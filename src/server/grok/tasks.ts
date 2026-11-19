import { z } from "zod";
import type { GrokPlugin } from "../../shared/grok-bot";
import type { OpenClawRelay } from "../openclaw-relay";
import { sendGrokWake } from "./dispatch";
import { initGrokTasks } from "./schema";
import { readGrokHistory } from "./history";
import { AppError } from "../config";

const lifetime = 45 * 60_000;
const maxWakeAttempts = 3;
const id = z.string().uuid();
const claimArgs = z.object({ taskId: id }).strict();
const finishArgs = z
  .object({
    taskId: id,
    receipt: id,
    status: z.enum(["completed", "failed"]),
    text: z.string().max(30000),
  })
  .strict();
type Task = {
  ref: string;
  jobId: string;
  routeId: string;
  pluginId: string;
  state: string;
  runnerId: string;
  userMessage: number;
  outcome: string | null;
  outputLimit: number;
  attempts: number;
  due: number;
  expires: number;
};
const joined = "FROM grok_tasks t JOIN claw_jobs j ON j.id=t.jobId";
const active = "j.state IN ('pending','claimed') AND t.due IS NOT NULL";
const firstOnRoute = `NOT EXISTS (SELECT 1 FROM grok_tasks earlier
  WHERE earlier.routeId=t.routeId AND earlier.userMessage<t.userMessage AND earlier.due IS NOT NULL)`;
const fields =
  "t.ref,t.jobId,j.routeId,j.pluginId,j.state,j.runnerId,j.outputLimit,t.userMessage,t.attempts,t.due,t.expires,t.outcome";

export class GrokTasks {
  // Start unknown after a restart. Once SQLite confirms an empty queue, unrelated
  // account alarms need no Grok query until this instance enqueues another job.
  private mayHaveTasks = true;

