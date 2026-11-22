import { waitingMessageFields } from "./waiting-message";
import { z } from "zod";
import { openClawInputSchema, openClawManifest, type OpenClawPlugin } from "./openclaw";
import { pluginShortcutJsonSchema } from "./plugin-shortcut";
import { pluginManifestSchema } from "./plugins";

export const GROK_ID = "wechatai/grok" as const;
export const GROK_WAITING_MESSAGE = "任务已加入 Grok Bot 队列，完成后会在这里回复。";
export const GROK_DISPATCH_UNAVAILABLE = "Grok Bot 派发服务暂不可用，请在服务恢复后再发送新任务。";
export type GrokPlugin = Omit<OpenClawPlugin, "pluginId"> & {
  pluginId: typeof GROK_ID;
  /** A Routine Webhook URL and key are saved for this configuration. */
  webhookReady?: boolean;
  /** A configuration prompt may still register a Routine Webhook. */
  setupPending?: boolean;
};
/** How long a configuration prompt may register a Routine Webhook after it is generated. */
export const GROK_SETUP_MINUTES = 30;
export const GROK_SETUP_INCOMPLETE =
  "Grok Bot 还没完成配置。请在微伴网页的 Grok Bot 配置中复制配置指令，发给你的 Grok Bot。";
export const grokInputSchema = openClawInputSchema.safeExtend({
  agentId: z.literal("main").default("main"),
  ...waitingMessageFields(GROK_WAITING_MESSAGE),
  allowProactive: z.literal(false).default(false),
});
export const grokManifest = pluginManifestSchema.parse({
  ...openClawManifest,
  id: GROK_ID,
  name: "Grok Bot",
  capabilities: { ...openClawManifest.capabilities, sessions: "platform", commands: "platform" },
  permissions: { ...openClawManifest.permissions, networkOrigins: ["https://api2.cursor.sh"] },
  configSchema: {
    type: "object",
    required: ["name", "shortcut", "webhookUrl", "webhookKey"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 40 },
      shortcut: pluginShortcutJsonSchema,
      webhookUrl: { type: "string", format: "uri" },
      webhookKey: { type: "string", writeOnly: true },
    },
  },
});

export const grokRoutineInstructions =
  "收到微伴 Webhook 后，为本次 Routine 运行生成一个新的随机 UUID 作为 claimId，连同 Webhook 的 taskId 调用 wechatai_claim。若未收到领取响应，用原 claimId 重试。claimed 为 false 时停止；为 true 时只执行一次。" +
  "根据 text 和本次 history 处理请求。重试依赖已截断的要求时先请用户确认，保留 Grok 自身的审批。完成后用领取到的 receipt 和同一 taskId 调用 wechatai_finish，" +
  "成功时提交 completed，最终文字尽量控制在 maxOutputTokens 内。无法完成时提交 failed 并将 text 留空。网络中断只重试同一份回传。工具提示已超时或已结算时停止回传，不重新执行原任务。";

// One message for the user's own Grok Bot chat. The Bot adds the MCP connector,
// creates the Webhook Routine and returns its URL and key through the connector.
export function grokSetupPrompt(input: { endpoint: string; token: string; shortcut: string }) {
  return [
    "请帮我把你接入微伴（wechatai.app），让我能在微信里把文字任务交给你。按顺序完成以下步骤：",
    "",
    `1. 添加一个远程 MCP 服务器（Remote HTTPS），名称「微伴」，地址 ${input.endpoint}，请求头 Authorization: Bearer ${input.token}`,
    "2. 新建一个名为「微伴微信任务」的 Routine，只用 Webhook 触发，不加定时或其他触发。Routine 指令如下：",
    grokRoutineInstructions,
    `3. 读取这个 Routine 的 Webhook POST 地址和 key，调用「微伴」的 wechatai_register_webhook 工具提交。key 不含 Bearer 前缀。请在 ${GROK_SETUP_MINUTES} 分钟内完成这一步。`,
    `4. 工具返回成功后告诉我「配置完成」，我会在微信发 @${input.shortcut} 加一句任务来测试。如果读取不到 Webhook 地址或 key，请告诉我在桌面端哪里复制，我会手动填到微伴。`,
    "",
    "这段指令含有微伴的连接凭据，只用于这次配置，不要发给别人，也不要保存到公开位置。",
  ].join("\n");
}
