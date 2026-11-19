import { waitingMessageFields } from "./waiting-message";
import { z } from "zod";
import { openClawInputSchema, openClawManifest, type OpenClawPlugin } from "./openclaw";
import { pluginShortcutJsonSchema } from "./plugin-shortcut";
import { pluginManifestSchema } from "./plugins";

export const GROK_ID = "wechatai/grok" as const;
export type GrokPlugin = Omit<OpenClawPlugin, "pluginId"> & { pluginId: typeof GROK_ID };
export const grokInputSchema = openClawInputSchema.safeExtend({
  agentId: z.literal("main").default("main"),
  ...waitingMessageFields("任务已加入 Grok Bot 队列，完成后会在这里回复。"),
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
  "收到微伴 Webhook 后，使用其中的 taskId 调用 wechatai_claim。只有 claimed 为 true 才执行；" +
  "根据 text 和本次 history 处理请求。重试依赖已截断的要求时先请用户确认，保留 Grok 自身的审批。完成后用领取到的 receipt 和同一 taskId 调用 wechatai_finish，" +
  "成功时提交 completed，最终文字尽量控制在 maxOutputTokens 内。无法完成时提交 failed 并将 text 留空。网络中断只重试同一份回传。工具提示已超时或已结算时停止回传，不重新执行原任务。";
