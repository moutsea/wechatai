import { env, runInDurableObject, createExecutionContext } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import authMigration from "../migrations/0001_auth.sql?raw";
import billingMigration from "../migrations/0002_billing.sql?raw";
import referralMigration from "../migrations/0003_referrals.sql?raw";
import prepaidMigration from "../migrations/0004_prepaid_membership.sql?raw";
import adminMigration from "../migrations/0005_admin.sql?raw";
import worker from "../src/server/index";
import { adminOverview, adminUsers, saveAdminStats, syncAdminStats } from "../src/server/admin";
import { readAdminAccountStats } from "../src/server/admin-account";
import { dayWindow } from "../src/server/wallet";
import type { AdminAccountStats } from "../src/shared/admin";

beforeAll(async () => {
  for (const migration of [
    authMigration,
    billingMigration,
    referralMigration,
    prepaidMigration,
    adminMigration,
  ])
    await env.DB.exec(migration.replace(/^--.*$/gm, "").replace(/\n/g, " "));
});
beforeEach(async () => {
  await env.DB.batch(
    [
      "admin_account_stats",
      "admin_user",
      "billing_order",
      "referral",
      "referral_code",
      "session",
      "account",
      "user",
    ].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("Unexpected external request"))),
  );
});
afterEach(() => vi.unstubAllGlobals());

async function user(
  id: string = crypto.randomUUID(),
  email = `${id}@example.test`,
  createdAt = Date.now(),
) {
  await env.DB.prepare(
    "INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,0,?,?)",
  )
    .bind(id, `User ${id}`, email, createdAt, createdAt)
    .run();
  return id;
}
const blankStats = (extra: Partial<AdminAccountStats> = {}): AdminAccountStats => ({
  sampledAt: Date.now(),
  planUntil: 0,
  links: 0,
  connected: 0,
  channels: 0,
  models: 0,
  plugins: 0,
  sessions: 0,
  requests: 0,
  tokens: 0,
  credits: 0,
  purchasedCredits: 0,
  debt: 0,
  lastActiveAt: null,
  daily: [],
  pluginUsage: [],
  ...extra,
});
async function order(
  id: string,
  uid: string,
  amount: number,
  mode: string,
  status: string,
  kind: string,
  paidAt: number,
  currency = "cny",
) {
  await env.DB.prepare(`INSERT INTO billing_order(id,user_id,mode,offer_id,kind,price_id,amount,currency,credits,customer_id,status,created_at,paid_at)
    VALUES (?,?,?,'offer',?,'price',?,?,0,'customer',?,?,?)`)
    .bind(id, uid, mode, kind, amount, currency, status, paidAt, paidAt)
    .run();
}
const request = (path: string, options?: RequestInit) =>
  worker.fetch(new Request(`${env.APP_URL}${path}`, options), env, createExecutionContext());
async function login() {
  const response = await request("/api/auth/sign-up/email", {
    method: "POST",
    headers: {
      origin: env.APP_URL,
      "content-type": "application/json",
      "cf-connecting-ip": "198.51.100.220",
    },
    body: JSON.stringify({
      name: "Admin test",
      email: `test-${crypto.randomUUID()}@example.test`,
      password: "test-password-only",
      isAdmin: true,
      role: "admin",
    }),
  });
  expect(response.status).toBe(200);
  const { user: account } = await response.json<{ user: { id: string } }>();
  return {
    id: account.id,
    cookie: response.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  };
}

