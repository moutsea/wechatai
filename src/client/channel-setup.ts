import { workspaceCopy as ptCopy } from "../shared/i18n/pt/copy/workspace";
import type { Locale } from "../shared/i18n";
import { formatCopy } from "../shared/i18n/dashboard";
import { modelImportCopy } from "../shared/i18n/ko/copy/workspace";
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

export function modelImportMessage(
  result: ModelImportResult,
  limit: number,
  locale: Locale = "zh-CN",
) {
  const copy =
    locale === "ko"
      ? modelImportCopy
      : locale === "pt"
        ? {
            imported: ptCopy["已导入 {count} 个模型"],
            noNew: ptCopy["没有新模型可导入"],
            empty: ptCopy["上游未返回可导入的模型，请手动添加模型"],
            existing: ptCopy["{count} 个已存在"],
            invalid: ptCopy["跳过 {count} 条无效记录"],
            incompatible: ptCopy["跳过 {count} 个与当前协议不兼容的模型，可调整渠道协议后重新获取"],
            limited: ptCopy["渠道最多 {limit} 个模型，另有 {count} 个未导入"],
          }
        : {
            imported: "已导入 {count} 个模型",
            noNew: "没有新模型可导入",
            empty: "上游未返回可导入的模型，请手动添加模型",
            existing: "{count} 个已存在",
            invalid: "跳过 {count} 条无效记录",
            incompatible: "跳过 {count} 个与当前协议不兼容的模型，可调整渠道协议后重新获取",
            limited: "渠道最多 {limit} 个模型，另有 {count} 个未导入",
          };
  const parts = [
    result.imported
      ? formatCopy(copy.imported, { count: result.imported })
      : result.total
        ? copy.noNew
        : copy.empty,
  ];
  if (result.existing) parts.push(formatCopy(copy.existing, { count: result.existing }));
  if (result.invalid) parts.push(formatCopy(copy.invalid, { count: result.invalid }));
  if (result.incompatible)
    parts.push(formatCopy(copy.incompatible, { count: result.incompatible }));
  if (result.limited) parts.push(formatCopy(copy.limited, { limit, count: result.limited }));
  return parts.join(locale === "ko" || locale === "pt" ? "; " : "；");
}
