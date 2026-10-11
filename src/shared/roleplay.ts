import { z } from "zod";
import { pluginManifestSchema } from "./plugins";
import { roleAvatarIds } from "./plugin-visuals";

export const loreEntrySchema = z.object({
  name: z.string().trim().max(100).default(""),
  keys: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  secondaryKeys: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  content: z.string().trim().min(1).max(6000),
  enabled: z.boolean().default(true),
  constant: z.boolean().default(false),
  caseSensitive: z.boolean().default(false),
  priority: z.number().int().min(-10000).max(10000).default(0),
});
export type LoreEntry = z.infer<typeof loreEntrySchema>;
export const roleplayInputSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    avatar: z.enum(roleAvatarIds).default(""),
    shortcut: z
      .string()
      .trim()
      .min(1)
      .max(24)
      .regex(/^[\p{L}\p{N}_-]+$/u),
    modelId: z.string().min(1).max(200),
    enabled: z.boolean().default(true),
    description: z.string().trim().min(1).max(16000),
    personality: z.string().trim().max(6000).default(""),
    userName: z.string().trim().max(80).default("你"),
    userPersona: z.string().trim().max(6000).default(""),
    scenario: z.string().trim().max(8000).default(""),
    firstMessage: z.string().trim().max(6000).default(""),
    examples: z.string().trim().max(16000).default(""),
    instructions: z.string().trim().max(8000).default(""),
    postHistoryInstructions: z.string().trim().max(4000).default(""),
    lore: z.array(loreEntrySchema).max(50).default([]),
    loreTokenBudget: z.number().int().min(0).max(4000).default(1000),
    // Opaque import data is never interpreted as executable code or prompt material.
    sourceCard: z.string().max(64000).default(""),
  })
  .refine((v) => new TextEncoder().encode(JSON.stringify(v)).length <= 120000, {
    message: "角色配置过大，请减少设定或世界书内容（总计最多 120 KB）",
  });
export type RoleplayInput = z.infer<typeof roleplayInputSchema>;
export type RoleplayPlugin = RoleplayInput & {
  id: string;
  pluginId: "wechatai/roleplay";
  version: "1.0.0";
  createdAt: number;
  hasKey: boolean;
};
export const roleplayManifest = pluginManifestSchema.parse({
  protocolVersion: "1.0",
  id: "wechatai/roleplay",
  version: "1.0.0",
  name: "角色扮演",
  author: "Wechatai",
  runtime: "builtin",
  capabilities: {
    input: ["text", "image"],
    output: ["text"],
    sessions: "platform",
    streaming: false,
    cancellation: false,
    approvals: false,
  },
  configSchema: z.toJSONSchema(roleplayInputSchema, { io: "input" }),
  permissions: { modelAccess: true, networkOrigins: [], storage: false },
});

export function roleVariables(text: string, role: Pick<RoleplayInput, "name" | "userName">) {
  return text.replace(/\{\{(char|user)\}\}/gi, (_, key: string) =>
    key.toLowerCase() === "char" ? role.name : role.userName || "你",
  );
}
