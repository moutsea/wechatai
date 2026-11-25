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
import adminMigration from "../migrations/0005_admin.sql?raw";
import referralMigration from "../migrations/0003_referrals.sql?raw";
import prepaidMigration from "../migrations/0004_prepaid_membership.sql?raw";
import serverStatusMigration from "../migrations/0013_server_status.sql?raw";
import pageViewsMigration from "../migrations/0014_page_views.sql?raw";
import signupMigration from "../migrations/0015_signup_attributions.sql?raw";
import funnelMigration from "../migrations/0016_funnel_events.sql?raw";
import adminExpiryMigration from "../migrations/0017_admin_expiry.sql?raw";
import accountRoutesMigration from "../migrations/0019_account_backend_routes.sql?raw";
import budgetMigration from "../migrations/0020_analytics_budget.sql?raw";
import { authEmailMigration, verifiedFixtureCookie } from "./auth-fixtures";
import * as auth from "../src/server/auth";
import worker from "../src/server/index";

const token = "test-only-metrics-token-0123456789abcdef";
const otherToken = "test-only-other-token-fedcba9876543210";
const ip = "203.0.113.10";

let consoleLog: MockInstance;
let consoleInfo: MockInstance;
let consoleWarn: MockInstance;
let consoleError: MockInstance;

