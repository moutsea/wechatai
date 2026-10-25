import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import pageViewsMigration from "../migrations/0014_page_views.sql?raw";
import signupMigration from "../migrations/0015_signup_attributions.sql?raw";
import funnelMigration from "../migrations/0016_funnel_events.sql?raw";
import worker from "../src/server/index";
import {
  getFunnelSummary,
  getSignupConversions,
  getTrafficSummary,
  pruneExpiredPageViews,
  recordFunnelEvent,
  recordPageView,
  recordSignupConversion,
} from "../src/server/analytics";
import {
  classifyDevice,
  isBotUserAgent,
  isTrackedPath,
  normalizePath,
  referrerHost,
  shanghaiDay,
} from "../src/shared/analytics";

// D1 的 exec 只吃单行语句，测试里把注释与换行压平成一段脚本。
async function applyMigration() {
  for (const migration of [pageViewsMigration, signupMigration, funnelMigration])
    await env.DB.exec(
      migration
        .replace(/^--.*$/gm, "")
        .replace(/\n/g, " ")
        .trim(),
    );
}

const event = (overrides: Record<string, unknown> = {}) => ({
  eventId: crypto.randomUUID(),
  pathname: "/wechat-ai",
  referrer: "",
  sessionId: "session-0001",
  utmSource: "",
  utmMedium: "",
  utmCampaign: "",
  ...overrides,
});

const rows = () =>
  env.DB.prepare(
    "SELECT day, path, referrer_host, utm_source, visitor_hash, session_id, country, device, event_id FROM page_views ORDER BY id",
  ).all<Record<string, string>>();

beforeAll(applyMigration);
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM page_views").run();
  await env.DB.prepare("DELETE FROM signup_attributions").run();
  await env.DB.prepare("DELETE FROM funnel_events").run();
});

