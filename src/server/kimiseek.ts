import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { AppError, secret } from "./config";
import { readJson } from "./security";
import type { ModelImportResult } from "../shared/types";

export type KimiseekIdentity = { id: string; email: string; emailVerified: boolean; name: string };
export type KimiseekFlow = {
  id: string;
  expires: number;
  status: "pending" | "working" | "complete" | "failed";
  operation: "connect" | "recharge";
  message?: string;
  channelId?: string;
  modelImport?: ModelImportResult;
};
export const balanceSchema = z.object({
  amount: z.number().finite().nonnegative(),
  currency: z.literal("CNY"),
  checkedAt: z.number(),
});
export const kimiseekResponseSchema = z.object({
  apiKey: z.string().min(1).max(2000).optional(),
  models: z.array(z.record(z.string(), z.unknown())).max(10000).optional(),
  balance: balanceSchema,
  code: z
    .string()
    .regex(/^[A-Za-z0-9_-]{32,128}$/)
    .optional(),
});
export type KimiseekResponse = z.infer<typeof kimiseekResponseSchema>;
export type KimiseekCommand =
  | { action: "start"; operation: "connect" | "recharge" }
  | { action: "status"; id: string }
  | { action: "claim"; id: string }
  | { action: "complete"; id: string; result: KimiseekResponse }
  | { action: "fail"; id: string; message: string }
  | { action: "balance"; identity: KimiseekIdentity };
export async function callKimiseek<T>(
  account: DurableObjectStub<import("./personal-account").PersonalAccount>,
  command: KimiseekCommand,
): Promise<T> {
  const result = JSON.parse(await account.kimiseek(command));
  if (!result.ok) throw new AppError(result.error, result.message, result.status);
  return result.data as T;
}
export const integrationNonce = () => randomBytes(32).toString("base64url");
export const validIntegrationNonce = (value: string) => /^[A-Za-z0-9_-]{32,128}$/.test(value);
export function kimiseekConfig(env: Env) {
  const signingKey = secret(env, "KIMISEEK_CONNECT_SECRET", false);
  if (signingKey.length < 32)
    throw new AppError("kimiseek_unconfigured", "KimiSeek 一键关联尚未配置，请联系管理员", 503);
  const origin = new URL(secret(env, "KIMISEEK_URL", false) || "https://kimiseek.app").origin;
  const apiUrl = (secret(env, "KIMISEEK_API_URL", false) || "https://api.kimiseek.app").replace(
    /\/+$/,
    "",
  );
  return { origin, apiUrl, signingKey };
}
export async function kimiseekRequest(
  env: Env,
  identity: KimiseekIdentity,
  operation: "connect" | "recharge" | "balance",
  flow?: { id: string; state: string; challenge: string },
) {
  const config = kimiseekConfig(env);
  const time = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    iss: new URL(env.APP_URL).origin,
    aud: config.origin,
    sub: identity.id,
    iat: time,
    exp: time + 60,
    jti: integrationNonce(),
    operation,
    ...(operation === "connect"
      ? { email: identity.email, emailVerified: identity.emailVerified, name: identity.name }
      : {}),
    ...(flow ? { flow: flow.id, state: flow.state, challenge: flow.challenge } : {}),
  });
  try {
    const binding = Reflect.get(env, "KIMISEEK_SERVICE") as Fetcher | undefined;
    const request = new Request(`${config.origin}/api/integrations/wechatai`, {
      method: "POST",
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
      headers: {
        "content-type": "application/json",
        "x-wechatai-signature": createHmac("sha256", config.signingKey).update(body).digest("hex"),
      },
    });
    const response = await (binding ? binding.fetch(request) : fetch(request));
    if (!response.ok) {
      await response.body?.cancel();
      throw new AppError(
        "kimiseek_unavailable",
        response.status === 404
          ? "尚未关联 KimiSeek，请先一键导入"
          : "KimiSeek 关联服务暂不可用，请稍后重试",
        502,
      );
    }
    return kimiseekResponseSchema.parse(await readJson(response));
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("kimiseek_unavailable", "KimiSeek 连接超时或响应异常，请稍后重试", 502);
  }
}
