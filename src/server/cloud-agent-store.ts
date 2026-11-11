import type { PluginInvocation } from "../shared/plugins";
import type { ChatSession } from "../shared/types";
import type { AgentJobView } from "./cloud-agent-client";
import { AppError } from "./config";
import { z } from "zod";

/** Local submission state, kept separate from AGT's own job status. */
export type CloudTaskState =
  | "submitting"
  | "accepted"
  | "completed"
  | "failed"
  | "cancelled"
  | "rejected";

export type CloudTask = {
  id: string;
  sourceId: string;
  origin: string;
  appId: string;
  tenantId: string;
  profileId: string;
  model: string;
  workspaceName: string;
  callbackVersion: string;
  callbackOrigin: string;
  invocation: PluginInvocation | null;
  /** Encrypted exact submit body, including callback secret. */
  request: string;
  submittedAt: number;
  outcome: AgentJobView | null;
  reconcileCursor: string;
  reconcileCandidates: string[];
  hidden: number;
  deliveryStatus: "pending" | "sent" | "stale" | "failed";
  /** Persisted with inbox creation; a missing queued reply must never be recreated. */
  deliveryQueuedAt?: number;
  pluginContext: string | null;
  currentSessionId: string;
  pluginId: string;
  pluginName: string;
  sessionId: string;
  connectionId: string;
  generation: string;
  contextStart: number;
  resetAt: number;
  conversationId: string;
  prompt: string;
  idempotencyKey: string;
  state: CloudTaskState;
  upstreamStatus: string;
  jobId: string;
  createdAt: number;
  updatedAt: number;
  deadline: number;
  nextAt: number;
  attempts: number;
  stopRequested: number;
  /** Stable stop cause, separate from temporary submission/reconciliation messages. */
  stopReason?: string;
  settled: number;
  stale: number;
  delivered: number;
  result: string;
  error: string;
  /** Billed units once settled. */
  units: number;
  /** Frozen metered result so a delivery retry cannot re-price the answer. */
  frozen: string;
  /** 1 when a job id was never confirmed but the task may exist upstream. */
  unconfirmed: number;
};

export type CloudProvision = {
  scope: string;
  profiles: string[];
  externalId: string;
  appUserId: string;
  workspaceId: string;
  configured: number;
  updatedAt: number;
};

const TERMINAL: CloudTaskState[] = ["completed", "failed", "cancelled", "rejected"];
const TERMINAL_SQL = TERMINAL.map((state) => `'${state}'`).join(",");
// Deadlines only interrupt upstream execution. Frozen outcomes await local
// settlement/delivery and must retain the host's retry backoff in nextAt.
const WAKE_AT_SQL =
  "CASE WHEN state IN ('submitting','accepted') AND stopRequested=0 AND json_extract(data, '$.outcome') IS NULL THEN MIN(nextAt,deadline) ELSE nextAt END";
export const cloudTaskTerminal = (state: CloudTaskState) => TERMINAL.includes(state);
/** Shared by settlement and delivery; the host checks connection/plugin selection. */
export const cloudTaskMatchesSession = (
  task: CloudTask,
  session: (ChatSession & { contextStart: number }) | null,
) =>
  !!session &&
  !session.archived &&
  session.resetAt === task.resetAt &&
  session.contextStart === task.contextStart &&
  (session.pluginInstanceId ?? null) === task.pluginContext &&
  (!session.connectionId || session.connectionId === task.connectionId);
/** Older snapshots stored a stop cause only in error. An explicit empty cause
 * means a lifecycle hook requested stop before the host could explain it. */
export const cloudTaskStopReason = (task: CloudTask) =>
  task.stopReason ?? (task.stopRequested ? task.error : "");

const cursorSchema = z.tuple([z.number().int().nonnegative(), z.string().uuid()]);
function parseCursor(cursor?: string) {
  if (cursor === undefined) return undefined;
  try {
    if (!cursor || cursor.length > 256) throw new Error("Invalid cursor length");
    return cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  } catch {
    throw new AppError("invalid_task_cursor", "任务分页信息无效，请返回最新任务后重试。", 400);
  }
}

type Row = {
  id: string;
  pluginId: string;
  sessionId: string;
  connectionId: string;
  state: CloudTaskState;
  jobId: string;
  createdAt: number;
  updatedAt: number;
  deadline: number;
  nextAt: number;
  stopRequested: number;
  settled: number;
  stale: number;
  delivered: number;
  data: string;
};

