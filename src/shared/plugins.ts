import { z } from "zod";

export const PLUGIN_PROTOCOL_VERSION = "1.0" as const;
export const BILLING_POLICY_VERSION = "gateway-v1" as const;
export const TOKENIZER_VERSION = "cl100k_base@gpt-tokenizer-4.0.0" as const;
export const IMAGE_CREDITS = 5;
const id = z.string().min(1).max(200);
const version = z.string().regex(/^\d+\.\d+\.\d+$/);
const modality = z.enum(["text", "image", "file"]);

// A catalog definition, an installed instance and a run have independent identities.
export const pluginManifestSchema = z
  .object({
    protocolVersion: z.literal(PLUGIN_PROTOCOL_VERSION),
    id: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/),
    version,
    name: z.string().min(1).max(80),
    author: z.string().min(1).max(100),
    runtime: z.enum(["builtin", "remote", "sandbox"]),
    capabilities: z
      .object({
        input: z.array(modality).min(1),
        output: z.array(modality).min(1),
        sessions: z.enum(["none", "platform", "remote"]),
        streaming: z.boolean(),
        cancellation: z.boolean(),
        approvals: z.boolean(),
        // Optional for protocol 1.0 manifests authored before command routing existed.
        commands: z.enum(["platform", "native"]).default("platform"),
      })
      .strict(),
    configSchema: z.record(z.string(), z.unknown()),
    permissions: z
      .object({
        modelAccess: z.boolean(),
        networkOrigins: z.array(z.string().url()).max(30),
        storage: z.boolean(),
      })
      .strict(),
  })
  .strict();
export const pluginBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().max(8_000_000) }).strict(),
  // Assets must be resolved in the platform's account/run scope, never fetched from arbitrary URLs.
  z.object({ type: z.literal("image"), assetId: id }).strict(),
  z.object({ type: z.literal("file"), assetId: id }).strict(),
]);
export const pluginInvocationSchema = z
  .object({
    protocolVersion: z.literal(PLUGIN_PROTOCOL_VERSION),
    runId: id,
    instanceId: id,
    pluginId: id,
    pluginVersion: version,
    sessionId: id.nullable(),
    messages: z
      .array(
        z
          .object({
            role: z.enum(["system", "user", "assistant"]),
            content: z.array(pluginBlockSchema).max(100),
          })
          .strict(),
      )
      .max(20_001),
    limits: z
      .object({
        inputTokens: z.number().int().min(1).max(2_000_000),
        outputTokens: z.number().int().min(1).max(2_000_000),
        outputImages: z.number().int().min(0).max(20),
        // Null means no optional spending cap; never a plugin-supplied value.
        creditUnits: z.number().int().min(0).max(1_000_000_000).nullable(),
      })
      .strict(),
  })
  .strict();
export const pluginResultSchema = z
  .object({
    protocolVersion: z.literal(PLUGIN_PROTOCOL_VERSION),
    runId: id,
    status: z.enum(["completed", "partial"]),
    content: z.array(pluginBlockSchema).min(1).max(100),
  })
  .strict();
export const pluginEventSchema = z
  .object({
    protocolVersion: z.literal(PLUGIN_PROTOCOL_VERSION),
    runId: id,
    eventId: id,
    sequence: z.number().int().nonnegative(),
    type: z.enum([
      "accepted",
      "progress",
      "text.delta",
      "approval.required",
      "completed",
      "failed",
      "cancelled",
    ]),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();
export type PluginManifest = z.infer<typeof pluginManifestSchema>;
export type PluginInvocation = z.infer<typeof pluginInvocationSchema>;
export type PluginResult = z.infer<typeof pluginResultSchema>;
export type PluginBlock = z.infer<typeof pluginBlockSchema>;
export type PlatformMeter = {
  policyVersion: typeof BILLING_POLICY_VERSION;
  tokenizerVersion: typeof TOKENIZER_VERSION;
  inputTokens: number;
  outputTokens: number;
  outputImages: number;
  units: number;
};

// Public definition shared by the adapter, documentation and contract examples.
export const llmChatManifest = pluginManifestSchema.parse({
  protocolVersion: PLUGIN_PROTOCOL_VERSION,
  id: "wechatai/llm-chat",
  version: "1.0.0",
  name: "LLM 对话",
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
  configSchema: {
    type: "object",
    required: ["modelId"],
    properties: { modelId: { type: "string" } },
  },
  permissions: { modelAccess: true, networkOrigins: [], storage: false },
});
