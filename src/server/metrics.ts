import { createHash, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { secret } from "./config";

const TOKEN_NAME = "METRICS_API_TOKEN";
const TOKEN_MIN_LENGTH = 32;
const HEALTH_PATH = "/api/metrics/health";

type BillingMode =
  | { available: true; mode: "test" | "live" }
  | { available: false; reason: "billing_not_configured" | "billing_mode_unknown" };

/**
 * Report the configured Stripe mode without claiming that payments are usable.
 * billingMode() intentionally treats every unrecognized key as test; exposing
 * that as an environment fact would misreport a missing or malformed key.
 */
function billingMode(env: Env): BillingMode {
  const key = secret(env, "STRIPE_SECRET_KEY", false);
  if (!key) return { available: false, reason: "billing_not_configured" };
  if (key.startsWith("sk_live_")) return { available: true, mode: "live" };
  if (key.startsWith("sk_test_")) return { available: true, mode: "test" };
  return { available: false, reason: "billing_mode_unknown" };
}

function tokenAuthorized(env: Env, authorization: string): boolean {
  const expected = secret(env, TOKEN_NAME, false);
  if (expected.length < TOKEN_MIN_LENGTH) return false;
  if (!authorization.startsWith("Bearer ")) return false;
  return timingSafeEqual(
    createHash("sha256").update(expected).digest(),
    createHash("sha256").update(authorization.slice(7)).digest(),
  );
}

/**
 * Dedicated read-only operator metadata endpoint. It is mounted before the
 * general API body limit and browser session middleware, so it never reads a
 * request body, queries a session, or reaches account Durable Objects.
 */
export async function metricsRequest(c: Context<{ Bindings: Env }>): Promise<Response> {
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex, nofollow");
  if (!tokenAuthorized(c.env, c.req.header("authorization") || ""))
    return c.json({ error: "unauthorized" }, 401);
  if (c.req.path !== HEALTH_PATH) return c.json({ error: "not_found" }, 404);
  if (c.req.method !== "GET") {
    c.header("Allow", "GET");
    return c.json({ error: "method_not_allowed" }, 405);
  }
  return c.json({
    service: "wechatai",
    documentationVersion: "1",
    timezone: "Asia/Shanghai",
    authenticated: true,
    billingMode: billingMode(c.env),
  });
}
