import { env, createExecutionContext, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import authMigration from "../migrations/0001_auth.sql?raw";
import billingMigration from "../migrations/0002_billing.sql?raw";
import adminMigration from "../migrations/0005_admin.sql?raw";
import routesMigration from "../migrations/0019_account_backend_routes.sql?raw";
import { saveAdminStats, syncAdminStats } from "../src/server/admin";
import { readAdminAccountStats } from "../src/server/admin-account";
import { readAccountRetention } from "../src/server/account-retention";
import { readMetricsRetention } from "../src/server/metrics-retention";
import { dayWindow } from "../src/server/wallet";
import { accountForAdmin } from "../src/server/account-route";
import type { AdminAccountStats } from "../src/shared/admin";
import type { AccountRetention, MetricsRetention } from "../src/shared/metrics-retention";
import worker from "../src/server/index";

const day = 86_400_000;
const d0 = dayWindow(Date.now()).start - 22 * day;
const cohortDay = dayWindow(d0).day;
const firstDay = dayWindow(d0 + day).day;
const seventhDay = dayWindow(d0 + 7 * day).day;
const launchedAt = d0 - day / 2;
const completeAt = d0 + 8 * day;
const grant = { userId: "test-operator", adminUntil: Number.MAX_SAFE_INTEGER };
const token = "test-only-retention-bearer-0123456789abcdef";

beforeAll(async () => {
  for (const migration of [authMigration, billingMigration, adminMigration, routesMigration])
    await env.DB.exec(migration.replace(/^--.*$/gm, "").replace(/\n/g, " "));
});
beforeEach(async () => {
  await env.DB.batch(
    ["account_backend_routes", "admin_account_stats", "user"].map((table) =>
      env.DB.prepare(`DELETE FROM ${table}`),
    ),
  );
});
afterEach(() => vi.restoreAllMocks());

function stats(extra: Partial<AdminAccountStats> = {}): AdminAccountStats {
  return {
    sampledAt: completeAt,
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
    failedRequests: 0,
    lastFailureAt: null,
    lastFailureCode: null,
    lastFailureStatus: null,
    daily: [],
    pluginUsage: [],
    ...extra,
  };
}
function observations(activeD1: boolean, activeD7: boolean): AccountRetention {
  return {
    startedAt: launchedAt,
    days: {
      d1: { day: firstDay, active: activeD1, observedAt: completeAt },
      d7: { day: seventhDay, active: activeD7, observedAt: completeAt },
    },
  };
}
async function user(id = crypto.randomUUID(), createdAt = d0) {
  await env.DB.prepare("INSERT INTO user VALUES(?,?,?,0,NULL,?,?)")
    .bind(id, "private-name", `${id}@example.test`, createdAt, createdAt)
    .run();
  return id;
}
async function snapshot(id: string, data: AdminAccountStats) {
  await env.DB.prepare("INSERT OR REPLACE INTO admin_account_stats VALUES(?,?,?)")
    .bind(id, data.sampledAt, JSON.stringify(data))
    .run();
}
async function saved(id: string) {
  const row = await env.DB.prepare("SELECT data FROM admin_account_stats WHERE user_id=?")
    .bind(id)
    .first<{ data: string }>();
  return row ? (JSON.parse(row.data) as AdminAccountStats) : null;
}
async function cohort() {
  const ids = await Promise.all([user(), user(), user()]);
  for (const [index, id] of ids.entries())
    await snapshot(id, stats({ retention: observations(index === 0, index < 2) }));
  return ids;
}
async function result(now = completeAt) {
  const report = await readMetricsRetention(env, 30, now);
  return report.cohorts.find((c) => c.day === cohortDay)!;
}

// Real account SQL proves completeness for closed days independently of the 30-day cache.
describe("retention source observations", () => {
  it("uses successful usage with half-open Shanghai days, excludes failures and mutable reply times", async () => {
    const stub = env.ACCOUNTS.getByName(crypto.randomUUID());
    await runInDurableObject(stub, (_, state) => {
      const sql = state.storage.sql;
      sql.exec(
        "INSERT INTO usage VALUES('before',?,1,1),('after',?,1,1)",
        d0 + day - 1,
        d0 + 2 * day,
      );
      sql.exec("INSERT INTO call_failures VALUES('failure',?,'timeout',NULL)", d0 + day);
      sql.exec(
        "INSERT INTO settings VALUES('last_reply_at',?),('firstWechatReplyAt',?)",
        String(d0 + day),
        String(d0 + day),
      );
      expect(readAccountRetention(sql, d0, completeAt, d0).days.d1?.active).toBe(false);
      sql.exec(
        "INSERT INTO usage VALUES('one',?,1,1),('two',?,1,1),('d7',?,1,1)",
        d0 + day,
        d0 + 2 * day - 1,
        d0 + 7 * day,
      );
      const before = sql.exec("SELECT * FROM settings").toArray();
      expect(readAccountRetention(sql, d0, completeAt).days).toEqual({});
      expect(readAccountRetention(sql, d0, completeAt, d0 + day).days).toEqual({});
      const facts = readAccountRetention(sql, d0, completeAt, d0);
      expect(facts.days).toEqual(observations(true, true).days);
      expect(readAccountRetention(sql, d0 / 1000, completeAt, d0)).toEqual(facts);
      expect(readAccountRetention(sql, d0, d0 + 2 * day - 1, d0).days).toEqual({});
      expect(readAccountRetention(sql, d0, d0 + 2 * day, d0).days.d1?.active).toBe(true);
      expect(readAccountRetention(sql, d0, completeAt - 1, d0).days.d7).toBeUndefined();
      expect(readAccountRetention(sql, d0, completeAt + 60 * day, d0).days.d7?.active).toBe(true);
      expect(readAdminAccountStats(sql, completeAt).retention).toBeUndefined();
      expect(readAdminAccountStats(sql, completeAt, d0, d0).retention).toEqual(facts);
      expect(sql.exec("SELECT * FROM settings").toArray()).toEqual(before);
      expect(sql.exec("SELECT COUNT(*) total FROM credit_ledger").one().total).toBe(0);
    });
  });

  it("keeps completed observations through retries, legacy and membership refreshes", async () => {
    const id = await user();
    const initial = observations(true, false);
    delete initial.days.d7;
    await snapshot(id, stats({ retention: initial }));
    await saveAdminStats(
      env,
      id,
      stats({ sampledAt: completeAt + 1, retention: observations(false, true) }),
    );
    let stored = (await saved(id))!;
    expect(stored.retention).toEqual(observations(true, true));
    await saveAdminStats(
      env,
      id,
      stats({ sampledAt: completeAt + 2, planUntil: completeAt + day }),
    );
    await saveAdminStats(
      env,
      id,
      stats({ sampledAt: completeAt - 1, retention: observations(false, false) }),
    );
    stored = (await saved(id))!;
    expect(stored.retention).toEqual(observations(true, true));
    expect(stored.planUntil).toBe(completeAt + day);
  });

  it("persists the collection marker with the first successful sync and survives a failed read", async () => {
    const id = await user(crypto.randomUUID(), Date.now());
    expect(await saved(id)).toBeNull();
    expect(await syncAdminStats(env, null, grant)).toMatchObject({ failed: 0, processed: 1 });
    const initial = (await saved(id))!;
    expect(initial.retention?.startedAt).toBeGreaterThan(completeAt);
    expect(initial.retention?.days).toEqual({});
    await env.DB.prepare("UPDATE admin_account_stats SET synced_at=1 WHERE user_id=?")
      .bind(id)
      .run();
    await runInDurableObject(env.ACCOUNTS.getByName(id), (_, state) => {
      state.storage.sql.exec("INSERT OR REPLACE INTO settings VALUES('planUntil','invalid-json')");
    });
    expect(await syncAdminStats(env, null, grant)).toMatchObject({ failed: 1 });
    expect(await saved(id)).toEqual(initial);
    await runInDurableObject(env.ACCOUNTS.getByName(id), (_, state) => {
      state.storage.sql.exec("DELETE FROM settings WHERE key='planUntil'");
    });
    expect(await syncAdminStats(env, null, grant)).toMatchObject({ failed: 0 });
    expect((await saved(id))!.retention?.startedAt).toBe(initial.retention?.startedAt);
  });

  it("syncs all members including an inactive member and replays without duplicate activity", async () => {
    const ids = await Promise.all([user(), user(), user()]);
    const collector = await user(crypto.randomUUID(), launchedAt);
    await snapshot(collector, stats({ retention: { startedAt: launchedAt, days: {} } }));
    for (const [index, id] of ids.entries())
      await runInDurableObject(env.ACCOUNTS.getByName(id), (_, state) => {
        if (index === 0)
          state.storage.sql.exec(
            "INSERT INTO usage VALUES('one',?,1,1),('two',?,1,1)",
            d0 + day,
            d0 + day + 1,
          );
        if (index < 2)
          state.storage.sql.exec("INSERT INTO usage VALUES('seven',?,1,1)", d0 + 7 * day);
      });
    for (let attempt = 0; attempt < 2; attempt++) {
      await env.DB.prepare("UPDATE admin_account_stats SET synced_at=1").run();
      expect(await syncAdminStats(env, null, grant)).toMatchObject({ failed: 0, processed: 4 });
      const report = await result(Date.now());
      expect(report.d1).toMatchObject({
        available: true,
        numerator: 1,
        denominator: 3,
        rate: 1 / 3,
      });
      expect(report.d7).toMatchObject({
        available: true,
        numerator: 2,
        denominator: 3,
        rate: 2 / 3,
      });
    }
  });
});

describe("source compatibility and atomic persistence", () => {
  it("keeps the Go RPC argument contract and cannot certify its imported ledger", async () => {
    const id = await user();
    await env.DB.prepare("INSERT INTO account_backend_routes VALUES(?,?,'go',1)")
      .bind(id, env.ACCOUNTS.idFromName(id).toString())
      .run();
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(JSON.stringify({ ok: true, data: stats() }), {
          headers: { "content-type": "application/json" },
        }),
    );
    const routedEnv = {
      ...env,
      WECHATAI_BACKEND_ORIGIN: "https://backend.example.test",
      WECHATAI_RPC_SECRET: "test-only-backend-secret-0123456789abcdef",
    } as Env;
    const account = await accountForAdmin(routedEnv, id, grant);
    expect((await account.adminStats()).retention).toBeUndefined();
    expect((await account.adminStats(d0)).retention).toMatchObject({
      days: {},
      sourceUnavailable: true,
    });
    for (const [request] of fetch.mock.calls) {
      expect(await (request as Request).clone().json()).toMatchObject({
        method: "adminStats",
        params: [],
      });
    }
  });

  it("commits the observation and coverage together or leaves the previous snapshot", async () => {
    const id = await user();
    const initial = stats();
    await snapshot(id, initial);
    await env.DB.exec(
      "CREATE TRIGGER fail_retention BEFORE UPDATE ON admin_account_stats BEGIN SELECT RAISE(ABORT,'test-only-write-failure'); END;",
    );
    try {
      await expect(
        saveAdminStats(
          env,
          id,
          stats({ sampledAt: completeAt + 1, retention: observations(true, true) }),
        ),
      ).rejects.toThrow();
      expect(await saved(id)).toEqual(initial);
    } finally {
      await env.DB.exec("DROP TRIGGER fail_retention;");
    }
    await saveAdminStats(
      env,
      id,
      stats({ sampledAt: completeAt + 1, retention: observations(true, true) }),
    );
    expect((await saved(id))!.retention?.days).toEqual(observations(true, true).days);
  });

  it("advances the conservative start when the oldest marker owner is deleted", async () => {
    const ids = await cohort();
    for (const id of ids.slice(1)) {
      const retention = observations(true, true);
      retention.startedAt = d0 + day / 2;
      await snapshot(id, stats({ retention }));
    }
    expect((await result()).d1.available).toBe(true);
    await env.DB.prepare("DELETE FROM user WHERE id=?").bind(ids[0]).run();
    expect((await result()).d1.reason).toBe("before_collection");
  });
});

