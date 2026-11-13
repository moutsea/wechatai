import { z } from "zod";
import type { PluginAccessIssue } from "./plugin-access";
import { pluginShortcutSchema } from "./plugin-shortcut";
import { isChatModel } from "./model-compatibility";
import type { Assistant } from "./types";
import {
  waitingMessageFields,
  validWaitingMessage,
  waitingMessageValidation,
} from "./waiting-message";

export const CLOUD_AGENT_PLUGIN_ID = "wechatai/cloud-agent";
export const CLOUD_AGENT_VERSION = "1.0.0";
export const CLOUD_AGENT_NAME = "小薇";
export const CLOUD_AGENT_SHORTCUT = "小薇";
// Used before the first workspace is provisioned; existing workspaces report their own quota.
export const CLOUD_AGENT_STORAGE_BYTES = 500 * 1024 * 1024;
export const CLOUD_AGENT_FILE_LIMITS_NOTE =
  "累计存储额度不代表单次处理上限。工作区单文件最大 25 MiB；转换工具单次读取或生成的工作文件，每个最大 2 MiB，输入、输出各合计最大 8 MiB。";

export type CloudAgentStorageUsage = {
  usedBytes: number;
  reservedBytes: number;
  maxTotalBytes: number;
  availableBytes: number;
};

export const CLOUD_AGENT_WAITING_MESSAGE =
  "任务已接收，正在提交小薇；结果会在微信回复，也可在云端任务页查看。";
export const CLOUD_AGENT_PLUS_MESSAGE =
  "小薇是 Plus 会员功能，开通或续费后可提交新任务，已有任务记录仍可查看。";
export const CLOUD_AGENT_UNAVAILABLE_MESSAGE = "运营方尚未开启云端服务，请稍后再试。";
export const CLOUD_AGENT_ADMIN_ONLY_MESSAGE = "小薇目前仅对管理员开放内测。";
export const cloudAgentInputSchema = z
  .object({
    name: z.string().trim().min(1).max(40).default(CLOUD_AGENT_NAME),
    modelId: z.string().trim().max(128).default(""),
    shortcut: pluginShortcutSchema.default(CLOUD_AGENT_SHORTCUT),
    enabled: z.boolean().default(true),
    ...waitingMessageFields(CLOUD_AGENT_WAITING_MESSAGE),
  })
  .refine(validWaitingMessage, waitingMessageValidation);
export type CloudAgentInput = z.infer<typeof cloudAgentInputSchema>;
/** Empty modelId follows the server-resolved ordinary model for the selected WeChat link. */
export function resolveCloudAgentModel<
  T extends Pick<Assistant, "id" | "kind" | "model" | "protocol" | "baseUrl">,
>(
  plugin: Pick<CloudAgentInput, "modelId">,
  models: readonly T[],
  defaultModelId: string | null,
): T | undefined {
  return models.find(
    (model) => model.id === (plugin.modelId || defaultModelId) && isChatModel(model),
  );
}
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
  files?: { id: string; name: string; bytes: number }[];
  error?: string;
  credits?: number;
  /** The original conversation no longer permits automatic result delivery. */
  stale?: boolean;
  delivered?: boolean;
  delivery: "pending" | "sent" | "stale" | "failed";
  stopping?: boolean;
  /** Unbilled generated files are still being received and can be abandoned. */
  canCancelFiles?: boolean;
  /** A submission attempt may exist upstream but its job id is not confirmed. */
  unconfirmed?: boolean;
};

export type CloudAgentTaskPage = {
  tasks: CloudAgentTask[];
  nextCursor: string | null;
};
