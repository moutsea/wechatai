import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { secret } from "./config";

export const CLOUD_CALLBACK_PATH = "/api/integrations/agt/callback";
export const CLOUD_CALLBACK_MAX_BYTES = 1024 * 1024;
/** AGT re-signs every attempt, so only the timestamp inside this window is trusted. */
export const CLOUD_CALLBACK_SKEW_SECONDS = 300;

export function cloudCallbackVersion(env: Env) {
  return secret(env, "AGT_CALLBACK_KEY_VERSION", false) || "v1";
}
function callbackKey(env: Env, version: string) {
  const configured = secret(env, "AGT_CALLBACK_KEYS", false);
  // An explicitly configured ring is authoritative; never fall back for a missing version.
  if (!configured && version === "v1") return secret(env, "ENCRYPTION_KEY");
  let keys: unknown;
  try {
    keys = JSON.parse(configured);
  } catch {
    throw new Error("Invalid callback key ring");
  }
  const key = keys && typeof keys === "object" ? Reflect.get(keys, version) : undefined;
  if (typeof key !== "string" || key.length < 32) throw new Error("Missing callback key version");
  return key;
}
const sign = (env: Env, value: string, version: string) =>
  createHmac("sha256", callbackKey(env, version)).update(value).digest("base64url");

/**
 * Authenticate routing identifiers before selecting an account. The token is
 * insufficient to accept an event: the payload needs its own per-task signature.
 */
export function createCloudCallbackToken(
  env: Env,
  accountId: string,
  taskId: string,
  expiresAt: number,
  version = cloudCallbackVersion(env),
) {
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(version)) throw new Error("Invalid callback key version");
  const unsigned = `agt1.${version}.${accountId}.${taskId}.${Math.ceil(expiresAt / 1000)}`;
  return `${unsigned}.${sign(env, unsigned, version)}`;
}

export function parseCloudCallbackToken(env: Env, token: string) {
  const match =
    /^agt1\.([a-zA-Z0-9_-]{1,32})\.([a-f0-9]{64})\.([a-zA-Z0-9-]{1,64})\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(
      token,
    );
  if (!match) return null;
  const unsigned = token.slice(0, token.lastIndexOf("."));
  let expected: string;
  try {
    expected = sign(env, unsigned, match[1]);
  } catch {
    return null;
  }
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(match[5]))) return null;
  const expiresAt = Number(match[4]) * 1000;
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return { accountId: match[2], taskId: match[3] };
}

/** Derived, never stored: a task's secret is reproducible for its whole lifecycle. */
export function cloudCallbackSecret(
  env: Env,
  accountId: string,
  taskId: string,
  version = cloudCallbackVersion(env),
) {
  return createHmac("sha256", callbackKey(env, version))
    .update(`wechatai-agt-callback-v1:${accountId}:${taskId}`)
    .digest("base64url");
}

export const cloudCallbackSchema = z.looseObject({
  id: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
  callbackJobId: z.string().min(1).max(200),
  jobId: z.string().max(200).optional(),
  tenantId: z.string().max(200),
  workspaceId: z.string().max(200),
  createdAt: z.string().max(100).optional(),
  data: z.looseObject({
    seq: z.number().int().nonnegative().optional(),
    status: z.string().max(40).optional(),
    result: z.string().optional(),
    task: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type CloudCallback = z.infer<typeof cloudCallbackSchema>;

export type CloudCallbackResult =
  | { ok: true; body: CloudCallback; deliveryId: string }
  | { ok: false; status: 400 | 401 | 413; error: string };

/**
 * Verify before parsing for meaning: the signature covers the exact bytes, so a
 * reformatted body is rejected rather than silently reinterpreted.
 * Callers must also check job/tenant/workspace ownership and persist deliveryId
 * for deduplication. A valid callback is a wakeup, not a basis for settlement.
 */
export function verifyCloudCallback(
  signingSecret: string,
  rawBody: string,
  headers: { event?: string; delivery?: string; timestamp?: string; signature?: string },
  now = Date.now(),
): CloudCallbackResult {
  if (Buffer.byteLength(rawBody, "utf8") > CLOUD_CALLBACK_MAX_BYTES)
    return { ok: false, status: 413, error: "body_too_large" };
  const signature = /^sha256=([a-f0-9]{64})$/.exec(headers.signature ?? "");
  if (!signature) return { ok: false, status: 401, error: "invalid_signature" };
  const timestamp = headers.timestamp ?? "";
  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, status: 401, error: "invalid_timestamp" };
  const seconds = Number(timestamp);
  if (Math.abs(Math.floor(now / 1000) - seconds) > CLOUD_CALLBACK_SKEW_SECONDS)
    return { ok: false, status: 401, error: "stale_timestamp" };
  const expected = createHmac("sha256", signingSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  if (
    expected.length !== signature[1].length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(signature[1]))
  )
    return { ok: false, status: 401, error: "invalid_signature" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  }
  const body = cloudCallbackSchema.safeParse(parsed);
  if (!body.success) return { ok: false, status: 400, error: "invalid_event" };
  // Bind the unsigned delivery headers to their signed counterparts in the body.
  if (headers.event !== body.data.type) return { ok: false, status: 400, error: "event_mismatch" };
  if (headers.delivery !== body.data.id)
    return { ok: false, status: 400, error: "delivery_mismatch" };
  return { ok: true, body: body.data, deliveryId: body.data.id };
}

/** Stream cap applies to actual bytes, including chunked requests without Content-Length. */
export async function readCloudCallbackBody(request: Request) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  let size = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > CLOUD_CALLBACK_MAX_BYTES) return null;
      body += decoder.decode(value, { stream: true });
    }
    return body + decoder.decode();
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