describe("cohort aggregation", () => {
  it("returns manual 1/3 and 2/3 cohorts without personal or financial details", async () => {
    const ids = await cohort();
    const report = await readMetricsRetention(env, 30, completeAt);
    expect(report).toMatchObject({
      timezone: "Asia/Shanghai",
      collectionStartDay: cohortDay,
      window: { days: 30, to: dayWindow(completeAt).day },
    });
    expect(await result()).toMatchObject({
      d1: { available: true, numerator: 1, denominator: 3, rate: 1 / 3 },
      d7: { available: true, numerator: 2, denominator: 3, rate: 2 / 3 },
    });
    for (const id of ids) expect(JSON.stringify(report)).not.toContain(id);
    expect(JSON.stringify(report)).not.toMatch(
      /private-name|example.test|credits|email|last_reply|tokens/,
    );
    const changed = (await saved(ids[0]))!;
    changed.activation = {
      firstModelTestAt: null,
      firstWechatConnectedAt: null,
      firstWechatReplyAt: completeAt,
      lastWechatReplyAt: completeAt,
      deliveredWechatReplies: 999,
    };
    changed.lastActiveAt = completeAt;
    changed.daily = [];
    await snapshot(ids[0], changed);
    expect(await readMetricsRetention(env, 30, completeAt)).toEqual(report);
  });

  it("requires coverage of the full cohort and distinguishes confirmed zero and empty", async () => {
    const ids = await cohort();
    await env.DB.prepare("DELETE FROM admin_account_stats WHERE user_id=?").bind(ids[2]).run();
    expect((await result()).d1).toMatchObject({
      available: false,
      reason: "coverage_incomplete",
      numerator: null,
      denominator: null,
      rate: null,
    });
    for (const id of ids) await snapshot(id, stats({ retention: observations(false, false) }));
    expect((await result()).d1).toMatchObject({
      available: true,
      numerator: 0,
      denominator: 3,
      rate: 0,
    });
    const report = await readMetricsRetention(env, 30, completeAt + day);
    expect(report.cohorts.find((c) => c.day === firstDay)?.d1.reason).toBe("empty_cohort");
  });

  it("matures D1 and D7 independently at the end of each observation day", async () => {
    const ids = await cohort();
    for (const id of ids) {
      const retention = observations(true, true);
      retention.days.d1!.observedAt = d0 + 2 * day;
      await snapshot(id, stats({ retention }));
    }
    expect((await result(d0 + 2 * day - 1)).d1.reason).toBe("window_incomplete");
    expect((await result(d0 + 2 * day)).d1.available).toBe(true);
    expect((await result(completeAt - 1)).d7.reason).toBe("window_incomplete");
    expect((await result(completeAt)).d7.available).toBe(true);
  });

  it("excludes collection's partial first day and legacy snapshots", async () => {
    const id = await user();
    await snapshot(
      id,
      stats({
        daily: [{ day: firstDay, requests: 100, failedRequests: 0, tokens: 10, credits: 1 }],
      }),
    );
    expect((await result()).d1.reason).toBe("collection_not_started");
    const retention = observations(true, true);
    retention.startedAt = d0 + day / 2;
    await snapshot(id, stats({ retention }));
    expect((await result()).d1).toMatchObject({ reason: "before_collection", rate: null });
    expect((await readMetricsRetention(env, 30, completeAt)).collectionStartDay).toBe(firstDay);
  });

  it("checks the exact day and a completed source read even when a positive event is present", async () => {
    const ids = await cohort();
    const retention = observations(true, true);
    retention.days.d1!.observedAt = d0 + day;
    await snapshot(ids[0], stats({ retention }));
    expect((await result()).d1.reason).toBe("coverage_incomplete");
    retention.days.d1!.observedAt = completeAt;
    retention.days.d1!.day = dayWindow(d0 + 2 * day).day;
    await snapshot(ids[0], stats({ retention }));
    expect((await result()).d1.reason).toBe("coverage_incomplete");
    expect((await result()).d7.available).toBe(true);
  });

  it("keeps routed and frozen sources unavailable, including after an observed cutover is rolled back", async () => {
    const ids = await cohort();
    for (const location of ["go", "frozen"]) {
      await env.DB.prepare("INSERT OR REPLACE INTO account_backend_routes VALUES(?,?,?,1)")
        .bind(ids[0], env.ACCOUNTS.idFromName(ids[0]).toString(), location)
        .run();
      expect((await result()).d1.reason).toBe("coverage_incomplete");
    }
    // The route appears between the DO read and the snapshot write.
    await saveAdminStats(
      env,
      ids[0],
      stats({ sampledAt: completeAt + 1, retention: observations(true, true) }),
    );
    expect((await saved(ids[0]))!.retention?.sourceUnavailable).toBe(true);
    await env.DB.prepare("DELETE FROM account_backend_routes").run();
    expect((await result()).d1.reason).toBe("coverage_incomplete");
  });

  it("normalizes seconds and preserves facts beyond the rolling 30-day cache", async () => {
    const ids = await cohort();
    await env.DB.prepare("UPDATE user SET createdAt=? WHERE id=?")
      .bind(d0 / 1000, ids[0])
      .run();
    const report = await readMetricsRetention(env, 90, completeAt + 40 * day);
    expect(report.cohorts.find((c) => c.day === cohortDay)?.d1).toMatchObject({
      numerator: 1,
      denominator: 3,
    });
  });

  it("uses remaining registered users and safely restarts after old code clears the markers", async () => {
    const ids = await cohort();
    await env.DB.prepare("DELETE FROM user WHERE id=?").bind(ids[2]).run();
    expect((await result()).d1.denominator).toBe(2);
    for (const id of ids.slice(0, 2)) await snapshot(id, stats());
    expect((await result()).d1.reason).toBe("collection_not_started");
    await saveAdminStats(
      env,
      ids[0],
      stats({ sampledAt: Date.now(), retention: observations(true, true) }),
    );
    expect((await result(Date.now())).d1.reason).toBe("before_collection");
  });
});