/**
 * Durable task and callback bookkeeping inside the account Durable Object.
 * The host owns execution, alarm scheduling and wallet settlement; this store
 * preserves their recovery state and rejects conflicting task identities.
 */
export class CloudAgentStore {
  constructor(private storage: DurableObjectStorage) {}

  private get sql() {
    return this.storage.sql;
  }

  init() {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS cloud_provision (
        id INTEGER PRIMARY KEY CHECK(id = 1), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cloud_tasks (
        id TEXT PRIMARY KEY, pluginId TEXT NOT NULL, sessionId TEXT NOT NULL,
        connectionId TEXT NOT NULL, state TEXT NOT NULL, jobId TEXT NOT NULL DEFAULT '',
        createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, deadline INTEGER NOT NULL,
        nextAt INTEGER NOT NULL, stopRequested INTEGER NOT NULL DEFAULT 0,
        settled INTEGER NOT NULL DEFAULT 0, stale INTEGER NOT NULL DEFAULT 0,
        delivered INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS cloud_tasks_due ON cloud_tasks(state, nextAt);
      CREATE INDEX IF NOT EXISTS cloud_tasks_session ON cloud_tasks(sessionId, createdAt);
      CREATE INDEX IF NOT EXISTS cloud_tasks_created ON cloud_tasks(createdAt);
      CREATE INDEX IF NOT EXISTS cloud_tasks_page ON cloud_tasks(createdAt DESC, id DESC);
      CREATE INDEX IF NOT EXISTS cloud_tasks_plugin_page ON cloud_tasks(pluginId, createdAt DESC, id DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS cloud_tasks_job ON cloud_tasks(jobId) WHERE jobId != '';
      CREATE UNIQUE INDEX IF NOT EXISTS cloud_tasks_source ON cloud_tasks(json_extract(data, '$.sourceId'));
      CREATE TABLE IF NOT EXISTS cloud_callbacks (
        deliveryId TEXT PRIMARY KEY, taskId TEXT NOT NULL, jobId TEXT NOT NULL,
        hash TEXT NOT NULL, createdAt INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS cloud_callbacks_created ON cloud_callbacks(createdAt);
      CREATE INDEX IF NOT EXISTS cloud_callbacks_task ON cloud_callbacks(taskId, jobId);`);
  }

  provision(): CloudProvision | undefined {
    const row = this.sql
      .exec<{ data: string }>("SELECT data FROM cloud_provision WHERE id = 1")
      .toArray()[0];
    return row ? (JSON.parse(row.data) as CloudProvision) : undefined;
  }

  saveProvision(value: CloudProvision) {
    this.sql.exec(
      "INSERT INTO cloud_provision VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
      JSON.stringify(value),
    );
  }

  private decode(row: Row): CloudTask {
    const { data, ...columns } = row;
    return {
      ...columns,
      ...(JSON.parse(data) as Omit<CloudTask, keyof typeof columns>),
    };
  }

  get(id: string): CloudTask | undefined {
    const row = this.sql.exec<Row>("SELECT * FROM cloud_tasks WHERE id = ?", id).toArray()[0];
    return row ? this.decode(row) : undefined;
  }

  byJobId(jobId: string): CloudTask | undefined {
    if (!jobId) return undefined;
    const row = this.sql.exec<Row>("SELECT * FROM cloud_tasks WHERE jobId = ?", jobId).toArray()[0];
    return row ? this.decode(row) : undefined;
  }

  save(task: CloudTask) {
    const {
      id,
      pluginId,
      sessionId,
      connectionId,
      state,
      jobId,
      createdAt,
      updatedAt,
      deadline,
      nextAt,
      stopRequested,
      settled,
      stale,
      delivered,
      ...data
    } = task;
    this.sql.exec(
      `INSERT INTO cloud_tasks (id, pluginId, sessionId, connectionId, state, jobId, createdAt,
        updatedAt, deadline, nextAt, stopRequested, settled, stale, delivered, data)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
        pluginId=excluded.pluginId, sessionId=excluded.sessionId, connectionId=excluded.connectionId,
        state=excluded.state, jobId=excluded.jobId, createdAt=excluded.createdAt,
        updatedAt=excluded.updatedAt, deadline=excluded.deadline, nextAt=excluded.nextAt,
        stopRequested=excluded.stopRequested, settled=excluded.settled, stale=excluded.stale,
        delivered=excluded.delivered, data=excluded.data`,
      id,
      pluginId,
      sessionId,
      connectionId,
      state,
      jobId,
      createdAt,
      updatedAt,
      deadline,
      nextAt,
      stopRequested,
      settled,
      stale,
      delivered,
      JSON.stringify(data),
    );
  }

  patch(task: CloudTask, patch: Partial<CloudTask>) {
    // Always merge with durable state after external I/O. A concurrent stop,
    // callback or deletion must not be overwritten by the earlier snapshot.
    const current = this.get(task.id) ?? task;
    const next = { ...current, ...patch, updatedAt: Date.now() };
    // A bare stop flag must not reinterpret an earlier recovery message as its
    // cause. Callers can supply the cause now, or let the host fill it later.
    if (!current.stopRequested && patch.stopRequested && patch.stopReason === undefined)
      next.stopReason = patch.error ?? "";
    if (current.hidden) {
      next.prompt = "";
      next.result = "";
      next.error = "";
      next.stopReason = "";
      next.frozen = "";
      next.invocation = null;
      next.request = "";
      if (next.outcome)
        next.outcome = { ...next.outcome, text: undefined, task: undefined, refusal: undefined };
    }
    this.save(next);
    return next;
  }

  source(sourceId: string) {
    const row = this.sql
      .exec<Row>("SELECT * FROM cloud_tasks WHERE json_extract(data, '$.sourceId') = ?", sourceId)
      .toArray()[0];
    return row ? this.decode(row) : undefined;
  }

  callbackJobs(taskId: string) {
    return this.sql
      .exec<{ jobId: string }>("SELECT DISTINCT jobId FROM cloud_callbacks WHERE taskId=?", taskId)
      .toArray()
      .map((row) => row.jobId);
  }

  hideSession(sessionId?: string) {
    const rows = this.sql
      .exec<Row>(
        sessionId ? "SELECT * FROM cloud_tasks WHERE sessionId=?" : "SELECT * FROM cloud_tasks",
        ...(sessionId ? [sessionId] : []),
      )
      .toArray();
    for (const row of rows) {
      const task = this.decode(row);
      // A completed stale result has no live runs.sessionId. Remove its cached
      // response by stable task id as well, so clearing the original session
      // erases every local result copy while retaining the billing ledger.
      this.sql.exec("DELETE FROM runs WHERE id = ?", task.id);
      this.patch(task, {
        hidden: 1,
        prompt: "",
        result: "",
        error: "",
        stopReason: "",
        frozen: "",
        invocation: null,
        request: "",
        outcome: null,
        stale: 1,
        delivered: 1,
        deliveryStatus: "stale",
        stopRequested: cloudTaskTerminal(task.state) ? task.stopRequested : 1,
        nextAt: cloudTaskTerminal(task.state) ? 0 : Date.now(),
      });
    }
  }

  remove(id: string) {
    this.sql.exec("DELETE FROM cloud_tasks WHERE id = ?", id);
  }

  /** Non-terminal tasks. A task past its deadline is still here until the alarm
   *  finishes stopping it, so admission cannot silently exceed the concurrency cap. */
  active(): CloudTask[] {
    return this.sql
      .exec<Row>(
        "SELECT * FROM cloud_tasks WHERE state IN ('submitting','accepted') ORDER BY createdAt LIMIT 20",
      )
      .toArray()
      .map((row) => this.decode(row));
  }

  /** Work the alarm must revisit: submits, polls, cancels and undelivered results. */
  due(now = Date.now(), limit = 4): CloudTask[] {
    return this.sql
      .exec<Row>(
        `SELECT * FROM cloud_tasks
         WHERE (state IN ('submitting','accepted') OR (state IN (${TERMINAL_SQL}) AND delivered = 0))
           AND (${WAKE_AT_SQL}) <= ?
         ORDER BY (${WAKE_AT_SQL}), createdAt, id LIMIT ?`,
        now,
        limit,
      )
      .toArray()
      .map((row) => this.decode(row));
  }

  nextAt(now = Date.now()): number | null {
    const row = this.sql
      .exec<{ at: number | null }>(
        `SELECT MIN(${WAKE_AT_SQL}) AS at FROM cloud_tasks
         WHERE state IN ('submitting','accepted') OR (state IN (${TERMINAL_SQL}) AND delivered = 0)`,
      )
      .toArray()[0];
    return typeof row?.at === "number" ? Math.max(now, row.at) : null;
  }

  /** Rejections (including explicit upstream refusals) release the reserved execution. */
  countSince(start: number): number {
    return this.sql
      .exec<{ n: number }>(
        "SELECT COUNT(*) AS n FROM cloud_tasks WHERE createdAt >= ? AND state != 'rejected'",
        start,
      )
      .one().n;
  }

  /** Seek by immutable creation time and id, so new tasks and deletions cannot shift pages. */
  page(pluginId?: string, cursor?: string): { tasks: CloudTask[]; nextCursor: string | null } {
    const after = parseCursor(cursor);
    const limit = 30;
    const rows = this.sql
      .exec<Row>(
        `SELECT * FROM cloud_tasks WHERE COALESCE(json_extract(data, '$.hidden'), 0) = 0
         ${pluginId ? "AND pluginId = ?" : ""}
         ${after ? "AND (createdAt < ? OR (createdAt = ? AND id < ?))" : ""}
         ORDER BY createdAt DESC, id DESC LIMIT ?`,
        ...(pluginId ? [pluginId] : []),
        ...(after ? [after[0], after[0], after[1]] : []),
        limit + 1,
      )
      .toArray();
    const last = rows[Math.min(rows.length, limit) - 1];
    return {
      tasks: rows.slice(0, limit).map((row) => this.decode(row)),
      nextCursor:
        rows.length > limit
          ? Buffer.from(JSON.stringify([last.createdAt, last.id])).toString("base64url")
          : null,
    };
  }

  /** Stop in-flight work and prevent queued results from entering a changed context. */
  private stop(column: "sessionId" | "pluginId" | "connectionId", id: string, now: number) {
    // Restoring the original context later must not restore automatic delivery.
    this.sql.exec(
      `UPDATE cloud_tasks SET
        data = json_set(data, '$.stopReason', CASE WHEN stopRequested = 0 THEN ''
          ELSE COALESCE(json_extract(data, '$.stopReason'), json_extract(data, '$.error'), '') END),
        stopRequested = 1, stale = 1, nextAt = ?, updatedAt = ?
        WHERE ${column} = ? AND state IN ('submitting','accepted')`,
      now,
      now,
      id,
    );
    this.sql.exec(
      `UPDATE cloud_tasks SET stale = 1, delivered = 1, nextAt = 0, data = json_set(data, '$.deliveryStatus', 'stale') WHERE ${column} = ? AND state IN (${TERMINAL_SQL}) AND delivered = 0`,
      id,
    );
  }

  stopSession(sessionId: string, now = Date.now()) {
    this.stop("sessionId", sessionId, now);
  }

  stopPlugin(pluginId: string, now = Date.now()) {
    this.stop("pluginId", pluginId, now);
  }

  stopConnection(connectionId: string, now = Date.now()) {
    this.stop("connectionId", connectionId, now);
  }

  /**
   * Delivery dedupe keyed on the full delivery id. A repeated valid delivery is
   * acknowledged; the same id with different content or ownership is a conflict.
   */
  delivery(deliveryId: string, taskId: string, hash: string, jobId: string, now = Date.now()) {
    const existing = this.sql
      .exec<{ hash: string; taskId: string; jobId: string }>(
        "SELECT hash, taskId, jobId FROM cloud_callbacks WHERE deliveryId = ?",
        deliveryId,
      )
      .toArray()[0];
    if (existing) {
      if (existing.hash !== hash || existing.taskId !== taskId || existing.jobId !== jobId)
        throw new AppError("cloud_callback_conflict", "回调标识与内容不一致", 409);
      return "duplicate" as const;
    }
    this.sql.exec(
      "INSERT INTO cloud_callbacks VALUES (?,?,?,?,?)",
      deliveryId,
      taskId,
      jobId,
      hash,
      now,
    );
    return "new" as const;
  }

  /** Verified callbacks only: atomically commit receipt and wakeup if upstream work remains. */
  receiveCallback(deliveryId: string, taskId: string, hash: string, jobId: string) {
    return this.storage.transactionSync(() => {
      const task = this.get(taskId);
      if (!task) throw new AppError("cloud_task_missing", "云端任务不存在", 404);
      const delivery = this.delivery(deliveryId, taskId, hash, jobId);
      if (delivery === "new" && !cloudTaskTerminal(task.state) && !task.outcome)
        this.patch(task, { nextAt: Date.now() });
      return delivery;
    });
  }

  prune(before = Date.now() - 7 * 86_400_000) {
    this.sql.exec("DELETE FROM cloud_callbacks WHERE createdAt < ?", before);
  }
}
