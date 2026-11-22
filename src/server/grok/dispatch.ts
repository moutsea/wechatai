import { createHash } from "node:crypto";
import { z } from "zod";
import { GROK_DISPATCH_UNAVAILABLE } from "../../shared/grok-bot";
import { backendOrigin, signedRequest } from "../backend-signature";
import { AppError, secret } from "../config";
import { encrypt, decrypt } from "../security";

// Never allow a user-controlled URL to choose where a provider credential is sent.
const routineURL = /^https:\/\/api2\.cursor\.sh\/automations\/webhook\/[A-Za-z0-9_-]{1,256}$/;
const credentials = z.object({
  webhookUrl: z
    .string()
    .trim()
    .regex(routineURL, "请输入 Grok Bot 桌面端复制的 Routine Webhook URL"),
  webhookKey: z
    .string()
    .trim()
    .min(1)
    .max(2048)
    .regex(/^[\x21-\x7e]+$/, "请复制 Webhook key，不含 Bearer 前缀"),
});
// Comma-separated PersonalAccount IDs, or "all". Unset keeps Grok Bot hidden.
export function grokBotEnabled(env: Env, accountId: string) {
  const allowed = secret(env, "GROK_BOT_ACCOUNTS", false)
    .split(",")
    .map((v) => v.trim());
  return allowed.includes("all") || allowed.includes(accountId);
}
export function grokDispatcherReady(env: Env, accountId: string) {
  if (!grokBotEnabled(env, accountId)) return false;
  const origin = secret(env, "GROK_DISPATCH_ORIGIN", false);
  if (
    !origin ||
    new TextEncoder().encode(secret(env, "GROK_DISPATCH_SECRET", false)).byteLength < 32
  )
    return false;
  try {
    backendOrigin(origin);
    return true;
  } catch {
    return false;
  }
}
export function requireGrokDispatcher(env: Env, accountId: string) {
  if (!grokDispatcherReady(env, accountId))
    throw new AppError("grok_unavailable", GROK_DISPATCH_UNAVAILABLE, 503);
}
export async function sealGrokWebhook(
  env: Env,
  accountId: string,
  input: unknown,
  binding: string,
) {
  requireGrokDispatcher(env, accountId);
  const parsed = credentials.safeParse(input);
  if (!parsed.success)
    throw new AppError(
      "invalid_grok_webhook",
      "请从同一个 Grok Routine 复制完整的 Webhook URL 和 key，key 不含 Bearer 前缀。",
    );
  return encrypt(env, JSON.stringify(parsed.data), binding);
}
export async function prepareGrokWake(
  env: Env,
  accountId: string,
  sealed: string,
  binding: string,
  taskId: string,
) {
  requireGrokDispatcher(env, accountId);
  const auth = credentials.parse(JSON.parse(await decrypt(env, sealed, binding)));
  const body = JSON.stringify({ ...auth, taskId });
  const target = new URL(
    "/internal/v1/grok/wake",
    backendOrigin(secret(env, "GROK_DISPATCH_ORIGIN")),
  );
  return signedRequest(
    target,
    secret(env, "GROK_DISPATCH_SECRET"),
    createHash("sha256").update(body).digest("hex"),
    body,
    { signal: AbortSignal.timeout(12_000) },
  );
}

export type GrokWakeResult = {
  status: "waiting" | "reconcile" | "retry" | "rejected";
  receiptDeclined?: boolean;
};
export async function sendGrokWake(request: Request): Promise<GrokWakeResult> {
  let response: Response;
  try {
    response = await fetch(request);
  } catch {
    return { status: "reconcile" };
  }
  await response.body?.cancel().catch(() => {});
  if (response.status === 202 || response.status === 204) return { status: "waiting" };
  const receiptDeclined = response.headers.get("X-Wechatai-Grok-Receipt") === "declined";
  if (
    response.status === 429 ||
    (response.status === 502 && receiptDeclined) ||
    (response.status === 503 && response.headers.get("X-Wechatai-Grok-Wake") === "not-sent")
  )
    return { status: "retry", receiptDeclined };
  if (response.status >= 400 && response.status < 500 && response.status !== 408)
    return { status: "rejected", receiptDeclined };
  return { status: "reconcile" };
}
