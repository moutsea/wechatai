import { accountForAdmin, type AdminGrant } from "./account-route";
import { AppError } from "./config";
import { billingMode } from "./billing";
import { billingRevenueQueries } from "./billing-revenue";
import { dayWindow } from "./wallet";
import { retentionCollectionSql, RETENTION_DAY_MS } from "./account-retention";
import { adminGiftInputSchema } from "../shared/admin";
import type {
  AdminAccountStats,
  AdminDay,
  AdminOverview,
  AdminPluginUsage,
  AdminSync,
  AdminUser,
  AdminUsers,
} from "../shared/admin";

export async function adminAccessUntil(env: Env, userId: string): Promise<number> {
  const grant = await env.DB.prepare("SELECT expires_at FROM admin_user WHERE user_id=?")
    .bind(userId)
    .first<{ expires_at: number | null }>();
  return grant ? (grant.expires_at ?? Number.MAX_SAFE_INTEGER) : 0;
}

export async function isAdmin(env: Env, userId: string): Promise<boolean> {
  return (await adminAccessUntil(env, userId)) > Date.now();
}

async function membershipAccount(env: Env, userId: string, grant: AdminGrant) {
  if (
    !userId ||
    userId.length > 128 ||
    !(await env.DB.prepare("SELECT 1 FROM user WHERE id=?").bind(userId).first())
  )
    throw new AppError("user_not_found", "没有找到这个用户", 404);
  return accountForAdmin(env, userId, grant);
}

