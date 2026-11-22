// Only recognized policy errors get recovery links; never display upstream HTML or URLs.
const emailErrors = {
  EMAIL_VERIFICATION_REQUIRED: {
    message: "请先验证微伴账号的邮箱，再回到渠道与模型重新点击 KimiSeek 一键导入。",
    href: "/verify-email?returnTo=%2Fapp%2Fchannels%3Fnew%3D1",
    label: "验证邮箱",
  },
  EMAIL_DOMAIN_BLOCKED: {
    message:
      "KimiSeek 暂不支持此邮箱注册。请用 QQ、163/126、Gmail、Outlook 等受支持邮箱注册 KimiSeek，再回微伴手动添加 API Key。",
    href: "/docs/model-providers#kimiseek",
    label: "查看手动接入步骤",
  },
} as const;

export function kimiseekEmailError(
  code: unknown,
): ({ code: KimiseekEmailErrorCode } & (typeof emailErrors)[KimiseekEmailErrorCode]) | undefined {
  if (code === "EMAIL_VERIFICATION_REQUIRED" || code === "EMAIL_DOMAIN_BLOCKED")
    return { code, ...emailErrors[code] };
  return undefined;
}

export type KimiseekEmailErrorCode = keyof typeof emailErrors;
