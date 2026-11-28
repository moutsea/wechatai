import { routePath } from "hono/route";
import {
  emailLinkPage,
  emailLinkPath,
  emailActionRequest,
  privateEmailLink,
  privateAuthResponse,
} from "./auth-email-link";
import {
  listUserNotices,
  readAllNotices,
  markNotice,
  listAdminNotices,
  createNotice,
  updateNotice,
  deleteNotice,
} from "./site-notices";
import { noticeReadAllSchema } from "../shared/site-notices";
import {
  getAdminAnalytics,
  pruneExpiredPageViews,
  recordFunnelEvent,
  recordPageView,
} from "./analytics";
import { connectorVersionPattern } from "../shared/openclaw-release";
import { parseOpenClawToken, parseOpenClawPairing } from "./openclaw-token";
import {
  CLOUD_CALLBACK_MAX_BYTES,
  CLOUD_CALLBACK_PATH,
  parseCloudCallbackToken,
  readCloudCallbackBody,
} from "./cloud-agent-callback";
import { parseNotificationToken, notificationTokenHash } from "./notification-token";
import {
  accountForGrok,
  accountForNotification,
  accountForUser,
  type AdminGrant,
  receiveAccountCallback,
  receiverConnection,
  receiverStatus,
} from "./account-route";
import { Hono } from "hono";
import { html } from "hono/html";
import { kimiseekEmailError } from "../shared/kimiseek-errors";
import {
  receiverAuthorized,
  receiverEnabled,
  receiverPoolHeader,
  receiverPoolMatches,
} from "./wechat-receiver";
import { senderAccess } from "./wechat-sender";
import { watchdogHeader, fallbackWatchdogs } from "./receiver-watchdog";
import { watchdogRoutes } from "./receiver-watchdog-routes";
import { grokMcp } from "./grok/mcp";
import {
  GROK_IMAGE_RULES,
  GROK_UPLOAD_PATH,
  parseGrokUploadToken,
  readGrokUpload,
} from "./grok/upload";
import { connectorPoll } from "./connector-poll";
import { MUSE_IMAGE_RULES } from "./openclaw-relay";
import { executionCompletionSchema } from "../shared/executor-protocol";
import { executionAuthorized, EXECUTION_MAX_BYTES } from "./execution-store";
import { serverMonitorAuthorized, saveServerStatus, adminServerStatus } from "./server-status";
import { metricsRequest } from "./metrics";
import {
  isAdmin,
  adminAccessUntil,
  adminOverview,
  adminUsers,
  syncAdminStats,
  adminMembership,
  giftAdminMembership,
} from "./admin";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { admitSessionLookup, entryLimited } from "./public-admission";
import { availableAuthProviders, createAuth } from "./auth";
import { reserveAuthEmail } from "./auth-email";
import { authEmailConfig, checkAuthEmailChallenge } from "./auth-email-challenge";
import { authEmailActions, authErrorMessage } from "../shared/auth";
import { z } from "zod";
import { AppError, trustedAppOrigins } from "./config";
import { catalog, checkout, checkoutStatus, subscriptionInfo, portal, webhook } from "./billing";
import { dispatchPaymentNotices } from "./billing-notifications";
import { acceptReferral, referralSummary, registrationReferrer } from "./referrals";
import { publicPluginDocs } from "./plugin-docs";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import {
  callKimiseek,
  type KimiseekFlow,
  kimiseekConfig,
  kimiseekRequest,
  validIntegrationNonce,
  type KimiseekIdentity,
} from "./kimiseek";
export { PersonalAccount } from "./personal-account";
// Local development/tests colocate both classes. Production binds REMINDERS to
// the independently deployed wechatai-reminders Worker.
export { ReminderScheduler } from "./reminder-scheduler";
type App = { Bindings: Env; Variables: { user: KimiseekIdentity; adminGrant: AdminGrant } };
const app = new Hono<App>();
// Use the same token checks, quotas and durable queue as the public endpoint,
// without a public fetch back into this Worker (which can fail before routing).
function dispatchBillingNotices(env: Env, ctx: Parameters<typeof app.fetch>[2]) {
  return dispatchPaymentNotices(env, (url, init) => app.fetch(new Request(url, init), env, ctx));
}
const defaultHeaders = secureHeaders();
const emailPageHeaders = secureHeaders({ referrerPolicy: "same-origin" });
app.use("*", (c, next) =>
  (c.req.path === emailLinkPath && c.req.method === "GET" ? emailPageHeaders : defaultHeaders)(
    c,
    next,
  ),
);
// AGT callbacks use their own stream cap and signed credentials, so register
// before the general body limit and browser session/Origin middleware.
app.post(`${CLOUD_CALLBACK_PATH}/:token`, async (c) => {
  c.header("Cache-Control", "no-store");
  const match = parseCloudCallbackToken(c.env, c.req.param("token"));
  if (!match) return c.json({ error: "invalid_token" }, 401);
  try {
    if (!(await c.env.API_LIMIT.limit({ key: `agt-callback:${match.accountId}` })).success)
      return c.json({ error: "rate_limited" }, 429);
    if (Number(c.req.header("content-length")) > CLOUD_CALLBACK_MAX_BYTES)
      return c.json({ error: "body_too_large" }, 413);
    // Read once without reformatting: the signature covers the exact UTF-8 body.
    let rawBody: string | null;
    try {
      rawBody = await readCloudCallbackBody(c.req.raw);
    } catch {
      return c.json({ error: "invalid_body" }, 400);
    }
    if (rawBody === null) return c.json({ error: "body_too_large" }, 413);
    try {
      c.env.ACCOUNTS.idFromString(match.accountId);
    } catch {
      return c.json({ error: "invalid_token" }, 401);
    }
    const result = await receiveAccountCallback(c.env, match.accountId, match.taskId, rawBody, {
      event: c.req.header("x-agent-event"),
      delivery: c.req.header("x-agent-delivery"),
      timestamp: c.req.header("x-agent-timestamp"),
      signature: c.req.header("x-agent-signature"),
    });
    return result.ok ? c.json({ received: true }) : c.json({ error: result.error }, result.status);
  } catch (error) {
    // Do not log routing tokens, callback bodies or credentials. Persistence and
    // alarm failures must be retryable, including a duplicate saved receipt.
    console.error(
      JSON.stringify({
        event: "cloud.callback_failed",
        errorType: error instanceof Error ? error.name : "unknown",
      }),
    );
    return c.json({ error: "unavailable" }, 503);
  }
});
// Grok Bot image uploads come from curl with a signed task URL, not a browser
// session, and need a larger cap than the general API body limit.
app.put(`${GROK_UPLOAD_PATH}/:token`, async (c) => {
  c.header("Cache-Control", "no-store");
  const match = parseGrokUploadToken(c.env, c.req.param("token"));
  if (!match) return c.json({ error: "invalid_token", message: "上传地址无效或已过期" }, 401);
  if (!(await c.env.API_LIMIT.limit({ key: `grok:upload:${match.ref}` })).success)
    return c.json({ error: "rate_limited", message: "上传过于频繁，请稍后重试" }, 429);
  const data = await readGrokUpload(c.req.raw);
  if (!data) return c.json({ error: "image_size", message: GROK_IMAGE_RULES }, 413);
  if (!data.length) return c.json({ error: "empty_upload", message: "请上传图片文件" }, 400);
  const account = await accountForGrok(c.env, match.accountId);
  const result = JSON.parse(await account.grokUpload(match.pluginId, match.ref, data));
  return result.ok
    ? c.json(result.data, 201)
    : c.json(
        { error: result.error, message: result.message },
        result.status as ContentfulStatusCode,
      );
});
// Read-only operator metrics use their own bearer credential. Terminate them
// before the general API body limit and browser session middleware so every
// result is audited. Aggregate routes read D1 through the metrics dispatcher.
app.all("/api/metrics", metricsRequest);
app.all("/api/metrics/*", metricsRequest);
// Muse connectors upload a finished job's images with their channel token, one
// file per request, before the reply that lists them. Registered before the
// general API body limit, like Grok uploads.
app.put("/api/muse/uploads", async (c) => {
  c.header("Cache-Control", "no-store");
  const match = parseOpenClawToken(c.env, c.req.header("authorization") || "", "muse");
  if (!match) return c.json({ error: "unauthorized", message: "连接凭证无效" }, 401);
  const job = c.req.query("job") ?? "";
  const runner = c.req.query("runner") ?? "";
  if (!job || job.length > 300 || !/^[0-9a-f-]{36}$/i.test(runner))
    return c.json({ error: "invalid_request", message: "缺少任务或 runner 标识" }, 400);
  if (
    !(await c.env.API_LIMIT.limit({ key: `muse:upload:${match.accountId}:${match.pluginId}` }))
      .success
  )
    return c.json({ error: "rate_limited", message: "上传过于频繁，请稍后重试" }, 429);
  const data = await readGrokUpload(c.req.raw);
  if (!data) return c.json({ error: "image_size", message: MUSE_IMAGE_RULES }, 413);
  if (!data.length) return c.json({ error: "empty_upload", message: "请上传图片文件" }, 400);
  const account = c.env.ACCOUNTS.get(c.env.ACCOUNTS.idFromString(match.accountId));
  const result = JSON.parse(
    await account.museUpload(match.pluginId, match.secret, job, runner, data),
  );
  return result.ok
    ? c.json(result.data, 201)
    : c.json(
        { error: result.error, message: result.message },
        result.status as ContentfulStatusCode,
      );
});
app.use("/api/*", async (c, next) =>
  c.req.path.startsWith("/api/internal/executor/")
    ? next()
    : bodyLimit({
        maxSize: 128 * 1024,
        onError: (c) => c.json({ error: "body_too_large", message: "请求内容过大" }, 413),
      })(c, next),
);
app.use("/api/internal/executor/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  if (!executionAuthorized(c.env, c.req.header("authorization") || ""))
    return c.json({ error: "unauthorized" }, 401);
  return bodyLimit({
    maxSize: EXECUTION_MAX_BYTES,
    onError: (c) => c.json({ error: "body_too_large" }, 413),
  })(c, next);
});
app.get("/api/internal/executor/accounts", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT account_id FROM execution_accounts WHERE pending=1 ORDER BY updated_at LIMIT 100",
  ).all<{ account_id: string }>();
  return c.json({
    // Scope controls creation, not draining work already accepted before a rollback.
    accounts: rows.results.map((r) => r.account_id),
  });
});
app.get("/api/internal/executor/:accountId/status", async (c) => {
  const id = c.req.param("accountId");
  if (!/^[0-9a-f]{64}$/.test(id)) return c.json({ error: "not_found" }, 404);
  return c.json(
    await c.env.ACCOUNTS.get(c.env.ACCOUNTS.idFromString(id)).executionRequest("status", {}),
  );
});
app.post("/api/internal/executor/:accountId/:action", async (c) => {
  const id = c.req.param("accountId"),
    action = c.req.param("action");
  if (!/^[0-9a-f]{64}$/.test(id) || !["claim", "complete"].includes(action))
    return c.json({ error: "not_found" }, 404);
  const payload = action === "claim" ? {} : executionCompletionSchema.parse(await c.req.json());
  return c.json({
    data: await c.env.ACCOUNTS.get(c.env.ACCOUNTS.idFromString(id)).executionRequest(
      action as "claim" | "complete",
      payload,
    ),
  });
});
app.get("/api/health", (c) => c.json({ ok: true, service: "wechatai" }));
/** 公开 PV 上报的格式、来源和限流校验。 */
async function analyticsPrecheck(c: import("hono").Context<App>): Promise<Response | null> {
  c.header("Cache-Control", "no-store");
  if (!c.req.header("content-type")?.toLowerCase().startsWith("application/json"))
    return c.json({ error: "invalid_content_type", message: "请使用 application/json" }, 415);
  if (c.req.header("sec-fetch-site") === "cross-site") return c.json({ error: "cross_site" }, 403);
  const origin = c.req.header("origin") || "";
  const requestOrigin = new URL(c.req.url).origin;
  if (origin && origin !== requestOrigin && !trustedAppOrigins(c.env).includes(origin))
    return c.json({ error: "origin_not_allowed" }, 403);
  const ip = c.req.header("cf-connecting-ip") || "local";
  try {
    if (!(await c.env.API_LIMIT.limit({ key: `analytics-page-view:${ip}` })).success)
      return c.json({ error: "rate_limited" }, 429);
    // Rate limiting is local to a Cloudflare location. D1 leases enforce the daily global cap.
    if (!(await c.env.ANALYTICS_LIMIT.limit({ key: "analytics:public" })).success)
      return c.body(null, 204);
  } catch {
    // Optional telemetry stops before D1 if edge admission is unavailable.
    return c.body(null, 204);
  }
  return null;
}
// First-party page-view collection; the client ignores reporting failures.
app.post("/api/analytics/page-view", async (c) => {
  const rejected = await analyticsPrecheck(c);
  if (rejected) return rejected;
  try {
    await recordPageView(c.env, {
      payload: await c.req.json().catch(() => null),
      ip: c.req.header("cf-connecting-ip") || "local",
      userAgent: c.req.header("user-agent") || "",
      country: c.req.header("cf-ipcountry") || "",
      siteHost: new URL(c.req.url).hostname,
    });
  } catch (error) {
    console.error("analytics: page view failed", error);
    return c.json({ error: "unavailable" }, 503);
  }
  return c.body(null, 204);
});
// 漏斗事件收集：与页面浏览分开存，因为关键节点（引导、付费墙、结账）发生在 /app 内部，
// 而 /app 在页面浏览统计里是被排除的。客户端同样忽略上报失败。
app.post("/api/analytics/event", async (c) => {
  const rejected = await analyticsPrecheck(c);
  if (rejected) return rejected;
  try {
    await recordFunnelEvent(c.env, {
      payload: await c.req.json().catch(() => null),
      ip: c.req.header("cf-connecting-ip") || "local",
      userAgent: c.req.header("user-agent") || "",
      country: c.req.header("cf-ipcountry") || "",
    });
  } catch (error) {
    console.error("analytics: funnel event failed", error);
    return c.json({ error: "unavailable" }, 503);
  }
  return c.body(null, 204);
});
// 旧客户端的公开注册上报已退役；仅账户创建钩子可以记录注册。
app.post("/api/analytics/signup", (c) => c.body(null, 410));
// A dedicated write-only monitor credential; browser sessions cannot publish metrics.
app.post("/api/internal/server-status", async (c) => {
  c.header("Cache-Control", "no-store");
  if (!serverMonitorAuthorized(c.env, c.req.header("authorization") || ""))
    return c.json({ error: "unauthorized" }, 401);
  if (!(await c.env.API_LIMIT.limit({ key: "server-monitor" })).success)
    return c.json({ error: "rate_limited" }, 429);
  return c.json(await saveServerStatus(c.env, await c.req.json().catch(() => null)));
});
app.get("/api/internal/wechat-sender/:action", async (c) => {
  c.header("Cache-Control", "no-store");
  const access = senderAccess(c.env, c.req.header("authorization") || "");
  if (!access) return c.body(null, 401);
  const action = c.req.param("action");
  if (action === "pool") return access.pool ? c.json({ ids: access.ids }) : c.body(null, 403);
  const id = c.req.header("X-Wechatai-Account") || "";
  if (!access.ids.includes(id)) return c.body(null, 403);
  const account = c.env.ACCOUNTS.get(c.env.ACCOUNTS.idFromString(id));
  if (action === "status") return c.json(await account.senderStatus());
  if (action !== "connect") return c.body(null, 404);
  if (c.req.header("upgrade")?.toLowerCase() !== "websocket") return c.body(null, 426);
  const response = await account.fetch("https://internal/wechat-sender", {
    headers: { Upgrade: "websocket" },
  });
  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
    ...(response.webSocket ? { webSocket: response.webSocket } : {}),
  });
});
// Operator-only receiver discovery/transport; never authenticated by a user cookie.
app.use("/api/internal/wechat-receiver/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  if (!receiverAuthorized(c.env, c.req.header("authorization") || ""))
    return c.json({ error: "unauthorized" }, 401);
  return next();
});
app.route("/api/internal/wechat-receiver/watchdog", watchdogRoutes);
app.get("/api/internal/wechat-receiver/accounts", async (c) => {
  const after = c.req.query("after") || "";
  if (after && !/^[0-9a-f]{64}$/.test(after)) return c.json({ error: "invalid_cursor" }, 400);
  const rows = await c.env.DB.prepare(
    "SELECT account_id FROM wechat_receivers WHERE active=1 AND account_id>? ORDER BY account_id LIMIT 200",
  )
    .bind(after)
    .all<{ account_id: string }>();
  return c.json({
    ...(c.req.header(receiverPoolHeader) === "dedicated" ? { pool: "dedicated" } : {}),
    accounts: rows.results
      .map((r) => r.account_id)
      .filter(
        (id) =>
          receiverEnabled(c.env, id) &&
          receiverPoolMatches(c.env, id, c.req.header(receiverPoolHeader)),
      ),
    next: rows.results.length === 200 ? rows.results.at(-1)!.account_id : null,
  });
});
app.get("/api/internal/wechat-receiver/status/:accountId", async (c) => {
  const id = c.req.param("accountId");
  if (!/^[0-9a-f]{64}$/.test(id)) return c.json({ error: "invalid_account" }, 400);
  try {
    return c.json(await receiverStatus(c.env, id));
  } catch (error) {
    // Authenticated operator diagnostic; no credentials/messages are read here.
    return c.json(
      {
        error: "receiver_unavailable",
        reason: error instanceof Error ? error.message.slice(0, 400) : "unknown",
      },
      503,
    );
  }
});
app.get("/api/internal/wechat-receiver/connect/:accountId", async (c) => {
  const id = c.req.param("accountId");
  if (
    !/^[0-9a-f]{64}$/.test(id) ||
    !receiverEnabled(c.env, id) ||
    !receiverPoolMatches(c.env, id, c.req.header(receiverPoolHeader))
  )
    return c.json({ error: "not_found" }, 404);
  if (c.req.header("upgrade")?.toLowerCase() !== "websocket")
    return c.json({ error: "websocket_required" }, 426);
  const response = await receiverConnection(c.env, id, {
    Upgrade: "websocket",
    ...(c.req.header(watchdogHeader) === "1" ? { [watchdogHeader]: "1" } : {}),
  });
  // DO fetch responses have immutable headers. Hono's security middleware adds
  // response headers, so clone explicitly while retaining the upgrade socket.
  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
    ...(response.webSocket ? { webSocket: response.webSocket } : {}),
  });
});
app.route("/", publicPluginDocs);
app.get("/invite/:code", (c) => acceptReferral(c.env, c.req.param("code"), c.req.raw));
const mailActions = new Map([
  ["/api/auth/sign-up/email", authEmailActions.signup],
  ["/api/auth/send-verification-email", authEmailActions.resend],
  ["/api/auth/request-password-reset", authEmailActions.reset],
]);
app.use("/api/auth/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
  if (
    c.req.method === "POST" &&
    !(await c.env.AUTH_LIMIT.limit({ key: c.req.header("cf-connecting-ip") || "local" })).success
  )
    return c.json({ message: "尝试过于频繁，请稍后再试" }, 429);
  const path = c.req.path.replace(/\/+$/, "");
  if (
    path === "/api/auth/reset-password" &&
    c.req.method === "POST" &&
    !(await c.env.PUBLIC_ENTRY_LIMIT.limit({ key: "reset" })).success
  )
    return entryLimited();
  if (!(await admitSessionLookup(c.env, c.req.raw)).success) return entryLimited();
  const action = mailActions.get(path);
  if (c.req.method === "POST" && action) {
    if (!trustedAppOrigins(c.env).includes(c.req.header("origin") || ""))
      return c.json({ code: "INVALID_ORIGIN", message: "请求来源无效" }, 403);
    // Match the format parsed below so Better Auth cannot accept a body that bypasses the limit.
    const mediaType = c.req.header("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (mediaType !== "application/json")
      return c.json({ code: "UNSUPPORTED_MEDIA_TYPE", message: "请使用 JSON 格式提交请求。" }, 415);
    const body = z.object({ email: z.string() }).safeParse(
      await c.req.raw
        .clone()
        .json()
        .catch(() => null),
    );
    const email = body.success ? body.data.email.trim().toLowerCase() : "";
    if (!z.email().safeParse(email).success)
      return c.json({ code: "INVALID_EMAIL", message: "请填写有效的邮箱地址。" }, 400);
    const code = await checkAuthEmailChallenge(c.env, c.req.raw, action);
    if (code)
      return c.json(
        { code, message: authErrorMessage({ code }) },
        code === "EMAIL_CHALLENGE_INVALID" ? 403 : 503,
      );
    // Applied before looking up an account: unknown and registered emails have the same limits.
    if (!(await reserveAuthEmail(c.env, email))) {
      c.header("Retry-After", "60");
      return c.json(
        { code: "AUTH_EMAIL_RATE_LIMITED", message: "邮件发送太频繁，请稍后再试。" },
        429,
      );
    }
  }
  return next();
});
app.get("/api/auth/email-config", (c) => c.json(authEmailConfig(c.env)));
app.get("/api/auth/providers", (c) => {
  c.header("Cache-Control", "no-store");
  return c.json({ providers: availableAuthProviders(c.env) });
});
app.get("/api/referrals/attribution", async (c) => {
  c.header("Cache-Control", "no-store");
  if (!(await admitSessionLookup(c.env, c.req.raw)).success) return entryLimited();
  return c.json({ active: Boolean(await registrationReferrer(c.env, c.req.raw.headers)) });
});
app.get(emailLinkPath, () => emailLinkPage());
app.post(emailLinkPath, async (c) => {
  const request = await emailActionRequest(c.req.raw, c.env.APP_URL);
  if (!request) return c.text("邮件链接无效，请重新打开邮件中的完整链接。", 400);
  return privateAuthResponse(await createAuth(c.env, c.executionCtx).handler(request), request);
});
// Previously issued reset emails used the token in the path. Do no database or
// authentication work (which could log errors) until the clean POST arrives.
app.get("/api/auth/reset-password/:token", (c) => {
  const url = new URL(c.req.url);
  if (!/^[A-Za-z0-9_-]+$/.test(c.req.param("token"))) return c.text("重置链接无效。", 400);
  return c.redirect(privateEmailLink(new URL(url.pathname + url.search, c.env.APP_URL)), 302);
});
app.on(["GET", "POST"], "/api/auth/*", async (c) =>
  privateAuthResponse(await createAuth(c.env, c.executionCtx).handler(c.req.raw), c.req.raw),
);
app.post("/api/billing/webhook", async (c) => {
  await webhook(c.env, await c.req.text(), c.req.header("stripe-signature") || "");
  c.executionCtx.waitUntil(dispatchBillingNotices(c.env, c.executionCtx));
  return c.json({ received: true });
});
// Receive-only webhook credentials cannot use any account management endpoint.
app.use(
  "/api/notify",
  bodyLimit({
    maxSize: 32768,
    onError: (c) => c.json({ error: "body_too_large", message: "请求内容最大 32 KB" }, 413),
  }),
);
for (const method of ["POST", "GET"] as const) {
  app.on(method, method === "POST" ? "/api/notify" : "/api/notify/:id", async (c) => {
    c.header("Cache-Control", "no-store");
    const match = parseNotificationToken(c.env, c.req.header("authorization") || "");
    if (!match)
      return c.json({ error: "invalid_token", message: "请提供有效的 Bearer Token" }, 401);
    // Bound invalid/revoked credential traffic without consuming another token's
    // quota. Only a currently valid credential can consume the account quota.
    if (
      !(
        await c.env.API_LIMIT.limit({
          key: `notify:token:${notificationTokenHash(match.credential)}`,
        })
      ).success
    )
      return c.json({ error: "rate_limited", message: "请求过于频繁，请稍后重试" }, 429);
    const account = await accountForNotification(c.env, match.accountId);
    if (!(await account.notificationCredentialValid(match.pluginId, match.credential)))
      return c.json({ error: "invalid_token", message: "Token 无效或已撤销" }, 401);
    if (!(await c.env.API_LIMIT.limit({ key: `notify:${match.accountId}` })).success)
      return c.json({ error: "rate_limited", message: "请求过于频繁，请稍后重试" }, 429);
    let payload: unknown = c.req.param("id");
    if (method === "POST") {
      if (!c.req.header("content-type")?.toLowerCase().startsWith("application/json"))
        return c.json({ error: "invalid_content_type", message: "请使用 application/json" }, 415);
      try {
        payload = await c.req.json();
      } catch {
        return c.json({ error: "invalid_json", message: "JSON 格式无效" }, 400);
      }
    }
    const result = JSON.parse(
      await account.notificationRequest(
        match.pluginId,
        match.credential,
        method === "POST" ? "send" : "status",
        payload,
        c.req.header("idempotency-key") || "",
      ),
    );
    if (!result.ok)
      return c.json(
        { error: result.error, message: result.message },
        result.status as ContentfulStatusCode,
      );
    return c.json(
      result.data,
      method === "POST" && ["pending", "sending"].includes(result.data.status) ? 202 : 200,
    );
  });
}
app.route("/api/grok/mcp", grokMcp);
// Connector-only bearer scope. Browser session routes below retain Origin checks.
for (const kind of ["openclaw", "hermes", "muse"] as const)
  app.post(`/api/${kind}/:action`, async (c) => {
    c.header("Cache-Control", "no-store");
    const parser = c.req.param("action") === "pair" ? parseOpenClawPairing : parseOpenClawToken;
    const match = parser(c.env, c.req.header("authorization") || "", kind);
    if (!match) return c.json({ error: "unauthorized", message: "连接凭证无效" }, 401);
    if (
      !(await c.env.API_LIMIT.limit({ key: `${kind}:${match.accountId}:${match.pluginId}` }))
        .success
    )
      return c.json({ error: "rate_limited" }, 429);
    const account = c.env.ACCOUNTS.get(c.env.ACCOUNTS.idFromString(match.accountId));
    const payload = await c.req.json();
    const result = JSON.parse(
      c.req.param("action") === "poll"
        ? await connectorPoll(
            account,
            match.pluginId,
            match.secret,
            kind,
            payload,
            c.req.raw.signal,
          )
        : await account.openClawRequest(
            match.pluginId,
            match.secret,
            c.req.param("action"),
            payload,
            kind,
          ),
    );
    return result.ok
      ? c.json(result.data)
      : c.json(
          {
            error: result.error,
            message: result.message,
            ...(result.reason ? { reason: result.reason } : {}),
          },
          result.status as ContentfulStatusCode,
        );
  });
