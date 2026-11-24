import { env, createExecutionContext } from "cloudflare:test";
import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import authMigration from "../migrations/0001_auth.sql?raw";
import billingMigration from "../migrations/0002_billing.sql?raw";
import worker from "../src/server/index";
import { metricsRevenue } from "../src/server/metrics-revenue";
import * as auth from "../src/server/auth";
import { dayWindow } from "../src/server/wallet";

let consoleSpies: MockInstance[];

const token = "test-only-revenue-token-0123456789abcdef";
const now = Date.parse("2026-10-10T01:00:00Z");
const start = dayWindow(now).start - 29 * 86400000;
const refundUnknown = {
  available: false,
  value: null,
  reason: "现有 paid 订单求和不是净额，退款未入本聚合",
};

beforeAll(async () => {
  for (const migration of [authMigration, billingMigration])
    await env.DB.exec(migration.replace(/^--.*$/gm, "").replace(/\n/g, " "));
});
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM billing_order"),
    env.DB.prepare("DELETE FROM user"),
  ]);
  consoleSpies = ["log", "info", "warn", "error"].map((method) =>
    vi.spyOn(console, method as "log" | "info" | "warn" | "error").mockImplementation(() => {}),
  );
});
afterEach(() => vi.restoreAllMocks());

function bindings(overrides: Record<string, unknown> = {}): Env {
  return {
    ...env,
    METRICS_API_TOKEN: token,
    STRIPE_SECRET_KEY: "sk_test_revenue_fixture",
    API_LIMIT: { limit: vi.fn(async () => ({ success: true })) },
    ...overrides,
  } as unknown as Env;
}
function request(b: Env, headers: Record<string, string> = { authorization: `Bearer ${token}` }) {
  return worker.fetch(
    new Request("https://wechatai.app/api/metrics/revenue?mode=live&days=1", { headers }),
    b,
    createExecutionContext(),
  );
}
async function user(id: string) {
  await env.DB.prepare(
    "INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,0,?,?)",
  )
    .bind(id, "BUYER_NAME_SENTINEL", `${id}@example.test`, now, now)
    .run();
}
async function order(
  id: string,
  amount: number,
  overrides: Partial<{
    user: string;
    mode: "test" | "live";
    status: string;
    currency: string;
    kind: string;
    createdAt: number;
    paidAt: number | null;
  }> = {},
) {
  const row = {
    user: "BUYER_A_SENTINEL",
    mode: "test",
    status: "paid",
    currency: "cny",
    kind: "plus",
    createdAt: start - 86400000,
    paidAt: now,
    ...overrides,
  };
  await env.DB.prepare(`INSERT INTO billing_order
    (id,user_id,mode,offer_id,kind,price_id,amount,currency,credits,customer_id,session_id,status,created_at,paid_at)
    VALUES (?,?,?,'OFFER_SENTINEL',?,'PRICE_SENTINEL',?,?,0,'CUSTOMER_SENTINEL',?,?,?,?)`)
    .bind(
      id,
      row.user,
      row.mode,
      row.kind,
      amount,
      row.currency,
      `SESSION_${id}`,
      row.status,
      row.createdAt,
      row.paidAt,
    )
    .run();
}

function consoleText() {
  return consoleSpies
    .flatMap((spy) => spy.mock.calls.map((args) => args.map(String).join(" ")))
    .join("\n");
}

