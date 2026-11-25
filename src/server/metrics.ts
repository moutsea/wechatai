import { createHash, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { secret } from "./config";
import { analyticsDays } from "./analytics";
import { readMetricsTraffic } from "./metrics-traffic";
import { metricsRevenue } from "./metrics-revenue";
import { readMetricsRetention, retentionDays } from "./metrics-retention";

const TOKEN_NAME = "METRICS_API_TOKEN";
const TOKEN_MIN_LENGTH = 32;
const IP_LIMIT_KEY = "metrics:ip:";
const TOKEN_LIMIT_KEY = "metrics:token:shared";
const HEALTH_PATH = "/api/metrics/health";
const REVENUE_PATH = "/api/metrics/revenue";
const RETENTION_PATH = "/api/metrics/retention";
const TRAFFIC_PATH = "/api/metrics/traffic";

type BillingMode =
  | { available: true; mode: "test" | "live" }
  | { available: false; reason: "billing_not_configured" | "billing_mode_unknown" };

type AuditReason =
  | "ok"
  | "not_configured"
  | "unauthorized"
  | "ip_rate_limited"
  | "token_rate_limited"
  | "rate_limit_unavailable"
  | "method_not_allowed"
  | "not_found"
  | "internal_error"
  | "billing_unavailable"
  | "invalid_query";

type LimitResult = "ok" | "limited" | "unavailable";

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

function tokenAuthorized(
  env: Env,
  authorization: string,
): "ok" | "not_configured" | "unauthorized" {
  const expected = secret(env, TOKEN_NAME, false);
  if (expected.length < TOKEN_MIN_LENGTH) return "not_configured";
  if (!authorization.startsWith("Bearer ")) return "unauthorized";
  return timingSafeEqual(
    createHash("sha256").update(expected).digest(),
    createHash("sha256").update(authorization.slice(7)).digest(),
  )
    ? "ok"
    : "unauthorized";
}

async function consumeLimit(env: Env, key: string): Promise<LimitResult> {
  const limiter = (env as Partial<Env>).API_LIMIT;
  if (!limiter || typeof limiter.limit !== "function") return "unavailable";
  try {
    return (await limiter.limit({ key })).success ? "ok" : "limited";
  } catch {
    // Never fail open when the edge limiter is unavailable.
    return "unavailable";
  }
}

function routeTemplate(path: string) {
  if (
    path === HEALTH_PATH ||
    path === REVENUE_PATH ||
    path === RETENTION_PATH ||
    path === TRAFFIC_PATH
  )
    return path;
  if (path === "/api/metrics") return "/api/metrics";
  return "/api/metrics/*";
}

function respond(
  c: Context<{ Bindings: Env }>,
  status: ContentfulStatusCode,
  body: unknown,
  reason: AuditReason,
  rateLimited = false,
) {
  // Whitelisted fields only: no URL, query, path parameters, headers, IP,
  // token digest, request/response body or thrown error text.
  console.log(
    JSON.stringify({
      event: "metrics.request",
      at: new Date().toISOString(),
      route: routeTemplate(c.req.path),
      method: c.req.method,
      status,
      rateLimited,
      reason,
    }),
  );
  return c.json(body, status);
}

/**
 * Dedicated read-only operator metadata and aggregate endpoints. It is mounted before the
 * general API body limit and browser session middleware, so it never reads a
 * request body, queries a session, or reaches account Durable Objects.
 */
export async function metricsRequest(c: Context<{ Bindings: Env }>): Promise<Response> {
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex, nofollow");
  try {
    // Unknown or missing forwarding headers share one local bucket; never trust
    // a client-supplied X-Forwarded-For.
    const ip = c.req.header("cf-connecting-ip") || "unknown";
    const ipLimit = await consumeLimit(c.env, IP_LIMIT_KEY + ip);
    if (ipLimit === "unavailable")
      return respond(c, 503, { error: "unavailable" }, "rate_limit_unavailable");
    if (ipLimit === "limited") {
      c.header("Retry-After", "60");
      return respond(c, 429, { error: "rate_limited" }, "ip_rate_limited", true);
    }

    const auth = tokenAuthorized(c.env, c.req.header("authorization") || "");
    if (auth !== "ok") return respond(c, 401, { error: "unauthorized" }, auth);

    // Only a valid credential consumes the shared token quota, so bad tokens
    // cannot exhaust the operator's allowance.
    const tokenLimit = await consumeLimit(c.env, TOKEN_LIMIT_KEY);
    if (tokenLimit === "unavailable")
      return respond(c, 503, { error: "unavailable" }, "rate_limit_unavailable");
    if (tokenLimit === "limited") {
      c.header("Retry-After", "60");
      return respond(c, 429, { error: "rate_limited" }, "token_rate_limited", true);
    }

    if (
      c.req.path !== HEALTH_PATH &&
      c.req.path !== REVENUE_PATH &&
      c.req.path !== RETENTION_PATH &&
      c.req.path !== TRAFFIC_PATH
    )
      return respond(c, 404, { error: "not_found" }, "not_found");
    if (c.req.method !== "GET") {
      c.header("Allow", "GET");
      return respond(c, 405, { error: "method_not_allowed" }, "method_not_allowed");
    }

    if (c.req.path === TRAFFIC_PATH) {
      const days = analyticsDays(c.req.query("days"));
      if (days === null) return respond(c, 400, { error: "invalid_query" }, "invalid_query");
      return respond(c, 200, await readMetricsTraffic(c.env, days), "ok");
    }

    if (c.req.path === RETENTION_PATH) {
      const days = retentionDays(c.req.queries("days"));
      if (days === null) return respond(c, 400, { error: "invalid_query" }, "invalid_query");
      return respond(c, 200, await readMetricsRetention(c.env, days), "ok");
    }

    if (c.req.path === REVENUE_PATH) {
      const mode = billingMode(c.env);
      if (!mode.available)
        return respond(
          c,
          503,
          { error: "unavailable", available: false, reason: mode.reason, billingMode: mode },
          "billing_unavailable",
        );
      return respond(c, 200, await metricsRevenue(c.env, mode.mode), "ok");
    }

    return respond(
      c,
      200,
      {
        service: "wechatai",
        documentationVersion: "1",
        timezone: "Asia/Shanghai",
        authenticated: true,
        billingMode: billingMode(c.env),
      },
      "ok",
    );
  } catch {
    // Do not log or return error.message/stack.
    const body =
      c.req.path === REVENUE_PATH
        ? { error: "unavailable", available: false, reason: "revenue_unavailable" }
        : { error: "unavailable" };
    return respond(c, 503, body, "internal_error");
  }
}