app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  if (
    !["GET", "HEAD"].includes(c.req.method) &&
    !trustedAppOrigins(c.env).includes(c.req.header("origin") || "")
  )
    return c.json({ error: "invalid_origin", message: "请求来源无效" }, 403);
  if (!(await admitSessionLookup(c.env, c.req.raw)).success) return entryLimited();
  const result = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!result) return c.json({ error: "unauthorized", message: "请先登录" }, 401);
  c.set("user", result.user);
  if (!(await c.env.API_LIMIT.limit({ key: result.user.id })).success)
    return c.json({ error: "rate_limited", message: "操作过于频繁，请稍后再试" }, 429);
  await next();
});
app.get("/api/me", (c) => c.json({ user: c.var.user }));
app.get("/api/admin/access", async (c) => c.json({ isAdmin: await isAdmin(c.env, c.var.user.id) }));
app.use("/api/admin/*", async (c, next) => {
  const adminUntil = await adminAccessUntil(c.env, c.var.user.id);
  if (adminUntil <= Date.now()) throw new AppError("admin_required", "此页面仅对管理员开放", 403);
  c.set("adminGrant", { userId: c.var.user.id, adminUntil });
  c.header("X-Robots-Tag", "noindex, nofollow");
  return next();
});
app.get("/api/notices", async (c) => {
  const [feed, connectorUpdate] = await Promise.all([
    listUserNotices(c.env, c.var.user.id, c.req.query()),
    accountForUser(c.env, c.var.user.id).then((account) => account.connectorUpdateNotice()),
  ]);
  return c.json({ ...feed, connectorUpdate });
});
app.post("/api/notices/connector-update/read", async (c) => {
  const body = await c.req.json<{ version?: unknown }>().catch(() => null);
  if (typeof body?.version !== "string" || !connectorVersionPattern.test(body.version))
    throw new AppError("invalid_notice", "通知参数无效", 400);
  const read = await (
    await accountForUser(c.env, c.var.user.id)
  ).readConnectorUpdateNotice(body.version);
  if (!read) throw new AppError("notice_changed", "升级通知已变化，请刷新后查看", 409);
  return c.json({ ok: true });
});
app.post("/api/notices/read-all", async (c) => {
  const parsed = noticeReadAllSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw new AppError("invalid_notice", "通知参数无效", 400);
  if (parsed.data.connectorVersion) {
    const read = await (
      await accountForUser(c.env, c.var.user.id)
    ).readConnectorUpdateNotice(parsed.data.connectorVersion);
    if (!read) throw new AppError("notice_changed", "升级通知已变化，请刷新后查看", 409);
  }
  return c.json(await readAllNotices(c.env, c.var.user.id, parsed.data));
});
// Keep the old close URL as a read alias for browser tabs opened before the upgrade.
for (const action of ["read", "dismiss"] as const)
  app.post(`/api/notices/:id/${action}`, async (c) =>
    c.json(
      await markNotice(
        c.env,
        c.var.user.id,
        c.req.param("id"),
        await c.req.json().catch(() => null),
      ),
    ),
  );
