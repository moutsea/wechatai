import { z } from "zod";

/**
 * 第一方访问统计的共用规则：浏览器上报端与服务端采集端必须用同一套过滤与归一化，
 * 否则「浏览器算了一次、服务端又算一次」这类偏差会直接体现在 PV 上。
 */

/** 站点按 Asia/Shanghai 切自然日；Worker 的时钟是 UTC。 */
export const ANALYTICS_DAY_OFFSET_SECONDS = 8 * 60 * 60;
/** 明细保留天数，由定时任务清理。 */
export const ANALYTICS_RETENTION_DAYS = 180;
/** 后台查询允许的最长区间。 */
export const ANALYTICS_MAX_DAYS = 90;
export const ANALYTICS_SESSION_HEADER = "x-wechatai-analytics-session";
export const analyticsSessionIdSchema = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

/**
 * 不进入统计的路径。
 *
 * - `/app` 是登录后的工作台，属于产品内部使用，不混进页面流量；
 * - `/demo` 是带演示数据的工作台预览，不是真实访问；
 * - 带一次性令牌的页面（校验邮箱、重置密码）连路径都不记录；
 * - 静态资源与接口不算页面浏览。
 */
const UNTRACKED_PREFIXES = ["/app", "/demo", "/api", "/assets", "/images", "/_"];

export function isTrackedPath(pathname: string): boolean {
  if (!pathname.startsWith("/") || pathname.startsWith("//")) return false;
  // 带查询串、片段、反斜杠或控制字符的路径一律不接收：这里只处理纯路径。
  if (/[\\?#]/.test(pathname)) return false;
  for (const char of pathname) if (char.charCodeAt(0) < 0x20) return false;
  if (UNTRACKED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)))
    return false;
  if (
    pathname === "/verify-email" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password"
  )
    return false;
  // 有扩展名的按文件处理，不是页面。
  if (/\.[a-zA-Z0-9]{1,8}$/.test(pathname)) return false;
  return true;
}

/** 去掉末尾斜杠，让 `/docs` 与 `/docs/` 合并成一条。 */
export function normalizePath(pathname: string) {
  const trimmed = pathname.split("?")[0]?.split("#")[0] ?? "/";
  const collapsed = trimmed.replace(/\/{2,}/g, "/");
  const withoutTrailing = collapsed.replace(/\/+$/, "");
  return withoutTrailing === "" ? "/" : withoutTrailing;
}

/** 来源只保留主机名，去掉 www. 前缀；本站来源返回空串（页内跳转不算外部来源）。 */
export function referrerHost(referrer: string | null, siteHost = "") {
  if (!referrer) return "";
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "").toLowerCase();
    if (!host) return "";
    if (siteHost && host === siteHost.replace(/^www\./, "").toLowerCase()) return "";
    return host;
  } catch {
    return "";
  }
}

export type DeviceKind = "desktop" | "mobile" | "tablet";

/**
 * 设备类别。`touch` 由浏览器上报（`navigator.maxTouchPoints > 0`）：iPadOS 13 起
 * Safari 把自己伪装成 macOS 的 UA，只看 UA 会把 iPad 记成桌面，而 Mac 没有触摸屏，
 * 所以「Macintosh UA + 有触摸」这条判据是可靠的。
 */
export function classifyDevice(userAgent: string, touch = false): DeviceKind {
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(userAgent)) return "tablet";
  // 只认 Macintosh：iPhone/iPod 的 UA 里也带「like Mac OS X」，用它当条件会把
  // 所有有触摸屏的 iPhone 判成平板。
  if (touch && /macintosh/i.test(userAgent) && !/iphone|ipod|mobile/i.test(userAgent))
    return "tablet";
  if (/mobile|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(userAgent)) return "mobile";
  return "desktop";
}

/**
 * 已知爬虫直接拒绝写入：Googlebot 之类会执行 JS，如果放行会把 PV 灌高。
 * 中文站点常见的百度、字节、搜狗爬虫一并列出。
 */
const BOT_PATTERN =
  /bot\b|bot\/|crawler|spider|crawling|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|pinterest|vkshare|w3c_validator|headlesschrome|phantomjs|python-requests|python-urllib|curl\/|wget\/|axios\/|go-http-client|okhttp|java\/|libwww|http-client|monitor|uptime|pingdom|lighthouse|gtmetrix|semrush|ahrefs|mj12bot|dotbot|petalbot|bytespider|yandexbot|baiduspider|sogou|exabot|ia_archiver/i;

export function isBotUserAgent(userAgent: string) {
  return BOT_PATTERN.test(userAgent);
}

export function shanghaiDay(at: Date = new Date()) {
  return new Date(at.getTime() + ANALYTICS_DAY_OFFSET_SECONDS * 1000).toISOString().slice(0, 10);
}

export function shanghaiDaysAgo(days: number, at: Date = new Date()) {
  return shanghaiDay(new Date(at.getTime() - days * 24 * 60 * 60 * 1000));
}

/** 浏览器上报的请求体。字段全部有上限，避免被灌入超长字符串。 */
export const pageViewPayloadSchema = z
  .object({
    eventId: z.uuid(),
    // min(1)：空路径经 normalizePath 会变成 "/"，等于把一条垃圾数据记成首页浏览。
    pathname: z.string().min(1).max(512),
    referrer: z.string().max(512),
    sessionId: analyticsSessionIdSchema,
    utmSource: z.string().max(60),
    utmMedium: z.string().max(60),
    utmCampaign: z.string().max(60),
    /** 浏览器是否有触摸屏，用来把 iPadOS 的 Macintosh UA 认回平板。 */
    touch: z.boolean().optional(),
  })
  .strict();

export type PageViewPayload = z.infer<typeof pageViewPayloadSchema>;

export type TrafficBucket = { label: string; pv: number; visitorDays: number };

export type TrafficDay = { day: string; pv: number; uv: number; sessions: number };

export type TrafficTotals = {
  pv: number;
  /** 按天去重的访客数。哈希每天换一次，所以不能跨天累加成「独立用户」。 */
  visitorDays: number;
  /** 会话数；「人均浏览页数」用 pv / sessions。 */
  sessions: number;
  pagesPerSession: number;
};

export type TrafficSummary = {
  range: { from: string; to: string; days: number };
  totals: TrafficTotals;
  daily: TrafficDay[];
  topPages: TrafficBucket[];
  /** 来源：优先 UTM，其次 referrer 主机名，都没有则记为直接访问。 */
  sources: TrafficBucket[];
  /** 每个来源带来的人均浏览页数。 */
  sourceDepth: { label: string; pv: number; sessions: number; pagesPerSession: number }[];
  countries: TrafficBucket[];
  devices: TrafficBucket[];
};

/**
 * 服务端账户创建钩子使用的注册事件。事件号由服务端生成；浏览器只提供会话号。
 */
export const signupConversionSchema = z
  .object({
    eventId: z.uuid(),
    sessionId: analyticsSessionIdSchema,
  })
  .strict();

export type SignupConversionPayload = z.infer<typeof signupConversionSchema>;

/** 会话的落地页与注册数：转化率按会话算，不按人算。 */
export type LandingConversion = {
  label: string;
  sessions: number;
  signups: number;
  rate: number;
};
