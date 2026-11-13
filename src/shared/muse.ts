import { z } from "zod";
import { openClawInputSchema, openClawManifest, type OpenClawPlugin } from "./openclaw";
import { pluginManifestSchema } from "./plugins";

export const museInputSchema = openClawInputSchema.safeExtend({
  agentId: z.literal("main").default("main"),
});
export type MusePlugin = Omit<OpenClawPlugin, "pluginId"> & { pluginId: "wechatai/muse" };
export const museManifest = pluginManifestSchema.parse({
  ...openClawManifest,
  id: "wechatai/muse",
  name: "Muse",
  capabilities: { ...openClawManifest.capabilities, commands: "platform" },
  configSchema: {
    ...openClawManifest.configSchema,
    properties: {
      ...(openClawManifest.configSchema.properties as Record<string, unknown>),
      agentId: { type: "string", const: "main", default: "main" },
      maxInputTokens: {
        type: "integer",
        minimum: 256,
        maximum: 2000000,
        default: 128000,
        description: "仅限制本条发送的文字，不包含 Muse 自身的历史、记忆或工具输入。",
      },
    },
  },
});
