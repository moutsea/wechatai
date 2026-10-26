import { ANALYTICS_SESSION_HEADER, isTrackedPath, normalizePath } from "../shared/analytics";
import type { FunnelEvent } from "../shared/funnel";
import { allowsFunnelEvent, isServerFunnelEvent } from "../shared/funnel-policy";
import type { ModelImportResult } from "../shared/types";

/**
 * 第一方访问统计的浏览器端核心。
 *
 * 这里不 import React，也不直接碰全局对象：所有依赖（存储、navigator、document、
 * 发请求的函数）都从参数传进来，于是隐私相关的判断（DNT/GPC、一次性令牌页不上报、
 * 会话号复用、首次归因）可以在测试里被真正验证，而不只是靠读代码。
 * React 侧的接线在 `page-view-tracker.tsx`。
 */

const SESSION_KEY = "wechatai:session";
const ATTRIBUTION_KEY = "wechatai:attribution";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign"] as const;

type UtmKey = (typeof UTM_KEYS)[number];
type Attribution = { referrer: string } & Record<UtmKey, string>;

/** 只用到这几个方法，测试里给一个普通对象就够了。 */
export type SessionStorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type AnalyticsNavigator = {
  doNotTrack?: string | null;
  globalPrivacyControl?: boolean;
  maxTouchPoints?: number;
};

export type PageViewDeps = {
  /** sessionStorage；不可用时传 null（隐私模式会直接抛错，由调用方兜住）。 */
  storage: SessionStorageLike | null;
  navigator: AnalyticsNavigator;
  document: { referrer: string };
  location: { search: string };
  /** 发一个上报请求；失败必须不影响页面，所以由这里决定「发了就不管」。 */
  send: (path: string, payload: Record<string, unknown>) => void;
  /** 测试里注入可预期的编号。 */
  randomId?: () => string;
};

export type PageViewTarget = {
  pathname: string;
  /** 查询串。和 pathname 一起构成「是不是同一页」。 */
  search: string;
  /** 锚点。同页内的锚点跳转不是新浏览，靠它和 search 一起判断。 */
  hash: string;
  /** react-router 的 location.key：一次导航一个，用来去重。 */
  key: string;
  visible: boolean;
};

/**
 * 埋点用的随机编号。`crypto.randomUUID` 只在安全上下文里存在（用 http + 局域网 IP
 * 预览时没有），统计脚本绝不能因为它把页面弄崩。
 */
function fallbackRandomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // getRandomValues 在非安全上下文也可用；仍生成服务端接受的 UUID v4。
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
}

/** Do Not Track 与 Global Privacy Control 都视为拒绝统计（旧浏览器把 DNT 写成 "yes"）。 */
export function optedOut(navigatorLike: AnalyticsNavigator): boolean {
  return (
    navigatorLike.doNotTrack === "1" ||
    navigatorLike.doNotTrack === "yes" ||
    navigatorLike.globalPrivacyControl === true
  );
}

export function createPageViewReporter(deps: PageViewDeps) {
  const randomId = deps.randomId ?? fallbackRandomId;
  /** 上一次处理过的 location.key，用来保证一次导航只记一次。 */
  let reportedKey = "";
  /** 上一次算作浏览的页面（path + search）与锚点，用来识别同页内的锚点跳转。 */
  let lastRoute = "";
  let lastHash = "";
  /** 内存里的会话号：storage 可用时与它保持一致，不可用时它就是唯一的会话身份。 */
  let sessionIdCache = "";

  function sessionId(): string {
    if (sessionIdCache) return sessionIdCache;
    const { storage } = deps;
    if (storage) {
      try {
        const existing = storage.getItem(SESSION_KEY);
        sessionIdCache = existing || randomId();
        if (!existing) storage.setItem(SESSION_KEY, sessionIdCache);
        return sessionIdCache;
      } catch {
        // 存储被禁用：退化到内存里的会话号，本次访问仍然算一个会话。
      }
    }
    // setItem 抛错时 cache 已有值，继续使用它；只有读取也失败时才生成。
    if (!sessionIdCache) sessionIdCache = randomId();
    return sessionIdCache;
  }

  function campaignParams(): Record<UtmKey, string> {
    let params: URLSearchParams;
    try {
      params = new URLSearchParams(deps.location.search);
    } catch {
      params = new URLSearchParams("");
    }
    return Object.fromEntries(
      // 与服务端同一套归一化（trim → 小写 → 截断），两端对同一个参数得出的值一致。
      UTM_KEYS.map((key) => [key, (params.get(key) ?? "").trim().toLowerCase().slice(0, 60)]),
    ) as Record<UtmKey, string>;
  }

  /**
   * 来源按会话取一次（首次归因）：推广参数只出现在落地那一次，如果逐页读取，
   * 来源带来的「人均浏览页数」会永远算成 1。
   */
  function attribution(): Attribution {
    // referrer 截断到 512：超长 referrer 会让整条上报被校验拒掉，宁愿丢尾部也别丢这次浏览。
    const fresh: Attribution = {
      referrer: (deps.document.referrer ?? "").slice(0, 512),
      ...campaignParams(),
    };
    const { storage } = deps;
    if (storage) {
      try {
        const cached = storage.getItem(ATTRIBUTION_KEY);
        if (cached) return { ...fresh, ...(JSON.parse(cached) as Partial<Attribution>) };
        storage.setItem(ATTRIBUTION_KEY, JSON.stringify(fresh));
      } catch {
        // 存储不可用时退化成逐页归因，宁可少一点信息也不影响上报。
      }
    }
    return fresh;
  }

  function sendPageView(pathname: string): boolean {
    const path = normalizePath(pathname);
    if (!isTrackedPath(path)) return false;
    if (optedOut(deps.navigator)) return false;
    const source = attribution();
    // 字段名必须与服务端的 pageViewPayloadSchema 一致（camelCase、strict）。
    // 这里逐项写出来，不要直接展开 source —— source 用的是 utm_source 这种
    // 存储侧的命名，展开进请求体会被服务端判成非法字段，整条浏览直接丢掉。
    deps.send("/api/analytics/page-view", {
      eventId: randomId(),
      pathname: path,
      sessionId: sessionId(),
      referrer: source.referrer,
      utmSource: source.utm_source,
      utmMedium: source.utm_medium,
      utmCampaign: source.utm_campaign,
      // iPadOS 13+ 把自己伪装成 macOS，用触摸能力把它认回平板。
      touch: (deps.navigator.maxTouchPoints ?? 0) > 0,
    });
    return true;
  }

  return {
    /** 记一次浏览。返回是否真的发出去了（去重、不可见、被排除的路径都返回 false）。 */
    reportPageView({ pathname, search, hash, key, visible }: PageViewTarget): boolean {
      // 只在页面可见时记数：后台标签页里打开的链接等用户真的切过来再补记。
      if (!visible) return false;
      if (reportedKey === key) return false;
      // 站点所有文档页和落地页都有目录锚点（<a href="#faq">）。点锚点会留下一段
      // 历史记录，从锚点按后退回到同一页时 pathname 与 search 都没变、只有 hash 变，
      // 这是同一页的另一次定位而不是新的浏览 —— 否则 PV 会被目录点击抬高。
      const route = `${pathname}${search}`;
      const anchorOnly = route === lastRoute && hash !== lastHash;
      reportedKey = key;
      lastRoute = route;
      lastHash = hash;
      if (anchorOnly) return false;
      return sendPageView(pathname);
    },
    /** 从往返缓存（后退/前进）恢复时算一次新的浏览。 */
    resetBackForward() {
      reportedKey = "";
    },
    /** 随注册请求传递，由服务端在真实创建账户后记账，不自行上报注册成功。 */
    signupAttribution(): { analyticsSessionId?: string } {
      if (optedOut(deps.navigator)) return {};
      return { analyticsSessionId: sessionId() };
    },
  };
}

