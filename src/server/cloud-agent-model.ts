import { createHash } from "node:crypto";
import { CloudAgentClient, type CloudAgentClientConfig } from "./cloud-agent-client";
import type { CloudAgentStore, CloudTask } from "./cloud-agent-store";
import { AppError } from "./config";
import { decrypt } from "./security";
import { modelEndpoint } from "../shared/model-endpoint";
import { modelInputBudget } from "../shared/context";

/** One private model channel per account, reused across its serialized tasks. */
export async function prepareCloudAgentModel(
  env: Env,
  config: CloudAgentClientConfig,
  store: CloudAgentStore,
  accountId: string,
  task: CloudTask,
): Promise<string> {
  const model = task.modelConnection;
  if (!model)
    throw new AppError(
      "cloud_model_required",
      "原云端任务未记录执行模型，请重新提交；未单独指定模型时将使用当前微信的默认文本模型。",
      422,
    );
  const provision = store.provision();
  if (!provision) throw new AppError("cloud_provision_missing", "云端账号尚未就绪", 503);
  const fingerprint = createHash("sha256").update(JSON.stringify(model)).digest("hex");
  let channel = provision.modelChannel;
  if (channel?.fingerprint !== fingerprint) {
    const client = new CloudAgentClient(config);
    const name = `wechatai-${accountId}`;
    // Recover a channel created before a lost response without creating duplicates.
    const id =
      channel?.id ?? (await client.modelChannels()).find((value) => value.name === name)?.id;
    const apiKey = await decrypt(env, model.encryptedKey, `${accountId}:${model.keyContext}`);
    // AGT accepts an API root and appends the resource. Match Wechatai's endpoint
    // handling for bare hosts, /v1 roots and pasted complete endpoints.
    const endpoint = new URL(modelEndpoint(model.baseUrl, model.protocol));
    endpoint.pathname = endpoint.pathname.replace(
      /\/(?:chat\/completions|responses|messages)$/,
      "",
    );
    const channelId = await client.saveModelChannel(
      {
        name,
        provider: model.protocol === "anthropic" ? "anthropic-compatible" : "openai-compatible",
        api: model.protocol === "anthropic" ? "messages" : model.protocol,
        baseUrl: endpoint.href.replace(/\/$/, ""),
        apiKey,
        models: [
          {
            id: model.model,
            contextWindowTokens: model.contextTokens,
            maxInputTokens: model.maxInputTokens ?? modelInputBudget(model),
            maxOutputTokens: model.maxOutputTokens,
            defaultOutputTokens: model.maxOutputTokens,
          },
        ],
        defaultModel: model.model,
        enabled: true,
        isDefault: false,
      },
      id,
    );
    channel = { id: channelId, fingerprint };
    store.saveProvision({ ...store.provision()!, modelChannel: channel });
  }
  return `channel:${channel.id}:${model.model}`;
}
