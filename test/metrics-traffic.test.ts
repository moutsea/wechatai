import { env, createExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import pageViewsMigration from "../migrations/0014_page_views.sql?raw";
import signupMigration from "../migrations/0015_signup_attributions.sql?raw";
import funnelMigration from "../migrations/0016_funnel_events.sql?raw";
import budgetMigration from "../migrations/0020_analytics_budget.sql?raw";
import worker from "../src/server/index";
import usageGuide from "../docs/metrics-traffic.md?raw";
import * as auth from "../src/server/auth";
import {
  getAdminAnalytics,
  getSignupConversions,
  getTrafficSummary,
} from "../src/server/analytics";
import { readMetricsTraffic, type MetricsTraffic } from "../src/server/metrics-traffic";
import { METRICS_TRAFFIC_PATHS } from "../src/server/metrics-traffic-paths";
import { shanghaiDay } from "../src/shared/analytics";

const at = new Date("2026-11-25T08:00:00.000Z");
const token = "test-only-traffic-token-0123456789abcdef";
let logs: MockInstance[];

beforeEach(async () => {
  for (const migration of [pageViewsMigration, signupMigration, funnelMigration, budgetMigration])
    await env.DB.exec(migration.replace(/^--.*$/gm, "").replace(/\n/g, " "));
  await env.DB.batch(
    ["page_views", "signup_attributions", "funnel_events", "anonymous_analytics_budget"].map(
      (table) => env.DB.prepare(`DELETE FROM ${table}`),
    ),
  );
  logs = ["log", "info", "warn", "error"].map((method) =>
    vi.spyOn(console, method as "log" | "info" | "warn" | "error").mockImplementation(() => {}),
  );
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function bindings(overrides: Record<string, unknown> = {}): Env {
  return {
    ...env,
    METRICS_API_TOKEN: token,
    ANALYTICS_DAILY_EVENT_BUDGET: "10000",
    API_LIMIT: { limit: vi.fn(async () => ({ success: true })) },
    ...overrides,
  } as unknown as Env;
}
function request(
  b = bindings(),
  query = "",
  headers: Record<string, string> = { authorization: `Bearer ${token}` },
) {
  return worker.fetch(
    new Request(`https://wechatai.app/api/metrics/traffic${query}`, { headers }),
    b,
    createExecutionContext(),
  );
}
function consoleText() {
  return logs.flatMap((spy) => spy.mock.calls.map((args) => args.map(String).join(" "))).join("\n");
}
async function view(
  session: string,
  overrides: Partial<{
    path: string;
    source: string;
    host: string;
    visitor: string;
    country: string;
    device: string;
    time: number;
  }> = {},
) {
  const row = {
    path: "/pricing",
    source: "",
    host: "",
    visitor: "visitor-fixture",
    country: "CN",
    device: "desktop",
    time: at.getTime(),
    ...overrides,
  };
  await env.DB.prepare(
    "INSERT INTO page_views(day,path,referrer_host,utm_source,visitor_hash,session_id,country,device,created_at,event_id) VALUES (?,?,?,?,?,?,?,?,?,?)",
  )
    .bind(
      shanghaiDay(new Date(row.time)),
      row.path,
      row.host,
      row.source,
      row.visitor,
      session,
      row.country,
      row.device,
      row.time,
      crypto.randomUUID(),
    )
    .run();
}
async function signup(
  session: string,
  overrides: Partial<{ path: string; source: string; host: string; time: number }> = {},
) {
  const row = { path: "/pricing", source: "", host: "", time: at.getTime(), ...overrides };
  await env.DB.prepare(
    "INSERT INTO signup_attributions(day,session_id,landing_path,referrer_host,utm_source,created_at,event_id) VALUES (?,?,?,?,?,?,?)",
  )
    .bind(
      shanghaiDay(new Date(row.time)),
      session,
      row.path,
      row.host,
      row.source,
      row.time,
      crypto.randomUUID(),
    )
    .run();
}

function expectSharedCounts(
  report: MetricsTraffic,
  traffic: Awaited<ReturnType<typeof getTrafficSummary>>,
  conversions: Awaited<ReturnType<typeof getSignupConversions>>,
) {
  expect(report.traffic.observed!.totals).toEqual(traffic.totals);
  expect(report.traffic.observed!.daily).toEqual(traffic.daily);
  for (const key of ["topPages", "sources", "countries", "devices"] as const)
    expect(
      report.traffic.observed![key].map(({ pv, visitorDays }) => ({ pv, visitorDays })),
    ).toEqual(traffic[key].map(({ pv, visitorDays }) => ({ pv, visitorDays })));
  expect(
    report.traffic.observed!.sourceDepth.map(({ pv, sessions, pagesPerSession }) => ({
      pv,
      sessions,
      pagesPerSession,
    })),
  ).toEqual(
    traffic.sourceDepth.map(({ pv, sessions, pagesPerSession }) => ({
      pv,
      sessions,
      pagesPerSession,
    })),
  );
  expect(report.conversions.observed).toMatchObject({
    total: conversions.total,
    unattributed: conversions.unattributed,
    sessions: conversions.sessions,
    rate: null,
  });
  for (const key of ["rows", "sourceRows"] as const)
    expect(
      report.conversions.observed![key].map(({ sessions, signups, rate }) => ({
        sessions,
        signups,
        rate,
      })),
    ).toEqual(conversions[key].map(({ sessions, signups }) => ({ sessions, signups, rate: null })));
}

describe("traffic stored aggregates", () => {
  it("matches the complete documented example using a synthetic stored dataset", async () => {
    await view("example-session");
    await view("example-session");
    await signup("example-session");
    const json = usageGuide.match(/```json\n([\s\S]*?)\n```/)![1];
    expect(await readMetricsTraffic(bindings(), 1, at)).toEqual(JSON.parse(json));
  });

  it("reuses full summaries, Shanghai boundaries, signup snapshots and truncated rows", async () => {
    const midnight = Date.parse("2026-11-24T16:00:00Z");
    await view("boundary-session", { time: midnight - 1 });
    await view("boundary-session", { time: midnight, path: "/wechat-ai" });
    await view("old-landing", { time: at.getTime() - 10 * 86400000, path: "/docs" });
    await view("old-landing", { path: "/register" });
    for (const [i, path] of METRICS_TRAFFIC_PATHS.slice(0, 22).entries()) {
      await view(`session-${i}`, { path, source: "newsletter", host: "google.com" });
      await signup(`session-${i}`, { path, source: "newsletter", host: "google.com" });
    }
    await signup("session-0", { path: "/pricing", time: at.getTime() + 1 });
    await signup("signup-only", { path: "/pricing" });
    await signup("empty-snapshot", { path: "" });
    await view("empty-snapshot", { path: "/pricing", time: at.getTime() + 2 });
    for (const days of [1, 2, 7, 90]) {
      const report = await readMetricsTraffic(bindings(), days, at);
      const traffic = await getTrafficSummary(env, days, at, "raw");
      const conversions = await getSignupConversions(env, days, at);
      expectSharedCounts(report, traffic, conversions);
      expect(report.window).toMatchObject({ ...traffic.range, includesToday: true });
      expect(report.asOf).toBe(at.toISOString());
      expect(report.conversions.observed).toMatchObject({
        total: 24,
        unattributed: 1,
        sessions: 26,
      });
      expect(conversions.rate).toBe(24 / 26);
      expect(conversions.rows).toHaveLength(15);
      expect(conversions.sourceRows).toHaveLength(15);
      expect(conversions.rows.reduce((sum, row) => sum + row.signups, 0)).toBeLessThan(
        conversions.total,
      );
    }
    const oneDay = await readMetricsTraffic(bindings(), 1, at);
    const twoDays = await readMetricsTraffic(bindings(), 2, at);
    expect(oneDay.traffic.observed!.totals.visitorDays).toBe(1);
    expect(twoDays.traffic.observed!.totals.visitorDays).toBe(2);
    expect(twoDays.traffic.observed!.daily.map((row) => row.day)).toEqual([
      "2026-11-24",
      "2026-11-25",
    ]);
    expect(oneDay.traffic.observed!.sources.some((row) => row.source === "utm:newsletter")).toBe(
      true,
    );
    expect(oneDay.traffic.observed!.sources.some((row) => row.source === "google.com")).toBe(false);
  });

  it("keeps an older first visit and an empty registration snapshot", async () => {
    await view("old", { path: "/docs", host: "google.com", time: at.getTime() - 10 * 86400000 });
    await view("old", { path: "/pricing" });
    await signup("empty", { path: "" });
    await view("empty", { time: at.getTime() + 1 });
    const report = await readMetricsTraffic(bindings(), 1, at);
    expect(report.conversions.observed).toMatchObject({
      total: 1,
      unattributed: 1,
      sessions: 2,
      rate: null,
      rows: [{ label: "/docs", sessions: 1, signups: 0 }],
    });
    expect(report.conversions.observed!.sourceRows).toMatchObject([
      { source: "google.com", landingPath: "/docs" },
    ]);
  });

  it("redacts full unapproved dimensions without merging overlapping visitor or session counts", async () => {
    for (const path of [
      "/docs/person-fixture",
      "/pricing/person@example.test",
      "/en/docs/%70erson",
      "/docs/0123456789abcdef0123456789abcdef",
    ])
      await view("shared-session", { path, source: "person@example.test" });
    await view("shared-session", { path: "/pricing", host: "person-fixture.example.com" });
    await view("shared-session", {
      source: "（直接访问）",
      country: "COUNTRY_SENTINEL",
      device: "DEVICE_SENTINEL",
    });
    await view("shared-session", { source: "bing" });
    await view("shared-session");
    await signup("private-signup", {
      path: "/docs/person-fixture",
      host: "person-fixture.example.com",
    });
    const report = await readMetricsTraffic(bindings(), 1, at);
    const traffic = report.traffic.observed!;
    expect(traffic.totals).toMatchObject({ pv: 8, visitorDays: 1, sessions: 1 });
    expect(traffic.topPages.filter((row) => row.labelRedacted)).toHaveLength(4);
    expect(traffic.sources.filter((row) => row.sourceRedacted)).toHaveLength(3);
    expect(traffic.sources).toContainEqual({
      source: "",
      label: "（直接访问）",
      sourceRedacted: false,
      pv: 1,
      visitorDays: 1,
    });
    expect(traffic.sources.some((row) => row.source === "utm:bing")).toBe(true);
    expect(traffic.countries.some((row) => row.label === null && row.labelRedacted)).toBe(true);
    expect(traffic.devices.some((row) => row.label === null && row.labelRedacted)).toBe(true);
    expect(report.conversions.observed!.sourceRows[0]).toMatchObject({
      source: null,
      sourceRedacted: true,
      landingPath: null,
      landingPathRedacted: true,
      sessions: 1,
      signups: 1,
      rate: null,
    });
    expectSharedCounts(
      report,
      await getTrafficSummary(env, 1, at, "raw"),
      await getSignupConversions(env, 1, at),
    );
    const body = JSON.stringify(report);
    for (const value of [
      "person-fixture",
      "person@example.test",
      "%70erson",
      "0123456789abcdef0123456789abcdef",
      "SENTINEL",
      "shared-session",
      "private-signup",
      "visitor-fixture",
    ])
      expect(body).not.toContain(value);
  });
});

describe("traffic availability", () => {
  it("keeps empty or sparse stored data unavailable when coverage is unknown", async () => {
    const empty = await readMetricsTraffic(bindings(), 7, at);
    expect(empty.coverage).toMatchObject({
      complete: false,
      reason: "coverage_unknown",
      basis: null,
    });
    expect(empty.traffic).toMatchObject({
      available: false,
      data: null,
      observed: { totals: { pv: 0 } },
    });
    expect(empty.conversions.observed).toMatchObject({ total: 0, sessions: 0, rate: null });
    await view("sparse", { time: at.getTime() - 6 * 86400000 });
    await env.DB.prepare("INSERT INTO anonymous_analytics_budget VALUES (?,100000,16)")
      .bind("2026-11-19")
      .run();
    const sparse = await readMetricsTraffic(bindings(), 7, at);
    expect(sparse.coverage.reason).toBe("coverage_unknown");
    expect(sparse.traffic.observed!.daily).toHaveLength(1);
    expect(sparse.conversions.available).toBe(false);
  });

  it.each(["0", "invalid", "-1"])("reports current collection disabled for %s", async (budget) => {
    await view("stored");
    const report = await readMetricsTraffic(
      bindings({ ANALYTICS_DAILY_EVENT_BUDGET: budget }),
      7,
      at,
    );
    expect(report.coverage).toMatchObject({
      reason: "collection_disabled",
      basis: "current_budget_config",
      checkedDay: "2026-11-25",
    });
    expect(report.traffic.observed!.totals.pv).toBe(1);
    expect(report.conversions).toMatchObject({
      available: false,
      reason: "collection_disabled",
      data: null,
    });
  });

  it("reports fully reserved current permits without claiming historical loss or complete coverage", async () => {
    await env.DB.prepare("INSERT INTO anonymous_analytics_budget VALUES (?,32,16)")
      .bind("2026-11-25")
      .run();
    expect(
      (await readMetricsTraffic(bindings({ ANALYTICS_DAILY_EVENT_BUDGET: "32" }), 7, at)).coverage,
    ).toEqual({
      complete: false,
      reason: "collection_budget_limited",
      basis: "current_day_permits_fully_reserved",
      checkedDay: "2026-11-25",
    });
    expect(
      (await readMetricsTraffic(bindings({ ANALYTICS_DAILY_EVENT_BUDGET: "64" }), 7, at)).coverage
        .reason,
    ).toBe("coverage_unknown");
  });

  it.each(["page_views", "signup_attributions", "anonymous_analytics_budget"])(
    "marks the dependent blocks unavailable when %s is missing",
    async (table) => {
      await view("present");
      await env.DB.exec(`DROP TABLE ${table}`);
      const report = await readMetricsTraffic(bindings(), 7, at);
      expect(report.conversions).toEqual({
        available: false,
        reason: "storage_unavailable",
        data: null,
        observed: null,
      });
      if (table === "signup_attributions") expect(report.traffic.observed!.totals.pv).toBe(1);
      else
        expect(report.traffic).toEqual({
          available: false,
          reason: "storage_unavailable",
          data: null,
          observed: null,
        });
      if (table !== "anonymous_analytics_budget")
        await expect(getAdminAnalytics(env, "7")).rejects.toThrow();
    },
  );

  it("does not require the optional funnel table", async () => {
    await view("present");
    await env.DB.exec("DROP TABLE funnel_events");
    const report = await readMetricsTraffic(bindings(), 7, at);
    expect(report.traffic.observed!.totals.pv).toBe(1);
    expect(report).not.toHaveProperty("funnel");
  });
});

describe("traffic HTTP boundary", () => {
  it("returns an explicit field projection without session, account or external access", async () => {
    await view("SESSION_SENTINEL");
    await signup("SESSION_SENTINEL");
    const createAuth = vi.spyOn(auth, "createAuth");
    const outbound = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("OUTBOUND_SENTINEL"));
    const sql: string[] = [];
    const database = new Proxy(env.DB, {
      get(target, key) {
        if (key === "prepare")
          return (query: string) => {
            sql.push(query);
            return target.prepare(query);
          };
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const b = bindings({
      DB: database,
      ACCOUNTS: new Proxy(
        {},
        {
          get() {
            throw new Error("ACCOUNT_SENTINEL");
          },
        },
      ),
    });
    const response = await request(b, "?days=1", {
      authorization: `Bearer ${token}`,
      cookie: "COOKIE_SENTINEL",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const report = await response.json<MetricsTraffic>();
    expect(Object.keys(report).sort()).toEqual(
      [
        "service",
        "documentationVersion",
        "timezone",
        "asOf",
        "window",
        "dataSource",
        "coverage",
        "semantics",
        "limits",
        "traffic",
        "conversions",
      ].sort(),
    );
    expect(Object.keys(report.traffic.observed!).sort()).toEqual(
      ["totals", "daily", "topPages", "sources", "sourceDepth", "countries", "devices"].sort(),
    );
    expect(Object.keys(report.conversions.observed!).sort()).toEqual(
      ["total", "unattributed", "sessions", "rate", "rows", "sourceRows"].sort(),
    );
    expect(report).toEqual(await readMetricsTraffic(b, 1, at));
    const text = JSON.stringify(report) + consoleText();
    for (const value of [
      token,
      "SENTINEL",
      "session_id",
      "visitor_hash",
      "event_id",
      "user_id",
      "utm_source",
      "referrer_host",
    ])
      expect(text).not.toContain(value);
    expect(consoleText()).toContain('"route":"/api/metrics/traffic"');
    expect(sql.length).toBeGreaterThan(0);
    expect(sql.every((query) => /^(SELECT|WITH)\b/.test(query.trim()))).toBe(true);
    expect(createAuth).not.toHaveBeenCalled();
    expect(outbound).not.toHaveBeenCalled();
  });

  it.each([
    "",
    "0",
    "-1",
    "91",
    "1.5",
    "1e2",
    "0x7",
    " 7",
    "7 ",
    "NaN",
    "Infinity",
    "7abc",
    "07.0",
  ])("rejects invalid days %s before querying D1", async (days) => {
    const prepare = vi.fn(() => {
      throw new Error("DB_SENTINEL");
    });
    const response = await request(
      bindings({ DB: { prepare } }),
      `?days=${encodeURIComponent(days)}`,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_query" });
    expect(prepare).not.toHaveBeenCalled();
    expect(consoleText()).toContain('"reason":"invalid_query"');
    expect(consoleText()).not.toContain("SENTINEL");
  });

  it.each([
    ["", 7],
    ["?days=1", 1],
    ["?days=07", 7],
    ["?days=90", 90],
  ] as const)("uses the administrator window semantics for %s", async (query, days) => {
    const response = await request(bindings(), query);
    expect(response.status).toBe(200);
    expect((await response.json<MetricsTraffic>()).window.days).toBe(days);
  });

  it.each([undefined, "", "Bearer ", "Bearer wrong", `Basic ${token}`])(
    "rejects invalid credentials %s without business reads",
    async (authorization) => {
      const prepare = vi.fn(() => {
        throw new Error("DB_SENTINEL");
      });
      const response = await request(
        bindings({ DB: { prepare } }),
        "",
        authorization === undefined ? {} : { authorization },
      );
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthorized" });
      expect(prepare).not.toHaveBeenCalled();
      expect(consoleText()).not.toContain("SENTINEL");
    },
  );

  it("returns a safe 503 for storage failure and logs no SQL or thrown text", async () => {
    const response = await request(
      bindings({
        DB: {
          prepare() {
            throw new Error("SQL person@example.test SENTINEL");
          },
        },
      }),
      "?other=QUERY_SENTINEL",
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
    expect(consoleText()).toContain('"reason":"internal_error"');
    expect(consoleText()).not.toMatch(/SENTINEL|person@example.test|SQL/);
  });

  it("does not mistake a malformed analytics table for zero traffic", async () => {
    await env.DB.exec("DROP TABLE page_views; CREATE TABLE page_views (id INTEGER)");
    try {
      const response = await request();
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "unavailable" });
      expect(consoleText()).not.toContain("no such column");
    } finally {
      await env.DB.exec("DROP TABLE page_views");
    }
  });
});
