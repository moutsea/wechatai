import { env, createExecutionContext } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
import budgetMigration from "../migrations/0020_analytics_budget.sql?raw";
import { authEmailMigration, verifiedFixtureCookie } from "./auth-fixtures";
import worker from "../src/server/index";

const token = "test-only-metrics-token-0123456789abcdef";
const otherToken = "test-only-other-token-fedcba9876543210";
const ip = "203.0.113.10";

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
});

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
    STRIPE_SECRET_KEY: "",
    API_LIMIT: fakeLimiter().binding,
    ...overrides,
  } as unknown as Env;
}

function call(
  bindings: Env,
  path = "/api/metrics/health",
  init: RequestInit = {},
  clientIp = ip,
) {
  const headers = new Headers(init.headers);
  if (!headers.has("cf-connecting-ip")) headers.set("cf-connecting-ip", clientIp);
  return worker.fetch(
    new Request(`https://wechatai.app${path}`, { ...init, headers }),
    bindings,
    createExecutionContext(),
  );
}

const bearer = (value = token) => ({ authorization: `Bearer ${value}` });



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
    const b = bindings({
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
      billingMode: { available: false, reason: "billing_not_configured" },
    });
  });

  it("fails closed when the credential is missing, short or mismatched", async () => {
    for (const configured of [undefined, "", "   ", "short", "x".repeat(31)]) {
      const response = await call(
        bindings({ METRICS_API_TOKEN: configured }),
        undefined,
        { headers: bearer() },
      );
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
      const response = await call(bindings(), undefined, {
        headers: { authorization },
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthorized" });
    }
  });


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
  it("rejects non-GET methods only after authentication", async () => {
    for (const method of ["HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"]) {
      const unauthenticated = await call(bindings(), undefined, { method });
      expect(unauthenticated.status).toBe(401);

      const response = await call(bindings(), undefined, { method, headers: bearer() });
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET");
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
      if (method !== "HEAD") expect(await response.json()).toEqual({ error: "method_not_allowed" });
      else expect(await response.text()).toBe("");
    }
  });

  it("handles the prefix before the general API body limit", async () => {
    const response = await call(bindings(), undefined, {
      method: "POST",
      headers: { ...bearer(), "content-type": "application/octet-stream" },
      body: new Uint8Array(200 * 1024),
    });
    expect(response.status).toBe(405);
  });

  it("returns 404 for every path except the exact health route", async () => {
    for (const path of [
      "/api/metrics",
      "/api/metrics/",
      "/api/metrics/overview",
      "/api/metrics/health/extra",
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
      ["/api/internal/server-status", "POST"],
    ] as const) {
      const response = await call(b, path, {
        method,
        headers: { ...bearer(), origin: env.APP_URL, "content-type": "application/json" },
        ...(method === "POST" ? { body: "{}" } : {}),
      });
      expect(response.status, `${method} ${path}`).toBe(401);
    }
  });
});

describe("metrics browser session isolation", () => {
  it("rejects admin and ordinary cookies without a bearer", async () => {
    const ordinary = await signUp();
    const admin = await signUp();
    await env.DB.prepare("INSERT INTO admin_user(user_id,created_at) VALUES (?,?)")
      .bind(admin.id, Date.now())
      .run();

    const limiter = fakeLimiter();
    for (const cookie of [ordinary.cookie, admin.cookie]) {
      expect(
        (
          await call(bindings({ API_LIMIT: limiter.binding }), undefined, {
            headers: { cookie },
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await call(bindings({ API_LIMIT: limiter.binding }), undefined, {
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
  });
});