export type PageViewReporter = ReturnType<typeof createPageViewReporter>;

function browserStorage(): SessionStorageLike | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function browserReporter(): PageViewReporter {
  return createPageViewReporter({
    storage: browserStorage(),
    navigator: window.navigator as AnalyticsNavigator,
    // 用 getter：单页应用里 document.referrer 在站内跳转时不变，但仍然取当下的值更稳。
    get document() {
      return { referrer: document.referrer };
    },
    get location() {
      return { search: window.location.search };
    },
    send: (path, payload) => {
      // keepalive 让「点完链接就离开」的那一次也能送达；不带凭据，不挂 Cookie。
      void fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
        credentials: "omit",
        referrerPolicy: "no-referrer",
      }).catch(() => undefined);
    },
  });
}

let singleton: PageViewReporter | null = null;

/** 浏览器里唯一的 reporter：组件和注册流程必须共用同一个会话号。 */
export function browserPageViewReporter(): PageViewReporter {
  if (!singleton) singleton = browserReporter();
  return singleton;
}

/** 业务请求可选择附带统计会话；统计环境故障不能阻止业务请求。 */
export function browserAnalyticsHeaders(): Record<string, string> {
  try {
    if (optedOut(window.navigator as AnalyticsNavigator)) return {};
    const { analyticsSessionId } = browserPageViewReporter().signupAttribution();
    return analyticsSessionId ? { [ANALYTICS_SESSION_HEADER]: analyticsSessionId } : {};
  } catch {
    return {};
  }
}

/**
 * 上报一条漏斗事件。和页面浏览共用同一个 sessionStorage 会话号，
 * 于是「这一次访问里看了几页、走到哪一步」能在后台对上。
 *
 * 约定与页面浏览一致：拒绝统计（DNT/GPC）、非安全上下文、网络失败都不抛错，
 * 绝不因为埋点让页面出问题。
 */
export function trackFunnel(name: FunnelEvent, props?: Record<string, string | number | boolean>) {
  try {
    const nav = window.navigator as AnalyticsNavigator;
    if (
      isServerFunnelEvent(name) ||
      optedOut(nav) ||
      !allowsFunnelEvent(name, window.location.pathname)
    )
      return;
    const { analyticsSessionId } = browserPageViewReporter().signupAttribution();
    const payload = {
      eventId: fallbackRandomId(),
      name,
      props,
      sessionId: analyticsSessionId,
      path: window.location.pathname,
      touch: nav.maxTouchPoints ? nav.maxTouchPoints > 0 : undefined,
    };
    void fetch("/api/analytics/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    }).catch(() => undefined);
  } catch {
    // 埋点是旁路，任何异常都不该影响交互。
  }
}

/** 列表请求成功且至少有一个模型落地，才记录导入；不代表已完成模型调用测试。 */
export function trackChannelModelImport(provider: string, result?: ModelImportResult) {
  if (result && result.imported + result.existing > 0)
    trackFunnel("channel_models_imported", { provider, models: result.imported + result.existing });
}
