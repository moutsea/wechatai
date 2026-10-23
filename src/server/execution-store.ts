import { createHash } from "node:crypto";
import { AppError, secret, MODEL_TURN_TIMEOUT_MS } from "./config";
import { encrypt, decrypt } from "./security";
import { ExecutionPending, type Activity } from "./execution-context";
import { receiverAuthorized } from "./wechat-receiver";

export const EXECUTION_MAX_BYTES = 32 * 1024 * 1024;
export function executionAuthorized(env: Env, authorization: string) {
  const configured = { ...env, WECHAT_RECEIVER_SECRET: secret(env, "EXECUTOR_SECRET", false) };
  return receiverAuthorized(configured, authorization);
}
export function executionEnabled(env: Env, account: string) {
  const allowed = secret(env, "EXECUTOR_ACCOUNTS", false)
    .split(",")
    .map((v) => v.trim());
  return (
    secret(env, "EXECUTOR_SECRET", false).length >= 32 &&
    (allowed.includes("all") || allowed.includes(account))
  );
}
export type ExecutionTurn = {
  id: string;
  connectionId: string;
  generation: string;
  startedAt: number;
  deadline: number;
};
type Job = { id: string; runId: string; state: string; lease: string; expiresAt: number };
export type ActivityOutcome =
  | { ok: true; value: unknown }
  | { ok: false; code: string; message: string };

