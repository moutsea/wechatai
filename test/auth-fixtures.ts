import { env, createExecutionContext } from "cloudflare:test";
import worker from "../src/server/index";
export { default as authEmailMigration } from "../migrations/0007_auth_email_limits.sql?raw";
let fixtureIp = 0;

// Non-authentication tests need a verified user fixture. The full verification
// flow itself is exercised with captured outgoing mail in auth-email.test.ts.
export async function verifiedFixtureCookie(
  userId: string,
  password: string,
  origin = env.APP_URL,
) {
  await env.DB.prepare("UPDATE user SET emailVerified=1 WHERE id=?").bind(userId).run();
  const user = await env.DB.prepare("SELECT email FROM user WHERE id=?")
    .bind(userId)
    .first<{ email: string }>();
  if (!user) throw new Error("Missing test user");
  const response = await worker.fetch(
    new Request(`${origin}/api/auth/sign-in/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        "cf-connecting-ip": `198.18.${Math.floor(++fixtureIp / 250)}.${(fixtureIp % 250) + 1}`,
      },
      body: JSON.stringify({ email: user.email, password }),
    }),
    env,
    createExecutionContext(),
  );
  if (response.status !== 200) throw new Error(`Fixture login failed: ${response.status}`);
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}
