import { env, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Wallet } from "../src/server/wallet";
import type { WxMessage } from "../src/server/wechat";

const account = () => env.ACCOUNTS.getByName(crypto.randomUUID());
type Account = ReturnType<typeof account>;
async function model(stub: Account, overrides = {}) {
  const result = JSON.parse(
    await stub.api("assistant.save", {
      name: "Postpaid model",
      protocol: "chat-completions",
      baseUrl: "https://llm.example.com",
      apiKey: "test-only-key",
      model: "test-model",
      systemPrompt: "",
      maxOutputTokens: 8192,
      maxCredits: 1000,
      ...overrides,
    }),
  );
  expect(result.ok).toBe(true);
  if (!(await stub.snapshot()).connections.length)
    await stub.api("wechat.create", { name: "测试微信" });
  return result.data;
}
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("Unexpected fetch"))),
  ),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("postpaid request credits", () => {
  it.each([1024, 8192])(
    "does not hold credits for an output limit of %s and charges actual usage once",
    async (limit) => {
      const stub = account();
      await model(stub, { maxOutputTokens: limit });
      await runInDurableObject(stub, async (instance, state) => {
        const before = instance.snapshot().wallet.balance;
        const beforeLedger = instance.snapshot().ledger;
        let modelCalls = 0;
        vi.mocked(fetch).mockImplementation(async (url, init) => {
          if (String(url).includes("cloudflare-dns.com"))
            return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
          modelCalls++;
          expect(JSON.parse(String(init?.body)).max_completion_tokens).toBe(limit);
          expect(instance.snapshot().wallet.balance).toBe(before);
          expect(instance.snapshot().ledger).toEqual(beforeLedger);
          expect(
            state.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM reservations").one().n,
          ).toBe(0);
          return Response.json({
            choices: [{ message: { content: "已回复" } }],
            usage: { prompt_tokens: 100, completion_tokens: 1000 },
          });
        });
        const processor = instance as unknown as {
          processWechat(id: string, message: WxMessage, connectionId: string): Promise<string>;
        };
        const message = { item_list: [{ type: 1, text_item: { text: "你好" } }] };
        expect(await processor.processWechat("request", message, "default")).toBe("已回复");
        expect(await processor.processWechat("request", message, "default")).toBe("已回复");
        expect(modelCalls).toBe(1);
        const after = instance.snapshot();
        expect(after.wallet.balance).toBeCloseTo(before - 0.006);
        expect(after.wallet.spentToday).toBe(0.006);
        expect(after.ledger.some((l) => ["reserve", "settlement", "refund"].includes(l.kind))).toBe(
          false,
        );
        expect(after.ledger.filter((l) => l.kind === "usage")).toHaveLength(1);
        expect(after.ledger.find((l) => l.kind === "usage")).toMatchObject({
          amount: -0.006,
          note: "实际消耗 0.006 credits",
          meter: {
            policyVersion: "gateway-v1",
            tokenizerVersion: "cl100k_base@gpt-tokenizer-4.0.0",
            inputTokens: 2,
            outputTokens: 3,
            outputImages: 0,
            units: 6,
          },
        });
        expect(
          state.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM platform_metering").one()
            .n,
        ).toBe(1);
        expect(() =>
          state.storage.sql.exec("UPDATE platform_metering SET data = '{}' WHERE id = 'request'"),
        ).toThrow("immutable metering");
        expect(
          state.storage.sql
            .exec<{ cost: number }>("SELECT cost FROM messages WHERE role = 'assistant'")
            .one().cost,
        ).toBe(0.006);
      });
    },
  );
  it("charges connection tests once using actual usage without holds or refunds", async () => {
    const stub = account();
    const a = await model(stub);
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (String(url).includes("cloudflare-dns.com"))
        return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
      expect(JSON.parse(String(init?.body)).max_completion_tokens).toBe(64);
      return Response.json({
        choices: [{ message: { content: "连接成功" } }],
        usage: { prompt_tokens: 52, completion_tokens: 10 },
      });
    });
    const before = (await stub.snapshot()).wallet.balance;
    expect(JSON.parse(await stub.api("assistant.test", { id: a.id }))).toMatchObject({
      ok: true,
      data: { cost: 0.005 },
    });
    const after = await stub.snapshot();
    expect(after.wallet.balance).toBeCloseTo(before - 0.005);
    expect(after.ledger.some((l) => ["reserve", "settlement", "refund"].includes(l.kind))).toBe(
      false,
    );
    expect(after.ledger.find((l) => l.kind === "usage")?.amount).toBe(-0.005);
  });
  it.each([0, -1000])(
    "rejects a balance of %s units before contacting the provider",
    async (remaining) => {
      const stub = account();
      const a = await model(stub);
      await runInDurableObject(stub, (_instance, state) => {
        const wallet = new Wallet(state.storage);
        const balance = wallet.balance();
        wallet.charge("spent", balance - remaining, balance - remaining);
      });
      const result = JSON.parse(await stub.api("assistant.test", { id: a.id }));
      expect(result).toMatchObject({ ok: false, error: "insufficient_credits", status: 402 });
      expect(result.message).toContain("余额不足");
      expect(fetch).not.toHaveBeenCalled();
      expect((await stub.snapshot()).wallet.balance).toBe(remaining / 1000);
      await runInDurableObject(stub, (_instance, state) => {
        expect(
          state.storage.sql
            .exec<{ n: number }>("SELECT COUNT(*) AS n FROM reservations WHERE status = 'held'")
            .one().n,
        ).toBe(0);
      });
    },
  );
  it.each(["http", "timeout"])(
    "does not change the wallet or ledger after an upstream %s failure",
    async (failure) => {
      const stub = account();
      const a = await model(stub);
      vi.mocked(fetch).mockImplementation(async (url) => {
        if (String(url).includes("cloudflare-dns.com"))
          return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
        if (failure === "timeout")
          throw new DOMException("Model request timed out", "TimeoutError");
        return new Response(null, { status: 500 });
      });
      const before = (await stub.snapshot()).wallet.balance;
      const beforeLedger = (await stub.snapshot()).ledger;
      expect(JSON.parse(await stub.api("assistant.test", { id: a.id })).ok).toBe(false);
      const after = await stub.snapshot();
      expect(after.wallet.balance).toBe(before);
      expect(after.ledger).toEqual(beforeLedger);
    },
  );
  it.each([0, 240000])(
    "blocks overlapping requests after %s ms without pre-debiting",
    async (elapsed) => {
      const stub = account();
      const a = await model(stub);
      await runInDurableObject(stub, async (instance, state) => {
        const wallet = new Wallet(state.storage);
        const spent = wallet.balance() - 1000;
        wallet.charge("previous", spent, spent);
        let release!: (response: Response) => void;
        let started!: () => void;
        let modelCalls = 0;
        const waiting = new Promise<void>((resolve) => {
          started = resolve;
        });
        vi.mocked(fetch).mockImplementation(async (url) => {
          if (String(url).includes("cloudflare-dns.com"))
            return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
          if (++modelCalls > 1) return new Response(null, { status: 500 });
          return new Promise<Response>((resolve) => {
            release = resolve;
            started();
          });
        });
        const first = instance.api("assistant.test", { id: a.id });
        await waiting;
        const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + elapsed);
        try {
          const second = JSON.parse(await instance.api("assistant.test", { id: a.id }));
          expect(second).toMatchObject({ ok: false, error: "conversation_busy" });
          expect(modelCalls).toBe(1);
          expect(wallet.balance()).toBe(1000);
        } finally {
          clock.mockRestore();
          release(
            Response.json({
              choices: [{ message: { content: "成功" } }],
              usage: { prompt_tokens: 10, completion_tokens: 10 },
            }),
          );
        }
        expect(JSON.parse(await first)).toMatchObject({ ok: true, data: { cost: 0.003 } });
        expect(wallet.balance()).toBe(997);
      });
    },
  );
  it("rolls back the charge if saving successful usage fails", async () => {
    const stub = account();
    const a = await model(stub);
    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url).includes("cloudflare-dns.com")
        ? Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] })
        : Response.json({
            choices: [{ message: { content: "成功" } }],
            usage: { prompt_tokens: 10, completion_tokens: 10 },
          }),
    );
    const before = await stub.snapshot();
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "CREATE TRIGGER fail_usage BEFORE INSERT ON usage BEGIN SELECT RAISE(ABORT, 'test save failure'); END;",
      );
    });
    expect(JSON.parse(await stub.api("assistant.test", { id: a.id })).ok).toBe(false);
    const after = await stub.snapshot();
    expect(after.wallet).toEqual(before.wallet);
    expect(after.ledger).toEqual(before.ledger);
    await runInDurableObject(stub, (_instance, state) => {
      expect(
        state.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM platform_metering").one()
          .n,
      ).toBe(0);
    });
  });
  it("uses the new token rate when limiting output to the request budget", async () => {
    const stub = account();
    await model(stub, { maxCredits: 2, maxOutputTokens: 1024 });
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (String(url).includes("cloudflare-dns.com"))
        return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
      expect(JSON.parse(String(init?.body)).max_completion_tokens).toBe(1024);
      return Response.json({
        choices: [{ message: { content: "budget updated" } }],
        usage: { prompt_tokens: 100, completion_tokens: 1000 },
      });
    });
    await runInDurableObject(stub, async (instance) => {
      const processor = instance as unknown as {
        processWechat(id: string, message: WxMessage, connectionId: string): Promise<string>;
      };
      expect(
        await processor.processWechat(
          "new-budget",
          { item_list: [{ type: 1, text_item: { text: "Hi" } }] },
          "default",
        ),
      ).toBe("budget updated");
      expect(instance.snapshot().wallet.spentToday).toBe(0.004);
    });
  });
  it("ignores inflated upstream usage instead of charging the spending cap", async () => {
    const stub = account();
    const a = await model(stub, { maxCredits: 1 });
    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url).includes("cloudflare-dns.com")
        ? Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] })
        : Response.json({
            choices: [{ message: { content: "done" } }],
            usage: { prompt_tokens: 1000, completion_tokens: 1000 },
          }),
    );
    const before = (await stub.snapshot()).wallet.balance;
    expect(JSON.parse(await stub.api("assistant.test", { id: a.id }))).toMatchObject({
      ok: true,
      data: { cost: 0.003 },
    });
    const after = await stub.snapshot();
    expect(after.wallet.balance).toBeCloseTo(before - 0.003);
    expect(after.ledger.find((l) => l.kind === "usage")?.amount).toBe(-0.003);
  });
});

