import { z } from "zod";

export const OPENCLAW_WAITING_MESSAGE = "已成功转发，等待回复...";
export const IMAGE_WAITING_MESSAGE = "已提交 AI 生图，等待上游返回...";
export const MAX_WAITING_MESSAGE_LENGTH = 300;
export type WaitingMessageSettings = {
  waitingMessageEnabled: boolean;
  waitingMessage: string;
};

export function waitingMessageFields(defaultMessage: string) {
  return {
    waitingMessageEnabled: z.boolean().default(true),
    waitingMessage: z.string().trim().max(MAX_WAITING_MESSAGE_LENGTH).default(defaultMessage),
  };
}
export const validWaitingMessage = (settings: WaitingMessageSettings) =>
  !settings.waitingMessageEnabled || Boolean(settings.waitingMessage.trim());
export const waitingMessageValidation = {
  message: "请输入等待提示文案，或关闭等待提示",
  path: ["waitingMessage"],
};
export function waitingMessageDefaults(defaultMessage: string): WaitingMessageSettings {
  return { waitingMessageEnabled: true, waitingMessage: defaultMessage };
}
export function waitingMessageProperties(defaultMessage: string) {
  return {
    waitingMessageEnabled: { type: "boolean", default: true },
    waitingMessage: {
      type: "string",
      maxLength: MAX_WAITING_MESSAGE_LENGTH,
      default: defaultMessage,
      description:
        "User-visible progress notice; not forwarded to the plugin or billed. Required when enabled.",
    },
  };
}
