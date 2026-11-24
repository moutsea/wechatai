import { env, runInDurableObject } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import authMigration from "../migrations/0001_auth.sql?raw";
import billingMigration from "../migrations/0002_billing.sql?raw";
import referralMigration from "../migrations/0003_referrals.sql?raw";
import adminMigration from "../migrations/0005_admin.sql?raw";
import { adminOverview, saveAdminStats } from "../src/server/admin";
import { readAdminAccountStats } from "../src/server/admin-account";
import { metricsOverview, projectMetricsOverview } from "../src/server/metrics-overview";
import { dayWindow } from "../src/server/wallet";
import { adminPluginNames, type AdminAccountStats } from "../src/shared/admin";

const now = Date.parse("2026-11-24T04:00:00Z");
const today = dayWindow(now);
const start = today.start - 29 * 86400000;
const usage = { requests: 3, failedRequests: 2, tokens: 91, credits: 0.123 };

beforeAll(async () => {
  for (const migration of [authMigration, billingMigration, referralMigration, adminMigration])
    await env.DB.exec(migration.replace(/^--.*$/gm, "").replace(/\n/g, " "));
});
beforeEach(async () => {
  await env.DB.batch(
    ["admin_account_stats", "billing_order", "referral", "user"].map((table) =>
      env.DB.prepare(`DELETE FROM ${table}`),
    ),
  );
});

async function user(id: string, createdAt = now) {
  await env.DB.prepare(
    "INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,1,?,?)",
  )
    .bind(id, "PRIVATE_NAME_SENTINEL", `${id}@private-sentinel.test`, createdAt, createdAt)
    .run();
}
function snapshot(extra: Partial<AdminAccountStats> = {}): AdminAccountStats {
  return {
    sampledAt: now,
    planUntil: now + 1000,
    links: 3,
    connected: 2,
    channels: 4,
    models: 5,
    plugins: 6,
    sessions: 7,
    ...usage,
    purchasedCredits: 1.234,
    debt: 0.456,
    lastActiveAt: now,
    lastFailureAt: now,
    lastFailureCode: "PRIVATE_FAILURE_SENTINEL",
    lastFailureStatus: 500,
    activation: {
      firstModelTestAt: now,
      firstWechatConnectedAt: now,
      firstWechatReplyAt: now,
      lastWechatReplyAt: now,
      deliveredWechatReplies: 999,
    },
    daily: [{ day: today.day, ...usage }],
    pluginUsage: [{ day: today.day, pluginId: "wechatai/llm-chat", ...usage }],
    ...extra,
  };
}
async function rawSnapshot(id: string, data: Record<string, unknown>, sampledAt = now) {
  await env.DB.prepare("INSERT INTO admin_account_stats VALUES (?,?,?)")
    .bind(id, sampledAt, JSON.stringify(data))
    .run();
}

const stockKeys = [
  "plus",
  "links",
  "connected",
  "channels",
  "models",
  "plugins",
  "sessions",
  "requests",
  "failedRequests",
  "tokens",
  "credits",
  "purchasedCredits",
  "debt",
];
const usageKeys = ["activeUsers", "requests", "failedRequests", "tokens", "credits"];
const select = (object: object, keys: string[]) =>
  Object.fromEntries(keys.map((key) => [key, (object as Record<string, unknown>)[key]]));

