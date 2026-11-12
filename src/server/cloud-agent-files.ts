import { CloudAgentClient, hasCompleteCloudAnswer } from "./cloud-agent-client";
import { cloudAgentScope } from "./cloud-agent-provision";
import { CLOUD_FILE_RETRY_MS, cloudTaskTerminal, type CloudAgentStore } from "./cloud-agent-store";
import { cloudAgentConnectionConfig, AppError } from "./config";
import type { MediaStore } from "./media";

/** Copy verified immutable result files before settlement. Retrying this step
 * neither executes the Agent again nor creates another bill or output asset. */
export async function prepareCloudAgentFiles(
  env: Env,
  store: CloudAgentStore,
  media: MediaStore,
  taskId: string,
) {
  let task = store.get(taskId);
  if (
    !task ||
    task.hidden ||
    task.fileCancelled ||
    task.fileError ||
    cloudTaskTerminal(task.state) ||
    !task.outcome ||
    !hasCompleteCloudAnswer(task.outcome) ||
    !task.outcome.attachments?.length ||
    task.outputFiles?.length === task.outcome.attachments.length
  )
    return;
  const fail = (message: string) => {
    const current = store.get(taskId);
    if (!current || current.hidden || cloudTaskTerminal(current.state) || current.fileCancelled)
      return;
    media.discardRun(taskId);
    store.patch(current, {
      outputFiles: [],
      error: "",
      fileError: `${message.replace(/[，。\s]+$/, "")}。本次未扣 credits。请重新提交文件处理任务；已发生的模型 API 费用以服务商账单为准。`,
    });
  };
  const attachments = task.outcome.attachments;
  const startedAt = task.fileStartedAt ?? Date.now();
  task = store.patch(task, { fileStartedAt: startedAt });
  if (Date.now() >= startedAt + CLOUD_FILE_RETRY_MS) {
    fail("生成文件接收重试已超过 10 分钟，任务已结束。");
    return;
  }
  const files: NonNullable<typeof task.outputFiles> = [];
  try {
    const provision = store.provision();
    const config = cloudAgentConnectionConfig(env);
    if (
      !config ||
      !provision ||
      provision.scope !== cloudAgentScope(task) ||
      cloudAgentScope(config) !== cloudAgentScope(task)
    )
      throw new AppError("cloud_file_scope", "等待恢复原云端文件空间。", 503);
    const client = new CloudAgentClient({ ...config, agentId: task.profileId });
    for (const file of attachments) {
      if (Date.now() >= startedAt + CLOUD_FILE_RETRY_MS) {
        fail("生成文件接收重试已超过 10 分钟，任务已结束。");
        return;
      }
      const data = await client.downloadFile(provision.workspaceId, file, provision.externalId);
      const current = store.get(taskId);
      if (!current || current.hidden || current.fileCancelled || cloudTaskTerminal(current.state))
        return;
      const asset = await media.saveFile(task.id, task.sessionId, file, data);
      task = store.get(taskId);
      if (!task || task.hidden || task.fileCancelled || cloudTaskTerminal(task.state)) {
        media.discard(asset.id);
        return;
      }
      files.push({ id: asset.id, name: asset.name, mime: asset.mime, bytes: asset.bytes });
    }
  } catch (error) {
    // Transport failures can recover; invalid immutable bytes cannot. Do not
    // charge a text answer that claims to contain an unusable file.
    task = store.get(taskId);
    if (!task || task.hidden || cloudTaskTerminal(task.state)) return;
    if (task.fileCancelled) return;
    if (error instanceof AppError) {
      if (["cloud_file_invalid", "cloud_file_identity"].includes(error.code)) {
        fail("云端返回的文件不完整或校验失败，");
        return;
      }
      if (
        [
          "cloud_file_missing",
          "cloud_file_rejected",
          "cloud_file_size",
          "image_invalid",
          "image_size",
        ].includes(error.code)
      ) {
        fail(error.message.replace(/本次未扣(?:费| credits)。?/, ""));
        return;
      }
    }
    store.patch(task, {
      error:
        "生成文件暂时无法读取，正在重试（最多 10 分钟）。可在云端任务页取消文件接收，或发送 /wx stop；取消后本次不扣 credits。",
    });
    throw error;
  }
  store.patch(task, { outputFiles: files, error: "" });
}