describe("legacy reservation compatibility", () => {
  it("releases an old interrupted hold after upgrade without changing its historical ledger", async () => {
    await runInDurableObject(account(), (_instance, state) => {
      const w = new Wallet(state.storage);
      w.grant("gift", "daily", 10000, Date.now() + 100000, "gift");
      w.reserve("old-request", 5000);
      state.storage.sql.exec(
        "UPDATE reservations SET createdAt = ? WHERE id = 'old-request'",
        Date.now() - 200000,
      );
      const upgraded = new Wallet(state.storage);
      upgraded.init();
      upgraded.reap();
      upgraded.reap();
      expect(upgraded.balance()).toBe(10000);
      expect(
        state.storage.sql
          .exec<{ amount: number }>(
            "SELECT amount FROM credit_ledger WHERE id = 'reserve:old-request'",
          )
          .one().amount,
      ).toBe(-5000);
      expect(
        state.storage.sql
          .exec<{ amount: number }>(
            "SELECT amount FROM credit_ledger WHERE id = 'settle:old-request'",
          )
          .one().amount,
      ).toBe(5000);
    });
  });
  it("debits extra credits in expiration order and records the total charge once", async () => {
    await runInDurableObject(account(), (_instance, state) => {
      const w = new Wallet(state.storage);
      w.grant("daily", "daily", 6000, Date.now() + 100000, "gift");
      w.grant("paid", "purchase", 10000, Number.MAX_SAFE_INTEGER, "paid");
      w.reserve("request", 5000);
      expect(w.settle("request", 8100, 15000)).toBe(8100);
      expect(w.balance()).toBe(7900);
      expect(w.buckets().map((b) => [b.id, b.remaining])).toEqual([["paid", 7900]]);
      expect(w.settle("request", 15000, 15000)).toBe(0);
      expect(w.balance()).toBe(7900);
      expect(
        state.storage.sql
          .exec<{ amount: number }>("SELECT SUM(amount) AS amount FROM credit_ledger")
          .one().amount,
      ).toBe(7900);
    });
  });
  it("records debt without spending another request's hold and repays it from a later refund", async () => {
    await runInDurableObject(account(), (_instance, state) => {
      const w = new Wallet(state.storage);
      w.grant("g", "purchase", 12000, Number.MAX_SAFE_INTEGER, "paid");
      w.reserve("a", 5000);
      w.reserve("b", 5000);
      expect(w.settle("a", 10000, 12000)).toBe(10000);
      expect(w.balance()).toBe(-3000);
      expect(w.debt()).toBe(3000);
      expect(
        state.storage.sql
          .exec<{ status: string }>("SELECT status FROM reservations WHERE id = 'b'")
          .one().status,
      ).toBe("held");
      expect(w.settle("b", 0)).toBe(0);
      expect(w.balance()).toBe(2000);
      expect(w.debt()).toBe(0);
    });
  });
  it("caps additional charges to the authorized request budget", async () => {
    await runInDurableObject(account(), (_instance, state) => {
      const w = new Wallet(state.storage);
      w.grant("g", "purchase", 20000, Number.MAX_SAFE_INTEGER, "paid");
      w.reserve("r", 5000);
      expect(w.settle("r", 999999, 8000)).toBe(8000);
      expect(w.balance()).toBe(12000);
    });
  });
  it("does not use expired credits for additional charges or resurrect late refunds", async () => {
    await runInDurableObject(account(), (_instance, state) => {
      const w = new Wallet(state.storage);
      w.grant("gift", "daily", 20000, Date.now() + 100000, "gift");
      w.grant("paid", "purchase", 2000, Number.MAX_SAFE_INTEGER, "paid");
      w.reserve("r", 5000);
      state.storage.sql.exec("UPDATE credit_buckets SET expires = 0 WHERE id = 'gift'");
      w.expire();
      expect(w.settle("r", 9000, 20000)).toBe(9000);
      expect(w.balance()).toBe(-2000);
      expect(w.debt()).toBe(2000);
      expect(
        state.storage.sql
          .exec<{ amount: number }>("SELECT SUM(amount) AS amount FROM credit_ledger")
          .one().amount,
      ).toBe(-2000);
    });
  });
});

