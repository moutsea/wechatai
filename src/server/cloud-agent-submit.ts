import {
  CloudAgentClient,
  type AgentJobView,
  type CloudAgentClientConfig,
} from "./cloud-agent-client";
import { cloudAgentScope } from "./cloud-agent-provision";
import { cloudAgentMeteringFailure } from "./cloud-agent-metering";
import { prepareCloudAgentRequest } from "./cloud-agent-request";
import { cloudTaskStopReason, type CloudAgentStore, type CloudTask } from "./cloud-agent-store";
import { AppError, cloudAgentEnabled } from "./config";
import { pluginInvocationSchema } from "../shared/plugins";
import { pluginOutputBudget } from "./plugins/gateway";

/**
 * Submit from the account's serialized runner using its durable frozen request.
 * Returns the associated task or a definitive first-attempt rejection; null
 * means submission is no longer allowed. The host owns scheduling/backoff and
 * terminal notification. This helper never settles credits or delivers results.
 */
export async function submitCloudAgentTask(
  env: Env,
  config: CloudAgentClientConfig,
  store: CloudAgentStore,
  accountId: string,
  taskId: string,
  stopReason: (task: CloudTask) => string | undefined,
): Promise<CloudTask | null> {
  const current = () => {
    const task = store.get(taskId);
    if (!task) throw new AppError("cloud_task_missing", "云端任务不存在", 404);
    return task;
  };
  const allowed = (task: CloudTask) =>
    task.state === "submitting" &&
    !task.jobId &&
    !task.outcome &&
    !task.stopRequested &&
    !task.hidden &&
    Date.now() < task.deadline &&
    cloudAgentEnabled(env) &&
    !stopReason(task);
  let task = current();
  if (!allowed(task)) return null;
  // Only a never-attempted task can be rejected locally. Once POST may have
  // happened, preserve its identity/occupancy and recover the original job.
  if (
    !task.submittedAt &&
    !task.unconfirmed &&
    !store.callbackJobs(task.id).length &&
    task.invocation
  ) {
    try {
      if (pluginOutputBudget(pluginInvocationSchema.parse(task.invocation)) <= 0)
        throw new AppError("plugin_empty_result", "本次上限不允许返回正文", 422);
    } catch (error) {
      const message = cloudAgentMeteringFailure(error);
      if (!message) throw error;
      return store.patch(task, {
        state: "rejected",
        attempts: 0,
        nextAt: Date.now(),
        error: `任务未提交。\n\n${message}`,
      });
    }
  }
  if (cloudAgentScope(config) !== cloudAgentScope(task))
    throw new AppError("cloud_config_changed", "云端服务配置已变更，原任务正在等待恢复", 503);
  const client = new CloudAgentClient(config);
  const raw = await prepareCloudAgentRequest(env, store, accountId, taskId, stopReason);
  task = current();
  if (raw === null || !allowed(task)) return null;
  const provision = store.provision();
  if (
    !provision?.workspaceId ||
    !provision.appUserId ||
    provision.externalId !== `wechatai:${accountId}` ||
    provision.scope !== cloudAgentScope(task) ||
    !provision.profiles.includes(task.profileId)
  )
    throw new AppError("cloud_provision_missing", "等待恢复云端账号映射与配置", 503);

  // A crash after this write is ambiguous, even before fetch starts. A later
  // refusal cannot prove that this earlier attempt did not create a job.
  const attempted = !!(task.submittedAt || task.unconfirmed);
  task = store.patch(task, { submittedAt: task.submittedAt || Date.now(), unconfirmed: 1 });
  let job: AgentJobView;
  try {
    job = await client.submit(raw, provision.externalId, task.idempotencyKey);
  } catch (error) {
    task = current();
    if (task.state !== "submitting" || task.jobId || task.outcome) return null;
    const status = error instanceof AppError ? error.upstreamStatus : undefined;
    if (
      !attempted &&
      !store.callbackJobs(task.id).length &&
      status !== undefined &&
      [401, 403, 404, 413, 422, 429].includes(status)
    )
      return store.patch(task, {
        state: "rejected",
        unconfirmed: 0,
        attempts: 0,
        nextAt: Date.now(),
        error:
          status === 429
            ? "云端服务繁忙，任务未接收，未扣 credits，请稍后重试。"
            : "云端服务拒绝了任务，未扣 credits。请稍后重试；若持续失败，请联系运营方。",
      });
    // AGT's generic 400 can also follow job creation (for example, callback
    // registration failed). Like 409, keep it for read-only recovery.
    store.patch(task, {
      ...(status === 400 || status === 409 ? { stopRequested: 1 } : {}),
      ...(status === 400 || status === 409
        ? {
            stopReason:
              cloudTaskStopReason(task) ||
              (status === 409 ? "云端请求发生冲突。" : "云端提交响应异常。"),
          }
        : {}),
      error:
        cloudTaskStopReason(task) ||
        (status === 409
          ? "云端请求冲突，正在核对原任务；不会重新提交。"
          : "提交结果尚未确认，正在恢复原任务。"),
    });
    throw error;
  }

  task = current();
  if (task.state !== "submitting" || task.jobId || task.outcome) return null;
  const owner = store.byJobId(job.id);
  if (
    job.workspaceId !== provision.workspaceId ||
    job.tenantId !== task.tenantId ||
    job.conversationId !== task.conversationId ||
    (job.appId !== undefined && job.appId !== task.appId) ||
    (job.appUserId !== undefined && job.appUserId !== provision.appUserId) ||
    (owner && owner.id !== task.id) ||
    store.callbackJobs(task.id).some((id) => id !== job.id)
  ) {
    store.patch(task, {
      stopRequested: 1,
      stopReason: cloudTaskStopReason(task) || "云端任务关联校验失败。",
      error: cloudTaskStopReason(task) || "云端任务关联校验失败，正在核对原任务。",
    });
    throw new AppError("cloud_job_identity", "云端任务归属校验失败，暂缓恢复", 502);
  }
  return store.patch(task, {
    state: "accepted",
    jobId: job.id,
    upstreamStatus: job.status,
    unconfirmed: 0,
    attempts: 0,
    error: task.stopRequested ? task.error : "",
    nextAt:
      Date.now() +
      (task.stopRequested ||
      ["awaiting_approval", "completed", "failed", "cancelled"].includes(job.status)
        ? 0
        : 15_000),
  });
}
