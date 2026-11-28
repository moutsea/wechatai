import { formatCopy } from "./i18n/dashboard";
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
  /** When the registration window closes; 0 when none is open. */
  setupUntil?: number;
  /** When a Routine Webhook was last registered or saved, by the server clock. */
  registeredAt?: number;
};
/** How long a configuration prompt may register a Routine Webhook after it is generated. */
export const GROK_SETUP_MINUTES = 30;
export const GROK_SETUP_INCOMPLETE =
  "Grok Bot 还没完成配置。请在微伴网页的 Grok Bot 配置中复制配置指令，发给你的 Grok Bot。";
/** For WeChat messages while the Bot has never used the current credential. */
export const GROK_AWAITING_BOT =
  "Grok Bot 还没用当前的连接凭据连上微伴，这条消息没有发给它。请让 Grok Bot 按配置指令连上「微伴」，例如让它调用一次「微伴」的工具，完成后再发送。";
/** Sent to WeChat for open tasks when the owner issues a new connection credential. */
export const GROK_RECONNECT_PENDING =
  "Grok Bot 正在重新连接，这条任务没有交给 Grok Bot，未扣平台 credits。重新连接完成后请重新发送。";
export const GROK_RECONNECT_CLAIMED =
  "Grok Bot 正在重新连接，这条任务已关闭，未扣平台 credits。Grok Bot 可能仍在处理，结果不会再发回这里，请到 Grok Bot 查看运行记录。";
export const GROK_REVOKED_PENDING =
  "Grok Bot 的连接凭据已撤销，这条任务没有交给 Grok Bot，未扣平台 credits。";
export const GROK_REVOKED_CLAIMED =
  "Grok Bot 的连接凭据已撤销，这条任务已关闭，未扣平台 credits。Grok Bot 可能仍在处理，结果不会再发回这里，请到 Grok Bot 查看运行记录。";
/** For woken tasks the old Routine never claimed when the Bot registers another one. */
export const GROK_ROUTINE_CHANGED =
  "Grok Bot 换了接收任务的 Routine，这条任务没有被领取，未扣平台 credits。请重新发送。";
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
  "根据 text 和本次 history 处理请求。重试依赖已截断的要求时先请用户确认，保留 Grok 自身的审批。需要回复图片时，按领取结果中 imageUpload 的说明用 curl 逐张上传，记下返回的 imageId。" +
  "完成后用领取到的 receipt 和同一 taskId 调用 wechatai_finish，成功时提交 completed，有图片时一并提交 images，最终文字尽量控制在 maxOutputTokens 内。无法完成时提交 failed 并将 text 留空。网络中断只重试同一份回传。工具提示已超时或已结算时停止回传，不重新执行原任务。";

// One message for the user's own Grok Bot chat. The Bot adds the MCP connector,
// creates the Webhook Routine and returns its URL and key through the connector.
export function grokSetupPrompt(
  input: { endpoint: string; token: string; shortcut: string },
  translate = formatCopy,
) {
  // Names remain stable when reconnecting a previously configured Bot.
  const values = {
    ...input,
    connector: "微伴",
    routine: "微伴微信任务",
    minutes: GROK_SETUP_MINUTES,
  };
  return [
    translate(
      "请帮我把你接入微伴（wechatai.app），让我能在微信里把文字任务交给你，你回复的文字和图片会发回微信。按顺序完成以下步骤：",
    ),
    "",
    translate(
      "1. 配置名为「{connector}」的远程 MCP 服务器（Remote HTTPS），地址 {endpoint}，请求头 Authorization: Bearer {token}。如果已经有名为「{connector}」的连接器，只更新它的地址和请求头，不要再添加一个。",
      values,
    ),
    translate(
      "2. 配置名为「{routine}」的 Routine，只用 Webhook 触发，不加定时或其他触发。已有同名 Routine 时更新它的指令并沿用它，不要新建。Routine 指令如下：",
      values,
    ),
    translate(grokRoutineInstructions),
    translate(
      "3. 读取这个 Routine 的 Webhook POST 地址和 key，调用「{connector}」的 wechatai_register_webhook 工具提交。key 不含 Bearer 前缀。请在 {minutes} 分钟内完成这一步。工具返回成功后不必再次调用。",
      values,
    ),
    translate(
      "4. 工具返回成功后告诉我「配置完成」，我会在微信发 @{shortcut} 加一句任务来测试。如果读取不到 Webhook 地址或 key，请告诉我在桌面端哪里复制，我会手动填到微伴。",
      values,
    ),
    "",
    translate("这段指令含有微伴的连接凭据，只用于这次配置，不要发给别人，也不要保存到公开位置。"),
  ].join("\n");
}

// Reopened registration keeps the existing connector and carries no credential.
export function grokReopenPrompt(input: { shortcut: string }, translate = formatCopy) {
  const values = {
    ...input,
    connector: "微伴",
    routine: "微伴微信任务",
    minutes: GROK_SETUP_MINUTES,
  };
  return [
    translate("微伴的 Webhook 登记已重新开放，{minutes} 分钟内有效。请继续完成接入：", values),
    "",
    translate(
      "1. 确认已有名为「{connector}」的 MCP 连接器，并且「{routine}」Routine 已建好。缺哪一项，就按之前那段配置指令补上，不要重复添加。",
      values,
    ),
    translate(
      "2. 读取「{routine}」的 Webhook POST 地址和 key，调用「{connector}」的 wechatai_register_webhook 工具提交。key 不含 Bearer 前缀。",
      values,
    ),
    translate(
      "3. 工具返回成功后告诉我「配置完成」，我会在微信发 @{shortcut} 加一句任务来测试。",
      values,
    ),
  ].join("\n");
}