app.get("/api/admin/notices", async (c) => c.json(await listAdminNotices(c.env, c.req.query())));
app.post("/api/admin/notices", async (c) =>
  c.json(await createNotice(c.env, c.var.user.id, await c.req.json().catch(() => null))),
);
app.patch("/api/admin/notices/:id", async (c) =>
  c.json(
    await updateNotice(
      c.env,
      c.var.user.id,
      c.req.param("id"),
      await c.req.json().catch(() => null),
    ),
  ),
);
app.delete("/api/admin/notices/:id", async (c) =>
  c.json(await deleteNotice(c.env, c.req.param("id"), await c.req.json().catch(() => null))),
);
app.get("/api/admin/overview", async (c) => c.json(await adminOverview(c.env)));
app.get("/api/admin/analytics", async (c) =>
  c.json(await getAdminAnalytics(c.env, c.req.query("days"))),
);
app.get("/api/admin/server-status", async (c) => c.json(await adminServerStatus(c.env)));
app.get("/api/admin/users", async (c) => c.json(await adminUsers(c.env, c.req.query())));
app.get("/api/admin/users/:id/membership", async (c) =>
  c.json(await adminMembership(c.env, c.req.param("id"), c.var.adminGrant)),
);
app.post("/api/admin/users/:id/gift-plus", async (c) => {
  const body = await c.req.json().catch(() => null);
  return c.json(await giftAdminMembership(c.env, c.var.adminGrant, c.req.param("id"), body));
});
app.post("/api/admin/sync", async (c) => {
  const body = await c.req.json<{ cursor?: string }>();
  return c.json(await syncAdminStats(c.env, body.cursor, c.var.adminGrant));
});
app.post("/api/kimiseek/start", async (c) => {
  const body = await c.req.json<{ operation?: string }>();
  if (body.operation !== "connect" && body.operation !== "recharge")
    throw new AppError("invalid_operation", "不支持的关联操作");
  const account = await accountForUser(c.env, c.var.user.id, true);
  const flow = await callKimiseek<KimiseekFlow>(account, {
    action: "start",
    operation: body.operation,
  });
  setCookie(c, "wx_kimiseek_flow", flow.id, {
    httpOnly: true,
    sameSite: "Lax",
    secure: c.env.APP_URL.startsWith("https:"),
    path: "/api/kimiseek",
    maxAge: 300,
  });
  const url = new URL("/api/integrations/wechatai/start", kimiseekConfig(c.env).origin);
  url.searchParams.set("flow", flow.id);
  return c.json({ url: url.toString(), flowId: flow.id });
});
app.get("/api/kimiseek/status/:id", async (c) =>
  c.json(
    await callKimiseek<KimiseekFlow>(await accountForUser(c.env, c.var.user.id), {
      action: "status",
      id: c.req.param("id"),
    }),
  ),
);
app.get("/api/kimiseek/balance", async (c) =>
  c.json(
    await callKimiseek<object>(await accountForUser(c.env, c.var.user.id), {
      action: "balance",
      identity: c.var.user,
    }),
  ),
);
app.get("/api/kimiseek/callback", async (c) => {
  c.header("Referrer-Policy", "no-referrer");
  const id = c.req.query("flow") || "";
  const state = c.req.query("state") || "";
  const challenge = c.req.query("challenge") || "";
  if (
    !validIntegrationNonce(id) ||
    !validIntegrationNonce(state) ||
    !validIntegrationNonce(challenge) ||
    getCookie(c, "wx_kimiseek_flow") !== id
  )
    return c.text("关联请求已失效，请回微伴重新点击一键导入。", 400);
  const account = await accountForUser(c.env, c.var.user.id);
  try {
    const flow = await callKimiseek<KimiseekFlow>(account, { action: "claim", id });
    const result = await kimiseekRequest(c.env, c.var.user, flow.operation, {
      id,
      state,
      challenge,
    });
    if (!result.code) throw new AppError("ticket_missing", "KimiSeek 未返回登录凭证", 502);
    await callKimiseek(account, { action: "complete", id, result });
    deleteCookie(c, "wx_kimiseek_flow", { path: "/api/kimiseek" });
    const target = new URL("/api/integrations/wechatai/finish", kimiseekConfig(c.env).origin);
    target.search = new URLSearchParams({ code: result.code, state }).toString();
    return c.redirect(target.toString(), 303);
  } catch (e) {
    const message = e instanceof AppError ? e.message : "关联未完成，请返回微伴重新尝试";
    const policy = kimiseekEmailError(e instanceof AppError ? e.code : undefined);
    await callKimiseek(account, { action: "fail", id, message, errorCode: policy?.code });
    if (policy) {
      deleteCookie(c, "wx_kimiseek_flow", { path: "/api/kimiseek" });
      return c.html(
        html`<!doctype html>
          <html lang="zh-CN">
            <head>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width,initial-scale=1" />
              <title>完成邮箱设置 · 微伴</title>
              <style>
                body {
                  margin: 0;
                  padding: 24px;
                  background: #f7f8f5;
                  color: #26382d;
                  font:
                    16px/1.8 system-ui,
                    sans-serif;
                }
                main {
                  max-width: 520px;
                  margin: 8vh auto;
                  padding: 28px;
                  background: white;
                  border: 1px solid #dce3da;
                  border-radius: 16px;
                }
                h1 {
                  font-size: 24px;
                  line-height: 1.4;
                }
                a {
                  display: inline-block;
                  padding: 10px 0;
                  color: #315f46;
                  text-underline-offset: 4px;
                }
                a:focus-visible {
                  outline: 2px solid currentColor;
                  outline-offset: 4px;
                }
              </style>
            </head>
            <body>
              <main>
                <h1>KimiSeek 关联未完成</h1>
                <p>${message}</p>
                <a href="${policy.href}">${policy.label}</a><br />
                <a href="/app/channels?new=1">返回渠道与模型</a>
              </main>
            </body>
          </html>`,
        403,
      );
    }
    return c.text(`${message}。你可以关闭此页面，回微伴重新操作。`, 400);
  }
});
app.get("/api/referrals", async (c) => c.json(await referralSummary(c.env, c.var.user.id)));
function invoke(
  action: string,
  payload: (c: import("hono").Context<App>) => unknown | Promise<unknown> = () => ({}),
) {
  return async (c: import("hono").Context<App>) => {
    const account = await accountForUser(c.env, c.var.user.id, true);
    const result = JSON.parse(await account.api(action, await payload(c))) as {
      ok: boolean;
      data: object;
      error: string;
      message: string;
      status: number;
    };
    return result.ok
      ? c.json(result.data)
      : c.json(
          { error: result.error, message: result.message },
          result.status as ContentfulStatusCode,
        );
  };
}
// A client can name its visible link explicitly so two open tabs cannot switch
// the other tab's conversation. Empty bodies remain compatible with old clients.
async function activationPayload(c: import("hono").Context<App>) {
  const raw = await c.req.text();
  let payload: unknown = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    throw new AppError("invalid_input", "请求内容无效");
  }
  return {
    id: c.req.param("id"),
    connectionId:
      payload && typeof payload === "object" ? Reflect.get(payload, "connectionId") : undefined,
  };
}
app.get("/api/assets/:id", async (c) =>
  (await accountForUser(c.env, c.var.user.id)).imageAsset(c.req.param("id")),
);
app.get("/api/dashboard", invoke("snapshot"));
app.post("/api/onboarding/dismiss", invoke("onboarding.dismiss"));
app.get("/api/plugins", invoke("plugin.list"));
app.post(
  "/api/plugins/:id/grok/token",
  invoke("plugin.grokToken", (c) => ({ id: c.req.param("id") })),
);
app.delete(
  "/api/plugins/:id/grok/token",
  invoke("plugin.grokRevoke", (c) => ({ id: c.req.param("id") })),
);
app.post(
  "/api/plugins/:id/grok/reopen",
  invoke("plugin.grokReopen", (c) => ({ id: c.req.param("id") })),
);
app.get(
  "/api/plugins/:id/grok/status",
  invoke("plugin.grokStatus", (c) => ({ id: c.req.param("id") })),
);
app.get(
  "/api/plugins/:id/notification",
  invoke("notification.status", (c) => ({ id: c.req.param("id") })),
);
app.post(
  "/api/plugins/:id/notification/token",
  invoke("notification.token", (c) => ({ id: c.req.param("id") })),
);
app.delete(
  "/api/plugins/:id/notification/token",
  invoke("notification.revoke", (c) => ({ id: c.req.param("id") })),
);
app.get(
  "/api/plugins/:id/records/scopes",
  invoke("personal.scopes", (c) => ({ pluginId: c.req.param("id") })),
);
app.post(
  "/api/plugins/:id/records/query",
  invoke("personal.list", async (c) => {
    const body = await c.req.json();
    return { pluginId: c.req.param("id"), query: body, connectionId: body?.connectionId };
  }),
);
app.post(
  "/api/plugins/:id/records",
  invoke("personal.save", async (c) => ({ ...(await c.req.json()), pluginId: c.req.param("id") })),
);
app.delete(
  "/api/plugins/:id/records/:recordId",
  invoke("personal.delete", async (c) => ({
    ...(await c.req.json()),
    pluginId: c.req.param("id"),
    recordId: c.req.param("recordId"),
  })),
);

