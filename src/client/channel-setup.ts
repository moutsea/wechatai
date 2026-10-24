import { api, json } from "./api";
import { channelNeedsApiKey } from "../shared/channel-providers";
import type { Channel, ChannelInput, ModelImportResult } from "../shared/types";

export async function saveChannelSetup(
  request: typeof api,
  input: ChannelInput,
  previous: Channel | undefined,
  importModels: boolean,
): Promise<{ channel: Channel; models?: ModelImportResult; importError?: string }> {
  if (channelNeedsApiKey(previous, input) && !input.apiKey?.trim())
    throw new Error(previous ? "服务地址已更改，请填写对应服务商的 API Key。" : "请输入 API Key");
  const channel = await request<Channel>(
    previous ? `/channels/${previous.id}` : "/channels",
    json({ ...input, apiKey: input.apiKey?.trim() || undefined }, previous ? "PATCH" : "POST"),
  );
  // Import is a separate operation. A catalog failure must not turn a successful
  // save into an error that encourages the user to create the channel twice.
  if (!previous && importModels) {
    try {
      const models = await request<ModelImportResult>(`/channels/${channel.id}/models/import`, {
        method: "POST",
      });
      return { channel, models };
    } catch (error) {
      return { channel, importError: (error as Error).message || "获取可用模型失败" };
    }
  }
  return { channel };
}

export function modelImportMessage(result: ModelImportResult, limit: number) {
  const parts = [
    result.imported
      ? `已导入 ${result.imported} 个模型`
      : result.total
        ? "没有新模型可导入"
        : "上游未返回可导入的模型，请手动添加模型",
  ];
  if (result.existing) parts.push(`${result.existing} 个已存在`);
  if (result.invalid) parts.push(`跳过 ${result.invalid} 条无效记录`);
  if (result.incompatible)
    parts.push(`跳过 ${result.incompatible} 个与当前协议不兼容的模型，可调整渠道协议后重新获取`);
  if (result.limited) parts.push(`渠道最多 ${limit} 个模型，另有 ${result.limited} 个未导入`);
  return parts.join("；");
}