describe("admin authorization", () => {
  it("requires authentication and a server-side role on every protected endpoint", async () => {
    for (const path of ["/api/admin/access", "/api/admin/overview", "/api/admin/users"])
      expect((await request(path)).status).toBe(401);
    const account = await login();
    const headers = {
      cookie: account.cookie,
      origin: env.APP_URL,
      "content-type": "application/json",
    };
    expect(await (await request("/api/admin/access", { headers })).json()).toEqual({
      isAdmin: false,
    });
    for (const path of ["/api/admin/overview", "/api/admin/users?q=admin", "/api/admin/unknown"])
      expect((await request(path, { headers })).status).toBe(403);
    expect((await request("/api/admin/sync", { method: "POST", headers, body: "{}" })).status).toBe(
      403,
    );
    await env.DB.prepare("INSERT INTO admin_user VALUES (?,?)").bind(account.id, Date.now()).run();
    const allowed = await request("/api/admin/overview", { headers });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("cache-control")).toBe("no-store");
    expect(allowed.headers.get("x-robots-tag")).toContain("noindex");
    expect(
      (
        await request("/api/admin/sync", {
          method: "POST",
          headers: { ...headers, origin: "https://evil.example" },
          body: "{}",
        })
      ).status,
    ).toBe(403);
    expect(
      (await request("/api/admin/sync", { method: "POST", headers, body: '{"cursor":{}}' })).status,
    ).toBe(400);
    expect((await request("/api/admin/sync", { method: "POST", headers, body: "{}" })).status).toBe(
      200,
    );
    await env.DB.prepare("DELETE FROM admin_user WHERE user_id=?").bind(account.id).run();
    expect((await request("/api/admin/overview", { headers })).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("admin aggregates", () => {
  it("uses Beijing days, ignores unpaid/other currencies, separates test payments, and counts distinct active users", async () => {
    const now = Date.parse("2026-10-10T01:00:00Z");
    const beforeMidnight = Date.parse("2026-10-09T15:59:59Z");
    const afterMidnight = beforeMidnight + 1000;
    const a = await user("a", "a@example.test", afterMidnight / 1000);
    const b = await user("b", "b@example.test", beforeMidnight);
    expect((await adminUsers(env, {})).items.map((item) => item.id)).toEqual([a, b]);
    await saveAdminStats(
      env,
      a,
      blankStats({
        sampledAt: now,
        planUntil: now + 1000,
        credits: 1.234,
        requests: 2,
        tokens: 300,
        daily: [{ day: "2026-10-10", requests: 2, tokens: 300, credits: 1.234 }],
        pluginUsage: [
          {
            pluginId: "wechatai/llm-chat",
            day: "2026-10-10",
            requests: 2,
            tokens: 300,
            credits: 1.234,
          },
        ],
      }),
    );
    await saveAdminStats(
      env,
      b,
      blankStats({
        sampledAt: now,
        planUntil: now - 1,
        requests: 1,
        tokens: 100,
        credits: 0.2,
        daily: [{ day: "2026-10-10", requests: 1, tokens: 100, credits: 0.2 }],
        pluginUsage: [
          {
            pluginId: "wechatai/llm-chat",
            day: "2026-10-10",
            requests: 1,
            tokens: 100,
            credits: 0.2,
          },
        ],
      }),
    );
    await order("live", a, 990, "live", "paid", "plus", afterMidnight);
    await order("test", a, 8800, "test", "paid", "plus", afterMidnight);
    await order("credits", b, 2900, "live", "paid", "credits", beforeMidnight);
    await order("pending", a, 5900, "live", "open", "credits", afterMidnight);
    await order("foreign", a, 990, "live", "paid", "plus", afterMidnight, "usd");
    const live = { ...env, STRIPE_SECRET_KEY: "sk_live_test_fixture" };
    const result = await adminOverview(live, now);
    expect(result.summary).toMatchObject({
      users: 2,
      plus: 1,
      requests: 3,
      revenue: 38.9,
      paidOrders: 2,
      payingUsers: 2,
      membershipRevenue: 9.9,
      creditsRevenue: 29,
    });
    expect(result.summary.credits).toBeCloseTo(1.434);
    expect(result.daily).toHaveLength(30);
    expect(result.daily.at(-1)).toMatchObject({
      day: "2026-10-10",
      newUsers: 1,
      activeUsers: 2,
      requests: 3,
      tokens: 400,
      revenue: 9.9,
    });
    expect(result.daily.at(-2)).toMatchObject({ newUsers: 1, revenue: 29 });
    expect(result.daily[0]).toMatchObject({ requests: 0, revenue: 0, activeUsers: 0 });
    expect(result.plugins[0]).toMatchObject({
      pluginId: "wechatai/llm-chat",
      requests: 3,
      users: 2,
    });
    expect((await adminOverview(env, now)).summary.revenue).toBe(88);
  });
  it("does not let a delayed sync overwrite a newer sample, and reports coverage", async () => {
    const id = await user();
    await user();
    await saveAdminStats(env, id, blankStats({ sampledAt: 200, requests: 2 }));
    await saveAdminStats(env, id, blankStats({ sampledAt: 100, requests: 1 }));
    const result = await adminOverview(env);
    expect(result.coverage).toEqual({ synced: 1, oldest: 200, newest: 200 });
    expect(result.summary).toMatchObject({ users: 2, requests: 2 });
  });
  it("paginates and escapes literal searches; unknown membership remains unknown", async () => {
    for (let i = 0; i < 23; i++) await user(`list-${String(i).padStart(2, "0")}`);
    const special = await user("special", "under_score%@example.test");
    await saveAdminStats(env, special, blankStats({ planUntil: Date.now() + 60000 }));
    const first = await adminUsers(env, {});
    expect(first.items).toHaveLength(20);
    const last = await adminUsers(env, { page: "999999" });
    expect(last).toMatchObject({ total: 24, page: 2, totalPages: 2 });
    expect(last.items).toHaveLength(4);
    expect(new Set([...first.items, ...last.items].map((u) => u.id)).size).toBe(24);
    expect((await adminUsers(env, { q: "_%" })).total).toBe(0);
    expect((await adminUsers(env, { q: "score%" })).items[0].id).toBe(special);
    expect((await adminUsers(env, { q: "' OR 1=1 --" })).total).toBe(0);
    expect((await adminUsers(env, { plan: "plus" })).total).toBe(1);
    expect((await adminUsers(env, { plan: "free" })).total).toBe(0);
    expect(first.items.find((u) => u.id !== special)?.syncedAt).toBeNull();
  });
  it("bounds sync batches and continues with a cursor", async () => {
    for (let i = 0; i < 11; i++) await user(`sync-${i.toString().padStart(2, "0")}`);
    const first = await syncAdminStats(env, null);
    expect(first).toMatchObject({ processed: 10, failed: 0 });
    expect(first.next).not.toBeNull();
    expect((await adminOverview(env)).coverage.synced).toBe(10);
    expect(await syncAdminStats(env, first.next)).toEqual({ next: null, processed: 1, failed: 0 });
    expect((await adminOverview(env)).coverage.synced).toBe(11);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("retains a failed account's old snapshot while syncing the other accounts", async () => {
    const broken = await user("broken");
    const good = await user("good");
    await saveAdminStats(env, broken, blankStats({ sampledAt: 1, requests: 9 }));
    await runInDurableObject(env.ACCOUNTS.getByName(broken), (_, state) => {
      state.storage.sql.exec("INSERT INTO settings VALUES ('planUntil','invalid-json')");
    });
    expect(await syncAdminStats(env, null)).toEqual({ next: null, processed: 2, failed: 1 });
    expect((await adminOverview(env)).summary.requests).toBe(9);
    expect((await adminUsers(env, { q: good })).items[0].syncedAt).toBeGreaterThan(1);
  });
});

describe("read-only per-account statistics", () => {
  it("uses durable usage rather than chat content, classifies remote plugins, and never grants credits or touches alarms", async () => {
    const stub = env.ACCOUNTS.getByName(crypto.randomUUID());
    const now = Date.now();
    const today = dayWindow(now).day;
    await runInDurableObject(stub, (_, state) => {
      const sql = state.storage.sql;
      sql.exec(
        "INSERT INTO usage VALUES ('normal',?,100,1250),('claw:remote',?,200,750)",
        now,
        now,
      );
      sql.exec(
        "INSERT INTO platform_metering VALUES ('normal','wechatai/llm-chat','1','', '{}',?)",
        now,
      );
      sql.exec(
        "INSERT INTO plugins VALUES ('agent',?)",
        JSON.stringify({
          pluginId: "wechatai/hermes",
          encryptedKey: "never-expose-key",
          name: "private-plugin-name",
        }),
      );
      sql.exec("INSERT INTO claw_events VALUES ('remote','agent','{}',?)", now);
      sql.exec(
        "INSERT INTO messages(sessionId,role,content,createdAt) VALUES ('s','user','private conversation',?)",
        now,
      );
      sql.exec(
        "INSERT INTO settings VALUES ('connection',?)",
        JSON.stringify({ status: "connected", encryptedCredentials: "secret-token" }),
      );
    });
    const before = await runInDurableObject(stub, async (_, state) => ({
      alarm: await state.storage.getAlarm(),
      ledger: state.storage.sql.exec("SELECT * FROM credit_ledger").toArray(),
      settings: state.storage.sql.exec("SELECT * FROM settings").toArray(),
    }));
    const stats = await stub.adminStats();
    expect(stats).toMatchObject({ requests: 2, tokens: 300, credits: 2, links: 1, connected: 1 });
    expect(stats.daily).toEqual([{ day: today, requests: 2, tokens: 300, credits: 2 }]);
    expect(stats.pluginUsage.find((p) => p.pluginId === "wechatai/hermes")).toMatchObject({
      requests: 1,
      credits: 0.75,
    });
    expect(JSON.stringify(stats)).not.toMatch(/private|secret|encrypted|content|apiKey/);
    await runInDurableObject(stub, async (_, state) => {
      expect(await state.storage.getAlarm()).toBe(before.alarm);
      expect(state.storage.sql.exec("SELECT * FROM credit_ledger").toArray()).toEqual(
        before.ledger,
      );
      expect(state.storage.sql.exec("SELECT * FROM settings").toArray()).toEqual(before.settings);
      state.storage.sql.exec("DELETE FROM messages");
      expect(readAdminAccountStats(state.storage.sql).requests).toBe(2);
    });
  });
});
