import { authEmailMigration, verifiedFixtureCookie } from "./auth-fixtures";
import { env, createExecutionContext } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import migration from "../migrations/0001_auth.sql?raw";
import referralMigration from "../migrations/0003_referrals.sql?raw";
import worker from "../src/server/index";
import { trustedAppOrigins } from "../src/server/config";
import { authReturnPath } from "../src/shared/auth";
const oauthEnv = {
  ...env,
  GOOGLE_CLIENT_ID: "google-local-test",
  GOOGLE_CLIENT_SECRET: "google-test-secret",
  GITHUB_CLIENT_ID: "github-local-test",
  GITHUB_CLIENT_SECRET: "github-test-secret",
};
const headers = {
  "content-type": "application/json",
  origin: env.APP_URL,
  "cf-connecting-ip": "198.51.100.14",
};
const request = (path: string, init?: RequestInit, bindings: Env = oauthEnv) =>
  worker.fetch(new Request(`${env.APP_URL}${path}`, init), bindings, createExecutionContext());
const cookieHeader = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
async function begin(provider = "github", extra: Record<string, unknown> = {}) {
  const response = await request("/api/auth/sign-in/social", {
    method: "POST",
    headers,
    body: JSON.stringify({ provider, callbackURL: "/app", errorCallbackURL: "/login", ...extra }),
  });
  expect(response.status).toBe(200);
  const data = await response.json<{ url: string }>();
  return { url: new URL(data.url), cookie: cookieHeader(response) };
}
async function finish(flow: Awaited<ReturnType<typeof begin>>, extra = "code=test-code") {
  return request(`/api/auth/callback/github?${extra}&state=${flow.url.searchParams.get("state")}`, {
    headers: { cookie: flow.cookie },
  });
}
function mockGitHub(email: string, id: number) {
  vi.mocked(fetch).mockImplementation(async (url) => {
    const target = String(url);
    if (target === "https://github.com/login/oauth/access_token")
      return Response.json({
        access_token: "private-oauth-test-token",
        token_type: "bearer",
        scope: "read:user,user:email",
      });
    if (target === "https://api.github.com/user")
      return Response.json({
        id,
        login: "oauth-tester",
        name: "OAuth Tester",
        email: null,
        avatar_url: "https://example.com/avatar.png",
      });
    if (target === "https://api.github.com/user/emails")
      return Response.json([{ email, primary: true, verified: true }]);
    throw new Error(`Unexpected OAuth endpoint ${target}`);
  });
}
beforeAll(async () => {
  await env.DB.exec(migration);
  await env.DB.exec(referralMigration);
  await env.DB.exec(authEmailMigration.replace(/^--.*$/gm, "").replace(/\n/g, " "));
});
let testIp = 20;
beforeEach(() => {
  headers["cf-connecting-ip"] = `198.51.100.${++testIp}`;
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("Unexpected network request"))),
  );
});
afterEach(() => vi.unstubAllGlobals());
describe("application origin validation", () => {
  const localOrigins = ["http://localhost:5173", "http://127.0.0.1:5173", "http://[::1]:5173"];
  const assistantInput = {
    name: "Origin regression test",
    protocol: "chat-completions",
    baseUrl: "https://api.example.com/v1",
    model: "test-model",
    apiKey: "test-only-provider-key",
  };
  async function signUp(origin: string) {
    const email = `origin-${crypto.randomUUID()}@example.test`;
    const password = "test-only-password";
    const response = await worker.fetch(
      new Request(`${origin}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { ...headers, origin },
        body: JSON.stringify({ name: "Origin Test", email, password }),
      }),
      env,
      createExecutionContext(),
    );
    expect(response.status).toBe(200);
    const { user } = await response.json<{ user: { id: string } }>();
    return { email, password, cookie: await verifiedFixtureCookie(user.id, password, origin) };
  }
  it.each(localOrigins)("allows email login and authenticated writes from %s", async (origin) => {
    const { email, password } = await signUp(origin);
    const login = await worker.fetch(
      new Request(`${origin}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { ...headers, origin },
        body: JSON.stringify({ email, password }),
      }),
      env,
      createExecutionContext(),
    );
    expect(login.status).toBe(200);
    const cookie = cookieHeader(login);
    const me = await request("/api/me", { headers: { cookie } });
    expect(await me.json()).toMatchObject({ user: { email } });
    const save = await request("/api/assistants", {
      method: "POST",
      headers: { ...headers, origin, cookie },
      body: JSON.stringify(assistantInput),
    });
    expect(save.status).toBe(200);
    expect(await save.json()).toMatchObject({ name: assistantInput.name, hasKey: true });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects unrelated, missing, wrong-port, and wrong-protocol origins on auth and app writes", async () => {
    const { cookie } = await signUp(env.APP_URL);
    for (const origin of [
      "https://evil.example",
      "http://localhost.evil.example:5173",
      "http://127.0.0.1:5174",
      "https://localhost:5173",
      "null",
      "",
    ]) {
      const requestHeaders = { ...headers, cookie, origin };
      const auth = await request("/api/auth/sign-out", {
        method: "POST",
        headers: requestHeaders,
        body: "{}",
      });
      expect(auth.status).toBe(403);
      const save = await request("/api/assistants", {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(assistantInput),
      });
      expect(save.status).toBe(403);
      expect(await save.json()).toMatchObject({ error: "invalid_origin" });
    }
  });
  it("does not enable loopback aliases for a production APP_URL", async () => {
    const production = { ...env };
    // Emulate a deployment override of Wrangler's locally typed binding.
    Reflect.set(production, "APP_URL", "https://app.example.com");
    expect(trustedAppOrigins(production)).toEqual([production.APP_URL]);
    for (const origin of localOrigins) {
      const auth = await request(
        "/api/auth/sign-in/email",
        {
          method: "POST",
          headers: { ...headers, origin },
          body: JSON.stringify({ email: "test@example.test", password: "test-only-password" }),
        },
        production,
      );
      expect(auth.status).toBe(403);
      const save = await request(
        "/api/assistants",
        { method: "POST", headers: { ...headers, origin }, body: JSON.stringify(assistantInput) },
        production,
      );
      expect(save.status).toBe(403);
      expect(await save.json()).toMatchObject({ error: "invalid_origin" });
    }
  });
  it("serves authenticated channel/model CRUD and switching without exposing keys", async () => {
    const { cookie } = await signUp(env.APP_URL);
    const write = (path: string, body: unknown, method = "POST", sessionCookie = cookie) =>
      request(path, {
        method,
        headers: { ...headers, cookie: sessionCookie },
        body: JSON.stringify(body),
      });
    const channelInput = {
      name: "HTTP channel",
      protocol: "responses",
      baseUrl: "https://api.example.com",
      apiKey: "http-private-key",
    };
    const created = await write("/api/channels", channelInput);
    expect(created.status).toBe(200);
    const channel = await created.json<{ id: string }>();
    expect(JSON.stringify(channel)).not.toMatch(/http-private-key|encryptedKey|keyContext/);
    const first = await write(`/api/channels/${channel.id}/models`, {
      name: "Alpha",
      model: "alpha",
    });
    const a = await first.json<{ id: string }>();
    const second = await write(`/api/channels/${channel.id}/models`, {
      name: "Beta",
      model: "beta",
    });
    expect(second.status).toBe(200);
    const b = await second.json<{ id: string }>();
    expect((await write(`/api/models/${b.id}/activate`, {})).status).toBe(200);
    expect((await write(`/api/channels/${channel.id}/activate`, {})).status).toBe(200);
    const snapshot = await request("/api/dashboard", { headers: { cookie } });
    expect(await snapshot.json()).toMatchObject({
      channels: [{ id: channel.id }],
      currentSession: { channelId: channel.id, assistantId: b.id, model: "beta" },
    });
    expect(
      (
        await write(
          `/api/models/${a.id}`,
          { channelId: channel.id, model: "alpha", name: "Renamed Alpha" },
          "PATCH",
        )
      ).status,
    ).toBe(200);
    const other = await signUp(env.APP_URL);
    expect(
      (
        await write(
          `/api/channels/${channel.id}`,
          { ...channelInput, name: "Not my channel" },
          "PATCH",
          other.cookie,
        )
      ).status,
    ).toBe(404);
    const importPath = `/api/channels/${channel.id}/models/import`;
    expect((await write(importPath, {}, "POST", other.cookie)).status).toBe(404);
    expect((await request(importPath, { method: "POST", headers })).status).toBe(401);
    expect(
      (
        await request(importPath, {
          method: "POST",
          headers: { ...headers, cookie, origin: "https://untrusted.example.com" },
        })
      ).status,
    ).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url).includes("cloudflare-dns.com")
        ? Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] })
        : Response.json({ data: [{ id: "alpha" }, { id: "gamma" }] }),
    );
    const imported = await write(importPath, {});
    expect(imported.status).toBe(200);
    expect(await imported.json()).toEqual({
      total: 2,
      imported: 1,
      existing: 1,
      invalid: 0,
      limited: 0,
    });
    expect((await write(`/api/models/${a.id}`, {}, "DELETE")).status).toBe(200);
    expect((await write(`/api/channels/${channel.id}`, {}, "DELETE")).status).toBe(200);
    const empty = await request("/api/dashboard", { headers: { cookie } });
    expect(await empty.json()).toMatchObject({
      channels: [],
      assistants: [],
      currentSession: null,
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
describe("Google and GitHub OAuth", () => {
  it("returns new and existing OAuth users to the upgrade page after authorization", async () => {
    const returnTo = authReturnPath("/app/billing");
    mockGitHub(`upgrade-${crypto.randomUUID()}@example.test`, 987603);
    for (let i = 0; i < 2; i++) {
      const response = await finish(
        await begin("github", {
          callbackURL: returnTo,
          newUserCallbackURL: returnTo,
        }),
      );
      expect(response.headers.get("location")).toBe("/app/billing");
      expect(cookieHeader(response)).toContain("session_token=");
    }
  });
  it("preserves membership return paths and rejects external or unrelated destinations", () => {
    expect(authReturnPath("/app/billing?checkout=cancelled#plans")).toBe(
      "/app/billing?checkout=cancelled#plans",
    );
    for (const path of [
      null,
      "https://evil.example",
      "//evil.example/app",
      "/\\evil.example/app",
      "/login",
      "/app/../../login",
      "/api/auth/sign-out",
      "/application",
    ]) {
      expect(authReturnPath(path)).toBe("/app");
    }
  });
  it("exposes only completely configured providers without disclosing credentials", async () => {
    const none = await request("/api/auth/providers", undefined, env);
    expect(none.status).toBe(200);
    expect(await none.json()).toEqual({ providers: [] });
    const partialEnv = {
      ...env,
      GOOGLE_CLIENT_ID: "id-without-secret",
      GITHUB_CLIENT_ID: "github-id",
      GITHUB_CLIENT_SECRET: "secret",
    };
    const partial = await request("/api/auth/providers", undefined, partialEnv);
    expect(await partial.json()).toEqual({ providers: ["github"] });
    const both = await request("/api/auth/providers");
    expect(both.headers.get("cache-control")).toBe("no-store");
    expect(await both.json()).toEqual({ providers: ["google", "github"] });
  });
  it.each(["google", "github"])(
    "starts %s authorization with the correct callback and state",
    async (provider) => {
      const flow = await begin(provider);
      expect(flow.url.hostname).toBe(provider === "google" ? "accounts.google.com" : "github.com");
      expect(flow.url.searchParams.get("redirect_uri")).toBe(
        `${env.APP_URL}/api/auth/callback/${provider}`,
      );
      expect(flow.url.searchParams.get("client_id")).toBe(`${provider}-local-test`);
      expect(flow.url.searchParams.get("state")).toBeTruthy();
      expect(flow.cookie).toBeTruthy();
      expect(flow.url.toString()).not.toContain("test-secret");
      if (provider === "google")
        expect(flow.url.searchParams.get("code_challenge_method")).toBe("S256");
      else expect(flow.url.searchParams.get("scope")).toContain("user:email");
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("rejects a callback redirect to an unrelated site", async () => {
    const response = await request("/api/auth/sign-in/social", {
      method: "POST",
      headers,
      body: JSON.stringify({ provider: "google", callbackURL: "https://evil.example/steal" }),
    });
    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects a callback with forged state before contacting the provider", async () => {
    const response = await request("/api/auth/callback/github?code=fake&state=forged");
    expect(response.status).toBe(302);
    const redirect = new URL(response.headers.get("location")!);
    expect(redirect.pathname).toBe("/login");
    expect(redirect.searchParams.get("error")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("returns canceled consent to the login page without creating a session", async () => {
    const response = await finish(await begin(), "error=access_denied");
    expect(response.headers.get("location")).toBe("/login?error=access_denied");
    expect(cookieHeader(response)).not.toContain("session_token=");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("creates a session from a private verified GitHub email, encrypts tokens, and reuses the same user", async () => {
    const email = `oauth-${crypto.randomUUID()}@example.test`;
    mockGitHub(email, 987601);
    const response = await finish(await begin());
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/app");
    const cookie = cookieHeader(response);
    expect(cookie).toContain("session_token=");
    const me = await request("/api/me", { headers: { cookie } });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ user: { email, name: "OAuth Tester" } });
    const row = await env.DB.prepare(
      "SELECT accessToken FROM account WHERE providerId = 'github' AND accountId = ?",
    )
      .bind("987601")
      .first<{ accessToken: string }>();
    expect(row?.accessToken).toBeTruthy();
    expect(row?.accessToken).not.toBe("private-oauth-test-token");
    const second = await finish(await begin());
    expect(second.headers.get("location")).toBe("/app");
    expect(
      (
        await env.DB.prepare("SELECT COUNT(*) AS n FROM user WHERE email = ?")
          .bind(email)
          .first<{ n: number }>()
      )?.n,
    ).toBe(1);
  });
  it("does not implicitly link an OAuth identity into an unverified pre-existing email account", async () => {
    const id = crypto.randomUUID();
    const email = `unverified-${id}@example.test`;
    await env.DB.prepare(
      "INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?, ?, ?, 0, ?, ?)",
    )
      .bind(id, "Unverified", email, Date.now(), Date.now())
      .run();
    mockGitHub(email, 987602);
    const response = await finish(await begin());
    expect(response.headers.get("location")).toContain("account_not_linked");
    expect(cookieHeader(response)).not.toContain("session_token=");
    expect(
      (
        await env.DB.prepare("SELECT COUNT(*) AS n FROM account WHERE userId = ?")
          .bind(id)
          .first<{ n: number }>()
      )?.n,
    ).toBe(0);
  });
});
