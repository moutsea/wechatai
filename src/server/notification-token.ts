import { createHmac, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { secret } from "./config";

const sign = (env: Env, value: string) =>
  createHmac("sha256", secret(env, "ENCRYPTION_KEY")).update(value).digest("base64url");
export const notificationTokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function createNotificationToken(env: Env, accountId: string, pluginId: string) {
  const credential = randomBytes(32).toString("base64url");
  const unsigned = `notify1.${accountId}.${pluginId}.${credential}`;
  return { token: `${unsigned}.${sign(env, unsigned)}`, hash: notificationTokenHash(credential) };
}
// Authenticate the routing envelope before any caller-supplied ID can allocate a DO.
export function parseNotificationToken(env: Env, authorization: string) {
  const match =
    /^Bearer (notify1\.([a-f0-9]{64})\.([a-f0-9-]{36})\.([A-Za-z0-9_-]{43}))\.([A-Za-z0-9_-]{43})$/.exec(
      authorization,
    );
  if (!match || !timingSafeEqual(Buffer.from(sign(env, match[1])), Buffer.from(match[5])))
    return null;
  return { accountId: match[2], pluginId: match[3], credential: match[4] };
}
