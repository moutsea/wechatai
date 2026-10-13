import { AppError, publicSiteUrl } from "./config";

export function upstreamPaymentError(env: Env, baseUrl: string, status: number): AppError | null {
  if (status !== 402) return null;
  const origin = new URL(baseUrl).origin;
  const kimiseek =
    origin === "https://api.kimiseek.app" ||
    (!!env.KIMISEEK_API_URL && origin === new URL(env.KIMISEEK_API_URL).origin);
  return kimiseek
    ? new AppError(
        "kimiseek_insufficient_balance",
        "KimiSeek 余额不足，无法调用模型。本次未扣微伴 credits。\n\n" +
          "KimiSeek 的模型余额与微伴 credits 分开计算，微伴赠送的 credits 不能抵扣模型服务费用。\n\n" +
          "请打开渠道页面，点击 KimiSeek 渠道的「充值」后重试：\n" +
          new URL("/app/channels", publicSiteUrl(env)).href,
        502,
        status,
      )
    : new AppError(
        "upstream_payment_required",
        "模型服务余额不足或需要付费，请在所选服务商处检查余额与计费状态。模型服务费用与微伴 credits 分开计算，本次未扣微伴 credits。",
        502,
        status,
      );
}
