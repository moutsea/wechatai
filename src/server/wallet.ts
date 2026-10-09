import { AppError } from "./config";
import { TOKENS_PER_CREDIT, OUTPUT_TOKEN_WEIGHT } from "../shared/credits";
// Wallet balances retain their existing scale: 1 credit = 1,000 integer units.
// Only new usage changes rate; round up once to the nearest 0.001 credit.
export const creditUnits = (input: number, output: number) =>
  Math.ceil(((input + output * OUTPUT_TOKEN_WEIGHT) * 1000) / TOKENS_PER_CREDIT);
export function dayWindow(now = Date.now()) {
  const shifted = now + 8 * 3600000;
  const day = new Date(shifted).toISOString().slice(0, 10);
  return {
    day,
    start: Math.floor(shifted / 86400000) * 86400000 - 8 * 3600000,
    end: (Math.floor(shifted / 86400000) + 1) * 86400000 - 8 * 3600000,
  };
}
type Bucket = { id: string; kind: string; remaining: number; expires: number };
export class Wallet {
  constructor(private storage: DurableObjectStorage) {}
  private get sql() {
    return this.storage.sql;
  }
  init() {
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS credit_buckets (id TEXT PRIMARY KEY, kind TEXT NOT NULL, remaining INTEGER NOT NULL CHECK(remaining >= 0), expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS credit_ledger (id TEXT PRIMARY KEY, kind TEXT NOT NULL, amount INTEGER NOT NULL, note TEXT NOT NULL, createdAt INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS reservations (id TEXT PRIMARY KEY, amount INTEGER NOT NULL, allocations TEXT NOT NULL, status TEXT NOT NULL, createdAt INTEGER NOT NULL); CREATE TRIGGER IF NOT EXISTS ledger_no_update BEFORE UPDATE ON credit_ledger BEGIN SELECT RAISE(ABORT, 'immutable ledger'); END; CREATE TRIGGER IF NOT EXISTS ledger_no_delete BEFORE DELETE ON credit_ledger BEGIN SELECT RAISE(ABORT, 'immutable ledger'); END;`,
    );
    this.sql
      .exec(`CREATE TABLE IF NOT EXISTS platform_metering (id TEXT PRIMARY KEY, pluginId TEXT NOT NULL, pluginVersion TEXT NOT NULL, instanceId TEXT NOT NULL, data TEXT NOT NULL, createdAt INTEGER NOT NULL);
      CREATE TRIGGER IF NOT EXISTS metering_no_update BEFORE UPDATE ON platform_metering BEGIN SELECT RAISE(ABORT, 'immutable metering'); END;
      CREATE TRIGGER IF NOT EXISTS metering_no_delete BEFORE DELETE ON platform_metering BEGIN SELECT RAISE(ABORT, 'immutable metering'); END;`);
    // Keep debt separate from expiring grants so a daily reset cannot erase it.
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS credit_debt (id INTEGER PRIMARY KEY CHECK(id = 1), amount INTEGER NOT NULL CHECK(amount >= 0)); INSERT OR IGNORE INTO credit_debt (id, amount) VALUES (1, 0);",
    );
  }
  grant(id: string, kind: string, units: number, expires: number, note: string) {
    if (!Number.isSafeInteger(units) || units < 0) throw new Error("Invalid credit grant");
    this.storage.transactionSync(() => {
      if (this.sql.exec("SELECT id FROM credit_buckets WHERE id = ?", id).toArray().length) return;
      this.sql.exec("INSERT INTO credit_buckets VALUES (?, ?, ?, ?)", id, kind, units, expires);
      const repaid = this.repayDebt();
      this.sql.exec(
        "INSERT INTO credit_ledger VALUES (?, ?, ?, ?, ?)",
        `grant:${id}`,
        kind,
        units,
        repaid ? `${note}；抵扣欠额 ${(repaid / 1000).toFixed(3)} credits` : note,
        Date.now(),
      );
    });
  }
  daily(amount: number) {
    const w = dayWindow();
    const units = Math.round(amount * 1000);
    if (!Number.isSafeInteger(units) || units < 0) throw new Error("Invalid daily allowance");
    this.storage.transactionSync(() => {
      // Count issued credits, including spent credits and debt repayments. Preserve legacy
      // daily IDs so an upgrade only tops up today's allowance and retries cannot refill it.
      const granted = this.sql
        .exec<{ units: number; count: number }>(
          "SELECT COALESCE(SUM(amount), 0) AS units, COUNT(*) AS count FROM credit_ledger WHERE kind = 'daily' AND id GLOB ?",
          `grant:daily:${w.day}*`,
        )
        .one();
      if (granted.units >= units) return;
      this.grant(
        granted.count ? `daily:${w.day}:topup:${units}` : `daily:${w.day}`,
        "daily",
        units - granted.units,
        w.end,
        granted.count ? "每日赠送补足" : "每日赠送",
      );
    });
  }
  buckets(now = Date.now()) {
    return this.sql
      .exec<Bucket>(
        "SELECT * FROM credit_buckets WHERE expires > ? AND remaining > 0 ORDER BY expires ASC, id ASC",
        now,
      )
      .toArray();
  }
  balance() {
    return this.buckets().reduce((s, b) => s + b.remaining, 0) - this.debt();
  }
  debt() {
    return this.sql.exec<{ amount: number }>("SELECT amount FROM credit_debt WHERE id = 1").one()
      .amount;
  }
  // Repayment only moves existing value from grants/refunds into outstanding debt.
  // The grant/refund ledger entry already accounts for the balance increase.
  private repayDebt() {
    const buckets = this.buckets();
    const repaid = Math.min(
      this.debt(),
      buckets.reduce((sum, b) => sum + b.remaining, 0),
    );
    if (repaid) {
      this.debit(repaid, buckets);
      this.sql.exec("UPDATE credit_debt SET amount = amount - ? WHERE id = 1", repaid);
    }
    return repaid;
  }
  // Called inside a transaction; consume the soonest-expiring credits first.
  private debit(amount: number, buckets = this.buckets()) {
    if (buckets.reduce((s, b) => s + b.remaining, 0) < amount)
      throw new AppError("insufficient_credits", "Credits 不足，请补充额度后重试", 402);
    let remaining = amount;
    const allocations: { id: string; amount: number }[] = [];
    for (const b of buckets) {
      const take = Math.min(remaining, b.remaining);
      if (!take) break;
      this.sql.exec("UPDATE credit_buckets SET remaining = remaining - ? WHERE id = ?", take, b.id);
      allocations.push({ id: b.id, amount: take });
      remaining -= take;
    }
    return allocations;
  }
  private spend(amount: number) {
    const buckets = this.buckets();
    const available = Math.min(
      amount,
      buckets.reduce((sum, b) => sum + b.remaining, 0),
    );
    this.debit(available, buckets);
    this.sql.exec("UPDATE credit_debt SET amount = amount + ? WHERE id = 1", amount - available);
  }
  charge(id: string, actual: number, budget: number, kind: "usage" | "context_summary" = "usage") {
    if (!Number.isFinite(actual) || !Number.isSafeInteger(budget) || budget < 0)
      throw new Error("Invalid charge");
    return this.storage.transactionSync(() => {
      const previous = this.sql
        .exec<{ amount: number }>("SELECT amount FROM credit_ledger WHERE id = ?", `usage:${id}`)
        .toArray()[0];
      if (previous) return Math.abs(previous.amount);
      const billed = Math.min(budget, Math.max(0, Math.ceil(actual)));
      this.expire();
      this.spend(billed);
      this.sql.exec(
        "INSERT INTO credit_ledger VALUES (?, ?, ?, ?, ?)",
        `usage:${id}`,
        kind,
        -billed,
        `${kind === "context_summary" ? "上下文整理" : "实际消耗"} ${(billed / 1000).toFixed(3)} credits`,
        Date.now(),
      );
      return billed;
    });
  }
  // Legacy holds remain readable and refundable; new requests use charge() only.
  reserve(id: string, amount: number) {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Invalid reserve");
    this.storage.transactionSync(() => {
      if (this.sql.exec("SELECT id FROM reservations WHERE id = ?", id).toArray().length)
        throw new AppError("duplicate_run", "这条消息已经处理过了", 409);
      if (this.balance() < amount)
        throw new AppError("insufficient_credits", "Credits 不足，请补充额度后重试", 402);
      const allocations = this.debit(amount);
      this.sql.exec(
        "INSERT INTO reservations VALUES (?, ?, ?, ?, ?)",
        id,
        amount,
        JSON.stringify(allocations),
        "held",
        Date.now(),
      );
      this.sql.exec(
        "INSERT INTO credit_ledger VALUES (?, ?, ?, ?, ?)",
        `reserve:${id}`,
        "reserve",
        -amount,
        "请求额度预留",
        Date.now(),
      );
    });
  }
  settle(id: string, actual: number, budget?: number) {
    if (
      !Number.isFinite(actual) ||
      (budget !== undefined && (!Number.isSafeInteger(budget) || budget < 0))
    )
      throw new Error("Invalid settlement");
    return this.storage.transactionSync(() => {
      const r = this.sql
        .exec<{ amount: number; allocations: string; status: string }>(
          "SELECT * FROM reservations WHERE id = ?",
          id,
        )
        .toArray()[0];
      if (!r || r.status !== "held") return 0;
      // A fixed hold is independent of the request's authorized spending limit.
      // Unpaid usage becomes persistent debt; other requests' holds stay intact.
      const billed = Math.min(budget ?? r.amount, Math.max(0, Math.ceil(actual)));
      if (billed > r.amount) this.spend(billed - r.amount);
      let refund = Math.max(0, r.amount - billed);
      const allocations = JSON.parse(r.allocations) as { id: string; amount: number }[];
      for (const b of allocations.reverse()) {
        const n = Math.min(b.amount, refund);
        this.sql.exec("UPDATE credit_buckets SET remaining = remaining + ? WHERE id = ?", n, b.id);
        refund -= n;
      }
      this.repayDebt();
      this.sql.exec("UPDATE reservations SET status = ? WHERE id = ?", "settled", id);
      this.sql.exec(
        "INSERT INTO credit_ledger VALUES (?, ?, ?, ?, ?)",
        `settle:${id}`,
        billed ? "settlement" : "refund",
        r.amount - billed,
        billed ? `实际消耗 ${(billed / 1000).toFixed(3)} credits` : "未完成请求，释放预留额度",
        Date.now(),
      );
      return billed;
    });
  }
  expire() {
    this.storage.transactionSync(() => {
      for (const b of this.sql
        .exec<Bucket>(
          "SELECT * FROM credit_buckets WHERE expires <= ? AND remaining > 0",
          Date.now(),
        )
        .toArray()) {
        this.sql.exec("UPDATE credit_buckets SET remaining = 0 WHERE id = ?", b.id);
        this.sql.exec(
          "INSERT INTO credit_ledger VALUES (?, ?, ?, ?, ?)",
          `expiry:${b.id}:${crypto.randomUUID()}`,
          "expiry",
          -b.remaining,
          b.kind === "daily" ? "每日赠送额度到期" : "会员周期额度到期",
          Date.now(),
        );
      }
    });
  }
  reap() {
    for (const r of this.sql
      .exec<{ id: string }>(
        "SELECT id FROM reservations WHERE status = 'held' AND createdAt < ?",
        Date.now() - 180000,
      )
      .toArray())
      this.settle(r.id, 0);
    this.expire();
  }
}
