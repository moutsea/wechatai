import {
  CLOUD_CALLBACK_PATH,
  cloudCallbackSecret,
  createCloudCallbackToken,
} from "./cloud-agent-callback";
import { cloudJobBody } from "./cloud-agent-client";
import { cloudAgentScope } from "./cloud-agent-provision";
import type { CloudAgentStore, CloudTask } from "./cloud-agent-store";
import { AppError, cloudAgentEnabled } from "./config";
import { decrypt, encrypt } from "./security";

/**
 * Freeze the exact submit body before any network attempt. Run from the account's
 * serialized runner; stopReason checks current session/plugin/account eligibility.
 * null means submission is no longer allowed. The caller still owns the final
 * preflight, durable attempt marker and network I/O; this helper never submits.
 */
export async function prepareCloudAgentRequest(
  env: Env,
  store: CloudAgentStore,
  accountId: string,
  taskId: string,
  stopReason: (task: CloudTask) => string | undefined,
): Promise<string | null> {
  const current = () => {
    const task = store.get(taskId);
    if (!task) throw new AppError("cloud_task_missing", "云端任务不存在", 404);
    if (
      task.state !== "submitting" ||
      task.jobId ||
      task.stopRequested ||
      task.hidden ||
      Date.now() >= task.deadline ||
      !cloudAgentEnabled(env) ||
      stopReason(task)
    )
      return null;
    // A lost response is not permission to reconstruct a potentially different
    // body under the same idempotency key. Leave it for read-only recovery.
    if (!task.request && (task.submittedAt || task.unconfirmed))
      throw new AppError(
        "cloud_request_missing",
        "原始云端请求缺失，已暂停提交，请联系运营方。",
        503,
      );
    return task;
  };

  let task = current();
  if (!task) return null;
  const provision = store.provision();
  if (
    !provision?.workspaceId ||
    !provision.appUserId ||
    provision.externalId !== `wechatai:${accountId}` ||
    provision.scope !== cloudAgentScope(task) ||
    !provision.profiles.includes(task.profileId)
  )
    throw new AppError("cloud_provision_missing", "等待恢复云端账号映射与配置", 503);

  const context = `${accountId}:cloud:${task.id}`;
  if (!task.request) {
    let origin: URL;
    try {
      origin = new URL(task.callbackOrigin);
    } catch {
      throw new AppError("cloud_callback_origin", "云端回调地址配置无效", 503);
    }
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
    if (
      origin.origin !== task.callbackOrigin.replace(/\/+$/, "") ||
      (origin.protocol !== "https:" && !(origin.protocol === "http:" && loopback))
    )
      throw new AppError("cloud_callback_origin", "云端回调地址配置无效", 503);
    const token = createCloudCallbackToken(
      env,
      accountId,
      task.id,
      task.deadline + 7 * 86_400_000,
      task.callbackVersion,
    );
    const raw = JSON.stringify(
      cloudJobBody({
        workspaceId: provision.workspaceId,
        agentId: task.profileId,
        model: task.model,
        message: task.prompt,
        conversationId: task.conversationId,
        callback: {
          url: new URL(`${CLOUD_CALLBACK_PATH}/${token}`, origin).href,
          secret: cloudCallbackSecret(env, accountId, task.id, task.callbackVersion),
        },
      }),
    );
    const request = await encrypt(env, raw, context);
    task = current();
    if (!task) return null;
    if (!task.request) task = store.patch(task, { request });
  }
  const request = task.request;
  const raw = await decrypt(env, request, context);
  task = current();
  return task?.request === request ? raw : null;
}
