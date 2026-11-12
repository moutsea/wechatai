import { z } from "zod";
import type { PluginAccessIssue } from "./plugin-access";
import { pluginShortcutSchema } from "./plugin-shortcut";
import {
  waitingMessageFields,
  validWaitingMessage,
  waitingMessageValidation,
} from "./waiting-message";

export const CLOUD_AGENT_PLUGIN_ID = "wechatai/cloud-agent";
export const CLOUD_AGENT_VERSION = "1.0.0";

export const CLOUD_AGENT_WAITING_MESSAGE =
  "任务已接收，正在提交云端 Agent；结果会在微信回复，也可在云端任务页查看。";
export const CLOUD_AGENT_PLUS_MESSAGE =
  "云端 Agent 是 Plus 会员功能，开通或续费后可提交新任务，已有任务记录仍可查看。";
export const CLOUD_AGENT_UNAVAILABLE_MESSAGE = "运营方尚未开启云端服务，请稍后再试。";
export const CLOUD_AGENT_ADMIN_ONLY_MESSAGE = "云端 Agent 目前仅对管理员开放内测。";
export const cloudAgentInputSchema = z
  .object({
    name: z.string().trim().min(1).max(40).default("云端 Agent"),
    modelId: z.string().trim().max(128).default(""),
    shortcut: pluginShortcutSchema.default("云"),
    enabled: z.boolean().default(true),
    ...waitingMessageFields(CLOUD_AGENT_WAITING_MESSAGE),
  })
  .refine(validWaitingMessage, waitingMessageValidation);
export type CloudAgentInput = z.infer<typeof cloudAgentInputSchema>;
export type CloudAgentStatus = {
  ready: boolean;
  adminPreview?: boolean;
  reason?: string;
  maxActive: number;
  dailyLimit: number;
  usedToday: number;
  active: number;
  deadlineMinutes: number;
};
export function cloudAgentAvailabilityIssue(
  plan: "free" | "plus",
  status: Pick<CloudAgentStatus, "ready" | "reason">,
) {
  if (!status.ready)
    return {
      code: "cloud_agent_unavailable" as const,
      message: status.reason ?? CLOUD_AGENT_UNAVAILABLE_MESSAGE,
    };
  if (plan !== "plus")
    return { code: "cloud_plus_required" as const, message: CLOUD_AGENT_PLUS_MESSAGE };
  return null;
}
export type CloudAgentPlugin = CloudAgentInput & {
  id: string;
  pluginId: typeof CLOUD_AGENT_PLUGIN_ID;
  version: typeof CLOUD_AGENT_VERSION;
  createdAt: number;
  hasKey: boolean;
  access?: PluginAccessIssue | null;
  status?: CloudAgentStatus;
};
export function isCloudAgent<T extends { pluginId: string }>(
  plugin: T | null | undefined,
): plugin is Extract<T, { pluginId: typeof CLOUD_AGENT_PLUGIN_ID }> {
  return plugin?.pluginId === CLOUD_AGENT_PLUGIN_ID;
}

/** Public task history. Never include upstream identities, credentials or raw requests. */
export type CloudAgentTaskStatus =
  | "submitting"
  | "queued"
  | "running"
  | "awaiting_approval"
  | "finalizing"
  | "completed"
  | "failed"
  | "cancelled";

export type CloudAgentTask = {
  id: string;
  pluginInstanceId: string;
  pluginName: string;
  sessionId: string | null;
  sessionTitle: string;
  prompt: string;
  status: CloudAgentTaskStatus;
  upstreamStatus?: string;
  createdAt: number;
  updatedAt: number;
  result?: string;
  error?: string;
  credits?: number;
  /** The original conversation no longer permits automatic result delivery. */
  stale?: boolean;
  delivered?: boolean;
  delivery: "pending" | "sent" | "stale" | "failed";
  stopping?: boolean;
  /** A submission attempt may exist upstream but its job id is not confirmed. */
  unconfirmed?: boolean;
};

export type CloudAgentTaskPage = {
  tasks: CloudAgentTask[];
  nextCursor: string | null;
};
