import { z } from "zod";
import { pluginManifestSchema } from "./plugins";

export const notificationInputSchema = z.object({
  name: z.string().trim().min(1).max(40).default("消息提醒"),
  connectionId: z.string().min(1).max(200),
  enabled: z.boolean().default(true),
});
export type NotificationInput = z.infer<typeof notificationInputSchema>;
export type NotificationPlugin = NotificationInput & {
  id: string;
  pluginId: "wechatai/notification";
  version: "1.0.0";
  createdAt: number;
  hasKey: boolean;
  // Internal unique alias for the common plugin registry; this is a receive-only plugin.
  shortcut: string;
};
export const notificationMessageSchema = z.union([
  z
    .object({
      title: z.string().trim().max(120).default(""),
      text: z.string().trim().min(1).max(4000),
    })
    .strict(),
  z
    .object({
      msg_type: z.literal("text"),
      content: z.object({ text: z.string().trim().min(1).max(4000) }).strict(),
    })
    .strict()
    .transform((v) => ({ title: "", text: v.content.text })),
]);
export type NotificationMessage = z.infer<typeof notificationMessageSchema>;
export type NotificationReceipt = {
  id: string;
  title: string;
  state: "pending" | "sending" | "sent" | "failed" | "cancelled";
  createdAt: number;
  sentAt: number | null;
  attempts: number;
  error: string;
};
export type NotificationStatus = {
  endpoint: string;
  hasToken: boolean;
  deliveries: NotificationReceipt[];
};
export const notificationManifest = pluginManifestSchema.parse({
  protocolVersion: "1.0",
  id: "wechatai/notification",
  version: "1.0.0",
  name: "消息提醒",
  author: "Wechatai",
  runtime: "builtin",
  capabilities: {
    input: ["text"],
    output: ["text"],
    sessions: "none",
    streaming: false,
    cancellation: false,
    approvals: false,
  },
  configSchema: {
    type: "object",
    required: ["connectionId"],
    properties: {
      name: { type: "string", maxLength: 40 },
      connectionId: { type: "string" },
      enabled: { type: "boolean", default: true },
    },
  },
  permissions: { modelAccess: false, networkOrigins: [], storage: true },
});
