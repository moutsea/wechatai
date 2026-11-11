import { AppError } from "./config";

/** Fixed invocation limits cannot recover by retrying the same persisted input. */
export function cloudAgentMeteringFailure(error: unknown): string | null {
  if (!(error instanceof AppError)) return null;
  switch (error.code) {
    case "input_limit_exceeded":
      return "输入超过本次平台上限，本次未扣 credits。请缩短内容后重新发送。";
    case "budget_too_small":
      return "本次 credits 上限不足以处理输入，未扣 credits。请缩短内容后重新发送；若持续失败，请联系运营方。";
    case "plugin_empty_result":
      return "本次上限内没有可用结果，未扣 credits。请缩小任务范围后重试；若持续失败，请联系运营方。";
    default:
      return null;
  }
}
