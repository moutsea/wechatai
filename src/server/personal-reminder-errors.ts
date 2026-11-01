import type { ReminderFailureReason } from "../shared/personal-assistant";
import { AppError } from "./config";
import { WechatRequestError } from "./wechat";

export function reminderFailureReason(error: unknown): ReminderFailureReason {
  if (error instanceof WechatRequestError) {
    const { code, upstreamStatus, ret, errcode } = error;
    const message =
      code === "wechat_expired"
        ? "微信登录凭据已失效。"
        : code === "wechat_unavailable"
          ? upstreamStatus === 401 || upstreamStatus === 403
            ? `微信接口拒绝请求（HTTP ${upstreamStatus}）。`
            : `微信接口暂时不可用（HTTP ${upstreamStatus}）。`
          : ret === -2 || errcode === -2
            ? "微信拒绝发送，可能是会话凭据失效或发送受限。"
            : "微信接口返回发送失败。";
    return { code, message, upstreamStatus, ret, errcode };
  }
  if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name))
    return { code: "wechat_timeout", message: "微信发送请求超时。" };
  if (error instanceof AppError && /^[a-z][a-z0-9_]{0,63}$/.test(error.code)) {
    const messages: Record<string, string> = {
      upstream_empty: "微信接口返回空响应。",
      upstream_format: "微信接口未返回有效 JSON。",
      upstream_too_large: "微信接口返回的数据超过大小限制。",
      wechat_host: "微信连接地址无效，请重新扫码连接。",
      record_missing: "提醒记录已删除或变更。",
    };
    return {
      code: error.code,
      message: messages[error.code] ?? "提醒发送过程中发生异常。",
      upstreamStatus: error.upstreamStatus,
    };
  }
  // Arbitrary exception messages can include credentials, request URLs or content.
  return { code: "reminder_delivery_error", message: "提醒发送过程中发生异常。" };
}