describe("paid revenue aggregates", () => {
  it.each(["test", "live"] as const)(
    "preserves the paid cny scope and Shanghai boundaries in %s mode",
    async (mode) => {
      await user("BUYER_A_SENTINEL");
      await user("BUYER_B_SENTINEL");
      await order("BEFORE_WINDOW", 101, { mode, paidAt: start - 1 });
      await order("AT_START", 102, { mode, paidAt: start, kind: "credits" });
      await order("BEFORE_MIDNIGHT", 103, {
        mode,
        user: "BUYER_B_SENTINEL",
        paidAt: Date.parse("2026-10-09T15:59:59.999Z"),
      });
      await order("AT_MIDNIGHT", 104, {
        mode,
        user: "BUYER_B_SENTINEL",
        paidAt: Date.parse("2026-10-09T16:00:00Z"),
        kind: "credits",
      });
      await order("FALLBACK", 105, { mode, createdAt: now, paidAt: null, kind: "credits" });
      await order("AT_NOW", 106, { mode, user: "BUYER_B_SENTINEL" });
      await order("AFTER_NOW", 107, { mode, paidAt: now + 1 });
      for (const status of ["created", "open", "failed", "expired"])
        await order(`EXCLUDED_${status}`, 900, { mode, status });
      await order("OTHER_MODE", 9999, { mode: mode === "test" ? "live" : "test" });
      await order("OTHER_CURRENCY", 8888, { mode, currency: "usd" });

      const result = await metricsRevenue(env, mode, now);
      expect(result).toMatchObject({
        mode,
        timezone: "Asia/Shanghai",
        currency: "cny",
        unit: "人民币元",
        basis: "gross",
        label: "已支付毛额",
        generatedAt: now,
        source: "billing_order",
      });
      expect(result.summary).toEqual({
        available: true,
        window: "查询时库内全部匹配订单，无日期过滤",
        revenue: 7.28,
        paidOrders: 7,
        payingUsers: 2,
        membershipRevenue: 4.17,
        creditsRevenue: 3.11,
      });
      expect(result.daily).toMatchObject({
        available: true,
        from: start,
        to: now,
        boundaries: "inclusive",
        includesToday: true,
      });
      expect(result.daily.items).toHaveLength(30);
      expect(result.daily.items.map((row) => row.day)).toEqual(
        Array.from({ length: 30 }, (_, i) => dayWindow(start + i * 86400000).day),
      );
      expect(result.daily.items[0]).toEqual({ day: "2026-09-11", revenue: 1.02, paidOrders: 1 });
      expect(result.daily.items[1]).toEqual({ day: "2026-09-12", revenue: 0, paidOrders: 0 });
      expect(result.daily.items.at(-2)).toEqual({
        day: "2026-10-09",
        revenue: 1.03,
        paidOrders: 1,
      });
      expect(result.daily.items.at(-1)).toEqual({
        day: "2026-10-10",
        revenue: 3.15,
        paidOrders: 3,
      });
      expect(result.daily.items.reduce((count, row) => count + row.paidOrders, 0)).toBe(5);
      expect(result.refunds).toEqual(refundUnknown);
      expect(result.netRevenue).toEqual(refundUnknown);
      expect(result.sourceCoverage).toContain("历史订阅续费更新原订单");
      expect(await metricsRevenue(env, mode, now)).toEqual(result);
    },
  );

  it("returns known zeroes for an empty order set while refunds and net remain unavailable", async () => {
    const result = await metricsRevenue(env, "test", now);
    expect(result.summary).toMatchObject({
      available: true,
      revenue: 0,
      paidOrders: 0,
      payingUsers: 0,
      membershipRevenue: 0,
      creditsRevenue: 0,
    });
    expect(result.daily.items.every((row) => row.revenue === 0 && row.paidOrders === 0)).toBe(true);
    expect(result.refunds).toEqual(refundUnknown);
    expect(result.netRevenue).toEqual(refundUnknown);
  });
});

