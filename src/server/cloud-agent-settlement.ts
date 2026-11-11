import type { ChatSession } from "../shared/types";
import { prepareCloudAgentResult } from "./cloud-agent-result";
import {
  CloudAgentStore,
  cloudTaskMatchesSession,
  cloudTaskTerminal,
  type CloudTask,
} from "./cloud-agent-store";
import { AppError } from "./config";
import { Wallet } from "./wallet";

/**
 * Finalize a verified, persisted outcome in the account's initialized storage.
 * The host's synchronous isStale checks current connection/plugin ownership;
 * session ownership is also checked here after asynchronous result preparation.
 *
 * Billing, history and the terminal task commit together. A terminal task with
 * delivered=0 is durable pending delivery for CloudAgentRuntime; this helper
 * neither queues an inbox message nor sends anything. The host owns the alarm.
 */
export async function settleCloudAgentTask(
  storage: DurableObjectStorage,
  taskId: string,
  isStale: (task: CloudTask) => boolean,
): Promise<CloudTask | null> {
  const store = new CloudAgentStore(storage);
  const prepared = await prepareCloudAgentResult(store, taskId);
  return storage.transactionSync(() => {
    const task = store.get(taskId);
    if (!task) throw new AppError("cloud_task_missing", "云端任务不存在", 404);
    if (cloudTaskTerminal(task.state)) return task;
    if (!prepared) return null;

    const sql = storage.sql;
    const row = sql
      .exec<{ data: string }>("SELECT data FROM sessions WHERE id=?", task.sessionId)
      .toArray()[0];
    const session = row ? (JSON.parse(row.data) as ChatSession & { contextStart: number }) : null;
    const stale = Boolean(
      task.hidden || task.stale || !cloudTaskMatchesSession(task, session) || isStale(task),
    );
    const now = Date.now();
    const meter = task.hidden ? null : prepared.meter;
    let units = task.units;
    let settled = task.settled;
    if (meter && !settled) {
      const invocation = task.invocation;
      if (
        !invocation ||
        invocation.runId !== task.id ||
        invocation.instanceId !== task.pluginId ||
        invocation.sessionId !== task.sessionId
      )
        throw new AppError(
          "cloud_invocation_mismatch",
          "原始云端调用记录与任务不匹配，暂缓结算",
          503,
        );
      units = new Wallet(storage).charge(task.id, meter.units, Number.MAX_SAFE_INTEGER);
      sql.exec(
        "INSERT INTO platform_metering (id,pluginId,pluginVersion,instanceId,data,createdAt) VALUES (?,?,?,?,?,?)",
        task.id,
        invocation.pluginId,
        invocation.pluginVersion,
        invocation.instanceId,
        JSON.stringify({ ...meter, units }),
        now,
      );
      sql.exec(
        "INSERT INTO usage (id,createdAt,tokens,units) VALUES (?,?,?,?)",
        task.id,
        now,
        meter.inputTokens + meter.outputTokens,
        units,
      );
      sql.exec(
        "INSERT INTO runs (id,sessionId,status,response,createdAt) VALUES (?,?,'complete',?,?)",
        task.id,
        stale ? null : task.sessionId,
        JSON.stringify({ text: prepared.result, cost: units / 1000 }),
        now,
      );
      if (!stale && session) {
        sql.exec(
          "INSERT INTO messages (sessionId,role,content,createdAt,inputTokens,outputTokens,cost,model) VALUES (?,'assistant',?,?,?,?,?,?)",
          task.sessionId,
          prepared.result,
          now,
          meter.inputTokens,
          meter.outputTokens,
          units / 1000,
          task.pluginName,
        );
        sql.exec(
          "UPDATE sessions SET data=? WHERE id=?",
          JSON.stringify({ ...session, messageCount: session.messageCount + 1, updatedAt: now }),
          task.sessionId,
        );
      }
      settled = 1;
    }
    return store.patch(task, {
      state: prepared.state,
      result: task.hidden ? "" : prepared.result,
      error: task.hidden ? "" : prepared.error,
      units,
      settled,
      unconfirmed: 0,
      stale: Number(stale),
      delivered: stale ? 1 : task.delivered,
      deliveryStatus: stale ? "stale" : task.deliveryStatus,
      attempts: 0,
      nextAt: stale || task.delivered ? 0 : now,
    });
  });
}
