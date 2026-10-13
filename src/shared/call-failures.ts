// Fixed categories only: raw provider errors can contain user content or credentials.
export const callFailureReasons: Record<string, string> = {
  legacy_unknown: "历史失败（未记录具体原因）",
  request_failed: "请求未完成（未识别的错误）",
  kimiseek_insufficient_balance: "KimiSeek 余额不足",
  upstream_payment_required: "上游余额不足或需要付费",
  model_http_error: "模型服务请求失败",
  image_upstream: "生图服务请求失败",
  remote_agent_failed: "远程 Agent 任务未完成",
  request_timeout: "请求超时",
  image_timeout: "生图请求超时",
  empty_reply: "模型未返回内容",
  model_failed: "模型未能完成请求",
  tool_call_incomplete: "模型的工具调用被截断",
  tool_call_invalid: "模型返回无效的工具调用",
  plugin_empty_result: "插件未返回可用结果",
  empty_result: "模型或插件未返回内容",
  context_limit: "超出模型上下文上限",
  message_too_long: "输入超过上限",
  invalid_context_window: "模型输入输出配置冲突",
  budget_too_small: "单次 credits 上限不足",
  image_download: "生成图片下载失败",
  image_response: "生图响应格式不正确",
  image_size: "生成图片超过大小上限",
  unsafe_url: "模型服务地址不符合要求",
  model_redirect: "模型服务地址发生跳转",
  context_changed: "处理期间会话已变更",
  insufficient_credits: "微伴 Credits 不足",
  search_failed: "搜索服务请求失败",
  interrupted_request: "处理进程中断",
  personal_recovery_expired: "助理任务恢复超时",
  personal_recovery_changed: "恢复期间配置或会话已变更",
  personal_recovery_missing: "任务恢复进度不完整",
};

export function callFailureReason(code: string | null, status: number | null = null) {
  const reason = callFailureReasons[code ?? ""] ?? callFailureReasons.request_failed;
  const detail =
    status === 401 || status === 403
      ? "鉴权或权限失败"
      : status === 404
        ? "接口或模型不存在"
        : status === 429
          ? "限流或额度限制"
          : status !== null && status >= 500
            ? "上游服务异常"
            : "";
  return `${reason}${status ? `（HTTP ${status}${detail ? ` · ${detail}` : ""}）` : ""}`;
}
