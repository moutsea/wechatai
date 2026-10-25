import { describe, expect, it, vi } from "vitest";
import {
  type AnalyticsNavigator,
  type PageViewDeps,
  type SessionStorageLike,
  createPageViewReporter,
} from "../src/client/analytics-client";
import { analyticsSessionIdSchema, pageViewPayloadSchema } from "../src/shared/analytics-schema";

/**
 * 浏览器端埋点的行为测试。
 *
 * 项目里没有 jsdom，所以核心逻辑做成依赖注入：这里给的是纯 JS 的假存储、假
 * navigator、假 fetch，测的是真正会跑在用户浏览器里的那段判断。
 */

function memoryStorage(): SessionStorageLike & { dump: Map<string, string> } {
  const dump = new Map<string, string>();
  return {
    dump,
    getItem: (key) => dump.get(key) ?? null,
    setItem: (key, value) => {
      dump.set(key, value);
    },
  };
}

type Sent = { path: string; payload: Record<string, unknown> };

function setup(overrides: Partial<PageViewDeps> & { navigator?: AnalyticsNavigator } = {}) {
  const sent: Sent[] = [];
  let counter = 0;
  const deps: PageViewDeps = {
    storage: memoryStorage(),
    navigator: {},
    document: { referrer: "" },
    location: { search: "" },
    send: (path, payload) => {
      sent.push({ path, payload });
    },
    // 必须是合法 UUID 与 >=8 字符的会话号：服务端 schema 就是这么校验的。
    randomId: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`,
    ...overrides,
  };
  return { reporter: createPageViewReporter(deps), sent, deps };
}

const view = (
  pathname: string,
  key: string,
  options: { visible?: boolean; search?: string; hash?: string } = {},
) => ({
  pathname,
  key,
  search: options.search ?? "",
  hash: options.hash ?? "",
  visible: options.visible ?? true,
});

describe("page view reporter", () => {
  it.each([false, true])("uses valid UUIDs with the real generator (fallback=%s)", (fallback) => {
    const mock = fallback
      ? vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
          throw new Error("randomUUID is unavailable in an insecure context");
        })
      : undefined;
    try {
      const { reporter, sent } = setup({ randomId: undefined });
      reporter.reportPageView(view("/pricing", "first"));
      reporter.reportPageView(view("/register", "second"));
      expect(sent.map(({ payload }) => pageViewPayloadSchema.safeParse(payload).success)).toEqual([
        true,
        true,
      ]);
      expect(sent[0]?.payload.eventId).not.toBe(sent[1]?.payload.eventId);
      expect(reporter.signupAttribution().analyticsSessionId).toBe(sent[0]?.payload.sessionId);
    } finally {
      mock?.mockRestore();
    }
  });

  it("keeps the landing and registration in one session when storage writes fail", () => {
    const { reporter, sent } = setup({
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
    });
    reporter.reportPageView(view("/pricing", "first"));
    reporter.reportPageView(view("/register", "second"));
    const sessionId = sent[0]?.payload.sessionId;
    expect(sent[1]?.payload.sessionId).toBe(sessionId);
    expect(reporter.signupAttribution()).toEqual({ analyticsSessionId: sessionId });
  });

  it("sends payloads the server schema actually accepts", () => {
    // 客户端与服务端是两份代码，字段名对不上时服务端只会静默丢掉整条浏览：
    // 没有这条断言，snake_case 的 utm_source 会让线上一条数据都收不到。
    const { reporter, sent, deps } = setup();
    deps.location.search = "?utm_source=newsletter&utm_medium=email&utm_campaign=launch";
    reporter.reportPageView(view("/pricing", "k1"));

    const payload = pageViewPayloadSchema.safeParse(sent[0]?.payload);
    expect(payload.success).toBe(true);
    expect(payload.success && payload.data.utmSource).toBe("newsletter");
    expect(payload.success && payload.data.utmMedium).toBe("email");
    expect(payload.success && payload.data.utmCampaign).toBe("launch");

    expect(
      analyticsSessionIdSchema.safeParse(reporter.signupAttribution().analyticsSessionId).success,
    ).toBe(true);
  });

  it("reports one page view per navigation and dedupes repeated keys", () => {
    const { reporter, sent } = setup();
    expect(reporter.reportPageView(view("/pricing", "k1"))).toBe(true);
    // StrictMode 会重复执行 effect：同一个 key 不能再记一次。
    expect(reporter.reportPageView(view("/pricing", "k1"))).toBe(false);
    expect(reporter.reportPageView(view("/wechat-ai", "k2"))).toBe(true);
    expect(sent.map((entry) => entry.payload.pathname)).toEqual(["/pricing", "/wechat-ai"]);
    expect(sent.every((entry) => entry.path === "/api/analytics/page-view")).toBe(true);
  });

  it("defers page views that happen in a hidden tab", () => {
    const { reporter, sent } = setup();
    expect(reporter.reportPageView(view("/docs", "k1", { visible: false }))).toBe(false);
    expect(sent).toHaveLength(0);
    // 用户真的切到这一页时补记，key 仍然有效。
    expect(reporter.reportPageView(view("/docs", "k1", { visible: true }))).toBe(true);
    expect(sent).toHaveLength(1);
  });

  it("reports again after coming back from the back-forward cache", () => {
    const { reporter, sent } = setup();
    reporter.reportPageView(view("/docs", "k1"));
    reporter.resetBackForward();
    reporter.reportPageView(view("/docs", "k1"));
    expect(sent).toHaveLength(2);
  });

  it("never reports private or untracked paths", () => {
    const { reporter, sent } = setup();
    for (const pathname of [
      "/app/wechat",
      "/demo/wechat",
      "/verify-email",
      "/reset-password",
      "/assets/index-abc.js",
      "/llms.txt",
    ])
      expect(reporter.reportPageView(view(pathname, pathname))).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("normalizes the path before sending", () => {
    const { reporter, sent } = setup();
    reporter.reportPageView(view("/docs/", "k1"));
    expect(sent[0]?.payload.pathname).toBe("/docs");
  });

  it("honours Do Not Track and Global Privacy Control", () => {
    for (const navigatorLike of [
      { doNotTrack: "1" },
      { doNotTrack: "yes" },
      { globalPrivacyControl: true },
    ]) {
      const { reporter, sent } = setup({ navigator: navigatorLike });
      expect(reporter.reportPageView(view("/pricing", "k1"))).toBe(false);
      expect(reporter.signupAttribution()).toEqual({});
      expect(sent).toHaveLength(0);
    }
  });

  it("keeps one session id across navigations", () => {
    const storage = memoryStorage();
    const { reporter, sent } = setup({ storage });
    reporter.reportPageView(view("/", "k1"));
    reporter.reportPageView(view("/pricing", "k2"));
    const ids = sent.map((entry) => entry.payload.sessionId);
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBe(storage.dump.get("wechatai:session"));
  });

  it("keeps one session id even when storage is unavailable", () => {
    // 隐私模式下 sessionStorage 直接抛错。如果每次上报都新生成会话号，
    // 会话数会被撑成 PV、人均页数恒为 1、落地页转化全断。
    const { reporter, sent } = setup({ storage: null });
    reporter.reportPageView(view("/", "k1"));
    reporter.reportPageView(view("/pricing", "k2"));
    reporter.reportPageView(view("/docs", "k3"));
    const ids = sent.map((entry) => entry.payload.sessionId);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(1);
  });

  it("attributes every page in a session to the landing source", () => {
    const { reporter, sent, deps } = setup();
    deps.document.referrer = "https://www.google.com/search?q=微信+ai";
    deps.location.search = "?utm_source=Newsletter&utm_campaign=launch";
    reporter.reportPageView(view("/pricing", "k1"));

    // 站内跳到第二页：推广参数已经不在地址栏里，但来源仍然是会话的落地来源。
    deps.document.referrer = "https://wechatai.app/pricing";
    deps.location.search = "";
    reporter.reportPageView(view("/docs", "k2"));

    expect(sent[0]?.payload).toMatchObject({
      referrer: "https://www.google.com/search?q=微信+ai",
      utmSource: "newsletter",
      utmCampaign: "launch",
    });
    // 第二页复用的是会话落地时的来源，不是"站内跳转"这种假来源。
    expect(sent[1]?.payload).toMatchObject({
      referrer: "https://www.google.com/search?q=微信+ai",
      utmSource: "newsletter",
      utmCampaign: "launch",
      utmMedium: "",
    });
  });

  it("does not count an in-page anchor jump as a new page view", () => {
    // 落地页和文档页都有目录（<a href="#faq">）。点完锚点再按后退回到同一页时，
    // pathname 与 search 都没变、只有 hash 变了 —— 这不是新的浏览。
    const { reporter, sent } = setup();
    reporter.reportPageView(view("/wechat-ai", "k1"));
    reporter.reportPageView(view("/wechat-ai", "k2", { hash: "#faq" }));
    reporter.reportPageView(view("/wechat-ai", "k3"));
    expect(sent).toHaveLength(1);
  });

  it("still counts a page again after the visitor went somewhere else", () => {
    const { reporter, sent } = setup();
    reporter.reportPageView(view("/wechat-ai", "k1"));
    reporter.reportPageView(view("/pricing", "k2"));
    reporter.reportPageView(view("/wechat-ai", "k3"));
    expect(sent.map((item) => item.payload.pathname)).toEqual([
      "/wechat-ai",
      "/pricing",
      "/wechat-ai",
    ]);
  });

  it("treats a different query string as a different route", () => {
    // 查询串不同但路径相同：路径会被归一化掉查询串，锚点判断不能把两者混为一谈。
    const { reporter, sent } = setup();
    reporter.reportPageView(view("/pricing", "k1", { search: "?utm_source=newsletter" }));
    reporter.reportPageView(view("/pricing", "k2", { search: "" }));
    expect(sent).toHaveLength(2);
    expect(sent.every((item) => item.payload.pathname === "/pricing")).toBe(true);
  });

  it("truncates a very long referrer instead of losing the page view", () => {
    const { reporter, sent, deps } = setup();
    deps.document.referrer = `https://example.com/${"a".repeat(900)}`;
    reporter.reportPageView(view("/pricing", "k1"));
    expect(String(sent[0]?.payload.referrer)).toHaveLength(512);
  });

  it("provides attribution for auth without posting a client-declared conversion", () => {
    const { reporter, sent } = setup();
    reporter.reportPageView(view("/pricing", "k1"));
    expect(reporter.signupAttribution()).toEqual({
      analyticsSessionId: sent[0]?.payload.sessionId,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.path).toBe("/api/analytics/page-view");
  });

  it("tells the server whether the device has a touch screen", () => {
    const { reporter, sent } = setup({ navigator: { maxTouchPoints: 5 } });
    reporter.reportPageView(view("/pricing", "k1"));
    expect(sent[0]?.payload.touch).toBe(true);

    const desktop = setup();
    desktop.reporter.reportPageView(view("/pricing", "k1"));
    expect(desktop.sent[0]?.payload.touch).toBe(false);
  });

  it("survives a storage that throws on access", () => {
    const hostile: SessionStorageLike = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    };
    const { reporter, sent } = setup({ storage: hostile });
    expect(reporter.reportPageView(view("/pricing", "k1"))).toBe(true);
    expect(sent).toHaveLength(1);
  });
});
