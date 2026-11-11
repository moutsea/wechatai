import {
  CloudAgentClient,
  type AgentJobView,
  type CloudAgentClientConfig,
} from "./cloud-agent-client";
import { cloudAgentScope } from "./cloud-agent-provision";
import {
  cloudTaskTerminal,
  type CloudAgentStore,
  type CloudProvision,
  type CloudTask,
} from "./cloud-agent-store";
import { AppError } from "./config";

function matchesTask(job: AgentJobView, task: CloudTask, provision: CloudProvision) {
  // AGT scopes GET/list with X-App-User. Reconciliation also requires the
  // persisted tenant, workspace and conversation; text and time are not identity.
  return (
    job.workspaceId === provision.workspaceId &&
    job.tenantId === task.tenantId &&
    job.conversationId === task.conversationId &&
    (job.appId === undefined || job.appId === task.appId) &&
    (job.appUserId === undefined || job.appUserId === provision.appUserId)
  );
}

/**
 * Read-only recovery for an attempted submission whose job ID is still unknown.
 * Call from the account's serialized runner. A returned ID is only a candidate:
 * the caller owns durable association, cancellation and terminal settlement.
 * Callback IDs must already have passed token, signature and ownership checks.
 */
export async function reconcileCloudAgentJob(
  config: CloudAgentClientConfig,
  store: CloudAgentStore,
  taskId: string,
): Promise<string | null> {
  const task = store.get(taskId);
  if (!task) throw new AppError("cloud_task_missing", "云端任务不存在", 404);
  if (cloudTaskTerminal(task.state) || !task.submittedAt || task.jobId) return null;
  const scope = cloudAgentScope(task);
  if (cloudAgentScope(config) !== scope)
    throw new AppError("cloud_config_changed", "云端服务配置已变更，原任务正在等待恢复", 503);
  const provision = store.provision();
  if (
    !provision?.workspaceId ||
    !provision.externalId ||
    !provision.appUserId ||
    provision.scope !== scope
  )
    throw new AppError("cloud_provision_missing", "等待恢复云端账号映射", 503);

  const client = new CloudAgentClient(config);
  const hints = store.callbackJobs(task.id);
  if (hints.length) {
    if (hints.length !== 1)
      throw new AppError("cloud_job_identity", "回调任务线索不一致，暂缓恢复", 502);
    const job = await client.getJob(provision.workspaceId, hints[0], provision.externalId);
    const currentHints = store.callbackJobs(task.id);
    if (
      job.id !== hints[0] ||
      currentHints.length !== 1 ||
      !matchesTask(job, task, provision) ||
      store.byJobId(job.id)
    )
      throw new AppError("cloud_job_identity", "云端任务归属校验失败，暂缓恢复", 502);
    store.patch(task, { reconcileCursor: "", reconcileCandidates: [] });
    return job.id;
  }

  // One page per pass, so a large history does not monopolize the shared alarm.
  const page = await client.listJobs(
    provision.workspaceId,
    provision.externalId,
    task.reconcileCursor || undefined,
  );
  // A callback may arrive during GET. Let the next pass verify that evidence
  // instead of choosing from an older list snapshot.
  if (store.callbackJobs(task.id).length) return null;
  const candidates = new Set(task.reconcileCandidates);
  for (const job of page.jobs) {
    if (matchesTask(job, task, provision) && !store.byJobId(job.id)) candidates.add(job.id);
  }
  if (page.hasMore) {
    if (!page.nextCursor || page.nextCursor === task.reconcileCursor)
      throw new AppError("cloud_cursor_invalid", "云端任务分页异常，暂缓恢复", 502);
    store.patch(task, {
      reconcileCursor: page.nextCursor,
      // Two distinct IDs already prove ambiguity. Keep the durable scan bounded.
      reconcileCandidates: [...candidates].slice(0, 2),
      nextAt: Date.now() + 1000,
    });
    return null;
  }
  store.patch(task, { reconcileCursor: "", reconcileCandidates: [] });
  const id = candidates.size === 1 ? [...candidates][0] : undefined;
  return id && !store.byJobId(id) ? id : null;
}
