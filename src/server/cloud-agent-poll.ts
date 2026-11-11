import { CloudAgentClient, type CloudAgentClientConfig } from "./cloud-agent-client";
import { cloudAgentScope } from "./cloud-agent-provision";
import {
  cloudTaskStopReason,
  cloudTaskTerminal,
  type CloudAgentStore,
  type CloudTask,
} from "./cloud-agent-store";
import { AppError } from "./config";

/**
 * Advance one already-associated job from the account's serialized runner.
 * Returns a task with a frozen terminal outcome for the host to settle/deliver.
 * null means it still needs polling, or is outside this helper's responsibility.
 * The host owns alarm scheduling and error backoff. No provisioning, submission
 * or billing happens here; disabling new submissions must not block recovery.
 */
export async function pollCloudAgentTask(
  config: CloudAgentClientConfig,
  store: CloudAgentStore,
  taskId: string,
  stopReason: (task: CloudTask) => string | undefined,
): Promise<CloudTask | null> {
  const current = () => {
    const task = store.get(taskId);
    if (!task) throw new AppError("cloud_task_missing", "云端任务不存在", 404);
    return task;
  };
  let task = current();
  if (cloudTaskTerminal(task.state) || !task.jobId) return null;
  if (task.outcome) return task;
  const requestStop = (snapshot: CloudTask) => {
    if (snapshot.stopRequested && (cloudTaskStopReason(snapshot) || snapshot.hidden))
      return snapshot;
    const reason =
      stopReason(snapshot) ||
      (Date.now() >= snapshot.deadline ? "任务已超时，正在请求停止。" : undefined) ||
      (snapshot.hidden ? "原任务内容已清除，正在请求停止。" : undefined);
    return reason && (!snapshot.stopRequested || !cloudTaskStopReason(snapshot))
      ? store.patch(snapshot, {
          stopRequested: 1,
          stopReason: reason,
          error: reason,
          ...(!snapshot.stopRequested ? { nextAt: Date.now() } : {}),
        })
      : snapshot;
  };
  task = requestStop(task);
  const scope = cloudAgentScope(task);
  if (cloudAgentScope(config) !== scope)
    throw new AppError("cloud_config_changed", "云端服务配置已变更，原任务正在等待恢复", 503);
  const provision = store.provision();
  if (
    !provision?.workspaceId ||
    !provision.appUserId ||
    !provision.externalId ||
    provision.scope !== scope
  )
    throw new AppError("cloud_provision_missing", "等待恢复云端账号映射", 503);
  const jobId = task.jobId;
  const client = new CloudAgentClient(config);
  const job = await client.getJob(provision.workspaceId, jobId, provision.externalId);
  if (
    job.id !== jobId ||
    job.workspaceId !== provision.workspaceId ||
    job.tenantId !== task.tenantId ||
    job.conversationId !== task.conversationId ||
    (job.appId !== undefined && job.appId !== task.appId) ||
    (job.appUserId !== undefined && job.appUserId !== provision.appUserId)
  )
    throw new AppError("cloud_job_identity", "云端任务归属校验失败，暂缓恢复", 502);

  task = current();
  if (cloudTaskTerminal(task.state) || task.jobId !== jobId) return null;
  if (task.outcome) return task;
  // A lifecycle stop may have arrived while GET was in flight. Explain it
  // before freezing a terminal response, which the runner will not poll again.
  task = requestStop(task);
  if (["completed", "failed", "cancelled"].includes(job.status))
    return store.patch(task, {
      outcome: job,
      upstreamStatus: job.status,
      attempts: 0,
      nextAt: Date.now(),
    });

  if (job.status === "awaiting_approval" && !cloudTaskStopReason(task))
    task = store.patch(task, {
      stopRequested: 1,
      stopReason: "云端 Agent 暂不支持工具审批。",
      error: "云端 Agent 暂不支持工具审批，正在请求停止。",
      nextAt: Date.now(),
    });
  if (task.stopRequested) {
    // Persist intent before cancellation I/O. Even a successful cancel response
    // is not a terminal proof; the next GET must confirm the job has ended.
    await client.cancelJob(provision.workspaceId, jobId, provision.externalId);
    task = current();
    if (cloudTaskTerminal(task.state) || task.jobId !== jobId) return null;
    if (task.outcome) return task;
  }
  store.patch(task, {
    upstreamStatus: job.status,
    attempts: 0,
    nextAt: Date.now() + 15_000,
  });
  return null;
}