describe("negative credit balances and repayment", () => {
  it.each([1, 5])(
    "allows a balance of %s units, charges full usage, then blocks the next request",
    async (remaining) => {
      const stub = account();
      await model(stub);
      await runInDurableObject(stub, async (instance, state) => {
        const wallet = new Wallet(state.storage);
        const spent = wallet.balance() - remaining;
        wallet.charge("previous", spent, spent);
        let calls = 0;
        vi.mocked(fetch).mockImplementation(async (url, init) => {
          if (String(url).includes("cloudflare-dns.com"))
            return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
          calls++;
          expect(wallet.balance()).toBe(remaining);
          expect(JSON.parse(String(init?.body)).max_completion_tokens).toBe(8192);
          return Response.json({
            choices: [{ message: { content: "已回复" } }],
            usage: { prompt_tokens: 100, completion_tokens: 1000 },
          });
        });
        const processor = instance as unknown as {
          processWechat(id: string, message: WxMessage, connectionId: string): Promise<string>;
        };
        const message = { item_list: [{ type: 1, text_item: { text: "你好" } }] };
        expect(await processor.processWechat("overdraw", message, "default")).toBe("已回复");
        const snapshot = instance.snapshot();
        expect(snapshot.wallet).toMatchObject({
          balance: (remaining - 6) / 1000,
          debt: (6 - remaining) / 1000,
          spentToday: 0.006,
        });
        expect(snapshot.ledger.find((l) => l.id === "usage:overdraw")?.amount).toBe(-0.006);
        expect(
          await processor.processWechat(
            "balance",
            {
              item_list: [{ type: 1, text_item: { text: "/balance" } }],
            },
            "default",
          ),
        ).toContain(`${((remaining - 6) / 1000).toFixed(3)} credits`);
        await expect(processor.processWechat("blocked", message, "default")).rejects.toMatchObject({
          code: "insufficient_credits",
        });
        expect(calls).toBe(1);
        expect(
          state.storage.sql
            .exec<{ units: number }>("SELECT units FROM usage WHERE id = 'overdraw'")
            .one().units,
        ).toBe(6);
      });
    },
  );
  it("deducts persistent debt from the next day's gift exactly once and keeps the ledger balanced", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2030-01-01T12:00:00+08:00"));
    await runInDurableObject(account(), (_instance, state) => {
      const w = new Wallet(state.storage);
      w.daily(100);
      expect(w.charge("long-reply", 108000, 200000)).toBe(108000);
      expect(w.balance()).toBe(-8000);
      expect(w.debt()).toBe(8000);
      w.daily(100);
      w.reap();
      expect(w.balance()).toBe(-8000);
      const reopened = new Wallet(state.storage);
      reopened.init();
      expect(reopened.debt()).toBe(8000);
      expect(reopened.charge("long-reply", 108000, 200000)).toBe(108000);
      expect(reopened.balance()).toBe(-8000);
      clock.mockReturnValue(Date.parse("2030-01-02T00:00:00+08:00"));
      reopened.reap();
      reopened.daily(100);
      expect(reopened.balance()).toBe(92000);
      expect(reopened.debt()).toBe(0);
      expect(reopened.buckets().map((b) => [b.id, b.remaining])).toEqual([
        ["daily:2030-01-02", 92000],
      ]);
      reopened.daily(100);
      expect(reopened.balance()).toBe(92000);
      expect(
        state.storage.sql
          .exec<{ amount: number; note: string }>(
            "SELECT amount,note FROM credit_ledger WHERE id = 'grant:daily:2030-01-02'",
          )
          .one(),
      ).toEqual({ amount: 100000, note: "每日赠送；抵扣欠额 8.000 credits" });
      expect(
        state.storage.sql
          .exec<{ amount: number }>("SELECT SUM(amount) AS amount FROM credit_ledger")
          .one().amount,
      ).toBe(92000);
      clock.mockReturnValue(Date.parse("2030-01-03T00:00:00+08:00"));
      reopened.reap();
      reopened.daily(100);
      expect(reopened.balance()).toBe(100000);
    });
  });
  it("carries unpaid debt across multiple daily refreshes instead of resetting it to zero", async () => {
    const start = Date.parse("2030-02-01T12:00:00+08:00");
    const clock = vi.spyOn(Date, "now").mockReturnValue(start);
    await runInDurableObject(account(), (_instance, state) => {
      const w = new Wallet(state.storage);
      w.daily(10);
      w.charge("large", 35000, 50000);
      expect(w.balance()).toBe(-25000);
      for (const [day, expected] of [
        [1, -15000],
        [2, -5000],
        [3, 5000],
      ]) {
        clock.mockReturnValue(start + day * 86400000);
        w.reap();
        w.daily(10);
        w.daily(10);
        expect(w.balance()).toBe(expected);
        expect(w.debt()).toBe(Math.max(0, -expected));
      }
      expect(
        state.storage.sql
          .exec<{ amount: number }>("SELECT SUM(amount) AS amount FROM credit_ledger")
          .one().amount,
      ).toBe(5000);
    });
  });
  it.each(["purchase", "subscription"] as const)(
    "repays debt from %s credits without repeating a payment grant",
    async (kind) => {
      const stub = account();
      await stub.snapshot();
      await runInDurableObject(stub, (_instance, state) => {
        const w = new Wallet(state.storage);
        const balance = w.balance();
        w.charge("r", balance + 8000, balance + 10000);
        expect(w.balance()).toBe(-8000);
      });
      const payment = { id: `repay-${kind}`, kind, units: 10000, expires: Date.now() + 86400000 };
      await stub.applyPayment(payment);
      await stub.applyPayment(payment);
      const snapshot = await stub.snapshot();
      expect(snapshot.wallet).toMatchObject({
        balance: kind === "purchase" ? 2 : 892,
        debt: 0,
        [kind === "purchase" ? "purchased" : "daily"]: kind === "purchase" ? 2 : 892,
      });
      expect(snapshot.wallet.subscription).toBe(0);
      expect(
        snapshot.ledger.find((l) =>
          kind === "purchase"
            ? l.id === `grant:payment:${payment.id}`
            : l.note.startsWith("每日赠送补足"),
        ),
      ).toMatchObject({
        amount: kind === "purchase" ? 10 : 900,
        note: expect.stringContaining("抵扣欠额 8.000 credits"),
      });
    },
  );
  it("never repays debt with an expired reservation refund", async () => {
    await runInDurableObject(account(), (_instance, state) => {
      const w = new Wallet(state.storage);
      w.grant("gift", "daily", 10000, Date.now() + 100000, "gift");
      w.reserve("a", 5000);
      w.reserve("b", 5000);
      w.settle("a", 8000, 10000);
      expect(w.debt()).toBe(3000);
      state.storage.sql.exec("UPDATE credit_buckets SET expires = 0 WHERE id = 'gift'");
      w.settle("b", 0);
      w.expire();
      expect(w.balance()).toBe(-3000);
      expect(w.debt()).toBe(3000);
      expect(
        state.storage.sql
          .exec<{ amount: number }>("SELECT SUM(amount) AS amount FROM credit_ledger")
          .one().amount,
      ).toBe(-3000);
    });
  });
});
