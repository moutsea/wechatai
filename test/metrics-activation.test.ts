import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import authMigration from "../migrations/0001_auth.sql?raw";
import billingMigration from "../migrations/0002_billing.sql?raw";
import adminMigration from "../migrations/0005_admin.sql?raw";
import referenceSql from "../docs/analytics/activation-cohort.sql?raw";
import {
  ACTIVATION_COLLECTION_START_MS as start,
  ACTIVATION_WINDOW_MS as window,
  getActivationMetrics,
  parseActivationRange,
} from "../src/server/metrics-activation";

const day = 86400000;
const observed = start + 15 * day;
const range = { from_ms: start, to_ms: start + day };
const counts = ["accounts", "model_tested", "connected", "first_reply_delivered", "paid_accounts"];
const bindings = { ...env, STRIPE_SECRET_KEY: "sk_test_activation_fixture" } as Env;

beforeAll(async () => {
  for (const migration of [authMigration, billingMigration, adminMigration])
    await env.DB.exec(migration.replace(/^--.*$/gm, "").replace(/\n/g, " "));
});
beforeEach(async () => {
  await env.DB.batch(
    ["billing_order", "admin_account_stats", "user"].map((table) =>
      env.DB.prepare(`DELETE FROM ${table}`),
    ),
  );
});

async function snapshot(id: string, synced: number, data: unknown) {
  await env.DB.prepare("INSERT OR REPLACE INTO admin_account_stats VALUES (?,?,?)")
    .bind(id, synced, JSON.stringify(data))
    .run();
}

async function account(id: string, created = start, activation: unknown = {}) {
  await env.DB.prepare("INSERT INTO user(id,name,email,createdAt,updatedAt) VALUES (?,?,?,?,?)")
    .bind(id, "PRIVATE_NAME", `${id}@example.test`, created, created)
    .run();
  const milliseconds = created < 100000000000 ? created * 1000 : created;
  await snapshot(id, milliseconds + window, {
    activation,
    ident: "PRIVATE_WECHAT_IDENT",
    messages: ["PRIVATE_CHAT"],
  });
}

async function order(id: string, user: string, at: number, mode = "test", status = "paid") {
  await env.DB.prepare(`INSERT INTO billing_order
    (id,user_id,mode,offer_id,kind,price_id,amount,currency,credits,customer_id,status,created_at,paid_at)
    VALUES (?,?,?,'offer','credits','price',100,'usd',10,'PRIVATE_CUSTOMER',?,?,?)`)
    .bind(id, user, mode, status, at, at)
    .run();
}

async function query(from = range.from_ms, to = range.to_ms, until = observed) {
  return getActivationMetrics(bindings, { from_ms: from, to_ms: to }, until);
}