describe("metrics overview snapshot contract", () => {
  it("projects the same aggregates as adminOverview and excludes private and payment fields", async () => {
    await user("PRIVATE_USER_SENTINEL", today.start / 1000);
    await user("failed-only", today.start - 1);
    await saveAdminStats(env, "PRIVATE_USER_SENTINEL", snapshot());
    await saveAdminStats(
      env,
      "failed-only",
      snapshot({
        planUntil: 0,
        requests: 0,
        daily: [{ day: today.day, requests: 0, failedRequests: 9, tokens: 0, credits: 0 }],
        pluginUsage: [],
      }),
    );
    await env.DB.prepare(`INSERT INTO billing_order(id,user_id,mode,offer_id,kind,price_id,amount,currency,credits,customer_id,status,created_at,paid_at)
      VALUES ('PRIVATE_ORDER_SENTINEL','PRIVATE_USER_SENTINEL','test','offer','plus','price',990,'cny',0,'PRIVATE_CUSTOMER_SENTINEL','paid',?,?)`)
      .bind(now, now)
      .run();
    const admin = await adminOverview(env, now);
    const result = await metricsOverview(env, now);
    expect(result.summary.snapshot.value).toEqual(select(admin.summary, stockKeys));
    expect(result.summary.snapshot.observed).toEqual(result.summary.snapshot.value);
    expect(result.summary.snapshot.asOf).toEqual({ oldest: now, newest: now });
    expect(result.coverage).toEqual({
      totalUsers: 2,
      syncedUsers: 2,
      oldestSyncedAt: now,
      newestSyncedAt: now,
      legacySnapshots: 0,
      complete: true,
      reason: null,
    });
    expect(result.daily).toHaveLength(30);
    for (const [index, day] of result.daily.entries()) {
      expect(day.newUsers).toBe(admin.daily[index].newUsers);
      expect(day.snapshot.observed).toEqual(select(admin.daily[index], usageKeys));
      expect(day.snapshot.available).toBe(index < 29);
    }
    expect(result.daily.at(-1)).toMatchObject({
      newUsers: 1,
      snapshot: {
        value: null,
        reason: "day_incomplete",
        observed: { activeUsers: 1, requests: 3 },
      },
    });
    expect(result.plugins).toEqual({
      available: false,
      reason: "day_incomplete",
      items: admin.plugins,
    });
    expect(Object.keys(result).sort()).toEqual(
      [
        "service",
        "documentationVersion",
        "timezone",
        "generatedAt",
        "window",
        "coverage",
        "summary",
        "daily",
        "plugins",
      ].sort(),
    );
    expect(Object.keys(result.summary.snapshot.value!).sort()).toEqual(stockKeys.sort());
    expect(Object.keys(result.daily[0].snapshot.value!).sort()).toEqual(usageKeys.sort());
    const text = JSON.stringify(result);
    expect(text).not.toMatch(
      /PRIVATE_|private-sentinel|revenue|paidOrders|payingUsers|Revenue|rewardedReferrals|isAdmin|activation|lastFailure|email|"mode"/,
    );
    expect(result.window).toEqual({
      startsAt: start,
      endsAt: now,
      startDay: "2026-10-26",
      endDay: "2026-11-24",
      days: 30,
      includesToday: true,
      endInclusive: true,
      activeUsers: "distinct_users_with_settled_usage_per_day",
      credits: "settled_units_divided_by_1000_before_refunds",
      source: "admin_account_stats",
    });
  });

  it("distinguishes an empty site from accounts without any snapshots", async () => {
    const empty = await metricsOverview(env, now);
    expect(empty.coverage).toMatchObject({
      complete: true,
      totalUsers: 0,
      syncedUsers: 0,
      oldestSyncedAt: null,
      newestSyncedAt: null,
    });
    expect(empty.summary.snapshot.available).toBe(true);
    expect(Object.values(empty.summary.snapshot.value!)).toEqual(stockKeys.map(() => 0));
    expect(empty.daily.every((day) => day.snapshot.available)).toBe(true);
    expect(empty.plugins).toEqual({ available: true, reason: null, items: [] });
    await user("unsynced");
    const result = await metricsOverview(env, now);
    expect(result.summary.users).toBe(1);
    expect(result.daily.at(-1)?.newUsers).toBe(1);
    expect(result.summary.snapshot).toMatchObject({
      available: false,
      reason: "not_synced",
      value: null,
      observed: null,
    });
    expect(
      result.daily.every((day) => !day.snapshot.available && day.snapshot.observed === null),
    ).toBe(true);
    expect(result.plugins).toEqual({ available: false, reason: "not_synced", items: null });
  });

  it("keeps partial observations separate from whole-site values including zero activity", async () => {
    await user("synced");
    await user("missing");
    await saveAdminStats(env, "synced", snapshot({ daily: [] }));
    const result = await metricsOverview(env, now);
    expect(result.coverage).toMatchObject({
      complete: false,
      reason: "not_synced",
      syncedUsers: 1,
      totalUsers: 2,
    });
    expect(result.summary.snapshot).toMatchObject({
      available: false,
      value: null,
      reason: "not_synced",
      observed: { requests: 3 },
    });
    expect(result.daily.at(-1)).toMatchObject({
      newUsers: 2,
      snapshot: {
        available: false,
        value: null,
        reason: "not_synced",
        observed: { activeUsers: 0, requests: 0 },
      },
    });
    expect(result.plugins.items).toHaveLength(1);
  });

  it.each([
    "planUntil",
    "links",
    "connected",
    "channels",
    "models",
    "plugins",
    "sessions",
    "requests",
    "failedRequests",
    "tokens",
    "credits",
    "purchasedCredits",
    "debt",
    "daily",
    "pluginUsage",
    "sampledAt",
  ])("reports unknown when an old snapshot lacks %s", async (field) => {
    await user("legacy");
    const data: Record<string, unknown> = snapshot();
    delete data[field];
    await rawSnapshot("legacy", data);
    const result = await metricsOverview(env, now);
    expect(result.coverage).toMatchObject({
      legacySnapshots: 1,
      complete: false,
      reason: "legacy_snapshot",
    });
    expect(result.summary.snapshot).toMatchObject({
      available: false,
      value: null,
      observed: null,
    });
    expect(
      result.daily.every(
        (day) => day.snapshot.reason === "legacy_snapshot" && day.snapshot.observed === null,
      ),
    ).toBe(true);
    expect(result.plugins.items).toBeNull();
  });

  it.each([
    { daily: null },
    { daily: {} },
    { requests: "0" },
    { debt: null },
    { daily: [{ day: today.day, requests: 1, tokens: 5, credits: 0.1 }] },
    { pluginUsage: [{ day: today.day, pluginId: "wechatai/llm-chat", requests: 1 }] },
    { sampledAt: now - 1 },
  ])("rejects incomplete nested rows and invalid structure %j", async (extra) => {
    await user("legacy");
    await rawSnapshot("legacy", { ...snapshot(), ...extra });
    const result = await metricsOverview(env, now);
    expect(result.coverage.legacySnapshots).toBe(1);
    expect(result.summary.snapshot.observed).toBeNull();
  });

  it("retains the not_synced reason but suppresses legacy partial observations", async () => {
    await user("legacy");
    await user("missing");
    await rawSnapshot("legacy", { requests: 0 });
    const result = await metricsOverview(env, now);
    expect(result.coverage).toMatchObject({ reason: "not_synced", legacySnapshots: 1 });
    expect(result.summary.snapshot).toMatchObject({ reason: "not_synced", observed: null });
    expect(result.plugins.items).toBeNull();
  });

  it("marks only covered past days as known zero when old snapshots are sparse", async () => {
    await user("old");
    const sampledAt = today.start - 2 * 86400000;
    await saveAdminStats(env, "old", snapshot({ sampledAt, daily: [], pluginUsage: [] }));
    const result = await metricsOverview(env, now);
    expect(result.coverage.complete).toBe(true);
    expect(result.summary.snapshot.available).toBe(true);
    expect(result.daily[26].snapshot).toMatchObject({ available: true, value: { requests: 0 } });
    for (const day of result.daily.slice(27))
      expect(day.snapshot).toMatchObject({ available: false, reason: "not_covered", value: null });
    expect(result.plugins.reason).toBe("not_covered");
  });

  it("uses each snapshot retention window as well as its sampling endpoint", async () => {
    await user("future-sample");
    await saveAdminStats(
      env,
      "future-sample",
      snapshot({ sampledAt: today.end, daily: [], pluginUsage: [] }),
    );
    const result = await metricsOverview(env, now);
    expect(result.daily[0].snapshot).toMatchObject({
      available: false,
      value: null,
      reason: "not_covered",
    });
    expect(result.plugins.reason).toBe("not_covered");
  });

  it("fails closed if completeness inspection metadata is absent", async () => {
    await user("legacy-caller");
    await saveAdminStats(env, "legacy-caller", snapshot());
    const result = projectMetricsOverview(await adminOverview(env, now));
    expect(result.summary.snapshot).toMatchObject({
      available: false,
      reason: "legacy_snapshot",
      observed: null,
    });
  });
});