function request(
  path = "/api/metrics/retention",
  init: RequestInit = {},
  overrides: Partial<Env> = {},
) {
  const bindings = {
    ...env,
    METRICS_API_TOKEN: token,
    API_LIMIT: { limit: async () => ({ success: true }) },
    ...overrides,
  } as Env;
  return worker.fetch(
    new Request(`https://wechatai.app${path}`, init),
    bindings,
    createExecutionContext(),
  );
}
const authorized = { authorization: `Bearer ${token}` };

describe("retention HTTP contract", () => {
  it("returns aggregates through the real dispatcher without sessions, RPCs or synchronization", async () => {
    await cohort();
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("unexpected outbound call"));
    const response = await request(
      undefined,
      { headers: authorized },
      {
        ACCOUNTS: new Proxy(
          {},
          {
            get() {
              throw new Error("account RPC must not run");
            },
          },
        ) as Env["ACCOUNTS"],
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json<MetricsRetention>();
    expect(body.window.days).toBe(30);
    expect(body.cohorts.find((c) => c.day === cohortDay)?.d7.rate).toBe(2 / 3);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects invalid tokens before reading D1 and validates the bounded window after authentication", async () => {
    const unavailable = new Proxy(
      {},
      {
        get() {
          throw new Error("DB access before authentication");
        },
      },
    ) as D1Database;
    for (const authorization of [
      "",
      "Bearer short",
      "Bearer test-only-invalid-token-0123456789abcdef",
    ]) {
      expect(
        (await request(undefined, { headers: { authorization } }, { DB: unavailable })).status,
      ).toBe(401);
    }
    for (const value of ["0", "91", "-1", "1.5", "", "abc", "30&days=1"]) {
      expect(
        (await request(`/api/metrics/retention?days=${value}`, { headers: authorized })).status,
      ).toBe(400);
    }
    for (const days of [1, 90]) {
      const response = await request(`/api/metrics/retention?days=${days}`, {
        headers: authorized,
      });
      expect(response.status).toBe(200);
      expect((await response.json<MetricsRetention>()).cohorts).toHaveLength(days);
    }
  });

  it("audits failures with fixed fields and keeps method and rate-limit boundaries", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    for (const method of ["POST", "PUT", "DELETE", "HEAD", "OPTIONS"]) {
      const response = await request(undefined, { method, headers: authorized });
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET");
    }
    expect(
      (
        await request(
          undefined,
          { headers: authorized },
          { API_LIMIT: { limit: async () => ({ success: false }) } as Env["API_LIMIT"] },
        )
      ).status,
    ).toBe(429);
    expect(
      (await request(undefined, { headers: authorized }, { API_LIMIT: undefined })).status,
    ).toBe(503);
    const response = await request(
      "/api/metrics/retention?probe=PRIVATE_QUERY",
      { headers: { ...authorized, cookie: "PRIVATE_COOKIE" } },
      {
        DB: new Proxy(
          {},
          {
            get() {
              throw new Error("PRIVATE_ERROR");
            },
          },
        ) as D1Database,
      },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/PRIVATE_|test-only-retention-bearer/);
    for (const [message] of log.mock.calls) {
      const record = JSON.parse(message);
      expect(record.route).toBe("/api/metrics/retention");
      expect(Object.keys(record).sort()).toEqual([
        "at",
        "event",
        "method",
        "rateLimited",
        "reason",
        "route",
        "status",
      ]);
    }
  });
});