describe("activation cohort accounting", () => {
  it("counts independent stages and deduplicates paid accounts in the billing mode", async () => {
    await account("model", start, { firstModelTestAt: start });
    await account("connected", start, { firstWechatConnectedAt: start + window });
    await account("agent", start, { firstWechatReplyAt: start + window });
    await account("payer");
    await account("last-only", start, { lastWechatReplyAt: start + day });
    await order("paid-1", "payer", start);
    await order("paid-2", "payer", start + window);
    await order("live", "model", start, "live");
    await order("pending", "connected", start, "test", "created");
    await order("refunded", "last-only", start, "test", "refunded");
    const result = await query();
    expect(result.days).toEqual([
      {
        signup_day: "2026-11-22",
        available: true,
        accounts: 5,
        model_tested: 1,
        connected: 1,
        first_reply_delivered: 1,
        paid_accounts: 1,
      },
    ]);
    expect(result).toMatchObject({
      available: true,
      reasons: [],
      timezone: "Asia/Shanghai",
      mode: "test",
      window_ms: window,
      observed_until_ms: observed,
      stages_independent: true,
      amount_basis: "not_applicable",
      refund_adjustment: "none",
    });
    const live = await getActivationMetrics(
      { ...bindings, STRIPE_SECRET_KEY: "sk_live_activation_fixture" } as Env,
      range,
      observed,
    );
    expect(live.mode).toBe("live");
    expect(live.days[0]).toMatchObject({ paid_accounts: 1 });
    await env.DB.prepare("UPDATE billing_order SET status='refunded' WHERE mode='live'").run();
    expect(
      (
        await getActivationMetrics(
          { ...bindings, STRIPE_SECRET_KEY: "sk_live_activation_fixture" } as Env,
          range,
          observed,
        )
      ).days[0],
    ).toMatchObject({ paid_accounts: 0 });
  });

  it("includes both event boundaries and excludes events outside the window", async () => {
    for (const [id, offset] of [
      ["before", -1],
      ["first", 0],
      ["last", window],
      ["after", window + 1],
    ] as const) {
      await account(id, start, {
        firstModelTestAt: start + offset,
        firstWechatConnectedAt: start + offset,
        firstWechatReplyAt: start + offset,
      });
      await order(id, id, start + offset);
    }
    expect((await query(start, start + day, start + window)).days).toEqual([
      {
        signup_day: "2026-11-22",
        available: true,
        accounts: 4,
        model_tested: 2,
        connected: 2,
        first_reply_delivered: 2,
        paid_accounts: 2,
      },
    ]);
  });

  it("normalizes seconds and milliseconds before Shanghai midnight and range filtering", async () => {
    await account("prior", (start - 1000) / 1000);
    await account("seconds", start / 1000, { firstModelTestAt: start });
    await account("milliseconds", start, { firstModelTestAt: start });
    await account("late", start + day - 1);
    await account("next-day", (start + day) / 1000);
    await account("excluded-end", start + 2 * day);
    const result = await query(start - day, start + 2 * day);
    expect(result.requested_range).toEqual({ from_ms: start - day, to_ms: start + 2 * day });
    expect(result.effective_range).toEqual({ from_ms: start, to_ms: start + 2 * day });
    expect(result.collection_started_at_ms).toBe(start);
    expect(result.days).toEqual([
      {
        signup_day: "2026-11-22",
        available: true,
        accounts: 3,
        model_tested: 2,
        connected: 0,
        first_reply_delivered: 0,
        paid_accounts: 0,
      },
      {
        signup_day: "2026-11-23",
        available: true,
        accounts: 1,
        model_tested: 0,
        connected: 0,
        first_reply_delivered: 0,
        paid_accounts: 0,
      },
    ]);
  });

  it("matches the reference SQL with the same five effective parameters", async () => {
    await account("normal", start, { firstModelTestAt: start + window });
    await account("seconds", start / 1000, { firstWechatReplyAt: start });
    await order("payment", "seconds", start);
    await account("next", start + day);
    const result = await query(start - day, start + 2 * day);
    const sql = await env.DB.prepare(referenceSql)
      .bind(
        result.effective_range!.from_ms,
        result.effective_range!.to_ms,
        result.observed_until_ms,
        result.window_ms,
        result.mode,
      )
      .all<Record<string, unknown>>();
    const expected = sql.results.map((row) => ({
      signup_day: row.signup_day,
      available: row.available === 1,
      ...Object.fromEntries(counts.map((key) => [key, row[key]])),
    }));
    expect(result.days).toEqual(expected);
  });

  it("reports complete zeroes while last reply alone contributes no first reply or retention", async () => {
    await account("last-only", start, {
      firstModelTestAt: null,
      firstWechatConnectedAt: null,
      firstWechatReplyAt: null,
      lastWechatReplyAt: start + day,
    });
    const result = await query();
    expect(result.days).toEqual([
      {
        signup_day: "2026-11-22",
        available: true,
        accounts: 1,
        model_tested: 0,
        connected: 0,
        first_reply_delivered: 0,
        paid_accounts: 0,
      },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/retention|lastWechatReplyAt|last_reply_at|d7/i);
  });

  it("returns an empty day list for a known range with no registrations", async () => {
    expect(await query()).toMatchObject({
      available: true,
      reasons: [],
      days: [],
      effective_range: range,
    });
  });

  it("uses the existing billing test fallback for absent or unrecognized configuration", async () => {
    await account("payer");
    await order("payment", "payer", start);
    for (const key of ["", "pk_live_fixture"]) {
      const result = await getActivationMetrics(
        { ...bindings, STRIPE_SECRET_KEY: key } as Env,
        range,
        observed,
      );
      expect(result.mode).toBe("test");
      expect(result.days[0]).toMatchObject({ paid_accounts: 1 });
    }
  });
});

describe("whole signup day completeness", () => {
  it.each([
    ["missing object", {}],
    ["null object", { activation: null }],
    ["array", { activation: [] }],
    ["scalar", { activation: "unknown" }],
  ])("excludes the entire day for an activation %s", async (_label, data) => {
    await account("complete", start, { firstModelTestAt: start });
    await account("incomplete");
    await snapshot("incomplete", start + window, data);
    expect((await query()).days).toEqual([
      {
        signup_day: "2026-11-22",
        available: false,
        reasons: ["activation_missing"],
      },
    ]);
  });

  it("excludes a day with a missing snapshot instead of publishing the other account's count", async () => {
    await account("complete");
    await account("missing");
    await env.DB.prepare("DELETE FROM admin_account_stats WHERE user_id='missing'").run();
    const result = await query();
    expect(result).toMatchObject({ available: false, reasons: ["snapshot_missing"] });
    expect(result.days).toEqual([
      {
        signup_day: "2026-11-22",
        available: false,
        reasons: ["snapshot_missing"],
      },
    ]);
    const sql = await env.DB.prepare(referenceSql)
      .bind(start, start + day, observed, window, "test")
      .first<Record<string, unknown>>();
    expect(sql!.available).toBe(0);
    for (const key of counts) expect(sql![key]).toBeNull();
  });

  it("requires every in-range account to mature, including later registrations on the same day", async () => {
    await account("early");
    await account("late", start + 3600000);
    expect((await query(start, start + day, start + window)).days).toEqual([
      {
        signup_day: "2026-11-22",
        available: false,
        reasons: ["window_incomplete"],
      },
    ]);
    expect((await query(start, start + day, start + window + 3600000)).days[0]).toMatchObject({
      available: true,
      accounts: 2,
    });
  });

  it("requires the snapshot to cover the exact window end", async () => {
    await account("ready");
    await account("stale");
    await snapshot("stale", start + window - 1, { activation: {} });
    expect((await query()).days).toEqual([
      {
        signup_day: "2026-11-22",
        available: false,
        reasons: ["snapshot_stale"],
      },
    ]);
    await snapshot("stale", start + window, { activation: {} });
    expect((await query(start, start + day, start + window)).days[0]).toMatchObject({
      available: true,
      accounts: 2,
    });
  });

  it("keeps a complete earlier day alongside an immature day and reports every known reason", async () => {
    await account("first");
    await account("later", start + day);
    await snapshot("later", start, {});
    const result = await query(start, start + 2 * day, start + window);
    expect(result.days[0]).toMatchObject({
      signup_day: "2026-11-22",
      available: true,
      accounts: 1,
    });
    expect(result.days[1]).toEqual({
      signup_day: "2026-11-23",
      available: false,
      reasons: ["window_incomplete", "snapshot_stale", "activation_missing"],
    });
    expect(result.reasons).toEqual(["window_incomplete", "snapshot_stale", "activation_missing"]);
  });

  it("returns explicit unavailability before collection or when the collection start is unknown", async () => {
    const unreachable = {
      ...bindings,
      DB: {
        prepare() {
          throw new Error("DB must not be read");
        },
      },
    } as unknown as Env;
    expect(
      await getActivationMetrics(unreachable, { from_ms: start - day, to_ms: start }, observed),
    ).toMatchObject({
      available: false,
      reasons: ["before_collection_start"],
      effective_range: null,
      days: [],
    });
    expect(await getActivationMetrics(unreachable, range, observed, null)).toMatchObject({
      available: false,
      reasons: ["collection_start_unknown"],
      collection_started_at_ms: null,
      days: [],
    });
  });
});

describe("activation range parsing", () => {
  it.each([
    "",
    "from_ms=1",
    "to_ms=2",
    "from_ms=&to_ms=2",
    "from_ms=-1&to_ms=2",
    "from_ms=1.1&to_ms=2",
    "from_ms=1e2&to_ms=200",
    "from_ms=NaN&to_ms=2",
    "from_ms=1&to_ms=Infinity",
    "from_ms=9007199254740992&to_ms=9007199254740993",
    "from_ms=2&to_ms=2",
    "from_ms=3&to_ms=2",
    "from_ms=1&from_ms=2&to_ms=3",
    "from_ms=1&to_ms=2&to_ms=3",
    "from_ms=+1&to_ms=2",
  ])("rejects invalid or ambiguous bounds %s", (search) => {
    expect(parseActivationRange(new URLSearchParams(search))).toBeNull();
  });
  it("accepts integer millisecond bounds", () => {
    expect(
      parseActivationRange(new URLSearchParams(`from_ms=${start}&to_ms=${start + day}`)),
    ).toEqual(range);
    expect(parseActivationRange(new URLSearchParams("from_ms=0&to_ms=1"))).toEqual({
      from_ms: 0,
      to_ms: 1,
    });
  });
});
