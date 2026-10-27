import { createHash, createHmac } from "node:crypto";
import {
  ANALYTICS_MAX_DAYS,
  ANALYTICS_RETENTION_DAYS,
  ANALYTICS_SESSION_HEADER,
  classifyDevice,
  isBotUserAgent,
  isTrackedPath,
  normalizePath,
  referrerHost,
  shanghaiDay,
  shanghaiDaysAgo,
  type AdminAnalytics,
  type SignupConversions,
  type TrafficBucket,
  type TrafficDay,
  type TrafficSummary,
} from "../shared/analytics";
import {
  analyticsSessionIdSchema,
  pageViewPayloadSchema,
  signupConversionSchema,
} from "../shared/analytics-schema";
import { funnelEventPayloadSchema, type FunnelEventPayload } from "../shared/funnel";
import { isServerFunnelEvent } from "../shared/funnel-policy";
import { summarizeFunnel, type FunnelCount, type FunnelSummary } from "../shared/funnel-report";
import { AppError, secret } from "./config";
import { signupConversionQueries } from "../shared/analytics-queries";

/**
 * 第一方访问统计的写入与汇总。
 *
 * 隐私边界（与 /privacy 的「访问统计」一节一一对应）：
 * - 原始 IP 与 User-Agent 只在内存里参与哈希，不落库；
 * - visitor_hash = sha256(ip|ua|day|salt)，day 参与哈希，所以同一个人每天都是新值，
 *   只能做「当日去重」，不构成跨天的访客 ID；
 * - session_id 由浏览器存在 sessionStorage，关标签页即失效；
 * - 查询串一律不入库，推广参数只取 utm_source/utm_medium/utm_campaign；
 * - referrer 只保留主机名。
 */

function analyticsSalt(env: Env) {
  // 盐只影响哈希，不影响功能；没配独立盐时退回站点密钥，保证不同站点的哈希不能互相碰撞比较。
  return (
    secret(env, "ANALYTICS_SALT", false) || secret(env, "BETTER_AUTH_SECRET", false) || "wechatai"
  );
}

export function visitorHash(env: Env, parts: { ip: string; userAgent: string; day: string }) {
  return createHash("sha256")
    .update(`${parts.ip}|${parts.userAgent}|${parts.day}|${analyticsSalt(env)}`)
    .digest("hex")
    .slice(0, 32);
}

export type RecordPageViewInput = {
  payload: unknown;
  ip: string;
  userAgent: string;
  country: string;
  /** Host serving the page; a referrer from this host is internal navigation, not a source. */
  siteHost?: string;
  now?: number;
};

export type RecordPageViewResult =
  | { ok: true; stored: boolean }
  | { ok: true; ignored: "bot" | "untracked_path" }
  | { ok: false; reason: "invalid_payload" };

export async function recordPageView(
  env: Env,
  input: RecordPageViewInput,
): Promise<RecordPageViewResult> {
  // 爬虫直接丢弃：Googlebot 之类会执行 JS，放行会把 PV 灌高。
  if (isBotUserAgent(input.userAgent)) return { ok: true, ignored: "bot" };
  const parsed = pageViewPayloadSchema.safeParse(input.payload);
  if (!parsed.success) return { ok: false, reason: "invalid_payload" };
  const payload = parsed.data;
  const path = normalizePath(payload.pathname);
  if (!isTrackedPath(path)) return { ok: true, ignored: "untracked_path" };

  const now = input.now ?? Date.now();
  const day = shanghaiDay(new Date(now));
  const utmSource = payload.utmSource.trim().toLowerCase().slice(0, 60);
  const utmMedium = payload.utmMedium.trim().toLowerCase().slice(0, 60);
  const utmCampaign = payload.utmCampaign.trim().toLowerCase().slice(0, 60);
  const result = await env.DB.prepare(
    `INSERT INTO page_views(day,path,referrer_host,utm_source,utm_medium,utm_campaign,
       visitor_hash,session_id,country,device,created_at,event_id)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(event_id) DO NOTHING`,
  )
    .bind(
      day,
      path,
      referrerHost(payload.referrer, input.siteHost ?? ""),
      utmSource,
      utmMedium,
      utmCampaign,
      visitorHash(env, { ip: input.ip, userAgent: input.userAgent, day }),
      payload.sessionId,
      input.country.trim().toUpperCase().slice(0, 2),
      classifyDevice(input.userAgent, payload.touch === true),
      now,
      payload.eventId,
    )
    .run();

  return { ok: true, stored: result.meta.changes > 0 };
}

export type RecordFunnelEventResult =
  | { ok: true; stored: boolean }
  | { ok: true; ignored: "bot" | "server_event" }
  | { ok: false; reason: "invalid_payload" };

