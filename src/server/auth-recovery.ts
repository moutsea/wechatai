import { APIError } from "better-auth/api";
import { authReturnPath } from "../shared/auth";

const recoveryKey = (userId: string) => `email-recovery:${userId}`;

// This is account state, not an expiring authentication credential. Keep it until
// the mailbox owner sets a password; old verification emails must not bypass it.
export async function requirePasswordRecovery(env: Env, userId: string) {
  await env.DB.prepare(`INSERT INTO verification
    (id,identifier,value,expiresAt,createdAt,updatedAt)
    SELECT ?,?,id,253402300799,unixepoch(),unixepoch() FROM user
    WHERE id=? AND emailVerified=0
    ON CONFLICT(id) DO NOTHING`)
    .bind(recoveryKey(userId), recoveryKey(userId), userId)
    .run();
}

export async function passwordRecoveryRequired(env: Env, userId: string) {
  return Boolean(
    await env.DB.prepare("SELECT id FROM verification WHERE id=?")
      .bind(recoveryKey(userId))
      .first(),
  );
}

export async function recoveryReturnTo(env: Env, request?: Request) {
  if (!request) return "/app";
  const body = (await request
    .clone()
    .json()
    .catch(() => null)) as { callbackURL?: unknown } | null;
  if (typeof body?.callbackURL !== "string") return "/app";
  try {
    return authReturnPath(new URL(body.callbackURL, env.APP_URL).searchParams.get("returnTo"));
  } catch {
    return "/app";
  }
}

export async function issuePasswordRecovery(env: Env, userId: string, returnTo: string) {
  const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  await env.DB.prepare(`INSERT INTO verification
    (id,identifier,value,expiresAt,createdAt,updatedAt) VALUES (?,?,?,unixepoch()+1800,unixepoch(),unixepoch())`)
    .bind(crypto.randomUUID(), `reset-password:${token}`, userId)
    .run();
  const callback = `/reset-password?recovery=1&returnTo=${encodeURIComponent(authReturnPath(returnTo))}`;
  return `${env.APP_URL}/api/auth/reset-password/${token}?callbackURL=${encodeURIComponent(callback)}`;
}

// D1 batch is a transaction. Every mutation checks the still-present credential;
// concurrent resets cannot both win, even when they use different valid tokens.
// Keep Better Auth's credential schema/hash and public API, but replace its
// separate consume -> update -> revoke operations with one atomic batch.
export async function resetPasswordAtomically(env: Env, token: string, hash: string) {
  const identifier = `reset-password:${token}`;
  // Use one timestamp throughout the batch, even if a token expires between statements.
  const now = Math.floor(Date.now() / 1000);
  const owner = "SELECT value FROM verification WHERE identifier=? AND expiresAt>? LIMIT 1";
  const results = await env.DB.batch<{ id: string }>([
    env.DB.prepare(`INSERT INTO account
      (id,userId,providerId,accountId,password,createdAt,updatedAt)
      SELECT ?,id,'credential',id,?,unixepoch(),unixepoch() FROM user WHERE id=(${owner})
      ON CONFLICT(providerId,accountId) DO UPDATE SET password=excluded.password,updatedAt=excluded.updatedAt`).bind(
      crypto.randomUUID(),
      hash,
      identifier,
      now,
    ),
    env.DB.prepare(
      `UPDATE user SET emailVerified=1,updatedAt=unixepoch() WHERE id=(${owner}) AND emailVerified=0 RETURNING id`,
    ).bind(identifier, now),
    env.DB.prepare(`DELETE FROM session WHERE userId=(${owner})`).bind(identifier, now),
    env.DB.prepare(`DELETE FROM verification WHERE value=(${owner})
      AND (identifier LIKE 'reset-password:%' OR identifier LIKE 'email-recovery:%')`).bind(
      identifier,
      now,
    ),
  ]).catch(() => {
    console.error(JSON.stringify({ event: "auth.password_reset.failed" }));
    throw new APIError("INTERNAL_SERVER_ERROR", {
      code: "PASSWORD_RESET_FAILED",
      message: "暂时无法保存密码，请稍后重试。",
    });
  });
  if (!results[0].meta.changes)
    throw new APIError("BAD_REQUEST", {
      code: "INVALID_TOKEN",
      message: "链接无效或已过期，请重新发送邮件。",
    });
  // 同一事务中只有真正由未验证变为已验证的账户会被返回。
  const verifiedId = results[1].results[0]?.id;
  return typeof verifiedId === "string" ? verifiedId : undefined;
}