beforeAll(async () => {
  for (const migration of [
    authMigration,
    billingMigration,
    referralMigration,
    prepaidMigration,
    adminMigration,
    authEmailMigration,
    serverStatusMigration,
    pageViewsMigration,
    signupMigration,
    funnelMigration,
    budgetMigration,
    accountRoutesMigration,
    adminExpiryMigration,
  ])
    await env.DB.exec(migration.replace(/^--.*$/gm, "").replace(/\n/g, " "));
});
beforeEach(async () => {
  await env.DB.batch(
    ["admin_user", "session", "account", "user"].map((table) =>
      env.DB.prepare(`DELETE FROM ${table}`),
    ),
  );
  consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
  consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

type LimitOutcome = "ok" | "limited" | "throw";

function fakeLimiter(plan: (key: string) => LimitOutcome = () => "ok") {
  const calls: string[] = [];
  const limit = vi.fn(async ({ key }: { key: string }) => {
    calls.push(key);
    const outcome = plan(key);
    if (outcome === "throw") throw new Error("LIMITER_SENTINEL");
    return { success: outcome === "ok" };
  });
  return { calls, binding: { limit } as unknown as Env["API_LIMIT"] };
}

function bindings(overrides: Record<string, unknown> = {}): Env {
  return {
    ...env,
    METRICS_API_TOKEN: token,
    STRIPE_SECRET_KEY: "sk_test_metrics_fixture",
    API_LIMIT: fakeLimiter().binding,
    ...overrides,
  } as unknown as Env;
}

function call(bindings: Env, path = "/api/metrics/health", init: RequestInit = {}, clientIp = ip) {
  const headers = new Headers(init.headers);
  if (!headers.has("cf-connecting-ip")) headers.set("cf-connecting-ip", clientIp);
  return worker.fetch(
    new Request(`https://wechatai.app${path}`, { ...init, headers }),
    bindings,
    createExecutionContext(),
  );
}

const bearer = (value = token) => ({ authorization: `Bearer ${value}` });

function auditRecords(): Record<string, unknown>[] {
  return consoleLog.mock.calls
    .map(([value]) => String(value))
    .filter((value) => value.includes('"event":"metrics.request"'))
    .map((value) => JSON.parse(value) as Record<string, unknown>);
}

function allConsoleText() {
  return [consoleLog, consoleInfo, consoleWarn, consoleError]
    .flatMap((spy) => spy.mock.calls.map((args) => args.map(String).join(" ")))
    .join("\n");
}

async function signUp() {
  const email = `metrics-${crypto.randomUUID()}@example.test`;
  const response = await worker.fetch(
    new Request(`${env.APP_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        origin: env.APP_URL,
        "content-type": "application/json",
        "cf-connecting-ip": `198.18.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`,
      },
      body: JSON.stringify({
        name: "Metrics fixture",
        email,
        password: "test-password-only",
      }),
    }),
    env,
    createExecutionContext(),
  );
  const raw = await response.text();
  expect(response.status, raw).toBe(200);
  const body = JSON.parse(raw) as { user: { id: string } };
  return {
    id: body.user.id,
    email,
    cookie: await verifiedFixtureCookie(body.user.id, "test-password-only"),
  };
}

describe("metrics credentials", () => {
  it("accepts only the dedicated bearer credential", async () => {
    const createAuth = vi.spyOn(auth, "createAuth");
    const outbound = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected fetch"));
    const b = bindings({
      STRIPE_SECRET_KEY: "sk_test_metrics_fixture",
      STRIPE_WEBHOOK_SECRET: "whsec_test_only",
      STRIPE_PORTAL_CONFIG_ID: "bpc_test",
      STRIPE_PLUS_MONTHLY_PRICE_ID: "price_metrics_fixture",
      DB: new Proxy(
        {},
        {
          get() {
            throw new Error("DB_SENTINEL");
          },
        },
      ),
      ACCOUNTS: new Proxy(
        {},
        {
          get() {
            throw new Error("DO_SENTINEL");
          },
        },
      ),
    });
    const response = await call(b, undefined, { headers: bearer() });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(await response.json()).toEqual({
      service: "wechatai",
      documentationVersion: "1",
      timezone: "Asia/Shanghai",
      authenticated: true,
      billingMode: { available: true, mode: "test" },
    });
    expect(createAuth).not.toHaveBeenCalled();
    expect(outbound).not.toHaveBeenCalled();
    expect(auditRecords()).toEqual([
      {
        event: "metrics.request",
        at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
        route: "/api/metrics/health",
        method: "GET",
        status: 200,
        rateLimited: false,
        reason: "ok",
      },
    ]);
    expect(allConsoleText()).not.toContain("DB_SENTINEL");
    expect(allConsoleText()).not.toContain("DO_SENTINEL");
    expect(allConsoleText()).not.toContain(token);
  });

  it.each(["/api/metrics/health", "/api/metrics/revenue"])(
    "fails closed when the credential is missing, short or mismatched (%s)",
    async (path) => {
      for (const configured of [undefined, "", "   ", "short", "x".repeat(31)]) {
        const response = await call(bindings({ METRICS_API_TOKEN: configured }), path, {
          headers: bearer(),
        });
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "unauthorized" });
      }
      for (const authorization of [
        "",
        `Bearer ${otherToken}`,
        token,
        `Basic ${token}`,
        "Bearer ",
        `Bearer  ${token}`,
      ]) {
        const response = await call(bindings(), path, {
          headers: { authorization },
        });
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "unauthorized" });
      }
    },
  );

  it.each(["/api/metrics/health", "/api/metrics/revenue"])(
    "does not let an invalid credential consume the shared token quota (%s)",
    async (path) => {
      const limiter = fakeLimiter();
      const response = await call(bindings({ API_LIMIT: limiter.binding }), path, {
        headers: bearer(otherToken),
      });
      expect(response.status).toBe(401);
      expect(limiter.calls).toEqual([`metrics:ip:${ip}`]);
    },
  );

  it("reports only reliably recognized Stripe modes", async () => {
    const cases = [
      ["sk_test_example", { available: true, mode: "test" }],
      ["sk_live_example", { available: true, mode: "live" }],
      ["", { available: false, reason: "billing_not_configured" }],
      ["  ", { available: false, reason: "billing_not_configured" }],
      ["pk_live_example", { available: false, reason: "billing_mode_unknown" }],
      ["rk_live_example", { available: false, reason: "billing_mode_unknown" }],
    ] as const;
    for (const [key, expected] of cases) {
      const response = await call(bindings({ STRIPE_SECRET_KEY: key }), undefined, {
        headers: bearer(),
      });
      expect(response.status).toBe(200);
      expect((await response.json<{ billingMode: unknown }>()).billingMode).toEqual(expected);
    }
  });
});

describe("metrics routing boundary", () => {
  it.each(["/api/metrics/health", "/api/metrics/revenue"])(
    "rejects non-GET methods only after authentication (%s)",
    async (path) => {
      for (const method of ["HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"]) {
        const unauthenticated = await call(bindings(), path, { method });
        expect(unauthenticated.status).toBe(401);

        const response = await call(bindings(), path, { method, headers: bearer() });
        expect(response.status).toBe(405);
        expect(response.headers.get("allow")).toBe("GET");
        expect(response.headers.get("access-control-allow-origin")).toBeNull();
        if (method !== "HEAD")
          expect(await response.json()).toEqual({ error: "method_not_allowed" });
        else expect(await response.text()).toBe("");
      }
    },
  );

  it("keeps the public health probe independent of metrics auth and limits", async () => {
    const limiter = fakeLimiter();
    const response = await call(bindings({ API_LIMIT: limiter.binding }), "/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: "wechatai" });
    expect(limiter.calls).toEqual([]);
  });

  it.each(["/api/metrics/health", "/api/metrics/revenue"])(
    "handles the prefix before the general API body limit (%s)",
    async (path) => {
      const response = await call(bindings(), path, {
        method: "POST",
        headers: { ...bearer(), "content-type": "application/octet-stream" },
        body: new Uint8Array(200 * 1024),
      });
      expect(response.status).toBe(405);
    },
  );

  it("returns 404 for unknown metrics paths", async () => {
    for (const path of [
      "/api/metrics",
      "/api/metrics/",
      "/api/metrics/overview",
      "/api/metrics/health/extra",
      "/api/metrics/revenue/extra",
      "/api/metrics/revenue/",
      "/api/metrics/health%2f..%2fadmin",
    ]) {
      const response = await call(bindings(), path, { headers: bearer() });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not_found" });
    }
    const unknownPost = await call(bindings(), "/api/metrics/overview", {
      method: "POST",
      headers: bearer(),
    });
    expect(unknownPost.status).toBe(404);
  });

  it("gives a metrics bearer no browser-session powers", async () => {
    const limiter = fakeLimiter();
    const b = bindings({ API_LIMIT: limiter.binding });
    for (const [path, method] of [
      ["/api/me", "GET"],
      ["/api/admin/access", "GET"],
      ["/api/admin/users", "GET"],
      ["/api/admin/sync", "POST"],
      ["/api/admin/users/fixture/gift-plus", "POST"],
      ["/api/models/fixture", "PATCH"],
      ["/api/wechat/links", "POST"],
      ["/api/internal/server-status", "POST"],
    ] as const) {
      const response = await call(b, path, {
        method,
        headers: { ...bearer(), origin: env.APP_URL, "content-type": "application/json" },
        ...(method !== "GET" ? { body: "{}" } : {}),
      });
      expect(response.status, `${method} ${path}`).toBe(401);
    }
  });
});

describe("metrics browser session isolation", () => {
  it.each(["/api/metrics/health", "/api/metrics/revenue", "/api/metrics/retention"])(
    "rejects ordinary, admin and Plus cookies without a bearer (%s)",
    async (path) => {
      const ordinary = await signUp();
      const admin = await signUp();
      const plus = await signUp();
      await env.DB.prepare("INSERT INTO admin_user(user_id,created_at) VALUES (?,?)")
        .bind(admin.id, Date.now())
        .run();
      await env.ACCOUNTS.getByName(plus.id).applyPayment({
        id: "test-only-metrics-membership",
        kind: "membership",
        months: 1,
      });
      const dashboard = await worker.fetch(
        new Request(`${env.APP_URL}/api/dashboard`, { headers: { cookie: plus.cookie } }),
        env,
        createExecutionContext(),
      );
      expect(dashboard.status).toBe(200);
      expect(await dashboard.json()).toMatchObject({ plan: "plus" });

      const limiter = fakeLimiter();
      for (const cookie of [ordinary.cookie, admin.cookie, plus.cookie]) {
        expect(
          (
            await call(bindings({ API_LIMIT: limiter.binding }), path, {
              headers: { cookie },
            })
          ).status,
        ).toBe(401);
        expect(
          (
            await call(bindings({ API_LIMIT: limiter.binding }), path, {
              headers: { cookie, ...bearer(otherToken) },
            })
          ).status,
        ).toBe(401);
      }

      const access = await worker.fetch(
        new Request(`${env.APP_URL}/api/admin/access`, { headers: { cookie: admin.cookie } }),
        env,
        createExecutionContext(),
      );
      expect(access.status).toBe(200);
      expect(await access.json()).toEqual({ isAdmin: true });
    },
  );
});

describe("metrics rate limits and audit", () => {
  it.each(["/api/metrics/health", "/api/metrics/revenue"])(
    "limits by trusted client IP before authenticating (%s)",
    async (path) => {
      const limiter = fakeLimiter((key) => (key.startsWith("metrics:ip:") ? "limited" : "ok"));
      const response = await call(bindings({ API_LIMIT: limiter.binding }), path, {
        headers: bearer(otherToken),
      });
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("60");
      expect(await response.json()).toEqual({ error: "rate_limited" });
      expect(limiter.calls).toEqual([`metrics:ip:${ip}`]);
    },
  );

  it.each(["/api/metrics/health", "/api/metrics/revenue"])(
    "limits the shared credential only after a valid bearer (%s)",
    async (path) => {
      const limiter = fakeLimiter((key) => (key === "metrics:token:shared" ? "limited" : "ok"));
      const response = await call(bindings({ API_LIMIT: limiter.binding }), path, {
        headers: bearer(),
      });
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("60");
      expect(limiter.calls).toEqual([`metrics:ip:${ip}`, "metrics:token:shared"]);
      expect(limiter.calls.join(" ")).not.toContain(token);
    },
  );

  it.each(["/api/metrics/health", "/api/metrics/revenue"])(
    "fails closed when the limiter binding is missing or throws (%s)",
    async (path) => {
      const { API_LIMIT: _missing, ...withoutLimiter } = bindings();
      for (const b of [
        withoutLimiter as unknown as Env,
        bindings({
          API_LIMIT: { limit: async () => Promise.reject(new Error("LIMITER_SENTINEL")) },
        }),
      ]) {
        const response = await call(b, path, { headers: bearer() });
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: "unavailable" });
      }
    },
  );

  it("emits one whitelisted audit record per result without request data", async () => {
    const sentinels = {
      auth: "AUTH_SENTINEL",
      cookie: "COOKIE_SENTINEL",
      header: "HEADER_SENTINEL",
      query: "QUERY_SENTINEL",
      path: "PATH_SENTINEL",
      email: "EMAIL_SENTINEL@example.test",
      error: "ERROR_SENTINEL",
    };
    const b = bindings();
    const request = (
      path: string,
      init: RequestInit = {},
      overrides: Record<string, unknown> = {},
    ) =>
      call(
        { ...b, ...overrides } as Env,
        path,
        {
          ...init,
          headers: {
            "x-probe": sentinels.header,
            "x-user-email": sentinels.email,
            ...(init.headers as Record<string, string>),
          },
        },
        "203.0.113.77",
      );

    await request(`/api/metrics/health?probe=${sentinels.query}`, { headers: bearer() });
    await request("/api/metrics/health", {
      headers: { authorization: `Bearer ${sentinels.auth}`, cookie: sentinels.cookie },
    });
    await request(`/api/metrics/${sentinels.path}`, { headers: bearer() });
    await request("/api/metrics/health", { method: "OPTIONS", headers: bearer() });
    await request(
      "/api/metrics/health",
      { headers: bearer() },
      {
        API_LIMIT: fakeLimiter(() => "limited").binding,
      },
    );

    const exploding = bindings();
    Object.defineProperty(exploding, "METRICS_API_TOKEN", {
      get() {
        throw new Error(sentinels.error);
      },
    });
    await call(exploding, "/api/metrics/health", {
      headers: { authorization: `Bearer ${token}`, "x-probe": sentinels.header },
    });

    const records = auditRecords();
    expect(records.map((record) => record.status)).toEqual([200, 401, 404, 405, 429, 503]);
    expect(records.map((record) => record.reason)).toEqual([
      "ok",
      "unauthorized",
      "not_found",
      "method_not_allowed",
      "ip_rate_limited",
      "internal_error",
    ]);
    const allowed = ["event", "at", "route", "method", "status", "rateLimited", "reason"];
    for (const record of records) {
      expect(Object.keys(record).sort()).toEqual([...allowed].sort());
      expect(record.route).toMatch(/^\/api\/metrics(\/health|\/\*)?$/);
    }
    const text = allConsoleText();
    for (const sentinel of Object.values(sentinels)) expect(text).not.toContain(sentinel);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("enforces the real API_LIMIT binding for IP and token", async () => {
    const b = bindings({ API_LIMIT: env.API_LIMIT });
    const clientIp = "203.0.113.240";
    for (let i = 0; i < 120; i += 1) {
      expect(
        (
          await call(
            b,
            i === 119 ? "/api/metrics/revenue" : "/api/metrics/health",
            { headers: bearer() },
            clientIp,
          )
        ).status,
        `request ${i + 1}`,
      ).toBe(200);
    }
    const ipLimited = await call(b, "/api/metrics/revenue", { headers: bearer() }, clientIp);
    expect(ipLimited.status).toBe(429);
    expect(ipLimited.headers.get("retry-after")).toBe("60");

    const tokenLimited = await call(
      b,
      "/api/metrics/revenue",
      { headers: bearer() },
      "203.0.113.241",
    );
    expect(tokenLimited.status).toBe(429);
    expect(tokenLimited.headers.get("retry-after")).toBe("60");
  });
});