/**
 * 写一条漏斗事件。与 `recordPageView` 的区别：**不按路径过滤**——
 * 注册验证、引导、付费墙、结账这些关键节点本来就发生在 `/app` 之内，
 * 而 `/app` 在页面浏览统计里是被刻意排除的。
 */
export async function recordFunnelEvent(
  env: Env,
  input: {
    payload: unknown;
    ip: string;
    userAgent: string;
    country: string;
    now?: number;
  },
): Promise<RecordFunnelEventResult> {
  if (isBotUserAgent(input.userAgent)) return { ok: true, ignored: "bot" };
  const parsed = funnelEventPayloadSchema.safeParse(input.payload);
  if (!parsed.success) return { ok: false, reason: "invalid_payload" };
  const payload = parsed.data;
  if (isServerFunnelEvent(payload.name)) return { ok: true, ignored: "server_event" };
  return insertFunnelEvent(env, payload, input);
}

async function insertFunnelEvent(
  env: Env,
  payload: FunnelEventPayload,
  input: Omit<RecordPageViewInput, "payload" | "siteHost">,
): Promise<RecordFunnelEventResult> {
  const now = input.now ?? Date.now();
  const day = shanghaiDay(new Date(now));
  const props = JSON.stringify(payload.props ?? {});
  const result = await env.DB.prepare(
    `INSERT INTO funnel_events(day,name,props,path,visitor_hash,session_id,country,device,created_at,event_id)
     VALUES(?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(event_id) DO NOTHING`,
  )
    .bind(
      day,
      payload.name,
      props.slice(0, 1000),
      normalizePath(payload.path ?? ""),
      visitorHash(env, { ip: input.ip, userAgent: input.userAgent, day }),
      payload.sessionId ?? "",
      input.country.trim().toUpperCase().slice(0, 2),
      classifyDevice(input.userAgent, payload.touch === true),
      now,
      payload.eventId,
    )
    .run();
  return { ok: true, stored: result.meta.changes > 0 };
}

/**
 * 已确认的业务成功事件。业务键只参与带密钥的幂等 UUID，不保存账户/订单 ID。
 * 统计失败不能使验证或支付状态查询失败；公开采集接口不接受这两类事件。
 */
export async function recordServerFunnelEvent(
  env: Env,
  input: {
    name: "verify_done" | "checkout_success";
    key: string;
    request?: Request;
    path: string;
    props?: Record<string, string | number | boolean>;
  },
) {
  const headers = input.request?.headers;
  if (!headers || ["1", "yes"].includes(headers.get("dnt") ?? "") || headers.get("sec-gpc") === "1")
    return;
  const userAgent = headers.get("user-agent") ?? "";
  if (isBotUserAgent(userAgent)) return;
  try {
    const hex = createHmac("sha256", analyticsSalt(env))
      .update(`funnel:${input.name}:${input.key}`)
      .digest("hex");
    const eventId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
    const session = analyticsSessionIdSchema.safeParse(headers.get(ANALYTICS_SESSION_HEADER));
    await insertFunnelEvent(
      env,
      {
        eventId,
        name: input.name,
        path: input.path,
        props: input.props,
        sessionId: session.success ? session.data : undefined,
      },
      {
        ip: headers.get("cf-connecting-ip") || "local",
        userAgent,
        country: headers.get("cf-ipcountry") ?? "",
      },
    );
  } catch {
    console.error(JSON.stringify({ event: "analytics.server_event_failed", name: input.name }));
  }
}

/**
 * 删除超过保留期的明细，由 cron（wrangler.jsonc 的 triggers，每分钟一次）调用。
 *
 * 早先是「写入时按 1% 概率顺带清理」，省掉定时任务；但那样只能保证「有访问就会清」，
 * 站点安静下来后旧数据会一直留着，与隐私政策承诺的 180 天不符。既然 Worker 本来
 * 就有每分钟的 cron（在清理 auth_email_limit），把保留期交给它更实在也更简单：
 * 到期即删，不依赖有没有流量。
 *
 * 两张表都要清：访问记录与注册归因同属一套口径。
 */
export async function pruneExpiredPageViews(env: Env, now: number = Date.now()) {
  const cutoff = shanghaiDay(new Date(now - ANALYTICS_RETENTION_DAYS * 86_400_000));
  await env.DB.batch([
    env.DB.prepare("DELETE FROM page_views WHERE day < ?").bind(cutoff),
    env.DB.prepare("DELETE FROM funnel_events WHERE day < ?").bind(cutoff),
    env.DB.prepare("DELETE FROM signup_attributions WHERE day < ?").bind(cutoff),
  ]);
}