export async function adminMembership(env: Env, userId: string, grant: AdminGrant) {
  try {
    return await (await membershipAccount(env, userId, grant)).adminMembership();
  } catch (error) {
    if (!(error instanceof AppError))
      console.error(
        JSON.stringify({
          event: "admin.membership_read_failed",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
      );
    throw error;
  }
}

export async function giftAdminMembership(
  env: Env,
  grant: AdminGrant,
  userId: string,
  body: unknown,
) {
  const input = adminGiftInputSchema.safeParse(body);
  if (!input.success)
    throw new AppError("invalid_gift", "请提供有效的操作编号，赠送原因最多 200 字");
  const account = await membershipAccount(env, userId, grant);
  const result = await account.adminGiftPlus(grant.userId, input.data);
  if (!result.ok)
    throw new AppError("gift_conflict", "操作编号已被使用，请刷新页面核对赠送记录", 409);
  // The entitlement and audit record already committed together in the account.
  // A reporting cache failure must not turn a successful gift into an apparent failure.
  try {
    await saveAdminStats(env, userId, await account.adminStats());
  } catch {
    console.warn(JSON.stringify({ event: "admin.gift_stats_sync_failed" }));
  }
  return { gift: result.gift, planUntil: result.planUntil };
}

export async function saveAdminStats(env: Env, id: string, data: AdminAccountStats) {
  // Existing observations win on replay. JSON merge preserves days and the first
  // collection marker even when a legacy or membership refresh omits retention.
  // Check the route in the same write so a cutover during the RPC fails closed.
  const snapshot = data.retention
    ? { ...data, retention: { ...data.retention, startedAt: Date.now() } }
    : data;
  await env.DB.prepare(`INSERT INTO admin_account_stats(user_id,synced_at,data)
    VALUES (?, ?, CASE WHEN EXISTS(SELECT 1 FROM account_backend_routes WHERE owner_id=? )
      THEN json_set(?, '$.retention.sourceUnavailable', json('true')) ELSE ? END)
    ON CONFLICT(user_id) DO UPDATE SET synced_at=excluded.synced_at,
      data=CASE WHEN json_type(admin_account_stats.data,'$.retention')='object'
        THEN json_set(excluded.data,'$.retention',
          json_patch(COALESCE(json_extract(excluded.data,'$.retention'),'{}'),
            json_extract(admin_account_stats.data,'$.retention')))
        ELSE excluded.data END
    WHERE excluded.synced_at>admin_account_stats.synced_at`)
    .bind(id, data.sampledAt, id, JSON.stringify(snapshot), JSON.stringify(snapshot))
    .run();
}

// A cursor keeps each HTTP request bounded. No full-account fan-out on normal user requests.
export async function syncAdminStats(
  env: Env,
  cursor: unknown,
  grant: AdminGrant,
): Promise<AdminSync> {
  if (cursor != null && (typeof cursor !== "string" || cursor.length > 128))
    throw new AppError("invalid_cursor", "无效的同步位置");
  const rows = (
    await env.DB.prepare(`SELECT u.id,u.createdAt,s.synced_at FROM user u
    LEFT JOIN admin_account_stats s ON s.user_id=u.id WHERE u.id>? ORDER BY u.id LIMIT 11`)
      .bind(cursor || "")
      .all<{ id: string; createdAt: number; synced_at: number | null }>()
  ).results;
  const collection = await env.DB.prepare(retentionCollectionSql)
    .bind(Date.now())
    .first<{ startedAt: number | null }>();
  const collectionStart =
    collection?.startedAt == null
      ? undefined
      : dayWindow(collection.startedAt).start + RETENTION_DAY_MS;
  const batch = rows.slice(0, 10);
  let failed = 0;
  for (let i = 0; i < batch.length; i += 2) {
    const results = await Promise.allSettled(
      batch.slice(i, i + 2).map(async (row) => {
        if (row.synced_at && row.synced_at > Date.now() - 30000) return;
        const stats = await (
          await accountForAdmin(env, row.id, grant)
        ).adminStats(row.createdAt, collectionStart);
        await saveAdminStats(env, row.id, stats);
      }),
    );
    failed += results.filter((r) => r.status === "rejected").length;
  }
  if (failed) console.warn(JSON.stringify({ event: "admin.sync_partial", failed }));
  return { next: rows.length > 10 ? batch.at(-1)!.id : null, processed: batch.length, failed };
}

const createdMillis =
  "CASE WHEN u.createdAt<100000000000 THEN u.createdAt*1000 ELSE u.createdAt END";
const value = (field: string) => `json_extract(s.data,'$.${field}')`;

// Inspect existing snapshots in the same batch as their aggregates, so a sync
// cannot race the completeness check. Missing or invalid old fields stay unknown.
function snapshotCoverageColumns() {
  const numeric = (source: string, fields: string[]) =>
    fields
      .map(
        (field) =>
          `COALESCE(json_type(${source},'$.${field}') IN ('integer','real') AND json_extract(${source},'$.${field}')>=0,0)`,
      )
      .join(" AND ");
  const usage = ["requests", "tokens", "credits"];
  const rowChecks = [
    ["daily", [...usage, "failedRequests"]],
    ["pluginUsage", usage],
  ] as const;
  return `,
    COUNT(CASE WHEN s.user_id IS NOT NULL AND NOT (
      ${numeric("s.data", ["sampledAt", "planUntil", "links", "connected", "channels", "models", "plugins", "sessions", ...usage, "failedRequests", "purchasedCredits", "debt"])}
      AND ${value("sampledAt")}=s.synced_at
      AND ${rowChecks
        .map(
          ([field, fields]) => `
        COALESCE(json_type(s.data,'$.${field}')='array',0)
        AND NOT EXISTS(SELECT 1 FROM json_each(s.data,'$.${field}') row WHERE
          row.type!='object' OR NOT (${numeric("row.value", [...fields])})
          OR COALESCE(json_type(row.value,'$.day')='text',0)=0
          ${field === "pluginUsage" ? "OR COALESCE(json_type(row.value,'$.pluginId')='text',0)=0" : ""}
        )`,
        )
        .join(" AND ")}
    ) THEN 1 END) legacySnapshots`;
}

export async function adminOverview(
  env: Env,
  now = Date.now(),
  options: { snapshotCoverage?: boolean; publicPluginIds?: readonly string[] } = {},
): Promise<AdminOverview> {
  const mode = billingMode(env);
  const start = dayWindow(now).start - 29 * 86400000;
  const startDay = dayWindow(start).day;
  const endDay = dayWindow(now).day;
  const db = env.DB.withSession("first-primary");
  const [paymentSummary, paymentDays] = billingRevenueQueries(db, mode, start, now);
  const results = await db.batch<Record<string, string | number | null>>([
    db
      .prepare(`SELECT COUNT(*) users, COUNT(s.user_id) synced, MIN(s.synced_at) oldest, MAX(s.synced_at) newest,
      COALESCE(SUM(${value("planUntil")}>?),0) plus,
      ${["links", "connected", "channels", "models", "plugins", "sessions", "requests", "failedRequests", "tokens", "credits", "purchasedCredits", "debt"].map((k) => `COALESCE(SUM(${value(k)}),0) ${k}`).join(",")}${options.snapshotCoverage ? snapshotCoverageColumns() : ""}
      FROM user u LEFT JOIN admin_account_stats s ON s.user_id=u.id`)
      .bind(now),
    paymentSummary,
    db.prepare("SELECT COUNT(*) rewardedReferrals FROM referral WHERE status='rewarded'"),
    db
      .prepare(`SELECT strftime('%Y-%m-%d',(${createdMillis})/1000,'unixepoch','+8 hours') day, COUNT(*) newUsers
      FROM user u WHERE (${createdMillis})>=? AND (${createdMillis})<=? GROUP BY day`)
      .bind(start, now),
    paymentDays,
    db
      .prepare(`SELECT json_extract(d.value,'$.day') day,
      COUNT(DISTINCT CASE WHEN json_extract(d.value,'$.requests')>0 THEN s.user_id END) activeUsers,
      COALESCE(SUM(json_extract(d.value,'$.failedRequests')),0) failedRequests,
      SUM(json_extract(d.value,'$.requests')) requests, SUM(json_extract(d.value,'$.tokens')) tokens,
      SUM(json_extract(d.value,'$.credits')) credits
      FROM admin_account_stats s JOIN user u ON u.id=s.user_id, json_each(s.data,'$.daily') d
      WHERE json_extract(d.value,'$.day') BETWEEN ? AND ? GROUP BY day`)
      .bind(startDay, endDay),
    db
      .prepare(`SELECT json_extract(p.value,'$.pluginId') pluginId, COUNT(DISTINCT s.user_id) users,
      SUM(json_extract(p.value,'$.requests')) requests, SUM(json_extract(p.value,'$.tokens')) tokens,
      SUM(json_extract(p.value,'$.credits')) credits
      FROM admin_account_stats s JOIN user u ON u.id=s.user_id, json_each(s.data,'$.pluginUsage') p
      WHERE json_extract(p.value,'$.day') BETWEEN ? AND ?
      ${options.publicPluginIds ? `AND json_extract(p.value,'$.pluginId') IN (${options.publicPluginIds.map(() => "?").join(",")})` : ""}
      GROUP BY pluginId ORDER BY requests DESC, pluginId ASC LIMIT 20`)
      .bind(startDay, endDay, ...(options.publicPluginIds ?? [])),
  ]);
  const stats = results[0].results[0] as AdminOverview["summary"] & AdminOverview["coverage"];
  const { synced, oldest, newest, legacySnapshots, ...summary } = stats;
  const days = new Map<string, Partial<AdminDay>>();
  for (const result of results.slice(3, 6))
    for (const row of result.results) {
      const day = String(row.day);
      days.set(day, { ...days.get(day), ...row });
    }
  const daily = Array.from({ length: 30 }, (_, i) => {
    const day = dayWindow(start + i * 86400000).day;
    return {
      day,
      activeUsers: 0,
      newUsers: 0,
      revenue: 0,
      paidOrders: 0,
      requests: 0,
      failedRequests: 0,
      tokens: 0,
      credits: 0,
      ...days.get(day),
    };
  });
  return {
    mode,
    generatedAt: now,
    coverage: { synced, oldest, newest, ...(options.snapshotCoverage ? { legacySnapshots } : {}) },
    summary: {
      ...summary,
      ...results[1].results[0],
      ...results[2].results[0],
    } as AdminOverview["summary"],
    daily,
    plugins: results[6].results as AdminPluginUsage[],
  };
}

export async function adminUsers(
  env: Env,
  input: { q?: string; page?: string; plan?: string },
): Promise<AdminUsers> {
  const q = (input.q || "")
    .trim()
    .slice(0, 100)
    .replace(/[\\%_]/g, "\\$&");
  const pageRequested = /^\d{1,6}$/.test(input.page || "") ? Math.max(1, Number(input.page)) : 1;
  const filters = ["(u.email LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\')"];
  const args: (string | number)[] = [`%${q}%`, `%${q}%`];
  if (["free", "plus"].includes(input.plan || "")) {
    filters.push(
      `s.user_id IS NOT NULL AND ${value("planUntil")} ${input.plan === "plus" ? ">" : "<="} ?`,
    );
    args.push(Date.now());
  }
  const where = filters.join(" AND ");
  const db = env.DB.withSession("first-primary");
  const count = await db
    .prepare(
      `SELECT COUNT(*) total FROM user u LEFT JOIN admin_account_stats s ON s.user_id=u.id WHERE ${where}`,
    )
    .bind(...args)
    .first<{ total: number }>();
  const total = count?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const page = Math.min(pageRequested, totalPages);
  const items = (
    await db
      .prepare(`SELECT u.id,u.name,u.email,(${createdMillis}) createdAt,
      EXISTS(SELECT 1 FROM admin_user a WHERE a.user_id=u.id AND (a.expires_at IS NULL OR a.expires_at>?)) isAdmin, s.synced_at syncedAt,
      ${["planUntil", "links", "connected", "requests", "failedRequests", "lastFailureAt", "lastFailureCode", "lastFailureStatus", "credits", "lastActiveAt"].map((k) => `${value(k)} ${k}`).join(",")},
      (SELECT COALESCE(SUM(amount),0)/100.0 FROM billing_order o WHERE o.user_id=u.id AND o.mode=? AND o.status='paid' AND o.currency='cny') paidAmount
      FROM user u LEFT JOIN admin_account_stats s ON s.user_id=u.id WHERE ${where}
      ORDER BY (${createdMillis}) DESC,u.id DESC LIMIT 20 OFFSET ?`)
      .bind(Date.now(), billingMode(env), ...args, (page - 1) * 20)
      .all<AdminUser>()
  ).results;
  return { items, total, page, totalPages };
}
