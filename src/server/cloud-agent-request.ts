import {
  CLOUD_CALLBACK_PATH,
  cloudCallbackSecret,
  createCloudCallbackToken,
} from "./cloud-agent-callback";
import { CloudAgentClient, cloudJobBody, cloudImagePath } from "./cloud-agent-client";
import { createHash } from "node:crypto";
import { cloudAgentScope } from "./cloud-agent-provision";
import type { CloudAgentStore, CloudTask } from "./cloud-agent-store";
import { AppError, cloudAgentEnabled, cloudAgentConnectionConfig } from "./config";
import { decrypt, encrypt } from "./security";
import { prepareCloudAgentModel } from "./cloud-agent-model";

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
    if (task.inputFiles?.length) {
      const connection = cloudAgentConnectionConfig(env);
      if (!connection) throw new AppError("cloud_agent_config", "云端服务配置尚未就绪", 503);
      const client = new CloudAgentClient({ ...connection, agentId: task.profileId });
      for (const file of task.inputFiles) {
        await client.uploadFile(provision.workspaceId, file.path, file.text, provision.externalId);
        task = current();
        if (!task) return null;
      }
    }
    const images: { id: string }[] = [];
    if (task.imageIds?.length) {
      const connection = cloudAgentConnectionConfig(env);
      if (!connection) throw new AppError("cloud_agent_config", "云端服务配置尚未就绪", 503);
      const client = new CloudAgentClient({ ...connection, agentId: task.profileId });
      for (const id of task.imageIds) {
        const data = store.image(task.id, id);
        if (!data || `img_${createHash("sha256").update(data).digest("hex")}` !== id)
          throw new AppError("cloud_image_missing", "原任务图片暂时无法读取，请稍后重试。", 503);
        await client.uploadFile(
          provision.workspaceId,
          cloudImagePath(id),
          data,
          provision.externalId,
        );
        task = current();
        if (!task) return null;
        images.push({
          id: await client.uploadImage(provision.workspaceId, data, provision.externalId),
        });
        task = current();
        if (!task) return null;
      }
    }
    let selectedModel = task.model;
    if (task.modelConnection) {
      const connection = cloudAgentConnectionConfig(env);
      if (!connection) throw new AppError("cloud_agent_config", "云端服务配置尚未就绪", 503);
      selectedModel = await prepareCloudAgentModel(
        env,
        { ...connection, agentId: task.profileId },
        store,
        accountId,
        task,
      );
      task = current();
      if (!task) return null;
    }
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
        model: selectedModel,
        ...(task.modelConnection ? { systemPrompt: task.modelConnection.systemPrompt } : {}),
        message: task.prompt,
        ...(images.length ? { images } : {}),
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
    if (!task.request) task = store.patch(task, { request, inputFiles: [] });
  }
  const request = task.request;
  const raw = await decrypt(env, request, context);
  task = current();
  return task?.request === request ? raw : null;
}