/** 来源归类：有 UTM 用 UTM，其次 referrer 主机名，都没有算直接访问。 */
const SOURCE_EXPR = `CASE
  WHEN utm_source <> '' THEN 'utm:' || utm_source
  WHEN referrer_host <> '' THEN referrer_host
  ELSE '' END`;

type Row = Record<string, unknown>;
const num = (value: unknown) => (typeof value === "number" ? value : Number(value ?? 0));

export async function getTrafficSummary(
  env: Env,
  days: number,
  at = new Date(),
): Promise<TrafficSummary> {
  const window = Math.min(Math.max(Math.trunc(days) || 7, 1), ANALYTICS_MAX_DAYS);
  const to = shanghaiDay(at);
  const from = shanghaiDaysAgo(window - 1, at);
  // 全部查询一次发出，避免逐个 await 把 RTT 叠加起来。
  const bucket = (column: string, limit: number) =>
    env.DB.prepare(
      `SELECT ${column} AS label, COUNT(*) AS pv,
         COUNT(DISTINCT day || ':' || visitor_hash) AS visitorDays
       FROM page_views WHERE day BETWEEN ? AND ?
       GROUP BY label ORDER BY pv DESC, label LIMIT ${limit}`,
    ).bind(from, to);
  const results = await env.DB.batch<Row>([
    env.DB.prepare(
      `SELECT COUNT(*) AS pv, COUNT(DISTINCT day || ':' || visitor_hash) AS visitorDays,
         COUNT(DISTINCT session_id) AS sessions
       FROM page_views WHERE day BETWEEN ? AND ?`,
    ).bind(from, to),
    env.DB.prepare(
      `SELECT day, COUNT(*) AS pv, COUNT(DISTINCT visitor_hash) AS uv,
         COUNT(DISTINCT session_id) AS sessions
       FROM page_views WHERE day BETWEEN ? AND ? GROUP BY day ORDER BY day`,
    ).bind(from, to),
    bucket("path", 20),
    bucket(SOURCE_EXPR, 15),
    bucket("country", 12),
    bucket("device", 4),
    // 每个来源带来的浏览深度：pv / sessions。
    env.DB.prepare(
      `SELECT ${SOURCE_EXPR} AS label, COUNT(*) AS pv,
         COUNT(DISTINCT session_id) AS sessions
       FROM page_views WHERE day BETWEEN ? AND ?
       GROUP BY label ORDER BY pv DESC, label LIMIT 15`,
    ).bind(from, to),
  ]);

  const totalsRow = results[0]?.results?.[0] ?? {};
  const pv = num(totalsRow.pv);
  const sessions = num(totalsRow.sessions);
  // 空标签的含义随维度而变：来源为空是「直接访问」，国家/设备为空只是没取到值，
  // 一律标成「直接访问」会让报表读起来像是所有未知地区的访问都来自直接访问。
  const bucketRows = (index: number, emptyLabel: string): TrafficBucket[] =>
    (results[index]?.results ?? []).map((row) => ({
      label: String(row.label ?? "") || emptyLabel,
      pv: num(row.pv),
      visitorDays: num(row.visitorDays),
    }));

  return {
    range: { from, to, days: window },
    totals: {
      pv,
      visitorDays: num(totalsRow.visitorDays),
      sessions,
      pagesPerSession: sessions > 0 ? Math.round((pv / sessions) * 100) / 100 : 0,
    },
    daily: (results[1]?.results ?? []).map<TrafficDay>((row) => ({
      day: String(row.day ?? ""),
      pv: num(row.pv),
      uv: num(row.uv),
      sessions: num(row.sessions),
    })),
    topPages: bucketRows(2, "（未知）"),
    sources: bucketRows(3, "（直接访问）"),
    countries: bucketRows(4, "（未知）"),
    devices: bucketRows(5, "（未知）"),
    sourceDepth: (results[6]?.results ?? []).map((row) => {
      const sourcePv = num(row.pv);
      const sourceSessions = num(row.sessions);
      return {
        label: String(row.label ?? "") || "（直接访问）",
        pv: sourcePv,
        sessions: sourceSessions,
        pagesPerSession:
          sourceSessions > 0 ? Math.round((sourcePv / sourceSessions) * 100) / 100 : 0,
      };
    }),
  };
}

export type RecordSignupInput = {
  payload: unknown;
  userAgent: string;
  now?: number;
};

export type RecordSignupResult =
  | { ok: true; stored: boolean }
  | { ok: true; ignored: "bot" }
  | { ok: false; reason: "invalid_payload" };

/**
 * 记一次注册，并把它归因到该会话的落地页。
 *
 * 落地页不是客户端告诉我们的，而是按 session_id 找这个会话在 page_views 里最早的一条；
 * 找不到（会话开始时统计还没上线、或上报丢了）就留空，报表里算作「未归因」，不猜。
 */