describe("metrics overview boundaries and stable plugin IDs", () => {
  it.each(["2026-11-23T15:59:59Z", "2026-11-23T16:00:00Z"])(
    "uses Shanghai boundaries and inclusive user timestamps at %s",
    async (time) => {
      const at = Date.parse(time);
      const first = dayWindow(at).start - 29 * 86400000;
      await user("before-first", first - 1);
      await user("first", first / 1000);
      await user("at-end", at);
      await user("after-end", at + 1);
      const result = await metricsOverview(env, at);
      expect(result.summary.users).toBe(4);
      expect(result.daily[0].newUsers).toBe(1);
      expect(result.daily.at(-1)?.newUsers).toBe(1);
      expect(result.daily.reduce((sum, day) => sum + day.newUsers, 0)).toBe(2);
      expect(result.daily.map((day) => day.day)).toEqual(result.daily.map((day) => day.day).sort());
      expect(result.window).toMatchObject({
        startsAt: first,
        endsAt: at,
        endDay: dayWindow(at).day,
      });
    },
  );

  it("filters private plugin identifiers before ranking and uses a stable tie-break", async () => {
    await user("plugins");
    await user("second");
    const known = Object.keys(adminPluginNames).reverse();
    const row = (pluginId: string, requests = 1) => ({
      day: today.day,
      pluginId,
      requests,
      tokens: 2,
      credits: 0.001,
    });
    await saveAdminStats(
      env,
      "plugins",
      snapshot({
        pluginUsage: [
          ...Array.from({ length: 25 }, (_, i) => row(`PRIVATE_PLUGIN_SENTINEL_${i}`, 100)),
          ...known.map((id) => row(id)),
        ],
      }),
    );
    await saveAdminStats(
      env,
      "second",
      snapshot({
        pluginUsage: [
          row("wechatai/llm-chat"),
          { ...row("wechatai/llm-chat"), day: dayWindow(today.start - 86400000).day },
          { ...row("wechatai/grok", 999), day: dayWindow(start - 86400000).day },
        ],
      }),
    );
    const result = await metricsOverview(env, now);
    expect(result.plugins.items).toHaveLength(known.length);
    expect(result.plugins.items?.[0]).toEqual({
      pluginId: "wechatai/llm-chat",
      users: 2,
      requests: 3,
      tokens: 6,
      credits: 0.003,
    });
    expect(result.plugins.items?.slice(1).map((p) => p.pluginId)).toEqual(
      known.filter((id) => id !== "wechatai/llm-chat").sort(),
    );
    expect(JSON.stringify(result)).not.toContain("PRIVATE_PLUGIN_SENTINEL");
  });

  it("counts a settled retry once and excludes failures from active users through the existing account reader", async () => {
    await user("settled");
    await user("only-failed");
    for (const id of ["settled", "only-failed"]) {
      const stub = env.ACCOUNTS.getByName(crypto.randomUUID());
      const stats = await runInDurableObject(stub, (_, state) => {
        const sql = state.storage.sql;
        sql.exec("INSERT INTO call_failures(id,createdAt,code) VALUES ('retry',?,'failed')", now);
        if (id === "settled")
          sql.exec("INSERT INTO usage VALUES ('retry',?,100,123),('another',?,200,456)", now, now);
        return readAdminAccountStats(sql, now);
      });
      await saveAdminStats(env, id, stats);
    }
    const result = await metricsOverview(env, now);
    expect(result.summary.snapshot.value).toMatchObject({
      requests: 2,
      failedRequests: 1,
      credits: 0.579,
    });
    expect(result.daily.at(-1)?.snapshot.observed).toEqual({
      activeUsers: 1,
      requests: 2,
      failedRequests: 1,
      tokens: 300,
      credits: 0.579,
    });
  });
});
