import { isChatModel } from "./model-compatibility";
import type { Assistant, Channel, Snapshot, WechatLink } from "./types";
import {
  CLOUD_AGENT_PLUGIN_ID,
  cloudAgentAvailabilityIssue,
  isCloudAgent,
  type CloudAgentPlugin,
  type CloudAgentStatus,
} from "./cloud-agent";
import type { UserPlugin } from "./image-generation";
import { availablePluginIds } from "./plugin-access";
import { isRemoteAgent } from "./remote-agent";

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

export function modelFreeWechatPlugins(setup: Pick<Snapshot, "plan" | "plugins">) {
  const plugins = setup.plugins ?? [];
  const available = availablePluginIds(setup.plan, plugins);
  return plugins.filter(
    (p) =>
      p.enabled &&
      available.has(p.id) &&
      (isRemoteAgent(p) || p.pluginId === "wechatai/notification"),
  );
}

export function preferredRemoteAgent(plugins: readonly UserPlugin[], currentPluginId?: string) {
  const agents = plugins.filter(isRemoteAgent);
  return agents.find((p) => p.id === currentPluginId) ?? agents[0];
}

export function notificationWechatSetupIssue(
  connection: Pick<WechatLink, "status" | "paused" | "hasReplyContext"> | undefined,
): SetupIssue | null {
  if (connection?.paused)
    return {
      code: "connection_paused",
      message: "接收微信已暂停，请改选可用链接，或恢复 Plus 会员后再推送。",
    };
  if (!connection || connection.status !== "connected")
    return {
      code: "wechat_not_connected",
      message: "请先在「微信连接」中完成扫码，再向对应微信对话发送 /wx help。",
    };
  if (!connection.hasReplyContext)
    return {
      code: "wechat_context_required",
      message: "请先向此微信对话发送 /wx help，建立回复通道后再测试推送。此命令不消耗 credits。",
    };
  return null;
}

export function notificationWechatIssue(
  connection: Pick<WechatLink, "status" | "paused" | "hasReplyContext" | "lastSeen"> | undefined,
  now = Date.now(),
): SetupIssue | null {
  const setupIssue = notificationWechatSetupIssue(connection);
  if (setupIssue) return setupIssue;
  // A saved context proves initialization, but does not keep the reply window
  // open forever. Treat age as recovery guidance; WeChat decides delivery.
  if (connection?.lastSeen !== undefined && now - connection.lastSeen >= 24 * 60 * 60 * 1000)
    return {
      code: "wechat_reply_window_expired",
      message:
        "接收微信已超过 24 小时未互动，回复窗口可能已过期。请在此微信对话发送 /wx help 更新窗口后再测试推送，无需重新扫码。",
    };
  return null;
}

// Chat configuration is independent of the WeChat transport. Binding is also
// used before configuring notifications or an external Agent, with no model.
export function chatSetupIssue(setup: Setup): SetupIssue | null {
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
      message: "请在「插件」中启用云端 Agent；也可在「渠道与模型」中配置文本模型，使用普通聊天。",
    };
  }

  if (!setup.channels.length)
    return {
      code: "wechat_channel_required",
      message:
        "普通模型聊天需要先在「渠道与模型」中添加渠道，填写 API Key 和服务地址，并添加一个文本模型。",
    };
  if (!setup.channels.some((c) => c.hasKey && c.baseUrl.trim()))
    return {
      code: "wechat_channel_incomplete",
      message: "渠道配置不完整，请在「渠道与模型」中补全 API Key 和服务地址后再开始普通聊天。",
    };
  return {
    code: "wechat_model_required",
    message:
      "请为已配置的渠道添加一个与渠道协议兼容的文本模型；仅添加渠道或生图模型还不能进行普通聊天。",
  };
}
