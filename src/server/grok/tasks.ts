import { z } from "zod";
import type { GrokPlugin } from "../../shared/grok-bot";
import type { OpenClawRelay } from "../openclaw-relay";
import { AppError } from "../config";

const lifetime = 45 * 60_000;
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
  outputLimit: number;
  attempts: number;
  due: number;
  expires: number;
};
const joined = "FROM grok_tasks t JOIN claw_jobs j ON j.id=t.jobId";
const active = "j.state IN ('pending','claimed') AND t.due IS NOT NULL";
const firstOnRoute = `NOT EXISTS (SELECT 1 FROM grok_tasks earlier JOIN claw_jobs e ON e.id=earlier.jobId
  WHERE e.routeId=j.routeId AND earlier.userMessage<t.userMessage AND e.state IN ('pending','claimed') AND earlier.due IS NOT NULL)`;
const fields =
  "t.ref,t.jobId,j.routeId,j.pluginId,j.state,j.runnerId,j.outputLimit,t.userMessage,t.attempts,t.due,t.expires";

export class GrokTasks {
  // Start unknown after a restart. Once SQLite confirms an empty queue, unrelated
  // account alarms need no Grok query until this instance enqueues another job.
  private mayHaveTasks = true;

  constructor(
    private storage: DurableObjectStorage,
    private relay: OpenClawRelay,
    private plugin: (id: string) => GrokPlugin,
    private dispatch: (pluginId: string, ref: string) => Promise<number>,
  ) {}
  private get db() {
    return this.storage.sql;
  }
  init() {
    this.db.exec(`CREATE TABLE IF NOT EXISTS grok_tasks (
      ref TEXT PRIMARY KEY, jobId TEXT NOT NULL UNIQUE, userMessage INTEGER NOT NULL,
      answerMessage INTEGER, attempts INTEGER NOT NULL DEFAULT 0, due INTEGER, expires INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS grok_tasks_due ON grok_tasks(due) WHERE due IS NOT NULL;
      CREATE INDEX IF NOT EXISTS grok_route_jobs ON claw_jobs(routeId,state);
      CREATE TRIGGER IF NOT EXISTS grok_task_cancelled AFTER UPDATE OF state ON claw_jobs
      WHEN NEW.state IN ('cancelled','expired') BEGIN UPDATE grok_tasks SET due=NULL WHERE jobId=NEW.id; END;`);
  }
  enqueue(jobId: string, userMessage: number) {
    const now = Date.now();
    this.db.exec(
      "INSERT OR IGNORE INTO grok_tasks(ref,jobId,userMessage,due,expires) VALUES(?,?,?,?,?)",
      crypto.randomUUID(),
      jobId,
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
      if (row.state !== "pending" || row.expires <= Date.now() || !row.attempts)
        return { claimed: false };
      const receipt = crypto.randomUUID();
      this.relay.handleTask(plugin, "claim", { id: row.jobId, runnerId: receipt });
      this.db.exec("UPDATE grok_tasks SET due=expires WHERE ref=?", taskId);
      const history = this.db
        .exec<{ role: string; text: string; state: string }>(
          `SELECT m.role,substr(m.content,1,3000) AS text,j.state FROM grok_tasks t
        JOIN claw_jobs j ON j.id=t.jobId JOIN messages m ON m.id IN (t.userMessage,t.answerMessage)
        WHERE j.routeId=? AND t.userMessage<?
          AND (j.state='failed' OR (j.state='complete' AND t.answerMessage IS NOT NULL))
        ORDER BY t.userMessage DESC, m.id DESC LIMIT 10`,
          row.routeId,
          row.userMessage,
        )
        .toArray()
        .reverse()
        .map(({ role, text, state }) =>
          state === "failed" ? { role, text, taskStatus: "failed" } : { role, text },
        );
      return {
        claimed: true,
        receipt,
        text: row.text,
        history,
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
      if (row.runnerId !== input.receipt || (row.state === "claimed" && row.expires <= Date.now()))
        throw new AppError("grok_claim_invalid", "任务凭据无效或已超时", 409);
      return this.settle(plugin, row, input.receipt, input.status, input.text);
    });
  }
  private settle(
    plugin: GrokPlugin,
    row: Task,
    receipt: string,
    status: "completed" | "failed",
    text: string,
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
        `UPDATE grok_tasks SET due=NULL,answerMessage=(SELECT MAX(m.id) FROM messages m
        JOIN claw_routes r ON r.sessionId=m.sessionId WHERE r.id=? AND m.role='assistant' AND m.id>? AND ?='completed') WHERE ref=?`,
        row.routeId,
        row.userMessage,
        status,
        row.ref,
      );
    }
    return result;
  }
  private expire(row: Task) {
    this.storage.transactionSync(() => {
      const plugin = this.plugin(row.pluginId);
      const receipt = row.runnerId || crypto.randomUUID();
      if (row.state === "pending")
        this.relay.handleTask(plugin, "claim", { id: row.jobId, runnerId: receipt });
      this.settle(plugin, row, receipt, "failed", "");
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
    await Promise.all(
      rows.map(async (row) => {
        // Recheck on completion: a callback, reset or rotation can win during fetch.
        if (row.expires <= now || row.attempts >= 3) {
          try {
            this.expire(row);
          } catch (error) {
            if (!(error instanceof AppError)) throw error;
            this.db.exec(
              "UPDATE claw_jobs SET state='cancelled',text='' WHERE id=? AND state IN ('pending','claimed')",
              row.jobId,
            );
            this.db.exec("UPDATE grok_tasks SET due=NULL WHERE ref=?", row.ref);
          }
          return;
        }
        const retryAt = Math.min(row.expires, now + 60_000 * (row.attempts + 1));
        this.db.exec(
          "UPDATE grok_tasks SET due=?,attempts=attempts+1 WHERE ref=?",
          retryAt,
          row.ref,
        );
        let status = 503;
        try {
          status = await this.dispatch(row.pluginId, row.ref);
        } catch {
          /* bounded retries reuse task ID */
        }
        if (status === 204 || status === 422)
          this.db.exec(
            `UPDATE grok_tasks SET due=?,attempts=3 WHERE ref=? AND due=?
        AND EXISTS (SELECT 1 FROM claw_jobs WHERE id=grok_tasks.jobId AND state='pending')`,
            status === 204 ? row.expires : Date.now(),
            row.ref,
            retryAt,
          );
      }),
    );
  }
}
