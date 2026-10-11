import { z } from "zod";
import { pluginManifestSchema } from "./plugins";
import { DEFAULT_INPUT_TOKENS, MAX_CONTEXT_TOKENS } from "./context";
import {
  OPENCLAW_WAITING_MESSAGE,
  waitingMessageFields,
  validWaitingMessage,
  waitingMessageValidation,
  waitingMessageProperties,
} from "./waiting-message";

export const openClawAgentsSchema = z
  .array(
    z.object({
      id: z
        .string()
        .min(1)
        .max(64)
        .regex(/^[a-zA-Z0-9_-]+$/),
      name: z.string().trim().min(1).max(80),
      isDefault: z.boolean().default(false),
    }),
  )
  .min(1)
  .max(100)
  .refine((agents) => new Set(agents.map((a) => a.id)).size === agents.length);
export type OpenClawAgent = z.infer<typeof openClawAgentsSchema>[number];
export type OpenClawPairing = { command: string; expiresAt: number };
export type OpenClawStatus = {
  pairingClaimed?: boolean;
  nativeCommands?: boolean;
  hasKey: boolean;
  lastSeen: number;
  agents: OpenClawAgent[];
  agentId: string;
  deliveries: { id: string; state: string; createdAt: number }[];
};

export const openClawInputSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    shortcut: z
      .string()
      .trim()
      .min(1)
      .max(24)
      .regex(/^[\p{L}\p{N}_-]+$/u),
    agentId: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z0-9_-]+$/)
      .default("main"),
    enabled: z.boolean().default(true),
    allowProactive: z.boolean().default(true),
    maxInputTokens: z.number().int().min(256).max(MAX_CONTEXT_TOKENS).default(DEFAULT_INPUT_TOKENS),
    maxOutputTokens: z.number().int().min(256).max(16000).default(4096),
    ...waitingMessageFields(OPENCLAW_WAITING_MESSAGE),
  })
  .refine(validWaitingMessage, waitingMessageValidation);
export type OpenClawInput = z.infer<typeof openClawInputSchema>;
export type OpenClawPlugin = OpenClawInput & {
  id: string;
  pluginId: "wechatai/openclaw";
  version: "1.0.0";
  createdAt: number;
  hasKey: boolean;
  lastSeen?: number;
  agents?: OpenClawAgent[];
};
export const openClawManifest = pluginManifestSchema.parse({
  protocolVersion: "1.0",
  id: "wechatai/openclaw",
  version: "1.0.0",
  name: "OpenClaw",
  author: "Wechatai",
  runtime: "builtin",
  capabilities: {
    input: ["text"],
    output: ["text"],
    sessions: "remote",
    streaming: false,
    // Native /stop is supported; protocol-level cancellation is not yet exposed.
    cancellation: false,
    approvals: false,
    commands: "native",
  },
  configSchema: {
    type: "object",
    required: ["name", "shortcut", "agentId"],
    properties: {
      name: { type: "string" },
      shortcut: { type: "string" },
      agentId: { type: "string", default: "main" },
      enabled: { type: "boolean", default: true },
      allowProactive: { type: "boolean", default: true },
      ...waitingMessageProperties(OPENCLAW_WAITING_MESSAGE),
      maxInputTokens: {
        type: "integer",
        minimum: 256,
        maximum: MAX_CONTEXT_TOKENS,
        default: DEFAULT_INPUT_TOKENS,
        description: "仅限制本条发送的文字，不包含 OpenClaw 的历史对话、系统提示词或内部工具输入。",
      },
      maxOutputTokens: { type: "integer", minimum: 256, maximum: 16000, default: 4096 },
    },
  },
  permissions: { modelAccess: false, networkOrigins: [], storage: true },
});