  constructor(
    private storage: DurableObjectStorage,
    private relay: OpenClawRelay,
    private plugin: (id: string) => GrokPlugin,
    private prepareWake: (pluginId: string, ref: string) => Promise<Request>,
  ) {}
  private get db() {
    return this.storage.sql;
  }
  init() {
    initGrokTasks(this.storage);
  }
  enqueue(jobId: string, routeId: string, userMessage: number) {
    const now = Date.now();
    this.db.exec(
      "INSERT OR IGNORE INTO grok_tasks(ref,jobId,routeId,userMessage,due,expires) VALUES(?,?,?,?,?,?)",
      crypto.randomUUID(),
      jobId,
      routeId,
      userMessage,
      now,
      now + lifetime,
    );
    this.mayHaveTasks = true;
  }
  nextAt() {
    if (!this.mayHaveTasks) return null;
    const at = this.db
      .exec<{ at: number | null }>(
        `SELECT MIN(t.due) AS at ${joined} WHERE ${active} AND ${firstOnRoute}`,
      )
      .one().at;
    this.mayHaveTasks = at !== null;
    return at;
  }
  private row(pluginId: string, ref: string) {
    const row = this.db
      .exec<Task & { text: string }>(
        `SELECT ${fields},j.text ${joined} WHERE j.pluginId=? AND t.ref=?`,
        pluginId,
        ref,
      )
      .toArray()[0];
    if (!row) throw new AppError("grok_task_missing", "任务不存在或已清除", 404);
    return row;
  }
  claim(plugin: GrokPlugin, raw: unknown) {
    const { taskId } = claimArgs.parse(raw);
    return this.storage.transactionSync(() => {
      const row = this.row(plugin.id, taskId);
      if (
        row.state !== "pending" ||
        row.expires <= Date.now() ||
        row.due !== row.expires ||
        !row.attempts
      )
        return { claimed: false };
      const receipt = crypto.randomUUID();
      this.relay.handleTask(plugin, "claim", { id: row.jobId, runnerId: receipt });
      return {
        claimed: true,
        receipt,
        text: row.text,
        history: readGrokHistory(this.db, row.routeId, row.userMessage),
        maxOutputTokens: Math.min(plugin.maxOutputTokens, row.outputLimit),
      };
    });
  }
  finish(plugin: GrokPlugin, raw: unknown) {
    const input = finishArgs.parse(raw);
    if (input.status === "completed" && !input.text.trim())
      throw new AppError("empty_result", "请提交最终文字");
    return this.storage.transactionSync(() => {
      const row = this.row(plugin.id, input.taskId);
      if (row.runnerId !== input.receipt)
        throw new AppError("grok_claim_invalid", "任务凭据无效", 409);
      if (row.outcome === "expired" || (row.state === "claimed" && row.expires <= Date.now()))
        throw new AppError("grok_task_expired", "任务已超时，回传已关闭。", 409);
      if (
        (row.state === "failed" && input.status !== "failed") ||
        (row.state === "complete" && input.status !== "completed")
      )
        throw new AppError(
          "grok_result_conflict",
          row.state === "failed"
            ? "任务已按失败结算，回传已关闭。"
            : "任务已成功结算，回传已关闭。",
          409,
        );
      return this.settle(plugin, row, input.receipt, input.status, input.text);
    });
  }
  private settle(
    plugin: GrokPlugin,
    row: Task,
    receipt: string,
    status: "completed" | "failed",
    text: string,
    outcome: "completed" | "failed" | "expired" = status,
  ) {
    const result = this.relay.handleTask(plugin, "event", {
      eventId: row.ref,
      jobId: row.jobId,
      routeId: row.routeId,
      runnerId: receipt,
      status,
      text,
    });
    if (row.state === "claimed" || row.state === "pending") {
      this.db.exec(
        `UPDATE grok_tasks SET due=NULL,outcome=?,answerMessage=(SELECT MAX(m.id) FROM messages m
        JOIN claw_routes r ON r.sessionId=m.sessionId WHERE r.id=? AND m.role='assistant' AND m.id>? AND ?='completed') WHERE ref=?`,
        outcome,
        row.routeId,
        row.userMessage,
        status,
        row.ref,
      );
    }
    return { ...result, taskStatus: outcome };
  }
  private fail(row: Task) {
    this.storage.transactionSync(() => {
      const plugin = this.plugin(row.pluginId);
      const receipt = row.runnerId || crypto.randomUUID();
      if (row.state === "pending")
        this.relay.handleTask(plugin, "claim", { id: row.jobId, runnerId: receipt });
      this.settle(
        plugin,
        row,
        receipt,
        "failed",
        "",
        row.expires <= Date.now() ? "expired" : "failed",
      );
    });
  }
  async dispatchDue() {
    if (!this.mayHaveTasks) return;
    const now = Date.now();
    const rows = this.db
      .exec<Task>(
        `SELECT ${fields} ${joined} WHERE ${active} AND ${firstOnRoute} AND t.due<=? ORDER BY t.due LIMIT 3`,
        now,
      )
      .toArray();
    await Promise.all(rows.map((row) => this.wake(row)));
  }
  cancelConnection(connectionId: string) {
    this.db.exec(
      `UPDATE claw_jobs SET state='cancelled',text=''
      WHERE routeId IN (SELECT id FROM claw_routes WHERE connectionId=?)
      AND state IN ('pending','claimed') AND EXISTS (SELECT 1 FROM grok_tasks WHERE jobId=claw_jobs.id)`,
      connectionId,
    );
  }
  private async wake(row: Task) {
    try {
      if (row.expires <= Date.now() || row.attempts >= maxWakeAttempts) {
        this.fail(row);
        return;
      }
      let request: Request;
      try {
        request = await this.prepareWake(row.pluginId, row.ref);
      } catch {
        // No request left the Worker. Re-read after async preparation so a
        // concurrent cancellation or settlement cannot be overwritten.
        const current = this.row(row.pluginId, row.ref);
        if (current.state === "pending") this.fail(current);
        return;
      }
      // Key decryption and signing yield. Check the route and reservation again
      // immediately before fetch so a disconnect or credential change wins.
      this.relay.requireRoute(row.routeId);
      if (row.expires <= Date.now()) return;
      const reserved = this.db
        .exec(
          `UPDATE grok_tasks SET due=expires,attempts=attempts+1
        WHERE ref=? AND due=? AND attempts=? AND EXISTS (
          SELECT 1 FROM claw_jobs WHERE id=grok_tasks.jobId AND state='pending') RETURNING ref`,
          row.ref,
          row.due,
          row.attempts,
        )
        .toArray();
      if (!reserved.length) return;
      // Persist the deadline before sending. After a lost response or a restart
      // the Bot can still claim the task, without starting another Routine.
      const disposition = await sendGrokWake(request);
      if (disposition === "waiting") return;
      const attempts = disposition === "retry" ? row.attempts + 1 : maxWakeAttempts;
      const next =
        attempts >= maxWakeAttempts
          ? Date.now()
          : Math.min(row.expires, Date.now() + 60_000 * attempts);
      this.db.exec(
        `UPDATE grok_tasks SET due=?,attempts=? WHERE ref=? AND attempts=? AND due=expires
        AND EXISTS (SELECT 1 FROM claw_jobs WHERE id=grok_tasks.jobId AND state='pending')`,
        next,
        attempts,
        row.ref,
        row.attempts + 1,
      );
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      this.db.exec(
        "UPDATE claw_jobs SET state='cancelled',text='' WHERE id=? AND state IN ('pending','claimed')",
        row.jobId,
      );
    }
  }
}
