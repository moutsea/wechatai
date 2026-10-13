// Preserve protected deep links without allowing an external post-login redirect.
export function authReturnPath(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/app";
  try {
    const url = new URL(value, "https://wechatai.app");
    return url.pathname === "/app" || url.pathname.startsWith("/app/")
      ? `${url.pathname}${url.search}${url.hash}`
      : "/app";
  } catch {
    return "/app";
  }
}
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const AUTH_EMAIL_COOLDOWN_SECONDS = 60;

export function passwordValidationError(password: string, confirmation: string): string {
  if (password.length < PASSWORD_MIN_LENGTH) return "密码至少需要 10 个字符。";
  if (password.length > PASSWORD_MAX_LENGTH) return "密码不能超过 128 个字符。";
  if (password !== confirmation) return "两次输入的密码不一致。";
  return "";
}

export function authErrorMessage(error: { code?: string; status?: number } | null): string {
  if (error?.status === 429) return "操作太频繁，请稍后再试。发送邮件后需等待 60 秒。";
  const messages: Record<string, string> = {
    INVALID_EMAIL: "请输入有效的邮箱地址。",
    PASSWORD_TOO_SHORT: "密码至少需要 10 个字符。",
    PASSWORD_TOO_LONG: "密码不能超过 128 个字符。",
    INVALID_EMAIL_OR_PASSWORD: "邮箱或密码不正确，请重新输入。",
    EMAIL_NOT_VERIFIED: "请先验证邮箱，再登录工作台。",
    EMAIL_ALREADY_VERIFIED: "这个邮箱已验证，可以直接登录。",
    EMAIL_MISMATCH: "请使用当前账号的邮箱。",
    PASSWORD_RESET_REQUIRED:
      "请使用最新邮件中的链接重新设置密码，完成邮箱验证；也可以在下方重发邮件。",
    PASSWORD_RESET_FAILED: "暂时无法保存密码，请稍后重试。",
    INVALID_TOKEN: "链接无效或已过期，请重新发送邮件。",
    TOKEN_EXPIRED: "链接已过期，请重新发送邮件。",
    EMAIL_SERVICE_UNAVAILABLE: "邮件服务暂时不可用，请稍后再试。",
    AUTH_EMAIL_RATE_LIMITED: "邮件发送太频繁，请稍后再试。",
  };
  return messages[error?.code || ""] || "操作未完成，请稍后重试。";
}