export async function recordSignupConversion(
  env: Env,
  input: RecordSignupInput,
): Promise<RecordSignupResult> {
  if (isBotUserAgent(input.userAgent)) return { ok: true, ignored: "bot" };
  const parsed = signupConversionSchema.safeParse(input.payload);
  if (!parsed.success) return { ok: false, reason: "invalid_payload" };

  const now = input.now ?? Date.now();
  const day = shanghaiDay(new Date(now));
  const first = await env.DB.prepare(
    "SELECT path, referrer_host, utm_source FROM page_views WHERE session_id = ? ORDER BY created_at ASC, id ASC LIMIT 1",
  )
    .bind(parsed.data.sessionId)
    .first<{ path: string; referrer_host: string; utm_source: string }>();

  const result = await env.DB.prepare(
    `INSERT INTO signup_attributions (day, session_id, landing_path, referrer_host, utm_source, created_at, event_id)
     VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(event_id) DO NOTHING`,
  )
    .bind(
      day,
      parsed.data.sessionId,
      first?.path ?? "",
      first?.referrer_host ?? "",
      first?.utm_source ?? "",
      now,
      parsed.data.eventId,
    )
    .run();

  return { ok: true, stored: (result.meta.changes ?? 0) > 0 };
}

/** 按落地页聚合的转化：只统计区间内产生的注册与会话。 */
export async function getSignupConversions(
  env: Env,
  days: number,
  at = new Date(),
): Promise<SignupConversions> {
  const window = Math.min(Math.max(Math.trunc(days) || 7, 1), ANALYTICS_MAX_DAYS);
  const to = shanghaiDay(at);
  const from = shanghaiDaysAgo(window - 1, at);
  const queries = signupConversionQueries(from, to);
  const [totals, rows] = await env.DB.batch<Row>([
    env.DB.prepare(queries.totals),
    env.DB.prepare(queries.funnel),
  ]);
  const total = num(totals?.results?.[0]?.total);
  const attributed = num(totals?.results?.[0]?.attributed);
  const sessions = num(totals?.results?.[0]?.sessions);
  const list = (rows?.results ?? []).map((row) => {
    const sessions = num(row.sessions);
    const signups = num(row.signups);
    return {
      label: String(row.label ?? "") || "（未知）",
      sessions,
      signups,
      rate: sessions > 0 ? signups / sessions : 0,
    };
  });
  return {
    total,
    unattributed: Math.max(total - attributed, 0),
    sessions,
    rate: sessions > 0 ? total / sessions : 0,
    rows: list,
  };
}

/**
 * 关键事件触达：按天去重后加总，不把独立事件计数解释为用户留存或付费转化。
 *
 * 与 `page_views` 不同，这里保留 `/app` 内的正式操作。
 * 演示工作台虽已下线，保留期内的历史模拟操作仍须排除。
 */
export async function getFunnelSummary(
  env: Env,
  days: number,
  at = new Date(),
): Promise<FunnelSummary> {
  const window = Math.min(Math.max(Math.trunc(days) || 7, 1), ANALYTICS_MAX_DAYS);
  const to = shanghaiDay(at);
  const from = shanghaiDaysAgo(window - 1, at);
  const rows = await env.DB.prepare(
    `SELECT name, COUNT(*) AS events, COUNT(DISTINCT day || ':' || visitor_hash) AS visitorDays
     FROM funnel_events WHERE day BETWEEN ? AND ?
       AND LOWER(path) <> '/demo' AND LOWER(path) NOT LIKE '/demo/%'
     GROUP BY name`,
  )
    .bind(from, to)
    .all<{ name: string; events: number; visitorDays: number }>();
  const counts: Partial<Record<string, FunnelCount>> = {};
  for (const row of rows.results ?? []) {
    counts[row.name] = { visitorDays: num(row.visitorDays), events: num(row.events) };
  }
  return summarizeFunnel({ from, to, days: window }, counts);
}

export async function getAdminAnalytics(env: Env, days?: string): Promise<AdminAnalytics> {
  const window = days === undefined ? 7 : Number(days);
  if (
    days !== undefined &&
    (!/^\d+$/.test(days) || !Number.isInteger(window) || window < 1 || window > ANALYTICS_MAX_DAYS)
  )
    throw new AppError(
      "invalid_analytics_range",
      `统计天数须为 1–${ANALYTICS_MAX_DAYS} 的整数`,
      400,
    );
  const at = new Date();
  const [traffic, conversions, funnel] = await Promise.all([
    getTrafficSummary(env, window, at),
    getSignupConversions(env, window, at),
    getFunnelSummary(env, window, at),
  ]);
  return { traffic, conversions, funnel };
}