app.post(
  "/api/plugins/:id/openclaw/pair",
  invoke("plugin.clawPair", (c) => ({ id: c.req.param("id") })),
);
app.post(
  "/api/plugins/:id/openclaw/token",
  invoke("plugin.clawToken", (c) => ({ id: c.req.param("id") })),
);
app.delete(
  "/api/plugins/:id/openclaw/token",
  invoke("plugin.clawRevoke", (c) => ({ id: c.req.param("id") })),
);
app.get(
  "/api/plugins/:id/openclaw/status",
  invoke("plugin.clawStatus", (c) => ({ id: c.req.param("id") })),
);
app.post(
  "/api/plugins/:id/hermes/pair",
  invoke("plugin.hermesPair", (c) => ({ id: c.req.param("id") })),
);
app.post(
  "/api/plugins/:id/hermes/token",
  invoke("plugin.hermesToken", (c) => ({ id: c.req.param("id") })),
);
app.delete(
  "/api/plugins/:id/hermes/token",
  invoke("plugin.hermesRevoke", (c) => ({ id: c.req.param("id") })),
);
app.get(
  "/api/plugins/:id/hermes/status",
  invoke("plugin.hermesStatus", (c) => ({ id: c.req.param("id") })),
);
for (const [method, suffix, action] of [
  ["post", "pair", "Pair"],
  ["post", "token", "Token"],
  ["delete", "token", "Revoke"],
  ["get", "status", "Status"],
] as const)
  app[method](
    `/api/plugins/:id/muse/${suffix}`,
    invoke(`plugin.muse${action}`, (c) => ({ id: c.req.param("id") })),
  );