describe("shared analytics rules", () => {
  it("tracks public pages and skips the workspace, assets and one-time-token routes", () => {
    for (const path of ["/", "/wechat-ai", "/docs", "/docs/faq", "/pricing", "/login", "/register"])
      expect(isTrackedPath(path)).toBe(true);
    for (const path of [
      "/app",
      "/app/channels",
      "/demo/wechat",
      "/api/health",
      "/assets/index.js",
      "/images/docs/a.jpg",
      "/verify-email",
      "/reset-password",
      "/favicon.ico",
      "//evil.example",
      "wechat-ai",
    ])
      expect(isTrackedPath(path)).toBe(false);
  });

  it("normalizes paths and filters internal referrers", () => {
    expect(normalizePath("/docs/")).toBe("/docs");
    expect(normalizePath("/docs//faq?utm_source=x")).toBe("/docs/faq");
    expect(normalizePath("/")).toBe("/");
    expect(referrerHost("https://www.google.com/search?q=wechat+ai")).toBe("google.com");
    expect(referrerHost("https://wechatai.app/wechat-ai", "wechatai.app")).toBe("");
    expect(referrerHost("not a url")).toBe("");
    expect(referrerHost(null)).toBe("");
  });

  it("recognises an iPad that reports a Macintosh user agent", () => {
    // iPadOS 13 起 Safari 的 UA 与 macOS 完全一致，只能靠触摸能力区分。
    const ipad =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
    expect(classifyDevice(ipad, true)).toBe("tablet");
    // 同样的 UA 但没有触摸屏：那是真的 Mac。
    expect(classifyDevice(ipad, false)).toBe("desktop");
    // 其它平台不受影响。
    expect(classifyDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", true)).toBe(
      "mobile",
    );
  });

  it("classifies devices and known crawlers", () => {
    expect(classifyDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe("mobile");
    expect(classifyDevice("Mozilla/5.0 (iPad; CPU OS 17_0)")).toBe("tablet");
    expect(classifyDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("desktop");
    expect(isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 (compatible; Baiduspider/2.0)")).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(false);
  });

  it("cuts the day on Asia/Shanghai, not UTC", () => {
    // 2026-10-24T22:30Z 已经是上海的 10 月 25 日早上。
    expect(shanghaiDay(new Date("2026-10-24T22:30:00Z"))).toBe("2026-10-25");
    expect(shanghaiDay(new Date("2026-10-24T15:59:00Z"))).toBe("2026-10-24");
  });
});

describe("recordPageView", () => {
  it("stores a tracked view with its source, country and device", async () => {
    const result = await recordPageView(env, {
      payload: event({
        pathname: "/wechat-clawbot/",
        referrer: "https://www.google.com/search?q=clawbot",
        utmSource: "Bing",
        sessionId: "session-0002",
      }),
      ip: "203.0.113.7",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)",
      country: "cn",
      siteHost: "wechatai.app",
      now: Date.UTC(2026, 9, 24, 3),
    });
    expect(result).toEqual({ ok: true, stored: true });
    const [row] = (await rows()).results;
    expect(row).toMatchObject({
      day: "2026-10-24",
      path: "/wechat-clawbot",
      referrer_host: "google.com",
      utm_source: "bing",
      session_id: "session-0002",
      country: "CN",
      device: "mobile",
    });
  });

  it("drops a repeated event id so retries and bfcache restores count once", async () => {
    const payload = event();
    const input = { payload, ip: "203.0.113.7", userAgent: "Mozilla/5.0", country: "CN" };
    expect(await recordPageView(env, input)).toEqual({ ok: true, stored: true });
    expect(await recordPageView(env, input)).toEqual({ ok: true, stored: false });
    expect((await rows()).results).toHaveLength(1);
  });

  it("hash identifies one visitor per day and cannot be joined across days", async () => {
    const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
    const base = { ip: "198.51.100.9", userAgent, country: "US" };
    await recordPageView(env, {
      ...base,
      payload: event({ pathname: "/" }),
      now: Date.UTC(2026, 9, 20, 2),
    });
    await recordPageView(env, {
      ...base,
      payload: event({ pathname: "/pricing" }),
      now: Date.UTC(2026, 9, 20, 6),
    });
    await recordPageView(env, {
      ...base,
      payload: event({ pathname: "/" }),
      now: Date.UTC(2026, 9, 21, 2),
    });
    const stored = (await rows()).results;
    expect(stored).toHaveLength(3);
    expect(stored[0].visitor_hash).toBe(stored[1].visitor_hash);
    expect(stored[0].visitor_hash).not.toBe(stored[2].visitor_hash);
    // 哈希里不含原始 IP 或 UA 明文。
    expect(JSON.stringify(stored)).not.toContain("198.51.100.9");
    expect(JSON.stringify(stored)).not.toContain("Windows NT");
  });

  it("refuses crawlers, untracked paths and malformed payloads", async () => {
    const input = (payload: unknown, userAgent = "Mozilla/5.0") => ({
      payload,
      ip: "203.0.113.7",
      userAgent,
      country: "CN",
    });
    expect(
      await recordPageView(env, input(event(), "Mozilla/5.0 (compatible; Googlebot/2.1)")),
    ).toEqual({
      ok: true,
      ignored: "bot",
    });
    expect(await recordPageView(env, input(event({ pathname: "/app/channels" })))).toEqual({
      ok: true,
      ignored: "untracked_path",
    });
    expect(await recordPageView(env, input(event({ eventId: "not-a-uuid" })))).toEqual({
      ok: false,
      reason: "invalid_payload",
    });
    expect(await recordPageView(env, input(event({ sessionId: "x" })))).toEqual({
      ok: false,
      reason: "invalid_payload",
    });
    expect(await recordPageView(env, input({ ...event(), extra: "field" }))).toEqual({
      ok: false,
      reason: "invalid_payload",
    });
    // 空路径不能悄悄变成 "/"：那会把一条垃圾请求记成首页浏览。
    expect(await recordPageView(env, input(event({ pathname: "" })))).toEqual({
      ok: false,
      reason: "invalid_payload",
    });
    expect((await rows()).results).toHaveLength(0);
  });
});

describe("getTrafficSummary", () => {
  const seed = async () => {
    const now = Date.now();
    // 浏览器按会话做首次归因，所以同一会话里后续浏览也带着落地时的来源。
    const add = (payload: Record<string, unknown>, ip: string, referrer = "") =>
      recordPageView(env, {
        payload: event({ referrer, ...payload }),
        ip,
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        country: "CN",
        siteHost: "wechatai.app",
        now,
      });
    const google = "https://www.google.com/";
    // 访客 A：从 Google 来，一个会话看两页；后来又直接回访一次。
    await add({ pathname: "/wechat-ai", sessionId: "session-a1" }, "203.0.113.1", google);
    await add({ pathname: "/pricing", sessionId: "session-a1" }, "203.0.113.1", google);
    await add({ pathname: "/wechat-ai", sessionId: "session-a2" }, "203.0.113.1");
    // 访客 B：从邮件推广来，一个会话看三页。
    for (const pathname of ["/wechat-clawbot", "/pricing", "/wechat-ai"])
      await add({ pathname, sessionId: "session-b1", utmSource: "newsletter" }, "203.0.113.2");
  };

  it("reports traffic, depth per source and the pages people actually read", async () => {
    await seed();
    const summary = await getTrafficSummary(env, 7);
    expect(summary.totals.pv).toBe(6);
    expect(summary.totals.sessions).toBe(3);
    expect(summary.totals.visitorDays).toBe(2);
    expect(summary.totals.pagesPerSession).toBe(2);
    expect(summary.daily.at(-1)?.pv).toBe(6);

    expect(summary.topPages[0]).toEqual({ label: "/wechat-ai", pv: 3, visitorDays: 2 });
    expect(summary.sources.map((bucket) => bucket.label)).toEqual([
      "utm:newsletter",
      "google.com",
      "（直接访问）",
    ]);
    const google = summary.sourceDepth.find((bucket) => bucket.label === "google.com");
    expect(google).toMatchObject({ pv: 2, sessions: 1, pagesPerSession: 2 });
    const newsletter = summary.sourceDepth.find((bucket) => bucket.label === "utm:newsletter");
    expect(newsletter).toMatchObject({ pv: 3, sessions: 1, pagesPerSession: 3 });
    const direct = summary.sourceDepth.find((bucket) => bucket.label === "（直接访问）");
    expect(direct).toMatchObject({ pv: 1, sessions: 1, pagesPerSession: 1 });
    expect(summary.devices[0]).toMatchObject({ label: "desktop", pv: 6 });
    expect(summary.countries[0]).toMatchObject({ label: "CN", pv: 6 });
    expect(summary.range.days).toBe(7);
  });

  it("labels empty buckets by meaning: direct traffic vs unknown", async () => {
    // 来源为空 = 直接访问；国家/设备为空只是没取到值。曾经两者都被标成
    // 「直接访问」，报表读起来像是所有未知地区的访问都来自直接访问。
    await env.DB.prepare(
      `INSERT INTO page_views(day,path,referrer_host,utm_source,visitor_hash,session_id,country,device,created_at,event_id)
       VALUES(?,?,?,?,?,?,?,?,?,?)`,
    )
      .bind(
        shanghaiDay(),
        "/wechat-ai",
        "",
        "",
        "hash-empty",
        "session-empty",
        "",
        "",
        Date.now(),
        "event-empty",
      )
      .run();

    const summary = await getTrafficSummary(env, 7);
    expect(summary.sources.find((row) => row.label === "（直接访问）")?.pv).toBe(1);
    expect(summary.countries.map((row) => row.label)).toEqual(["（未知）"]);
    expect(summary.devices.map((row) => row.label)).toEqual(["（未知）"]);
  });

  it("clamps the window and returns an empty but well-formed summary", async () => {
    const summary = await getTrafficSummary(env, 500);
    expect(summary.range.days).toBe(90);
    expect(summary.totals).toEqual({ pv: 0, visitorDays: 0, sessions: 0, pagesPerSession: 0 });
    expect(summary.daily).toEqual([]);
    expect(summary.sources).toEqual([]);
  });

  it("leaves older views out of the window", async () => {
    await recordPageView(env, {
      payload: event({ pathname: "/wechat-ai" }),
      ip: "203.0.113.5",
      userAgent: "Mozilla/5.0",
      country: "CN",
      now: Date.now() - 40 * 86_400_000,
    });
    expect((await getTrafficSummary(env, 7)).totals.pv).toBe(0);
    expect((await getTrafficSummary(env, 60)).totals.pv).toBe(1);
  });

  it("uses the same Shanghai midnight boundary for traffic and registration reports", async () => {
    const midnight = Date.parse("2026-10-26T00:00:00+08:00");
    for (const [sessionId, now] of [
      ["session-before", midnight - 1],
      ["session-after", midnight],
    ] as const) {
      await recordPageView(env, {
        payload: event({ sessionId, pathname: "/pricing" }),
        ip: "203.0.113.9",
        userAgent: "Mozilla/5.0",
        country: "CN",
        now,
      });
      await recordSignupConversion(env, {
        payload: { eventId: crypto.randomUUID(), sessionId },
        userAgent: "Mozilla/5.0",
        now,
      });
    }
    const at = new Date(midnight + 1);
    const today = await getTrafficSummary(env, 1, at);
    expect(today.range).toEqual({ from: "2026-10-26", to: "2026-10-26", days: 1 });
    expect(today.totals).toMatchObject({ pv: 1, visitorDays: 1, sessions: 1 });
    expect(await getSignupConversions(env, 1, at)).toMatchObject({
      total: 1,
      sessions: 1,
      rate: 1,
    });
    expect((await getTrafficSummary(env, 2, at)).totals).toMatchObject({
      pv: 2,
      visitorDays: 2,
      sessions: 2,
    });
    expect(await getSignupConversions(env, 2, at)).toMatchObject({
      total: 2,
      sessions: 2,
      rate: 1,
    });
  });
});

describe("POST /api/analytics/page-view", () => {
  const post = async (body: unknown, headers: Record<string, string> = {}) => {
    const request = new Request("https://wechatai.app/api/analytics/page-view", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    return response;
  };

  it("stores a browser view and answers 204", async () => {
    const response = await post(event({ pathname: "/wechat-gpt" }), {
      origin: "https://wechatai.app",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    });
    expect(response.status).toBe(204);
    expect((await rows()).results).toHaveLength(1);
  });

  it("rejects cross-site and non-JSON posts before touching the database", async () => {
    expect((await post(event(), { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await post(event(), { origin: "https://evil.example" })).status).toBe(403);
    expect((await post("{}", { "content-type": "text/plain" })).status).toBe(415);
    expect((await rows()).results).toHaveLength(0);
  });

  it("answers 204 without storing anything when the payload or the caller is junk", async () => {
    expect((await post({ nonsense: true })).status).toBe(204);
    expect(
      (await post(event(), { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" })).status,
    ).toBe(204);
    expect((await post("{not json")).status).toBe(204);
    expect((await rows()).results).toHaveLength(0);
  });

  it("stops answering once the per-IP limiter trips", async () => {
    const limited = {
      ...env,
      API_LIMIT: { limit: async () => ({ success: false }) },
    } as unknown as Env;
    const request = new Request("https://wechatai.app/api/analytics/page-view", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.9" },
      body: JSON.stringify(event()),
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, limited, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(429);
    expect((await rows()).results).toHaveLength(0);
  });
});

describe("recordSignupConversion", () => {
  const signup = (sessionId: string) => ({ eventId: crypto.randomUUID(), sessionId });
  const attributionRows = () =>
    env.DB.prepare(
      "SELECT day, session_id, landing_path, referrer_host, utm_source, event_id FROM signup_attributions ORDER BY id",
    ).all<Record<string, string>>();

  it("attributes the signup to the session's first page view", async () => {
    await recordPageView(env, {
      payload: event({ sessionId: "session-aaaa", pathname: "/wechat-clawbot-models" }),
      ip: "203.0.113.1",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      country: "cn",
      siteHost: "wechatai.app",
      now: Date.parse("2026-10-20T02:00:00Z"),
    });
    await recordPageView(env, {
      payload: event({ sessionId: "session-aaaa", pathname: "/register" }),
      ip: "203.0.113.1",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      country: "cn",
      siteHost: "wechatai.app",
      now: Date.parse("2026-10-20T02:05:00Z"),
    });

    const result = await recordSignupConversion(env, {
      payload: signup("session-aaaa"),
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      now: Date.parse("2026-10-20T02:06:00Z"),
    });
    expect(result).toEqual({ ok: true, stored: true });
    expect((await attributionRows()).results?.[0]).toMatchObject({
      session_id: "session-aaaa",
      landing_path: "/wechat-clawbot-models",
    });
  });

  it("deletes records past the retention window and keeps recent ones", async () => {
    // 隐私政策承诺「180 天后清理」。直接测试定时任务调用的清理函数：
    // 过期数据必须真的被删，而且两张表都要删。
    const now = Date.parse("2026-10-24T02:00:00Z");
    const old = shanghaiDay(new Date(now - 200 * 86_400_000));
    const fresh = shanghaiDay(new Date(now - 10 * 86_400_000));
    for (const [day, id] of [
      [old, "old"],
      [fresh, "fresh"],
    ] as const) {
      await env.DB.prepare(
        `INSERT INTO page_views(day,path,visitor_hash,session_id,created_at,event_id)
         VALUES(?,?,?,?,?,?)`,
      )
        .bind(day, "/wechat-ai", `hash-${id}`, `session-${id}`, now, `event-${id}`)
        .run();
      await env.DB.prepare(
        `INSERT INTO signup_attributions(day,session_id,landing_path,created_at,event_id)
         VALUES(?,?,?,?,?)`,
      )
        .bind(day, `session-${id}`, "/wechat-ai", now, `signup-${id}`)
        .run();
    }

    await pruneExpiredPageViews(env, now);

    const views = await env.DB.prepare("SELECT day FROM page_views ORDER BY day").all<{
      day: string;
    }>();
    const signups = await env.DB.prepare("SELECT day FROM signup_attributions ORDER BY day").all<{
      day: string;
    }>();
    expect(views.results?.map((row) => row.day)).toEqual([fresh]);
    expect(signups.results?.map((row) => row.day)).toEqual([fresh]);
  });

  it("breaks ties by insertion order when two views share a millisecond", async () => {
    // 两条浏览同一毫秒到达时，「哪一条是落地页」不能靠运气：按 id 兜底，
    // 否则同一份数据每次查出来的来源会不一样。
    const sameMoment = Date.parse("2026-10-20T02:00:00Z");
    for (const pathname of ["/pricing", "/wechat-ai"]) {
      await recordPageView(env, {
        payload: event({ sessionId: "session-tie", pathname }),
        ip: "203.0.113.4",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        country: "cn",
        siteHost: "wechatai.app",
        now: sameMoment,
      });
    }
    await recordSignupConversion(env, {
      payload: signup("session-tie"),
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      now: sameMoment + 1_000,
    });
    expect((await attributionRows()).results?.[0]).toMatchObject({
      session_id: "session-tie",
      landing_path: "/pricing",
    });
  });

  it("ignores crawlers and malformed payloads instead of writing junk", async () => {
    await expect(
      recordSignupConversion(env, {
        payload: signup("session-bbbb"),
        userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1)",
      }),
    ).resolves.toEqual({ ok: true, ignored: "bot" });
    await expect(
      recordSignupConversion(env, {
        payload: { sessionId: "short" },
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      }),
    ).resolves.toEqual({ ok: false, reason: "invalid_payload" });
    await expect(
      recordSignupConversion(env, {
        payload: { ...signup("session-bbbb"), landingPath: "/pricing" },
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      }),
    ).resolves.toEqual({ ok: false, reason: "invalid_payload" });
    expect((await attributionRows()).results).toHaveLength(0);
  });

  it("keeps the same event id idempotent", async () => {
    const payload = signup("session-cccc");
    const agent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
    expect(await recordSignupConversion(env, { payload, userAgent: agent })).toEqual({
      ok: true,
      stored: true,
    });
    expect(await recordSignupConversion(env, { payload, userAgent: agent })).toEqual({
      ok: true,
      stored: false,
    });
    expect((await attributionRows()).results).toHaveLength(1);
  });

  it("stores an empty landing page when the session has no recorded view", async () => {
    await recordSignupConversion(env, {
      payload: signup("session-dddd"),
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    });
    expect((await attributionRows()).results?.[0]).toMatchObject({
      session_id: "session-dddd",
      landing_path: "",
    });
  });
});

describe("getSignupConversions", () => {
  const agent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
  // 时间基准必须相对「现在」：getSignupConversions 的窗口是按真实当天算的，
  // 写死日期会让这套用例在窗口滑过去之后集体失败。
  const base = Date.now() - 2 * 86_400_000;
  const at = (minute: number) => base + minute * 60_000;
  const visit = async (sessionId: string, pathname: string, minute: number) =>
    recordPageView(env, {
      payload: event({ sessionId, pathname }),
      ip: "203.0.113.7",
      userAgent: agent,
      country: "cn",
      siteHost: "wechatai.app",
      now: at(minute),
    });
  const register = async (sessionId: string, minute: number) =>
    recordSignupConversion(env, {
      payload: { eventId: crypto.randomUUID(), sessionId },
      userAgent: agent,
      now: at(minute) + 30_000,
    });

  it("counts sessions per landing page and the signups they produced", async () => {
    // /wechat-deepseek 带来两个会话，其中一个注册；/pricing 一个会话且注册。
    await visit("session-1111", "/wechat-deepseek", 1);
    await visit("session-1111", "/register", 2);
    await register("session-1111", 3);
    await visit("session-2222", "/wechat-deepseek", 4);
    await visit("session-3333", "/pricing", 5);
    await register("session-3333", 6);

    const summary = await getSignupConversions(env, 7);
    expect(summary.total).toBe(2);
    expect(summary.unattributed).toBe(0);
    // 注册数相同时会话多的排前面（ORDER BY signups DESC, sessions DESC）。
    expect(summary.rows).toEqual([
      { label: "/wechat-deepseek", sessions: 2, signups: 1, rate: 0.5 },
      { label: "/pricing", sessions: 1, signups: 1, rate: 1 },
    ]);
  });

  it("reports signups it could not attribute instead of dropping them", async () => {
    await visit("session-4444", "/wechat-ai", 1);
    await register("session-9999", 2);

    const summary = await getSignupConversions(env, 7);
    expect(summary.total).toBe(1);
    expect(summary.unattributed).toBe(1);
    expect(summary.rows).toEqual([{ label: "/wechat-ai", sessions: 1, signups: 0, rate: 0 }]);
  });

  it("does not let one session count as two signups", async () => {
    // 同一个会话记录了两次注册：注册数按会话去重，
    // 不能变成 2，否则转化率会超过 100%。
    await visit("session-7777", "/pricing", 1);
    await register("session-7777", 2);
    await register("session-7777", 3);

    const summary = await getSignupConversions(env, 7);
    expect(summary.total).toBe(1);
    expect(summary.rows).toEqual([{ label: "/pricing", sessions: 1, signups: 1, rate: 1 }]);
    expect(summary.unattributed).toBe(0);
  });

  it("deduplicates unattributed signups as well as attributed signups", async () => {
    await register("session-unknown", 1);
    await register("session-unknown", 2);
    expect(await getSignupConversions(env, 7)).toEqual({
      total: 1,
      unattributed: 1,
      sessions: 1,
      rate: 1,
      rows: [],
    });
  });

  it("keeps the true landing page when the report crosses midnight", async () => {
    const midnight = Date.parse(`${shanghaiDay()}T00:00:00+08:00`);
    for (const [pathname, now] of [
      ["/wechat-ai", midnight - 60_000],
      ["/register", midnight + 60_000],
    ] as const) {
      await recordPageView(env, {
        payload: event({ sessionId: "session-midnight", pathname }),
        ip: "203.0.113.7",
        userAgent: agent,
        country: "CN",
        now,
      });
    }
    // Also cover a non-converting session: its denominator must use the real first view.
    for (const [pathname, now] of [
      ["/wechat-ai", midnight - 60_000],
      ["/pricing", midnight + 60_000],
    ] as const) {
      await recordPageView(env, {
        payload: event({ sessionId: "session-no-signup", pathname }),
        ip: "203.0.113.8",
        userAgent: agent,
        country: "CN",
        now,
      });
    }
    await recordSignupConversion(env, {
      payload: { eventId: crypto.randomUUID(), sessionId: "session-midnight" },
      userAgent: agent,
      now: midnight + 120_000,
    });
    for (const days of [1, 7]) {
      expect(await getSignupConversions(env, days)).toEqual({
        total: 1,
        unattributed: 0,
        sessions: 2,
        rate: 0.5,
        rows: [{ label: "/wechat-ai", sessions: 2, signups: 1, rate: 0.5 }],
      });
    }
  });

  it("uses the signup snapshot even when its page views are outside the window or deleted", async () => {
    await visit("session-snapshot", "/pricing", 1);
    await recordSignupConversion(env, {
      payload: { eventId: crypto.randomUUID(), sessionId: "session-snapshot" },
      userAgent: agent,
    });
    const expected = {
      total: 1,
      unattributed: 0,
      sessions: 1,
      rate: 1,
      rows: [{ label: "/pricing", sessions: 1, signups: 1, rate: 1 }],
    };
    expect(await getSignupConversions(env, 1)).toEqual(expected);
    await env.DB.prepare("DELETE FROM page_views").run();
    expect(await getSignupConversions(env, 1)).toEqual(expected);
  });

  it("does not invent a landing page from a visit after an unattributed registration", async () => {
    await register("session-late-view", 1);
    await visit("session-late-view", "/pricing", 2);
    expect(await getSignupConversions(env, 7)).toEqual({
      total: 1,
      unattributed: 1,
      sessions: 1,
      rate: 1,
      rows: [],
    });
  });

  it("uses all converted and unconverted sessions beyond the 15 shown landing pages", async () => {
    // 明细表只展示 15 行，但「已归因」必须是全量：否则第 16 个落地页带来的注册
    // 会被算成未归因，报表上的缺口是假的。
    for (let index = 0; index < 17; index += 1) {
      const session = `session-page-${String(index).padStart(2, "0")}`;
      await visit(session, `/wechat-page-${index}`, index);
      await register(session, index);
    }
    // 这些未注册会话的页面会被排在前 15 项之外。只按可见行计算会得到 100%，
    // 全量口径应是 17 个注册会话 / 100 个活跃会话 = 17%。
    for (let index = 17; index < 100; index += 1)
      await visit(`session-page-${index}`, `/wechat-page-${index}`, index);

    const summary = await getSignupConversions(env, 7);
    expect(summary.total).toBe(17);
    expect(summary.unattributed).toBe(0);
    expect(summary.sessions).toBe(100);
    expect(summary.rate).toBeCloseTo(0.17);
    expect(summary.rows).toHaveLength(15);
    expect(summary.rows.reduce((sum, row) => sum + row.signups, 0)).toBe(15);
    expect(summary.rows.every((row) => row.rate === 1)).toBe(true);
  });
});

describe("retired client signup endpoint", () => {
  it("does not allow a client to manufacture conversions", async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("https://wechatai.app/api/analytics/signup", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://wechatai.app" },
        body: JSON.stringify({ eventId: crypto.randomUUID(), sessionId: "forged-session" }),
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(410);
    expect((await env.DB.prepare("SELECT * FROM signup_attributions").all()).results).toEqual([]);
  });
});

const funnelRows = () =>
  env.DB.prepare(
    "SELECT day, name, props, path, session_id, country, device, event_id FROM funnel_events ORDER BY id",
  ).all<Record<string, string>>();

describe("recordFunnelEvent", () => {
  const funnelEvent = (overrides: Record<string, unknown> = {}) => ({
    eventId: crypto.randomUUID(),
    name: "paywall_view",
    props: { surface: "dashboard_recent" },
    sessionId: "session-0001",
    path: "/app",
    ...overrides,
  });

  it.each(["/demo", "/demo/channels", "/demo/", "/Demo/wechat"])(
    "rejects simulated operations at %s but keeps demo_view",
    async (path) => {
      const input = { ip: "203.0.113.7", userAgent: "Mozilla/5.0", country: "" };
      expect(await recordFunnelEvent(env, { ...input, payload: funnelEvent({ path }) })).toEqual({
        ok: true,
        ignored: "demo",
      });
      expect(
        await recordFunnelEvent(env, {
          ...input,
          payload: funnelEvent({ path, name: "demo_view" }),
        }),
      ).toEqual({ ok: true, stored: true });
      expect((await funnelRows()).results.map((row) => row.name)).toEqual(["demo_view"]);
    },
  );

  it("stores workspace events that page views deliberately ignore", async () => {
    // /app 在 page_views 里是被排除的，而最有价值的漏斗节点恰好都发生在这里。
    const result = await recordFunnelEvent(env, {
      payload: funnelEvent(),
      ip: "203.0.113.7",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)",
      country: "cn",
      now: Date.UTC(2026, 9, 24, 3),
    });
    expect(result).toEqual({ ok: true, stored: true });
    const [row] = (await funnelRows()).results;
    expect(row).toMatchObject({
      day: "2026-10-24",
      name: "paywall_view",
      path: "/app",
      session_id: "session-0001",
      country: "CN",
      device: "mobile",
    });
    expect(JSON.parse(row!.props)).toEqual({ surface: "dashboard_recent" });
  });

  it("dedupes a retried delivery by event id", async () => {
    const payload = funnelEvent();
    await recordFunnelEvent(env, {
      payload,
      ip: "203.0.113.7",
      userAgent: "Mozilla/5.0",
      country: "",
    });
    const again = await recordFunnelEvent(env, {
      payload,
      ip: "203.0.113.7",
      userAgent: "Mozilla/5.0",
      country: "",
    });
    expect(again).toEqual({ ok: true, stored: false });
    expect((await funnelRows()).results).toHaveLength(1);
  });

  it("rejects unknown event names and unknown fields", async () => {
    const unknownName = await recordFunnelEvent(env, {
      payload: funnelEvent({ name: "made_up_event" }),
      ip: "203.0.113.7",
      userAgent: "Mozilla/5.0",
      country: "",
    });
    expect(unknownName).toEqual({ ok: false, reason: "invalid_payload" });
    const extraField = await recordFunnelEvent(env, {
      payload: funnelEvent({ email: "someone@example.com" }),
      ip: "203.0.113.7",
      userAgent: "Mozilla/5.0",
      country: "",
    });
    expect(extraField).toEqual({ ok: false, reason: "invalid_payload" });
    expect((await funnelRows()).results).toEqual([]);
  });

  it("drops bot traffic and honours the retention window", async () => {
    const bot = await recordFunnelEvent(env, {
      payload: funnelEvent(),
      ip: "203.0.113.7",
      userAgent: "Googlebot/2.1",
      country: "",
    });
    expect(bot).toEqual({ ok: true, ignored: "bot" });
    await recordFunnelEvent(env, {
      payload: funnelEvent(),
      ip: "203.0.113.7",
      userAgent: "Mozilla/5.0",
      country: "",
      now: Date.UTC(2025, 0, 1, 3),
    });
    await pruneExpiredPageViews(env, Date.UTC(2026, 9, 24, 3));
    expect((await funnelRows()).results).toEqual([]);
  });
});

describe("key event reach reporting", () => {
  const at = new Date("2026-10-26T02:00:00Z");
  const add = async (name: string, sessionId: string, ip: string, now = at.getTime()) => {
    await recordFunnelEvent(env, {
      payload: { eventId: crypto.randomUUID(), name, sessionId, path: "/app" },
      ip,
      userAgent: "Mozilla/5.0",
      country: "",
      now,
    });
  };

  it("reports independent visitors without manufacturing conversion from unrelated sessions", async () => {
    await add("signup_submit", "new-user-session", "203.0.113.1");
    await add("checkout_success", "old-user-session", "203.0.113.2");
    const report = await getFunnelSummary(env, 7, at);
    expect(report.steps.find((step) => step.name === "signup_submit")).toMatchObject({
      visitorDays: 1,
      events: 1,
    });
    expect(report.steps.find((step) => step.name === "checkout_success")).toMatchObject({
      visitorDays: 1,
      events: 1,
    });
    expect(report).not.toHaveProperty("overall");
    for (const step of report.steps) {
      expect(step).not.toHaveProperty("stepRate");
      expect(step).not.toHaveProperty("fromStart");
      expect(step).not.toHaveProperty("users");
    }
  });

  it("dedupes within a Beijing day, labels cross-day sums as visitor-days and respects the range", async () => {
    const midnight = Date.parse("2026-10-25T16:00:00Z");
    for (const now of [
      midnight - 2,
      midnight - 1,
      midnight,
      midnight + 1,
      midnight - 3 * 86_400_000,
    ])
      await add("channel_saved", "same-session", "203.0.113.1", now);
    const report = await getFunnelSummary(env, 2, at);
    expect(report.range).toEqual({ from: "2026-10-25", to: "2026-10-26", days: 2 });
    expect(report.steps.find((step) => step.name === "channel_saved")).toMatchObject({
      visitorDays: 2,
      events: 4,
    });
    const today = await getFunnelSummary(env, 1, at);
    expect(today.steps.find((step) => step.name === "channel_saved")).toMatchObject({
      visitorDays: 1,
      events: 2,
    });
  });

  it("excludes previously stored demo operations while retaining demo views and real workspace events", async () => {
    // 模拟旧客户端已经写入的记录；仅修改采集端不足以修复报表。
    for (const [name, path] of [
      ["channel_saved", "/demo"],
      ["channel_saved", "/demo/channels"],
      ["onboarding_done", "/Demo"],
      ["demo_view", "/demo"],
      ["channel_saved", "/app/channels"],
    ])
      await env.DB.prepare(
        "INSERT INTO funnel_events(day,name,path,visitor_hash,session_id,created_at,event_id) VALUES(?,?,?,?,?,?,?)",
      )
        .bind(
          "2026-10-26",
          name,
          path,
          "visitor",
          "session-0001",
          at.getTime(),
          crypto.randomUUID(),
        )
        .run();
    const report = await getFunnelSummary(env, 1, at);
    expect(report.steps.find((step) => step.name === "channel_saved")).toMatchObject({
      events: 1,
      visitorDays: 1,
    });
    expect(report.steps.find((step) => step.name === "onboarding_done")?.events).toBe(0);
    expect(report.side.find((step) => step.name === "demo_view")?.events).toBe(1);
  });
});
