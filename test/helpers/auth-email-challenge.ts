import { AUTH_EMAIL_TOKEN_HEADER } from "../../src/shared/auth";

export const testChallengeKeys = {
  TURNSTILE_SITE_KEY: "fixture-public-key",
  TURNSTILE_SECRET_KEY: "fixture-private-key",
};

export function challengeHeaders(path: string): Record<string, string> {
  const routes: Record<string, string> = {
    "/api/auth/sign-up/email": "email_signup",
    "/api/auth/send-verification-email": "email_resend",
    "/api/auth/request-password-reset": "email_reset",
  };
  const action = routes[path.replace(/\/+$/, "")];
  return action ? { [AUTH_EMAIL_TOKEN_HEADER]: action + "." + crypto.randomUUID() } : {};
}

export function mockSiteverify(appURL: string) {
  const spent = new Set<string>();
  return async (url: RequestInfo | URL, init?: RequestInit) => {
    if (
      String(url) !== "https://challenges.cloudflare.com/turnstile/v0/siteverify" ||
      init?.method !== "POST"
    )
      throw new Error("Unexpected external request");
    const form = new URLSearchParams(String(init.body));
    if (form.get("secret") !== testChallengeKeys.TURNSTILE_SECRET_KEY)
      return Response.json({ success: false, "error-codes": ["invalid-input-secret"] });
    const token = form.get("response") || "";
    if (spent.has(token))
      return Response.json({ success: false, "error-codes": ["timeout-or-duplicate"] });
    spent.add(token);
    return Response.json({
      success: true,
      action: token.split(".")[0],
      hostname: new URL(appURL).hostname,
    });
  };
}
