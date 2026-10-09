import { z } from "zod";
import { openClawInputSchema, openClawManifest, type OpenClawInput } from "./openclaw";
import { pluginManifestSchema } from "./plugins";

export const hermesInputSchema = openClawInputSchema.safeExtend({
  agentId: z.literal("main").default("main"),
});
export type HermesPlugin = OpenClawInput & {
  id: string;
  pluginId: "wechatai/hermes";
  version: "1.0.0";
  createdAt: number;
  hasKey: boolean;
  lastSeen?: number;
  agents?: { id: string; name: string; isDefault: boolean }[];
};
export const hermesManifest = pluginManifestSchema.parse({
  ...openClawManifest,
  id: "wechatai/hermes",
  name: "Hermes",
  configSchema: {
    ...openClawManifest.configSchema,
    properties: {
      ...(openClawManifest.configSchema.properties as Record<string, unknown>),
      agentId: {
        type: "string",
        const: "main",
        default: "main",
        description: "使用当前 Hermes profile，无需填写 Agent ID。",
      },
      maxInputTokens: {
        type: "integer",
        minimum: 256,
        maximum: 2000000,
        default: 128000,
        description: "仅限制本条发送的文字，不包含 Hermes 历史、系统提示词或内部工具输入。",
      },
    },
  },
});
