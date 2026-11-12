const guidance = {
  model_context_limit:
    "任务输入（含系统提示词、历史和工具信息）超过所选模型的输入上限或上下文窗口。请新建会话、缩短内容，或在「渠道与模型」中调整上限后重试。",
  model_auth: "所选模型的身份验证失败。请在「渠道与模型」中检查或更新 API Key 后重试。",
  model_payment: "所选模型服务返回计费或额度错误。请检查服务商账号的余额、套餐或可用额度后重试。",
  model_permission: "所选模型服务拒绝访问。请检查 API Key 的模型权限及服务商的访问限制。",
  model_not_found:
    "所选模型服务地址或模型不可用。请在「渠道与模型」中核对服务地址、接口协议和模型 ID。",
  model_rate_limit:
    "所选模型服务触发限流或额度限制。请检查服务商的可用额度，稍后重试；若持续限流，请降低请求频率或调整服务商限额。",
  model_unavailable:
    "所选模型服务暂时不可用或请求超时。请稍后重试；若持续失败，请检查服务商状态和渠道配置。",
  model_request_invalid:
    "所选模型服务拒绝了请求参数。请检查接口协议、模型 ID、输出上限及工具调用支持；若普通聊天可用但云端仍失败，请联系运营方。",
} as const;

export type CloudAgentFailureCode = keyof typeof guidance;

/** Only accept known codes or AGT's exact legacy diagnostics, never upstream prose. */
export function cloudAgentFailureCode(job: {
  failureCode?: unknown;
  error?: unknown;
}): CloudAgentFailureCode | undefined {
  if (typeof job.failureCode === "string" && Object.hasOwn(guidance, job.failureCode))
    return job.failureCode as CloudAgentFailureCode;
  if (
    job.error === "Model context window exceeded; enable context compaction or reduce the request"
  )
    return "model_context_limit";
  const legacy =
    typeof job.error === "string"
      ? /^Model provider request failed \((\d{3})\)$/.exec(job.error)
      : null;
  switch (Number(legacy?.[1])) {
    case 400:
    case 422:
      return "model_request_invalid";
    case 401:
      return "model_auth";
    case 402:
      return "model_payment";
    case 403:
      return "model_permission";
    case 404:
      return "model_not_found";
    case 429:
      return "model_rate_limit";
    case 408:
    case 409:
      return "model_unavailable";
    default:
      return legacy && Number(legacy[1]) >= 500 ? "model_unavailable" : undefined;
  }
}

export function cloudAgentFailureMessage(code?: CloudAgentFailureCode): string {
  const message = code
    ? guidance[code]
    : "云端任务执行失败。请稍后重试；若持续失败，请联系运营方。";
  return `${message}本次未扣 credits；已发生的模型 API 费用以服务商账单为准。`;
}