app.post(
  "/api/plugins/exit",
  invoke("plugin.exit", (c) => c.req.json()),
);
app.post(
  "/api/plugins",
  invoke("plugin.save", async (c) => ({ ...(await c.req.json()), id: undefined })),
);
app.patch(
  "/api/plugins/:id",
  invoke("plugin.save", async (c) => ({ ...(await c.req.json()), id: c.req.param("id") })),
);
app.delete(
  "/api/plugins/:id",
  invoke("plugin.delete", (c) => ({ id: c.req.param("id") })),
);
app.post("/api/plugins/:id/activate", invoke("plugin.activate", activationPayload));
app.post(
  "/api/plugins/:id/test",
  invoke("plugin.test", async (c) => ({ ...(await c.req.json()), id: c.req.param("id") })),
);
app.post(
  "/api/channels",
  invoke("channel.save", (c) => c.req.json()),
);
app.patch(
  "/api/channels/:id",
  invoke("channel.save", async (c) => ({ ...(await c.req.json()), id: c.req.param("id") })),
);
app.delete(
  "/api/channels/:id",
  invoke("channel.delete", (c) => ({ id: c.req.param("id") })),
);
app.post("/api/channels/:id/activate", invoke("channel.activate", activationPayload));
app.post(
  "/api/channels/:id/models/import",
  invoke("channel.importModels", (c) => ({ id: c.req.param("id") })),
);
app.post(
  "/api/channels/:id/models",
  invoke("model.save", async (c) => ({
    ...(await c.req.json()),
    id: undefined,
    channelId: c.req.param("id"),
  })),
);
app.patch(
  "/api/models/:id",
  invoke("model.save", async (c) => ({ ...(await c.req.json()), id: c.req.param("id") })),
);
app.delete(
  "/api/models/:id",
  invoke("assistant.delete", (c) => ({ id: c.req.param("id") })),
);
app.post(
  "/api/models/:id/test",
  invoke("assistant.test", (c) => ({ id: c.req.param("id") })),
);
app.post("/api/models/:id/activate", invoke("assistant.activate", activationPayload));
app.post(
  "/api/assistants",
  invoke("assistant.save", (c) => c.req.json()),
);
app.patch(
  "/api/assistants/:id",
  invoke("assistant.save", async (c) => ({ ...(await c.req.json()), id: c.req.param("id") })),
);
app.delete(
  "/api/assistants/:id",
  invoke("assistant.delete", (c) => ({ id: c.req.param("id") })),
);
app.post(
  "/api/assistants/:id/test",
  invoke("assistant.test", (c) => ({ id: c.req.param("id") })),
);
app.post("/api/assistants/:id/activate", invoke("assistant.activate", activationPayload));
app.get("/api/cloud/storage", invoke("cloud.storage"));
app.get(
  "/api/cloud/tasks",
  invoke("cloud.tasks", (c) => ({
    pluginInstanceId: c.req.query("plugin"),
    cursor: c.req.query("cursor"),
  })),
);
app.get(
  "/api/cloud/tasks/:id",
  invoke("cloud.task", (c) => ({ id: c.req.param("id") })),
);
app.post(
  "/api/cloud/tasks/:id/cancel",
  invoke("cloud.cancel", (c) => ({ id: c.req.param("id") })),
);
app.get("/api/sessions", invoke("session.list"));
app.get(
  "/api/sessions/:id/messages",
  invoke("session.messages", (c) => ({
    id: c.req.param("id"),
    before: Number(c.req.query("before")) || undefined,
  })),
);
app.get(
  "/api/sessions/:id/summary",
  invoke("session.summary", (c) => ({ id: c.req.param("id") })),
);
app.patch(
  "/api/sessions/:id/summary",
  invoke("session.summary.save", async (c) => ({ ...(await c.req.json()), id: c.req.param("id") })),
);
app.post(
  "/api/sessions",
  invoke("session.create", (c) => c.req.json()),
);
app.post(
  "/api/sessions/:id",
  invoke("session.action", async (c) => ({ ...(await c.req.json()), id: c.req.param("id") })),
);
app.delete("/api/privacy/history", invoke("privacy.clear"));
app.post(
  "/api/wechat/links",
  invoke("wechat.create", (c) => c.req.json()),
);
app.patch(
  "/api/wechat/links/:id",
  invoke("wechat.rename", async (c) => ({ ...(await c.req.json()), id: c.req.param("id") })),
);
app.delete(
  "/api/wechat/links/:id",
  invoke("wechat.delete", (c) => ({ id: c.req.param("id") })),
);
for (const action of ["bind", "disconnect", "select"] as const)
  app.post(
    `/api/wechat/links/:id/${action}`,
    invoke(`wechat.${action}`, (c) => ({ id: c.req.param("id") })),
  );
