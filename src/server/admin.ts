import { AppError } from "./config";
import { billingMode } from "./billing";
import { dayWindow } from "./wallet";
import type {
  AdminAccountStats,
  AdminDay,
  AdminOverview,
  AdminPluginUsage,
  AdminSync,
  AdminUser,
  AdminUsers,
} from "../shared/admin";

export async function isAdmin(env: Env, userId: string): Promise<boolean> {
  return Boolean(
    await env.DB.prepare("SELECT 1 FROM admin_user WHERE user_id=?").bind(userId).first(),
  );
}

export async function saveAdminStats(env: Env, id: string, data: AdminAccountStats) {
  await env.DB.prepare(`INSERT INTO admin_account_stats(user_id,synced_at,data) VALUES (?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET synced_at=excluded.synced_at,data=excluded.data
    WHERE excluded.synced_at>admin_account_stats.synced_at`)
    .bind(id, data.sampledAt, JSON.stringify(data))
    .run();
}

// A cursor keeps each HTTP request bounded. No full-account fan-out on normal user requests.
export async function syncAdminStats(env: Env, cursor: unknown): Promise<AdminSync> {
  if (cursor != null && (typeof cursor !== "string" || cursor.length > 128))
    throw new AppError("invalid_cursor", "无效的同步位置");
  const rows = (
    await env.DB.prepare(`SELECT u.id,s.synced_at FROM user u
    LEFT JOIN admin_account_stats s ON s.user_id=u.id WHERE u.id>? ORDER BY u.id LIMIT 11`)
      .bind(cursor || "")
      .all<{ id: string; synced_at: number | null }>()
  ).results;
  const batch = rows.slice(0, 10);
  let failed = 0;
  for (let i = 0; i < batch.length; i += 2) {
    const results = await Promise.allSettled(
      batch.slice(i, i + 2).map(async (row) => {
        if (row.synced_at && row.synced_at > Date.now() - 30000) return;
        const stats = await env.ACCOUNTS.getByName(row.id).adminStats();
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

export async function adminOverview(env: Env, now = Date.now()): Promise<AdminOverview> {
  const mode = billingMode(env);
  const start = dayWindow(now).start - 29 * 86400000;
  const startDay = dayWindow(start).day;
  const endDay = dayWindow(now).day;
  const db = env.DB.withSession("first-primary");
  const results = await db.batch<Record<string, string | number | null>>([
    db
      .prepare(`SELECT COUNT(*) users, COUNT(s.user_id) synced, MIN(s.synced_at) oldest, MAX(s.synced_at) newest,
      COALESCE(SUM(${value("planUntil")}>?),0) plus,
      ${["links", "connected", "channels", "models", "plugins", "sessions", "requests", "tokens", "credits", "purchasedCredits", "debt"].map((k) => `COALESCE(SUM(${value(k)}),0) ${k}`).join(",")}
      FROM user u LEFT JOIN admin_account_stats s ON s.user_id=u.id`)
      .bind(now),
    db
      .prepare(`SELECT COALESCE(SUM(amount),0)/100.0 revenue, COUNT(*) paidOrders, COUNT(DISTINCT user_id) payingUsers,
      COALESCE(SUM(CASE WHEN kind='plus' THEN amount ELSE 0 END),0)/100.0 membershipRevenue,
      COALESCE(SUM(CASE WHEN kind='credits' THEN amount ELSE 0 END),0)/100.0 creditsRevenue
      FROM billing_order WHERE mode=? AND status='paid' AND currency='cny'`)
      .bind(mode),
    db.prepare("SELECT COUNT(*) rewardedReferrals FROM referral WHERE status='rewarded'"),
    db
      .prepare(`SELECT strftime('%Y-%m-%d',(${createdMillis})/1000,'unixepoch','+8 hours') day, COUNT(*) newUsers
      FROM user u WHERE (${createdMillis})>=? AND (${createdMillis})<=? GROUP BY day`)
      .bind(start, now),
    db
      .prepare(`SELECT strftime('%Y-%m-%d',COALESCE(paid_at,created_at)/1000,'unixepoch','+8 hours') day,
      SUM(amount)/100.0 revenue, COUNT(*) paidOrders FROM billing_order
      WHERE mode=? AND status='paid' AND currency='cny' AND COALESCE(paid_at,created_at)>=? AND COALESCE(paid_at,created_at)<=? GROUP BY day`)
      .bind(mode, start, now),
    db
      .prepare(`SELECT json_extract(d.value,'$.day') day, COUNT(DISTINCT s.user_id) activeUsers,
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
      WHERE json_extract(p.value,'$.day') BETWEEN ? AND ? GROUP BY pluginId ORDER BY requests DESC LIMIT 20`)
      .bind(startDay, endDay),
  ]);
  const stats = results[0].results[0] as AdminOverview["summary"] & AdminOverview["coverage"];
  const { synced, oldest, newest, ...summary } = stats;
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
      tokens: 0,
      credits: 0,
      ...days.get(day),
    };
  });
  return {
    mode,
    generatedAt: now,
    coverage: { synced, oldest, newest },
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
      EXISTS(SELECT 1 FROM admin_user a WHERE a.user_id=u.id) isAdmin, s.synced_at syncedAt,
      ${["planUntil", "links", "connected", "requests", "credits", "lastActiveAt"].map((k) => `${value(k)} ${k}`).join(",")},
      (SELECT COALESCE(SUM(amount),0)/100.0 FROM billing_order o WHERE o.user_id=u.id AND o.mode=? AND o.status='paid' AND o.currency='cny') paidAmount
      FROM user u LEFT JOIN admin_account_stats s ON s.user_id=u.id WHERE ${where}
      ORDER BY (${createdMillis}) DESC,u.id DESC LIMIT 20 OFFSET ?`)
      .bind(billingMode(env), ...args, (page - 1) * 20)
      .all<AdminUser>()
  ).results;
  return { items, total, page, totalPages };
}
