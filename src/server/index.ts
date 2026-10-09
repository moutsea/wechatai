import { parseOpenClawToken, parseOpenClawPairing } from "./openclaw-token";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { availableAuthProviders, createAuth } from "./auth";
import { AppError, trustedAppOrigins } from "./config";
import { catalog, checkout, checkoutStatus, subscriptionInfo, portal, webhook } from "./billing";
import { acceptReferral, referralSummary, registrationReferrer } from "./referrals";
import { publicPluginDocs } from "./plugin-docs";
export { PersonalAccount } from "./personal-account";
type App = { Bindings: Env; Variables: { user: { id: string; email: string; name: string } } };
const app = new Hono<App>();
app.use("*", secureHeaders());
app.use(
  "/api/*",
  bodyLimit({
    maxSize: 128 * 1024,
    onError: (c) => c.json({ error: "body_too_large", message: "请求内容过大" }, 413),
  }),
);
app.get("/api/health", (c) => c.json({ ok: true, service: "wechatai" }));
app.route("/", publicPluginDocs);
app.get("/invite/:code", (c) => acceptReferral(c.env, c.req.param("code"), c.req.raw));
app.use("/api/auth/*", async (c, next) => {
  if (
    c.req.method === "POST" &&
    !(await c.env.AUTH_LIMIT.limit({ key: c.req.header("cf-connecting-ip") || "local" })).success
  )
    return c.json({ message: "尝试过于频繁，请稍后再试" }, 429);
  return next();
});
app.get("/api/auth/providers", (c) => {
  c.header("Cache-Control", "no-store");
  return c.json({ providers: availableAuthProviders(c.env) });
});
app.get("/api/referrals/attribution", async (c) => {
  c.header("Cache-Control", "no-store");
  return c.json({ active: Boolean(await registrationReferrer(c.env, c.req.raw.headers)) });
});
app.on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));
app.post("/api/billing/webhook", async (c) => {
  await webhook(c.env, await c.req.text(), c.req.header("stripe-signature") || "");
  return c.json({ received: true });
});
// Connector-only bearer scope. Browser session routes below retain Origin checks.
for (const kind of ["openclaw", "hermes"] as const)
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
    const result = JSON.parse(
      await account.openClawRequest(
        match.pluginId,
        match.secret,
        c.req.param("action"),
        await c.req.json(),
        kind,
      ),
    );
    return result.ok
      ? c.json(result.data)
      : c.json(
          { error: result.error, message: result.message },
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
  const result = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!result) return c.json({ error: "unauthorized", message: "请先登录" }, 401);
  c.set("user", result.user);
  if (!(await c.env.API_LIMIT.limit({ key: result.user.id })).success)
    return c.json({ error: "rate_limited", message: "操作过于频繁，请稍后再试" }, 429);
  await next();
});
app.get("/api/me", (c) => c.json({ user: c.var.user }));
app.get("/api/referrals", async (c) => c.json(await referralSummary(c.env, c.var.user.id)));
function invoke(
  action: string,
  payload: (c: import("hono").Context<App>) => unknown | Promise<unknown> = () => ({}),
) {
  return async (c: import("hono").Context<App>) => {
    const account = c.env.ACCOUNTS.getByName(c.var.user.id);
    await account.identify(c.var.user.id);
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
  c.env.ACCOUNTS.getByName(c.var.user.id).imageAsset(c.req.param("id")),
);
app.get("/api/dashboard", invoke("snapshot"));
app.get("/api/plugins", invoke("plugin.list"));
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
app.get("/api/sessions", invoke("session.list"));
app.get(
  "/api/sessions/:id/messages",
  invoke("session.messages", (c) => ({
    id: c.req.param("id"),
    before: Number(c.req.query("before")) || undefined,
  })),
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
app.post("/api/wechat/bind", invoke("wechat.bind"));
app.post("/api/wechat/disconnect", invoke("wechat.disconnect"));
app.get("/api/billing/catalog", async (c) => c.json(await catalog(c.env)));
app.post("/api/billing/checkout", async (c) => {
  const data = await c.req.json<{ offerId: string }>();
  if (typeof data.offerId !== "string") throw new AppError("invalid_plan", "无效的购买方案");
  return c.json(await checkout(c.env, c.var.user, data.offerId));
});
app.get("/api/billing/checkout-status", async (c) =>
  c.json(await checkoutStatus(c.env, c.var.user.id, c.req.query("session_id") || "")),
);
app.get("/api/billing/subscription", async (c) =>
  c.json(await subscriptionInfo(c.env, c.var.user.id)),
);
app.post("/api/billing/portal", async (c) => c.json(await portal(c.env, c.var.user)));
app.notFound((c) => c.json({ error: "not_found", message: "没有找到这个接口" }, 404));
app.onError((error, c) => {
  if (error instanceof AppError)
    return c.json(
      { error: error.code, message: error.message },
      error.status as ContentfulStatusCode,
    );
  console.error(
    JSON.stringify({ event: "request.failed", path: c.req.path, errorType: error.name }),
  );
  return c.json({ error: "internal_error", message: "服务暂时不可用，请稍后重试" }, 500);
});
export default { fetch: app.fetch } satisfies ExportedHandler<Env>;
