import { isChatModel } from "./model-compatibility";
import type { Assistant, Channel, Snapshot } from "./types";
import {
  CLOUD_AGENT_PLUGIN_ID,
  cloudAgentAvailabilityIssue,
  isCloudAgent,
  type CloudAgentPlugin,
  type CloudAgentStatus,
} from "./cloud-agent";
import type { UserPlugin } from "./image-generation";

type Setup = {
  channels: Pick<Channel, "id" | "hasKey" | "baseUrl" | "protocol">[];
  assistants: Pick<Assistant, "channelId" | "model" | "kind">[];
  plan?: "free" | "plus";
  cloudAgent?: Pick<CloudAgentStatus, "ready" | "reason">;
  plugins?: Pick<UserPlugin, "pluginId" | "enabled">[];
};
type SetupIssue = { code: string; message: string };

export function readyCloudAgents(setup: Pick<Snapshot, "plan" | "cloudAgent" | "plugins">) {
  if (cloudAgentAvailabilityIssue(setup.plan, setup.cloudAgent)) return [];
  return (setup.plugins ?? []).filter(
    (p): p is CloudAgentPlugin => isCloudAgent(p) && p.enabled && !p.access,
  );
}

// Configuration only: binding must not make a billable model request. Use the
// same rules in the UI and the account, which rechecks before changing a link.
export function wechatSetupIssue(setup: Setup): SetupIssue | null {
  const configured = setup.assistants.some((model) => {
    const channel = setup.channels.find((c) => c.id === model.channelId);
    return (
      channel?.hasKey &&
      channel.baseUrl.trim() &&
      model.model.trim() &&
      isChatModel({ ...model, baseUrl: channel.baseUrl, protocol: channel.protocol })
    );
  });
  if (configured) return null;

  const cloud = setup.plugins?.filter((p) => p.pluginId === CLOUD_AGENT_PLUGIN_ID);
  if (cloud?.length && setup.cloudAgent && setup.plan) {
    const issue = cloudAgentAvailabilityIssue(setup.plan, setup.cloudAgent);
    if (issue) return issue;
    if (cloud.some((p) => p.enabled))
      return {
        code: "cloud_model_required",
        message:
          "云端 Agent 也需要你自己的文本模型，请先配置渠道与模型；未单独指定时使用当前微信的默认文本模型。",
      };
    return {
      code: "plugin_disabled",
      message: "请在「插件」中启用云端 Agent，或在「渠道与模型」中配置文本模型后连接微信。",
    };
  }

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
      "请先为已配置的渠道添加一个与渠道协议兼容的文本模型，再连接微信；仅添加渠道或生图模型还不能进行普通聊天。",
  };
}
