import { z } from "zod";
import { pluginManifestSchema } from "./plugins";
import type { OpenClawPlugin } from "./openclaw";
import type { HermesPlugin } from "./hermes";
import type { WebResearchPlugin } from "./web-research";
import {
  IMAGE_WAITING_MESSAGE,
  waitingMessageFields,
  validWaitingMessage,
  waitingMessageValidation,
  waitingMessageProperties,
} from "./waiting-message";

export const imageGenerationInputSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    shortcut: z
      .string()
      .trim()
      .min(1)
      .max(24)
      .regex(/^[\p{L}\p{N}_-]+$/u),
    modelId: z.string().min(1).max(200),
    enabled: z.boolean().default(true),
    ...waitingMessageFields(IMAGE_WAITING_MESSAGE),
  })
  .refine(validWaitingMessage, waitingMessageValidation);
export type ImageGenerationInput = z.infer<typeof imageGenerationInputSchema>;
export type ImageGenerationPlugin = ImageGenerationInput & {
  id: string;
  pluginId: "wechatai/image-generation";
  version: "1.2.0";
  createdAt: number;
  hasKey: boolean;
};
export type UserPlugin = WebResearchPlugin | ImageGenerationPlugin | OpenClawPlugin | HermesPlugin;
export const imageGenerationManifest = pluginManifestSchema.parse({
  protocolVersion: "1.0",
  id: "wechatai/image-generation",
  version: "1.2.0",
  name: "AI 生图",
  author: "Wechatai",
  runtime: "builtin",
  capabilities: {
    input: ["text"],
    output: ["image"],
    sessions: "platform",
    streaming: false,
    cancellation: false,
    approvals: false,
  },
  configSchema: {
    type: "object",
    required: ["name", "shortcut", "modelId"],
    properties: {
      name: { type: "string", maxLength: 40 },
      shortcut: { type: "string", maxLength: 24 },
      modelId: {
        type: "string",
        description:
          "Image model in an existing channel; the host uses its base URL and credential with /v1/images/generations, independently of the channel chat protocol.",
      },
      enabled: { type: "boolean", default: true },
      ...waitingMessageProperties(IMAGE_WAITING_MESSAGE),
    },
  },
  permissions: { modelAccess: true, networkOrigins: [], storage: false },
});
