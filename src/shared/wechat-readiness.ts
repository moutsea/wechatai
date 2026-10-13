import { modelKind } from "./model-kind";
import type { Assistant, Channel } from "./types";

type Setup = {
  channels: Pick<Channel, "id" | "hasKey" | "baseUrl">[];
  assistants: Pick<Assistant, "channelId" | "model" | "kind">[];
};
type SetupIssue = { code: string; message: string };

// Configuration only: binding must not make a billable model request. Use the
// same rules in the UI and the account, which rechecks before changing a link.
export function wechatSetupIssue(setup: Setup): SetupIssue | null {
  const configuredModels = setup.assistants.filter((model) => {
    const channel = setup.channels.find((c) => c.id === model.channelId);
    return channel?.hasKey && channel.baseUrl.trim() && model.model.trim();
  });
  if (configuredModels.some((model) => modelKind(model) === "text")) return null;

  if (!setup.channels.length)
    return {
      code: "wechat_channel_required",
      message:
        "请先在「渠道与模型」中添加渠道，填写 API Key 和服务地址，并添加一个文本模型，再连接微信。",
    };
  if (!setup.channels.some((c) => c.hasKey && c.baseUrl.trim()))
    return {
      code: "wechat_channel_incomplete",
      message: "渠道配置不完整，请先在「渠道与模型」中补全 API Key 和服务地址，再连接微信。",
    };
  return {
    code: "wechat_model_required",
    message:
      "请先为已配置的渠道添加一个文本模型，再连接微信；仅添加渠道或生图模型还不能进行普通聊天。",
  };
}