app.post(
  "/api/wechat/links/:id/rebind",
  invoke("wechat.bind", (c) => ({ id: c.req.param("id"), regenerate: true })),
);
app.post(
  "/api/wechat/links/:id/verify",
  invoke("wechat.verify", async (c) => ({ ...(await c.req.json()), id: c.req.param("id") })),
);
app.post("/api/wechat/bind", invoke("wechat.bind"));
app.post(
  "/api/wechat/verify",
  invoke("wechat.verify", (c) => c.req.json()),
);
app.post("/api/wechat/disconnect", invoke("wechat.disconnect"));
app.get("/api/billing/catalog", async (c) => c.json(await catalog(c.env)));
app.post("/api/billing/checkout", async (c) => {
  const data = await c.req.json<{ offerId: string; returnPath?: unknown }>();
  if (typeof data.offerId !== "string") throw new AppError("invalid_plan", "无效的购买方案");
  return c.json(await checkout(c.env, c.var.user, data.offerId, data.returnPath));
});
app.get("/api/billing/checkout-status", async (c) => {
  const status = await checkoutStatus(c.env, c.var.user.id, c.req.query("session_id") || "", {
    request: c.req.raw,
    context: c.executionCtx,
  });
  c.executionCtx.waitUntil(dispatchBillingNotices(c.env, c.executionCtx));
  return c.json(status);
});
app.get("/api/billing/subscription", async (c) =>
  c.json(await subscriptionInfo(c.env, c.var.user.id)),
);
app.post("/api/billing/portal", async (c) => {
  const data = await c.req.json<{ returnPath?: unknown }>().catch(() => null);
  return c.json(await portal(c.env, c.var.user, data?.returnPath));
});
app.notFound((c) => c.json({ error: "not_found", message: "没有找到这个接口" }, 404));
app.onError((error, c) => {
  if (error instanceof AppError)
    return c.json(
      { error: error.code, message: error.message },
      error.status as ContentfulStatusCode,
    );
  const requestId = crypto.randomUUID();
  c.header("X-Request-Id", requestId);
  console.error(
    JSON.stringify({
      event: "request.failed",
      route: routePath(c),
      method: c.req.method,
      status: 500,
      requestId,
    }),
  );
  return c.json({ error: "internal_error", message: "服务暂时不可用，请稍后重试" }, 500);
});
export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    await Promise.all([
      dispatchBillingNotices(env, ctx),
      fallbackWatchdogs(env).catch(() =>
        console.error(JSON.stringify({ event: "wechat.watchdog_fallback_failed" })),
      ),
      env.DB.prepare("DELETE FROM auth_email_limit WHERE last_sent_at<?")
        .bind(Date.now() - 2 * 86_400_000)
        .run()
        .catch(() => console.error(JSON.stringify({ event: "auth.email.cleanup_failed" }))),
      // 访问统计的保留期（180 天）由这里执行：删除语句走 (day) 索引，绝大多数次
      // 运行都删不到东西，代价远小于「让数据无限期留着」。
      // 表还没建（先发代码、后跑迁移的那段时间）是预期内的，不必每分钟刷一条日志；
      // 其他失败照旧记下来。
      pruneExpiredPageViews(env).catch((error: unknown) => {
        if (/no such table/i.test(String(error))) return;
        console.error(JSON.stringify({ event: "analytics.retention_failed" }));
      }),
    ]);
  },
} satisfies ExportedHandler<Env>;