// SQLite is authoritative. The D1 entry is an outbox for discovery, reconciled on
// alarms; a failed D1 write cannot lose a job. No upstream operation is repeated
// after an execution lease expires: its outcome may be unknown.
export class ExecutionStore {
  private syncing: Promise<void> | null = null;
  constructor(
    private storage: DurableObjectStorage,
    private env: Env,
    private account: string,
  ) {}
  private get sql() {
    return this.storage.sql;
  }
  init() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS execution_turns(id TEXT PRIMARY KEY, connectionId TEXT NOT NULL, generation TEXT NOT NULL, startedAt INTEGER NOT NULL, deadline INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS execution_jobs(id TEXT PRIMARY KEY,runId TEXT NOT NULL,state TEXT NOT NULL,lease TEXT NOT NULL DEFAULT '',expiresAt INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS execution_jobs_run ON execution_jobs(runId,state);
      CREATE TABLE IF NOT EXISTS execution_data(id TEXT NOT NULL,kind TEXT NOT NULL,part INTEGER NOT NULL,data BLOB NOT NULL,PRIMARY KEY(id,kind,part));
      CREATE TABLE IF NOT EXISTS execution_registry(id INTEGER PRIMARY KEY CHECK(id=1),dirty INTEGER NOT NULL);
      INSERT OR IGNORE INTO execution_registry VALUES(1,0);
    `);
  }
  enabled() {
    return executionEnabled(this.env, this.account);
  }
  turn(id: string) {
    return this.sql
      .exec<ExecutionTurn>("SELECT * FROM execution_turns WHERE id=?", id)
      .toArray()[0];
  }
  active() {
    return this.sql
      .exec<ExecutionTurn>("SELECT * FROM execution_turns ORDER BY startedAt LIMIT 1")
      .toArray()[0];
  }
  waiting(id: string) {
    return (
      this.sql
        .exec(
          "SELECT 1 FROM execution_jobs WHERE runId=? AND state IN ('queued','claimed') LIMIT 1",
          id,
        )
        .toArray().length > 0
    );
  }
  dirty() {
    return (
      this.sql.exec<{ dirty: number }>("SELECT dirty FROM execution_registry WHERE id=1").one()
        .dirty !== 0
    );
  }
  private changed() {
    this.sql.exec("UPDATE execution_registry SET dirty=dirty+1 WHERE id=1");
  }
  private put(id: string, kind: string, value: unknown) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    if (bytes.length > EXECUTION_MAX_BYTES)
      throw new AppError("execution_size", "本次处理数据过大，请减少附件或新建会话", 422);
    this.sql.exec("DELETE FROM execution_data WHERE id=? AND kind=?", id, kind);
    const total = this.sql
      .exec<{ bytes: number }>("SELECT COALESCE(SUM(length(data)),0) bytes FROM execution_data")
      .one().bytes;
    if (total + bytes.length > 96 * 1024 * 1024)
      throw new AppError("execution_size", "本次处理数据过大，请减少附件或新建会话", 422);
    for (let i = 0, part = 0; i < bytes.length; i += 256 * 1024, part++)
      this.sql.exec(
        "INSERT INTO execution_data VALUES(?,?,?,?)",
        id,
        kind,
        part,
        bytes.slice(i, i + 256 * 1024),
      );
  }
  private read<T>(id: string, kind: string): T {
    const parts = this.sql
      .exec<{ data: ArrayBuffer }>(
        "SELECT data FROM execution_data WHERE id=? AND kind=? ORDER BY part",
        id,
        kind,
      )
      .toArray();
    return JSON.parse(Buffer.concat(parts.map((p) => Buffer.from(p.data))).toString()) as T;
  }
  async perform(turn: ExecutionTurn, input: Activity): Promise<unknown> {
    const { timeoutMs: _timeout, ...fingerprint } = input;
    const id = createHash("sha256")
      .update(JSON.stringify([turn.id, fingerprint]))
      .digest("hex");
    const previous = this.sql.exec<Job>("SELECT * FROM execution_jobs WHERE id=?", id).toArray()[0];
    if (previous?.state === "complete") {
      const result = this.read<ActivityOutcome>(id, "result");
      if (!result.ok) throw new AppError(result.code, result.message, 502);
      return result.value;
    }
    if (previous) throw new ExecutionPending();
    if (Date.now() >= turn.deadline)
      throw new AppError(
        "model_turn_timeout",
        "本次处理耗时过长，本次未扣 credits，请重新发送",
        504,
      );
    const bounded = {
      ...input,
      timeoutMs: Math.max(1, Math.min(input.timeoutMs, 300000, turn.deadline - Date.now())),
    };
    const payload = await encrypt(
      this.env,
      JSON.stringify(bounded),
      `${this.account}:execution:${id}`,
    );
    this.storage.transactionSync(() => {
      const other = this.active();
      if (other && other.id !== turn.id)
        throw new AppError("conversation_busy", "正在处理一条消息，请稍后再操作", 409);
      this.sql.exec(
        "INSERT OR IGNORE INTO execution_turns VALUES(?,?,?,?,?)",
        turn.id,
        turn.connectionId,
        turn.generation,
        turn.startedAt,
        turn.deadline,
      );
      if (this.sql.exec("SELECT 1 FROM execution_jobs WHERE id=?", id).toArray().length) return;
      if (
        this.sql
          .exec<{ n: number }>("SELECT count(*) n FROM execution_jobs WHERE runId=?", turn.id)
          .one().n >= 100
      )
        throw new AppError("execution_steps", "本次处理步骤过多，请分批发送", 422);
      this.sql.exec(
        "INSERT INTO execution_jobs(id,runId,state,expiresAt) VALUES(?,?,'queued',?)",
        id,
        turn.id,
        Math.min(turn.deadline, Date.now() + 180000),
      );
      this.put(id, "input", payload);
      this.changed();
    });
    throw new ExecutionPending();
  }
  async sync() {
    const work = (this.syncing ?? Promise.resolve()).catch(() => {}).then(() => this.syncNow());
    this.syncing = work;
    try {
      await work;
    } finally {
      if (this.syncing === work) this.syncing = null;
    }
  }
  private async syncNow() {
    if (!this.dirty()) return;
    // Keep the dirty bit until acknowledged; queue mutations during the await
    // set it again and are reconciled by the next alarm.
    const version = this.sql
      .exec<{ dirty: number }>("SELECT dirty FROM execution_registry WHERE id=1")
      .one().dirty;
    const pending = this.sql
      .exec("SELECT 1 FROM execution_jobs WHERE state='queued' LIMIT 1")
      .toArray().length
      ? 1
      : 0;
    try {
      await this.env.DB.prepare(
        "INSERT INTO execution_accounts VALUES(?,?,?) ON CONFLICT(account_id) DO UPDATE SET pending=excluded.pending,updated_at=excluded.updated_at",
      )
        .bind(this.account, pending, Date.now())
        .run();
      this.sql.exec("UPDATE execution_registry SET dirty=0 WHERE id=1 AND dirty=?", version);
    } catch (error) {
      this.changed();
      throw error;
    }
  }
  async claim(validate?: () => void) {
    const row = this.sql
      .exec<Job>("SELECT * FROM execution_jobs WHERE state='queued' ORDER BY rowid LIMIT 1")
      .toArray()[0];
    if (!row) return null;
    const input = JSON.parse(
      await decrypt(
        this.env,
        this.read<string>(row.id, "input"),
        `${this.account}:execution:${row.id}`,
      ),
    ) as Activity;
    validate?.();
    const lease = crypto.randomUUID();
    const expiresAt = Math.min(
      this.turn(row.runId)?.deadline ?? row.expiresAt,
      Date.now() + input.timeoutMs + 60000,
    );
    const claimed = this.sql
      .exec(
        "UPDATE execution_jobs SET state='claimed',lease=?,expiresAt=? WHERE id=? AND state='queued' AND expiresAt>? RETURNING id",
        lease,
        expiresAt,
        row.id,
        Date.now(),
      )
      .toArray().length;
    if (!claimed) return null;
    this.changed();
    return { id: row.id, lease, expiresAt, input };
  }
  settle(id: string, lease: string, result: ActivityOutcome) {
    return this.storage.transactionSync(() => {
      const row = this.sql.exec<Job>("SELECT * FROM execution_jobs WHERE id=?", id).toArray()[0];
      if (!row || row.lease !== lease) return { stale: true };
      if (row.state === "complete") return { accepted: true };
      if (row.state !== "claimed" || row.expiresAt <= Date.now()) return { stale: true };
      this.put(id, "result", result);
      this.sql.exec("UPDATE execution_jobs SET state='complete' WHERE id=?", id);
      this.sql.exec("DELETE FROM execution_data WHERE id=? AND kind='input'", id);
      return { accepted: true };
    });
  }
  nextAt() {
    return this.sql
      .exec<{ time: number | null }>(
        "SELECT MIN(expiresAt) time FROM execution_jobs WHERE state IN ('queued','claimed')",
      )
      .one().time;
  }
  expire() {
    for (const row of this.sql
      .exec<Job>(
        "SELECT * FROM execution_jobs WHERE state IN ('queued','claimed') AND expiresAt<=?",
        Date.now(),
      )
      .toArray()) {
      this.storage.transactionSync(() => {
        this.put(row.id, "result", {
          ok: false,
          code: "execution_interrupted",
          message: "执行服务未完成本次任务，本次未扣 credits。为避免重复调用上游，请重新发送。",
        });
        this.sql.exec("UPDATE execution_jobs SET state='complete' WHERE id=?", row.id);
        this.sql.exec("DELETE FROM execution_data WHERE id=? AND kind='input'", row.id);
        this.changed();
      });
    }
  }
  finish(runId: string) {
    this.storage.transactionSync(() => {
      this.sql.exec(
        "DELETE FROM execution_data WHERE id IN (SELECT id FROM execution_jobs WHERE runId=?)",
        runId,
      );
      this.sql.exec("DELETE FROM execution_jobs WHERE runId=?", runId);
      this.sql.exec("DELETE FROM execution_turns WHERE id=?", runId);
      this.changed();
    });
  }
  scope(id: string, connectionId: string, generation: string) {
    return (
      this.turn(id) ?? {
        id,
        connectionId,
        generation,
        startedAt: Date.now(),
        deadline: Date.now() + MODEL_TURN_TIMEOUT_MS,
      }
    );
  }
}