describe("revenue HTTP contract", () => {
  it("returns only aggregates without querying sessions, snapshots, accounts or external services", async () => {
    await user("BUYER_A_SENTINEL");
    await order("ORDER_SENTINEL", 1234);
    const createAuth = vi.spyOn(auth, "createAuth");
    const outbound = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("OUTBOUND_SENTINEL"));
    const response = await request(
      bindings({
        ACCOUNTS: new Proxy(
          {},
          {
            get() {
              throw new Error("ACCOUNTS_SENTINEL");
            },
          },
        ),
      }),
      { authorization: `Bearer ${token}`, cookie: "COOKIE_SENTINEL" },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const text = await response.text();
    const body = JSON.parse(text);
    expect(Object.keys(body).sort()).toEqual(
      [
        "service",
        "documentationVersion",
        "timezone",
        "authenticated",
        "mode",
        "currency",
        "unit",
        "basis",
        "label",
        "generatedAt",
        "source",
        "sourceCoverage",
        "definitions",
        "summary",
        "daily",
        "refunds",
        "netRevenue",
      ].sort(),
    );
    expect(body.mode).toBe("test");
    expect(body.generatedAt).toBeGreaterThan(0);
    expect(body.summary).toEqual({
      available: true,
      window: "查询时库内全部匹配订单，无日期过滤",
      revenue: 12.34,
      paidOrders: 1,
      payingUsers: 1,
      membershipRevenue: 12.34,
      creditsRevenue: 0,
    });
    expect(body.daily.items).toHaveLength(30);
    for (const row of body.daily.items)
      expect(Object.keys(row).sort()).toEqual(["day", "paidOrders", "revenue"]);
    expect(body.refunds).toEqual(refundUnknown);
    expect(body.netRevenue).toEqual(refundUnknown);
    expect(createAuth).not.toHaveBeenCalled();
    expect(outbound).not.toHaveBeenCalled();
    expect(consoleText()).toContain('"route":"/api/metrics/revenue"');
    expect(consoleText()).toContain('"status":200');
    for (const sentinel of ["SENTINEL", "@example.test", token, "sk_test_revenue_fixture"])
      expect(text + consoleText()).not.toContain(sentinel);
  });

  it.each(["", "pk_live_fixture", "rk_live_fixture"])(
    "reports unavailable mode for %s before querying orders",
    async (key) => {
      const response = await request(
        bindings({
          STRIPE_SECRET_KEY: key,
          DB: new Proxy(
            {},
            {
              get() {
                throw new Error("DB_SENTINEL");
              },
            },
          ),
        }),
      );
      expect(response.status).toBe(503);
      const reason = key ? "billing_mode_unknown" : "billing_not_configured";
      expect(await response.json()).toEqual({
        error: "unavailable",
        available: false,
        reason,
        billingMode: { available: false, reason },
      });
      expect(consoleText()).not.toContain("DB_SENTINEL");
      expect(consoleText()).toContain('"reason":"billing_unavailable"');
    },
  );

  it("uses the configured live mode for HTTP requests", async () => {
    await user("BUYER_A_SENTINEL");
    await order("TEST_ORDER", 101);
    await order("LIVE_ORDER", 202, { mode: "live" });
    const response = await request(bindings({ STRIPE_SECRET_KEY: "sk_live_revenue_fixture" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      mode: "live",
      summary: { revenue: 2.02, paidOrders: 1 },
    });
  });

  it("rejects other service credentials before reading the database", async () => {
    const other = "test-only-other-service-secret-0123456789";
    const response = await request(
      bindings({
        SERVER_MONITOR_SECRET: other,
        EXECUTOR_SECRET: other,
        WECHAT_RECEIVER_SECRET: other,
        BILLING_NOTIFY_TOKEN: other,
        BETTER_AUTH_SECRET: other,
        ENCRYPTION_KEY: other,
        DB: new Proxy(
          {},
          {
            get() {
              throw new Error("DB_SENTINEL");
            },
          },
        ),
      }),
      { authorization: `Bearer ${other}` },
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(consoleText()).not.toContain("DB_SENTINEL");
    expect(consoleText()).not.toContain(other);
  });

  it("returns a sanitized 503 when the real database query fails", async () => {
    await env.DB.exec("ALTER TABLE billing_order RENAME TO unavailable_orders");
    try {
      const response = await request(bindings());
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({
        error: "unavailable",
        available: false,
        reason: "revenue_unavailable",
      });
      expect(consoleText()).toContain('"status":503');
      expect(consoleText()).not.toMatch(/D1_ERROR|no such table|unavailable_orders/);
    } finally {
      await env.DB.exec("ALTER TABLE unavailable_orders RENAME TO billing_order");
    }
  });

  it("rejects unsuccessful or missing aggregate results without producing zeroes", async () => {
    const session = env.DB.withSession("first-primary");
    const batch = vi.spyOn(session, "batch");
    const b = bindings({ DB: { withSession: () => session } });
    for (const results of [
      [
        { success: false, results: [] },
        { success: true, results: [] },
      ],
      [
        { success: true, results: [] },
        { success: true, results: [] },
      ],
      [
        { success: true, results: [{}] },
        { success: false, results: [] },
      ],
    ]) {
      batch.mockResolvedValueOnce(results as D1Result[]);
      const response = await request(b);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: "unavailable",
        available: false,
        reason: "revenue_unavailable",
      });
    }
    batch.mockRejectedValueOnce(new Error("DATABASE_SECRET_SENTINEL"));
    expect((await request(b)).status).toBe(503);
    expect(consoleText()).not.toContain("DATABASE_SECRET_SENTINEL");
  });
});
