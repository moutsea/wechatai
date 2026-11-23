import { createHmac, timingSafeEqual } from "node:crypto";
import { secret } from "../config";
import { MAX_GENERATED_BYTES } from "../media";

export const GROK_UPLOAD_PATH = "/api/grok/uploads";
export const GROK_MAX_IMAGES = 4;
// Leaves room for a few retried or replaced uploads; only finished images are sent.
export const GROK_MAX_UPLOADS = 8;
export const GROK_IMAGE_RULES =
  "只支持完整的 PNG、JPEG 或 WebP 图片，单张不超过 8 MB、2500 万像素。";

const sign = (env: Env, unsigned: string) =>
  createHmac("sha256", secret(env, "ENCRYPTION_KEY"))
    .update(`wechatai-grok-upload-v1:${unsigned}`)
    .digest("base64url");

/**
 * A task-scoped upload capability. The edge verifies it before selecting an
 * account; the account still accepts files only while the task is claimed.
 */
export function signGrokUploadToken(
  env: Env,
  accountId: string,
  pluginId: string,
  ref: string,
  expiresAt: number,
) {
  const unsigned = `gup1.${accountId}.${pluginId}.${ref}.${Math.ceil(expiresAt / 1000)}`;
  return `${unsigned}.${sign(env, unsigned)}`;
}

export function parseGrokUploadToken(env: Env, token: string) {
  const match =
    /^gup1\.([a-f0-9]{64})\.([a-f0-9-]{36})\.([a-f0-9-]{36})\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(
      token,
    );
  if (!match) return null;
  const expected = sign(env, token.slice(0, token.lastIndexOf(".")));
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(match[5]))) return null;
  if (Number(match[4]) * 1000 <= Date.now()) return null;
  return { accountId: match[1], pluginId: match[2], ref: match[3] };
}

/** Returns null when the body exceeds the image limit, without buffering the rest. */
export async function readGrokUpload(request: Request, max = MAX_GENERATED_BYTES) {
  if (Number(request.headers.get("content-length")) > max) return null;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) return null;
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return data;
}
