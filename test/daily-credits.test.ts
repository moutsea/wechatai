import { env, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dayWindow, Wallet } from "../src/server/wallet";

const account = () => env.ACCOUNTS.getByName(crypto.randomUUID());
const start = Date.parse("2026-10-08T02:00:00Z");
const day = 86400000;
const payment = (expires = start + 10 * day) => ({
  id: crypto.randomUUID(),
  kind: "subscription" as const,
  units: 0,
  expires,
});
afterEach(() => vi.restoreAllMocks());

describe("plan-based daily allowances", () => {
  it("grants Plus 1000 daily credits and never a monthly bucket", async () => {
    await runInDurableObject(account(), (instance) => {
      vi.spyOn(Date, "now").mockReturnValue(start);
      const invoice = payment();
      instance.applyPayment(invoice);
      instance.applyPayment(invoice);
      instance.applyPayment(payment(start + 30 * day));
      for (let i = 0; i < 3; i++) {
        const snapshot = instance.snapshot();
        expect(snapshot.plan).toBe("plus");
        expect(snapshot.wallet).toMatchObject({
          balance: 1000,
          daily: 1000,
          subscription: 0,
          dailyGrant: 1000,
          dailyGrants: { free: 100, plus: 1000 },
        });
        expect(snapshot.ledger.filter((l) => l.amount > 0)).toHaveLength(1);
      }
    });
  });

  it("only adds 900 on upgrade even after Free credits were spent, and cannot refill on renewal", async () => {
    await runInDurableObject(account(), (instance, state) => {
      vi.spyOn(Date, "now").mockReturnValue(start);
      expect(instance.snapshot().wallet.daily).toBe(100);
      const wallet = new Wallet(state.storage);
      wallet.charge("before-upgrade", 40000, 40000);
      const invoice = payment();
      instance.applyPayment(invoice);
      expect(instance.snapshot().wallet.daily).toBe(960);
      wallet.charge("after-upgrade", 20000, 20000);
      instance.applyPayment(invoice);
      instance.applyPayment(payment(start + 40 * day));
      expect(instance.snapshot().wallet.daily).toBe(940);
      expect(
        instance
          .snapshot()
          .ledger.filter((l) => l.kind === "daily")
          .map((l) => l.amount),
      ).toEqual([900, 100]);
    });
  });

  it("expires yesterday's unused grant exactly at Beijing midnight and preserves top-ups", async () => {
    await runInDurableObject(account(), (instance, state) => {
      const midnight = dayWindow(start).end;
      const clock = vi.spyOn(Date, "now").mockReturnValue(midnight - 1);
      instance.applyPayment(payment());
      const wallet = new Wallet(state.storage);
      wallet.charge("spent", 200000, 200000);
      instance.applyPayment({
        id: "topup",
        kind: "purchase",
        units: 50000,
        expires: Number.MAX_SAFE_INTEGER,
      });
      expect(instance.snapshot().wallet.balance).toBe(850);
      clock.mockReturnValue(midnight);
      const snapshot = instance.snapshot();
      expect(snapshot.wallet).toMatchObject({ balance: 1050, daily: 1000, purchased: 50 });
      expect(snapshot.ledger.find((l) => l.kind === "expiry")?.amount).toBe(-800);
      expect(instance.snapshot().wallet.balance).toBe(1050);
    });
  });

  it("does not accumulate missed days and grants on the first request of the current day", async () => {
    await runInDurableObject(account(), (instance) => {
      const clock = vi.spyOn(Date, "now").mockReturnValue(start);
      instance.applyPayment(payment());
      clock.mockReturnValue(start + 4 * day);
      const snapshot = instance.snapshot();
      expect(snapshot.wallet.daily).toBe(1000);
      expect(snapshot.ledger.filter((l) => l.kind === "daily")).toHaveLength(2);
    });
  });

  it("repays persistent debt across Plus daily resets without refilling a spent grant", async () => {
    await runInDurableObject(account(), (instance, state) => {
      const clock = vi.spyOn(Date, "now").mockReturnValue(start);
      instance.applyPayment(payment());
      new Wallet(state.storage).charge("overdraw", 2200000, 2200000);
      expect(instance.snapshot().wallet.balance).toBe(-1200);
      clock.mockReturnValue(start + day);
      expect(instance.snapshot().wallet).toMatchObject({ balance: -200, daily: 0, debt: 200 });
      expect(instance.snapshot().wallet.balance).toBe(-200);
      clock.mockReturnValue(start + 2 * day);
      expect(instance.snapshot().wallet).toMatchObject({ balance: 800, daily: 800, debt: 0 });
    });
  });

  it("returns to Free after membership expires without retracting today's already issued allowance", async () => {
    await runInDurableObject(account(), (instance, state) => {
      const clock = vi.spyOn(Date, "now").mockReturnValue(start);
      instance.applyPayment(payment(start + 3600000));
      new Wallet(state.storage).charge("spent", 40000, 40000);
      clock.mockReturnValue(start + 3600000);
      expect(instance.snapshot()).toMatchObject({
        plan: "free",
        wallet: { daily: 960, dailyGrant: 100 },
      });
      clock.mockReturnValue(dayWindow(start).end);
      expect(instance.snapshot().wallet).toMatchObject({
        balance: 100,
        daily: 100,
        dailyGrant: 100,
      });
    });
  });

  it("recognizes legacy daily grants after reopening and preserves existing monthly balances", async () => {
    await runInDurableObject(account(), (instance, state) => {
      vi.spyOn(Date, "now").mockReturnValue(start);
      const wallet = new Wallet(state.storage);
      wallet.grant(`daily:${dayWindow().day}`, "daily", 100000, dayWindow().end, "每日赠送");
      wallet.charge("spent", 40000, 40000);
      wallet.grant("payment:legacy", "subscription", 25000, start + day, "Plus 周期额度");
      instance.applyPayment(payment());
      const reopened = new Wallet(state.storage);
      reopened.init();
      reopened.daily(1000);
      expect(instance.snapshot().wallet).toMatchObject({
        balance: 985,
        daily: 960,
        subscription: 25,
      });
    });
  });

  it("rolls back membership and the daily supplement if recording the invoice fails", async () => {
    await runInDurableObject(account(), (instance, state) => {
      vi.spyOn(Date, "now").mockReturnValue(start);
      expect(instance.snapshot().wallet.daily).toBe(100);
      state.storage.sql.exec(
        "CREATE TRIGGER fail_payment BEFORE INSERT ON payments BEGIN SELECT RAISE(ABORT, 'test invoice failure'); END",
      );
      expect(() => instance.applyPayment(payment())).toThrow("test invoice failure");
      expect(instance.snapshot()).toMatchObject({ plan: "free", wallet: { daily: 100 } });
      expect(instance.snapshot().ledger.filter((l) => l.kind === "daily")).toHaveLength(1);
    });
  });
});
