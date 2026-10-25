import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import authMigration from "../migrations/0001_auth.sql?raw";
import referralMigration from "../migrations/0003_referrals.sql?raw";
import emailMigration from "../migrations/0007_auth_email_limits.sql?raw";
import pageViewsMigration from "../migrations/0014_page_views.sql?raw";
import signupMigration from "../migrations/0015_signup_attributions.sql?raw";
import worker from "../src/server/index";
import { createPageViewReporter } from "../src/client/analytics-client";
import { ANALYTICS_SESSION_HEADER, signupConversionSchema } from "../src/shared/analytics";

const send = vi.fn(async () => ({ messageId: "test-message" }));
const bindings = {
  ...env,
  AUTH_EMAIL_MODE: "cloudflare",
  AUTH_EMAIL_FROM: "verify@example.test",
  AUTH_EMAIL: { send },
  GOOGLE_CLIENT_ID: "analytics-google",
  GOOGLE_CLIENT_SECRET: "test-google-secret",
  GITHUB_CLIENT_ID: "analytics-github",
  GITHUB_CLIENT_SECRET: "test-github-secret",
};
let ip = 0;
const password = "analytics-test-password";
const email = () => `${crypto.randomUUID()}@example.test`;
const cookies = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
async function request(
  path: string,
  body?: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  const ctx = createExecutionContext();
  const response = await worker.fetch(
    new Request(new URL(path, env.APP_URL), {
      method: body ? "POST" : "GET",
      headers: {
        "content-type": "application/json",
        origin: env.APP_URL,
        "cf-connecting-ip": `198.18.1.${++ip}`,
        "user-agent": "Mozilla/5.0",
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    bindings,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}
const signup = (address: string, headers: Record<string, string> = {}) =>
  request(
    "/api/auth/sign-up/email",
    {
      name: "Analytics Test",
      email: address,
      password,
    },
    headers,
  );
const attributions = async () =>
  (
    await env.DB.prepare(
      "SELECT session_id, landing_path, event_id FROM signup_attributions ORDER BY id",
    ).all<{
      session_id: string;
      landing_path: string;
      event_id: string;
    }>()
  ).results;
async function migrate(sql: string) {
  await env.DB.exec(sql.replace(/^--.*$/gm, "").replace(/\n/g, " "));
}
beforeAll(async () => {
  for (const migration of [
    authMigration,
    referralMigration,
    emailMigration,
    pageViewsMigration,
    signupMigration,
  ])
    await migrate(migration);
});
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM page_views").run();
  await env.DB.prepare("DELETE FROM signup_attributions").run();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("Unexpected network request"))),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function landing(pathname = "/wechat-ai") {
  const sent: { path: string; payload: Record<string, unknown> }[] = [];
  const reporter = createPageViewReporter({
    storage: null,
    navigator: {},
    document: { referrer: "" },
    location: { search: "" },
    send: (path, payload) => {
      sent.push({ path, payload });
    },
  });
  reporter.reportPageView({ pathname, key: "landing", search: "", hash: "", visible: true });
  expect((await request(sent[0].path, sent[0].payload)).status).toBe(204);
  return reporter.signupAttribution().analyticsSessionId!;
}

function mockOAuth(address: string) {
  const providerId = crypto.randomUUID();
  vi.mocked(fetch).mockImplementation(async (url) => {
    const target = String(url);
    if (target.includes("oauth2.googleapis.com/token")) {
      const jwt = `${btoa(JSON.stringify({ alg: "none" }))}.${btoa(JSON.stringify({ sub: providerId, email: address, name: "Google Test", email_verified: true }))}.test-signature`;
      return Response.json({
        access_token: "test-token",
        token_type: "Bearer",
        expires_in: 3600,
        id_token: jwt,
      });
    }
    if (target.includes("github.com/login/oauth/access_token"))
      return Response.json({
        access_token: "test-token",
        token_type: "bearer",
        scope: "read:user,user:email",
      });
    if (target.endsWith("/user/emails"))
      return Response.json([{ email: address, primary: true, verified: true }]);
    if (target.endsWith("/user"))
      return Response.json({ id: providerId, login: "test", name: "GitHub Test", email: address });
    throw new Error(`Unexpected OAuth endpoint: ${new URL(target).hostname}`);
  });
}
async function oauth(
  provider: string,
  sessionId?: string,
  callbackHeaders: Record<string, string> = {},
) {
  const start = await request("/api/auth/sign-in/social", {
    provider,
    callbackURL: "/app",
    errorCallbackURL: "/login",
    additionalData: sessionId ? { analyticsSessionId: sessionId } : {},
  });
  expect(start.status).toBe(200);
  const { url } = await start.json<{ url: string }>();
  const state = new URL(url).searchParams.get("state");
  const finish = await request(
    `/api/auth/callback/${provider}?code=test-code&state=${state}`,
    undefined,
    {
      cookie: cookies(start),
      ...callbackHeaders,
    },
  );
  expect(finish.headers.get("location")).toBe("/app");
}

describe("signup analytics follows actual account creation", () => {
  it("accepts real browser IDs and attributes only the first email registration", async () => {
    const sessionId = await landing("/pricing");
    const address = email();
    expect((await signup(address, { [ANALYTICS_SESSION_HEADER]: sessionId })).status).toBe(200);
    const first = await attributions();
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ session_id: sessionId, landing_path: "/pricing" });
    expect(
      signupConversionSchema.safeParse({ sessionId, eventId: first[0].event_id }).success,
    ).toBe(true);

    // 防枚举响应仍然成功；未验证、已验证的重复注册均不产生归因。
    for (const verified of [0, 1]) {
      await env.DB.prepare("UPDATE auth_email_limit SET last_sent_at=0").run();
      await env.DB.prepare('UPDATE "user" SET emailVerified=? WHERE email=?')
        .bind(verified, address)
        .run();
      const repeated = await signup(address, { [ANALYTICS_SESSION_HEADER]: "different-session" });
      expect(repeated.status).toBe(200);
      expect(await repeated.json()).toMatchObject({ token: null });
      expect(await attributions()).toEqual(first);
    }
  });

  it.each<Record<string, string>>([
    {},
    { [ANALYTICS_SESSION_HEADER]: "bad" },
    { [ANALYTICS_SESSION_HEADER]: "optout-session", dnt: "1" },
    { [ANALYTICS_SESSION_HEADER]: "optout-session", "sec-gpc": "1" },
  ])("does not attribute missing, invalid or opted-out context: %j", async (headers) => {
    expect((await signup(email(), headers)).status).toBe(200);
    expect(await attributions()).toEqual([]);
  });

  it.each(["google", "github"])(
    "attributes new %s accounts, but not returning logins",
    async (provider) => {
      const sessionId = await landing("/bring-your-own-api-key");
      mockOAuth(email());
      await oauth(provider, sessionId);
      const first = await attributions();
      expect(first).toHaveLength(1);
      expect(first[0]).toMatchObject({
        session_id: sessionId,
        landing_path: "/bring-your-own-api-key",
      });
      await oauth(provider, "returning-session");
      expect(await attributions()).toEqual(first);
    },
  );

  it("does not count linking OAuth to an existing verified account as a signup", async () => {
    const address = email();
    expect((await signup(address)).status).toBe(200);
    await env.DB.prepare('UPDATE "user" SET emailVerified=1 WHERE email=?').bind(address).run();
    mockOAuth(address);
    await oauth("github", await landing());
    expect(await attributions()).toEqual([]);
  });

  it("honours OAuth opt-out both without context and with GPC at callback", async () => {
    mockOAuth(email());
    await oauth("github");
    mockOAuth(email());
    await oauth("github", "optout-session", { "sec-gpc": "1" });
    expect(await attributions()).toEqual([]);
  });

  it("does not let a missing analytics table fail account creation", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    await env.DB.prepare("DROP TABLE signup_attributions").run();
    try {
      const address = email();
      expect(
        (await signup(address, { [ANALYTICS_SESSION_HEADER]: "missing-table-session" })).status,
      ).toBe(200);
      expect(
        await env.DB.prepare('SELECT id FROM "user" WHERE email=?').bind(address).first(),
      ).not.toBeNull();
      expect(errorLog).toHaveBeenCalledWith(JSON.stringify({ event: "analytics.signup_failed" }));
    } finally {
      await migrate(signupMigration);
    }
  });
});
