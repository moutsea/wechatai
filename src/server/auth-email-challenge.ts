import { AUTH_EMAIL_TOKEN_HEADER, type AuthEmailAction } from "../shared/auth";
import { authEmailDelivery } from "./auth-email";
import { secret } from "./config";

function credentials(env: Env) {
  const siteKey = secret(env, "TURNSTILE_SITE_KEY", false);
  const secretKey = secret(env, "TURNSTILE_SECRET_KEY", false);
  // Cloudflare's published dummy keys must never authorize real mail.
  const dummyKey = /^[1-3]x0{8}/;
  return siteKey && secretKey && !dummyKey.test(siteKey) && !dummyKey.test(secretKey)
    ? { siteKey, secretKey }
    : null;
}

export function authEmailConfig(env: Env) {
  const delivery = authEmailDelivery(env);
  if (delivery !== "email") return { delivery };
  const keys = credentials(env);
  return keys ? { delivery, siteKey: keys.siteKey } : { delivery: "unavailable" as const };
}

export async function checkAuthEmailChallenge(env: Env, request: Request, action: AuthEmailAction) {
  const delivery = authEmailDelivery(env);
  if (delivery === "preview") return;
  if (delivery === "unavailable") return "EMAIL_SERVICE_UNAVAILABLE";
  const keys = credentials(env);
  if (!keys) return "EMAIL_CHALLENGE_UNAVAILABLE";
  const token = request.headers.get(AUTH_EMAIL_TOKEN_HEADER)?.trim();
  if (!token || token.length > 2048) return "EMAIL_CHALLENGE_INVALID";

  const body = new URLSearchParams({ secret: keys.secretKey, response: token });
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) body.set("remoteip", ip);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return "EMAIL_CHALLENGE_UNAVAILABLE";
    const data = await response.json<{
      success: boolean;
      hostname?: string;
      action?: string;
      "error-codes"?: string[];
    }>();
    if (data.success !== true) {
      const rejected = ["missing-input-response", "invalid-input-response", "timeout-or-duplicate"];
      return data["error-codes"]?.length &&
        data["error-codes"].every((code) => rejected.includes(code))
        ? "EMAIL_CHALLENGE_INVALID"
        : "EMAIL_CHALLENGE_UNAVAILABLE";
    }
    if (data.hostname !== new URL(env.APP_URL).hostname || data.action !== action)
      return "EMAIL_CHALLENGE_INVALID";
  } catch {
    return "EMAIL_CHALLENGE_UNAVAILABLE";
  }
}
