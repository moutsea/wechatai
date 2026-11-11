import type { AgentJobView } from "./cloud-agent-client";
import { pollCloudAgentTask } from "./cloud-agent-poll";
import { cloudAgentScope, ensureCloudAgentProvision } from "./cloud-agent-provision";
import { reconcileCloudAgentJob } from "./cloud-agent-reconcile";
import {
  cloudTaskStopReason,
  cloudTaskTerminal,
  type CloudAgentStore,
  type CloudTask,
} from "./cloud-agent-store";
import { submitCloudAgentTask } from "./cloud-agent-submit";
import { AppError, cloudAgentConnectionConfig, cloudAgentEnabled } from "./config";

type Host = {
  stopReason(task: CloudTask): string | undefined;
  /** Use settleCloudAgentTask to atomically commit billing, history and pending delivery. */
  finalize(task: CloudTask, job: AgentJobView): unknown | Promise<unknown>;
  /** Use CloudAgentDelivery.sync to queue/check terminal delivery without rebilling. */
  deliver(task: CloudTask): unknown | Promise<unknown>;
};

/**
 * One instance per account, called by its shared alarm. Progress and retry times
 * live in SQLite; running only prevents overlapping passes in this instance.
 * The host must persist/rearm its recovery alarm, initialize the store, and own
 * admission, settlement and delivery. This class is not wired to the account yet.
 */
export class CloudAgentRuntime {
  private running = false;

  constructor(
    private env: Env,
    private store: CloudAgentStore,
    private accountId: string,
    private host: Host,
  ) {}

  private stopping(task: CloudTask) {
    if (
      cloudTaskTerminal(task.state) ||
      task.outcome ||
      (task.stopRequested && (cloudTaskStopReason(task) || task.hidden))
    )
      return task;
    const reason =
      this.host.stopReason(task) ||
      (Date.now() >= task.deadline ? "任务已超时。" : undefined) ||
      (task.hidden ? "原任务内容已清除。" : undefined) ||
      (!cloudAgentEnabled(this.env) && !task.jobId ? "云端服务已暂停，请稍后重试。" : undefined);
    // Lifecycle hooks persist the stop intent before the runner can explain it.
    // Filling that explanation must not restart cancellation/notification backoff.
    return reason
      ? this.store.patch(task, {
          stopRequested: 1,
          stopReason: reason,
          error: reason,
          ...(!task.stopRequested ? { nextAt: Date.now() } : {}),
        })
      : task;
  }

  private async reject(task: CloudTask, error: string) {
    const rejected = this.store.patch(task, {
      state: "rejected",
      unconfirmed: 0,
      attempts: 0,
      error,
      nextAt: Date.now(),
    });
    if (!rejected.delivered) await this.host.deliver(rejected);
  }

  private rejectStopped(task: CloudTask) {
    return this.reject(
      task,
      `${cloudTaskStopReason(task) || "任务已停止。"}\n\n任务未提交，未扣 credits。`,
    );
  }

  private async advance(id: string) {
    let task = this.store.get(id);
    if (!task) return;
    if (cloudTaskTerminal(task.state)) {
      if (!task.delivered) await this.host.deliver(task);
      return;
    }
    // Local finalization retries must not depend on AGT, new configuration, the
    // submission gate, or the original execution deadline.
    if (task.outcome) return this.host.finalize(task, task.outcome);
    task = this.stopping(task);
    if (task.stopRequested && !task.submittedAt && !task.unconfirmed && !task.jobId)
      return this.rejectStopped(task);

    const configured = cloudAgentConnectionConfig(this.env);
    if (!configured || cloudAgentScope(configured) !== cloudAgentScope(task))
      throw new AppError("cloud_config_changed", "云端服务配置已变更，原任务正在等待恢复", 503);
    const config = { ...configured, agentId: task.profileId, model: task.model };

    if (!task.submittedAt && !task.unconfirmed && !task.jobId) {
      try {
        await ensureCloudAgentProvision(config, this.store, this.accountId, task.workspaceName);
      } catch (error) {
        task = this.stopping(this.store.get(id)!);
        if (task.stopRequested) return this.rejectStopped(task);
        if (
          error instanceof AppError &&
          error.upstreamStatus !== undefined &&
          [400, 401, 403, 404, 413, 422, 429].includes(error.upstreamStatus)
        )
          return this.reject(
            task,
            "云端账号暂时无法开通，任务未提交，未扣 credits。请稍后重试；若持续失败，请联系运营方。",
          );
        throw error;
      }
      task = this.stopping(this.store.get(id)!);
      if (task.stopRequested) return this.rejectStopped(task);
    }

    if (task.jobId) {
      const ready = await pollCloudAgentTask(config, this.store, id, (t) =>
        this.host.stopReason(t),
      );
      if (ready?.outcome) await this.host.finalize(ready, ready.outcome);
    } else if (
      task.stopRequested ||
      ((task.submittedAt || task.unconfirmed) && !task.request) ||
      this.store.callbackJobs(id).length
    ) {
      // Missing request data never permits reconstructing a POST. Recover the
      // original job read-only, then let the polling module honor stop intent.
      if (!task.request && !task.stopRequested)
        task = this.store.patch(task, {
          stopRequested: 1,
          stopReason: "原始云端请求缺失。",
        });
      const jobId = await reconcileCloudAgentJob(config, this.store, id);
      task = this.store.get(id)!;
      this.store.patch(
        task,
        jobId
          ? { jobId, state: "accepted", unconfirmed: 0, attempts: 0, nextAt: Date.now() }
          : {
              unconfirmed: 1,
              attempts: 0,
              error: cloudTaskStopReason(task) || "云端任务尚未唯一确认，正在持续核对原任务。",
              nextAt: Date.now() + (task.reconcileCursor ? 1000 : 60_000),
            },
      );
    } else {
      const submitted = await submitCloudAgentTask(
        this.env,
        config,
        this.store,
        this.accountId,
        id,
        (t) => this.host.stopReason(t),
      );
      if (submitted && cloudTaskTerminal(submitted.state) && !submitted.delivered)
        await this.host.deliver(submitted);
    }
  }

  /** Bounded passes; deadline is checked between tasks, not a hard I/O cutoff. */
  async process(deadline: number) {
    if (this.running) return;
    this.running = true;
    try {
      this.store.prune();
      for (const task of this.store.active()) this.stopping(task);
      // Visit each task at most once per pass, even if a host hook is a no-op.
      for (const snapshot of this.store.due(Date.now(), 6)) {
        if (Date.now() >= deadline - 5000) break;
        // Also leave a durable retry time when a host hook returns no progress.
        this.store.patch(snapshot, { nextAt: Date.now() + 15_000 });
        try {
          await this.advance(snapshot.id);
        } catch (error) {
          const current = this.store.get(snapshot.id);
          if (!current || (cloudTaskTerminal(current.state) && current.delivered)) continue;
          this.store.patch(current, {
            attempts: current.attempts + 1,
            nextAt: Date.now() + Math.min(300_000, 15_000 * 2 ** Math.min(current.attempts, 5)),
          });
          console.warn(
            JSON.stringify({
              event: "cloud.recovery_deferred",
              taskId: current.id,
              errorType: error instanceof AppError ? error.code : "unknown",
            }),
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
