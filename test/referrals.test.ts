import {
  env,
  createExecutionContext,
  runInDurableObject,
  runDurableObjectAlarm,
  abortAllDurableObjects,
} from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { serializeSigned } from "hono/utils/cookie";
import authMigration from "../migrations/0001_auth.sql?raw";
import referralMigration from "../migrations/0003_referrals.sql?raw";
import worker from "../src/server/index";
import { referralSummary, qualifyReferral, wechatIdentityHash } from "../src/server/referrals";
import { encrypt } from "../src/server/security";
import { Wallet } from "../src/server/wallet";
import type { WxMessage } from "../src/server/wechat";

const oauthEnv = {
  ...env,
  GOOGLE_CLIENT_ID: "referral-google",
  GOOGLE_CLIENT_SECRET: "test-google-secret",
  GITHUB_CLIENT_ID: "referral-github",
  GITHUB_CLIENT_SECRET: "test-github-secret",
};
const accounts = new Set<string>();
let ip = 1;
const request = (path: string, init?: RequestInit) =>
  worker.fetch(new Request(`${env.APP_URL}${path}`, init), oauthEnv, createExecutionContext());
const cookies = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
const post = (path: string, body: unknown, cookie = "") =>
  request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: env.APP_URL,
      cookie,
      "cf-connecting-ip": `192.0.2.${ip++}`,
    },
    body: JSON.stringify(body),
  });
beforeAll(async () => {
  await env.DB.exec(authMigration);
  await env.DB.exec(referralMigration);
});
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("Unexpected outbound request"))),
  ),
);
afterEach(async () => {
  for (const id of accounts)
    await runInDurableObject(env.ACCOUNTS.getByName(id), async (_, state) => {
      await state.storage.deleteAlarm();
    });
  accounts.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function user(referrerId: string | null = null) {
  const id = crypto.randomUUID();
  accounts.add(id);
  await env.DB.prepare(
    "INSERT INTO user (id, name, email, referrerId, createdAt, updatedAt) VALUES (?, '测试好友', ?, ?, ?, ?)",
  )
    .bind(id, `${id}@example.test`, referrerId, Date.now(), Date.now())
    .run();
  return id;
}
async function pair() {
  const inviter = await user();
  const summary = await referralSummary(env, inviter);
  const invitee = await user(inviter);
  return { inviter, invitee, code: summary.url.split("/").at(-1)! };
}
async function register(cookie = "", extra: Record<string, unknown> = {}) {
  const email = `${crypto.randomUUID()}@example.test`;
  const response = await post(
    "/api/auth/sign-up/email",
    { name: "新朋友", email, password: "test-password-123", ...extra },
    cookie,
  );
  expect(response.status).toBe(200);
  const result = await response.json<{ user: { id: string; referrerId?: string } }>();
  expect(result.user.referrerId).toBeUndefined();
  accounts.add(result.user.id);
  return { id: result.user.id, cookie: cookies(response), email };
}
async function relationship(id: string) {
  return env.DB.prepare("SELECT * FROM referral WHERE invitee_id = ?")
    .bind(id)
    .first<{ status: string; inviter_id: string }>();
}

describe("invitation attribution", () => {
  it("atomically attributes a new email user, keeps the first valid invitation, and grants nothing at signup", async () => {
    const a = await pair();
    const b = await pair();
    const landing = await request(`/invite/${a.code}`);
    expect(landing.status).toBe(303);
    expect(landing.headers.get("location")).toBe(`${env.APP_URL}/register?invitation=accepted`);
    expect(landing.headers.get("set-cookie")).toContain("HttpOnly");
    const cookie = cookies(landing);
    const second = await request(`/invite/${b.code}`, { headers: { cookie } });
    expect(second.headers.get("set-cookie")).toBeNull();
    const created = await register(cookie);
    expect(await relationship(created.id)).toMatchObject({
      inviter_id: a.inviter,
      status: "pending",
    });
    expect((await env.ACCOUNTS.getByName(created.id).snapshot()).wallet.referral).toBe(0);
    expect(
      await (await request("/api/referrals/attribution", { headers: { cookie } })).json(),
    ).toEqual({ active: true });
    await expect(
      env.DB.prepare("UPDATE user SET referrerId = ? WHERE id = ?")
        .bind(b.inviter, created.id)
        .run(),
    ).rejects.toThrow();
    const own = await request("/api/referrals", { headers: { cookie: created.cookie } });
    expect(own.status).toBe(200);
    expect(await own.json()).toMatchObject({ registered: 0, received: "pending" });
    expect((await request("/api/referrals")).status).toBe(401);
  });
  it("ignores forged fields, tampered or expired cookies, invalid codes and existing-account logins", async () => {
    const a = await pair();
    const forged = await post("/api/auth/sign-up/email", {
      name: "Forged",
      email: `${crypto.randomUUID()}@example.test`,
      password: "test-password-123",
      referrerId: a.inviter,
    });
    expect(forged.status).toBe(400);
    const created = await register();
    expect(await relationship(created.id)).toBeNull();
    const invalid = await request("/invite/not-valid");
    expect(invalid.headers.get("location")).toContain("invitation=invalid");
    expect(invalid.headers.get("set-cookie")).toBeNull();
    const expired = await serializeSigned(
      "wechatai_referral",
      `${a.code}:${Date.now() - 1000}`,
      env.BETTER_AUTH_SECRET,
    );
    for (const cookie of [`wechatai_referral=${a.code}.forged`, expired]) {
      expect(await relationship((await register(cookie)).id)).toBeNull();
    }
    const landing = await request(`/invite/${a.code}`);
    const login = await post(
      "/api/auth/sign-in/email",
      { email: created.email, password: "test-password-123" },
      cookies(landing),
    );
    expect(login.status).toBe(200);
    expect(await relationship(created.id)).toBeNull();
    const self = await referralSummary(env, created.id);
    const selfLanding = await request(new URL(self.url).pathname);
    await post(
      "/api/auth/sign-in/email",
      { email: created.email, password: "test-password-123" },
      cookies(selfLanding),
    );
    expect(await relationship(created.id)).toBeNull();
  });
  it.each(["github", "google"])(
    "preserves attribution through %s OAuth and never reassigns returning users",
    async (provider) => {
      const a = await pair();
      const referralCookie = cookies(await request(`/invite/${a.code}`));
      const email = `${crypto.randomUUID()}@example.test`;
      const providerId = crypto.randomUUID();
      vi.mocked(fetch).mockImplementation(async (url) => {
        const target = String(url);
        if (target.includes("oauth2.googleapis.com/token")) {
          const jwt = `${btoa(JSON.stringify({ alg: "none" }))}.${btoa(JSON.stringify({ sub: providerId, email, name: "Google Friend", email_verified: true }))}.test-signature`;
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
          return Response.json([{ email, primary: true, verified: true }]);
        if (target.endsWith("/user"))
          return Response.json({ id: providerId, login: "friend", name: "GitHub Friend", email });
        throw new Error(`Unexpected OAuth endpoint: ${new URL(target).hostname}`);
      });
      async function login(cookie: string) {
        const start = await post(
          "/api/auth/sign-in/social",
          { provider, callbackURL: "/app", errorCallbackURL: "/login" },
          cookie,
        );
        const { url } = await start.json<{ url: string }>();
        const state = new URL(url).searchParams.get("state");
        const finish = await request(
          `/api/auth/callback/${provider}?code=test-code&state=${state}`,
          { headers: { cookie: `${cookie}; ${cookies(start)}` } },
        );
        expect(finish.headers.get("location")).toBe("/app");
        const me = await request("/api/me", { headers: { cookie: cookies(finish) } });
        expect(me.status).toBe(200);
        return (await me.json<{ user: { id: string } }>()).user.id;
      }
      const id = await login(referralCookie);
      accounts.add(id);
      expect(await relationship(id)).toMatchObject({ inviter_id: a.inviter, status: "pending" });
      const b = await pair();
      expect(await login(cookies(await request(`/invite/${b.code}`)))).toBe(id);
      expect(await relationship(id)).toMatchObject({ inviter_id: a.inviter });
    },
  );
});

const model = {
  name: "Referral model",
  protocol: "responses",
  baseUrl: "https://llm.example.com",
  model: "test",
  apiKey: "test-key",
  maxOutputTokens: 256,
  contextTokens: 8000,
  maxCredits: 30,
};
async function connect(id: string, wxId = crypto.randomUUID()) {
  const stub = env.ACCOUNTS.getByName(id);
  await stub.identify(id);
  expect(JSON.parse(await stub.api("assistant.save", model)).ok).toBe(true);
  await runInDurableObject(stub, async (_, state) => {
    const encryptedCredentials = await encrypt(
      env,
      JSON.stringify({
        userId: wxId,
        botId: "bot-test",
        token: "test-wx",
        baseUrl: "https://ilinkai.weixin.qq.com",
      }),
      `${state.id}:wechat`,
    );
    state.storage.sql.exec(
      "INSERT OR REPLACE INTO settings VALUES ('connection', ?)",
      JSON.stringify({
        status: "connected",
        encryptedCredentials,
        generation: "test",
        contextToken: "test-context",
        cursor: "",
      }),
    );
    await state.storage.setAlarm(Date.now() + 60000);
  });
  return { stub, wxId };
}
function network(wxId: string) {
  const batches: WxMessage[][] = [];
  const control = { modelFails: false, sendFails: false, modelCalls: 0 };
  vi.mocked(fetch).mockImplementation(async (url) => {
    const target = String(url);
    if (target.includes("getupdates"))
      return Response.json({ ret: 0, msgs: batches.shift() ?? [], get_updates_buf: "cursor" });
    if (target.includes("sendmessage"))
      return control.sendFails
        ? Response.json({ ret: 1 }, { status: 503 })
        : Response.json({ ret: 0 });
    if (target.includes("cloudflare-dns.com"))
      return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
    if (target.includes("/responses")) {
      control.modelCalls++;
      return control.modelFails
        ? Response.json({ error: { message: "failed" } }, { status: 500 })
        : Response.json({
            output: [{ content: [{ type: "output_text", text: "你好" }] }],
            usage: { input_tokens: 100, output_tokens: 10 },
          });
    }
    throw new Error("Unexpected endpoint");
  });
  return {
    control,
    send: (text = "你好", id = 1) =>
      batches.push([
        {
          message_id: id,
          message_type: 1,
          from_user_id: wxId,
          context_token: "test-context",
          item_list: [{ type: 1, text_item: { text } }],
        },
      ]),
  };
}
async function tick(stub: ReturnType<typeof env.ACCOUNTS.getByName>, n = 1) {
  for (let i = 0; i < n; i++) await runDurableObjectAlarm(stub);
}

describe("permanent bilateral invitation rewards", () => {
  it("rewards both accounts only after a successful model reply is delivered, then remains idempotent across replay and restart", async () => {
    const { inviter, invitee } = await pair();
    const { stub, wxId } = await connect(invitee);
    const net = network(wxId);
    net.send();
    await tick(stub, 2);
    expect((await stub.snapshot()).wallet.referral).toBe(0);
    net.control.sendFails = true;
    await tick(stub);
    expect((await stub.snapshot()).wallet.referral).toBe(0);
    net.control.sendFails = false;
    await tick(stub, 2);
    expect(await relationship(invitee)).toMatchObject({ status: "rewarded" });
    for (const id of [inviter, invitee]) {
      const snapshot = await env.ACCOUNTS.getByName(id).snapshot();
      expect(snapshot.wallet.referral).toBe(500);
      expect(snapshot.ledger.filter((row) => row.kind === "referral")).toHaveLength(1);
    }
    expect(await referralSummary(env, inviter)).toMatchObject({
      registered: 1,
      completed: 1,
      earned: 500,
      recent: [{ name: "测***" }],
    });
    await abortAllDurableObjects();
    const reopened = env.ACCOUNTS.getByName(invitee);
    await Promise.all(
      Array.from({ length: 4 }, () => reopened.applyReferralReward(invitee, "invitee")),
    );
    net.send("你好", 2);
    await tick(reopened, 4);
    expect((await reopened.snapshot()).wallet.referral).toBe(500);
    expect((await env.ACCOUNTS.getByName(inviter).snapshot()).wallet.referral).toBe(500);
  });
  it("does not count commands, model tests or failed model requests", async () => {
    const { invitee } = await pair();
    const { stub, wxId } = await connect(invitee);
    const net = network(wxId);
    const a = (await stub.snapshot()).assistants[0];
    expect(JSON.parse(await stub.api("assistant.test", { id: a.id })).ok).toBe(true);
    net.send("/help");
    await tick(stub, 4);
    net.control.modelFails = true;
    net.send("你好", 2);
    await tick(stub, 4);
    expect(await relationship(invitee)).toMatchObject({ status: "pending" });
    expect((await stub.snapshot()).wallet.referral).toBe(0);
    expect(JSON.parse(await stub.api("referral.grant", { units: 999999 }))).toMatchObject({
      ok: false,
      status: 404,
    });
  });
  it("retries a partially delivered reward after disconnect and never grants the first half twice", async () => {
    const { inviter, invitee } = await pair();
    const { stub, wxId } = await connect(invitee);
    const net = network(wxId);
    const inviterStub = env.ACCOUNTS.getByName(inviter);
    await runInDurableObject(inviterStub, (_, state) =>
      state.storage.sql.exec(
        "CREATE TRIGGER fail_referral BEFORE INSERT ON credit_buckets WHEN NEW.kind = 'referral' BEGIN SELECT RAISE(ABORT, 'test failure'); END",
      ),
    );
    net.send();
    await tick(stub, 4);
    expect(await relationship(invitee)).toMatchObject({ status: "qualified" });
    expect((await stub.snapshot()).wallet.referral).toBe(500);
    expect((await inviterStub.snapshot()).wallet.referral).toBe(0);
    await stub.api("wechat.disconnect");
    await runInDurableObject(inviterStub, (_, state) =>
      state.storage.sql.exec("DROP TRIGGER fail_referral"),
    );
    await abortAllDurableObjects();
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 61000);
    await tick(env.ACCOUNTS.getByName(invitee));
    expect(await relationship(invitee)).toMatchObject({ status: "rewarded" });
    expect((await env.ACCOUNTS.getByName(invitee).snapshot()).wallet.referral).toBe(500);
    expect((await env.ACCOUNTS.getByName(inviter).snapshot()).wallet.referral).toBe(500);
  });
  it("rejects the inviter's own WeChat and repeated new accounts using the same WeChat", async () => {
    const a = await pair();
    const { wxId } = await connect(a.inviter);
    const self = await qualifyReferral(env, a.invitee, await wechatIdentityHash(wxId));
    expect(self?.status).toBe("ineligible");
    const b = await pair();
    const shared = await wechatIdentityHash(crypto.randomUUID());
    const other = await user(b.inviter);
    const results = await Promise.all([
      qualifyReferral(env, b.invitee, shared),
      qualifyReferral(env, other, shared),
    ]);
    expect(results.map((r) => r?.status).sort()).toEqual(["ineligible", "qualified"]);
    await runInDurableObject(env.ACCOUNTS.getByName(a.invitee), async (instance) => {
      await expect(instance.applyReferralReward(a.invitee, "invitee")).rejects.toThrow();
    });
    await runInDurableObject(env.ACCOUNTS.getByName(a.inviter), async (instance) => {
      await expect(instance.applyReferralReward(b.invitee, "inviter")).rejects.toThrow();
    });
  });
  it("keeps rewards permanently, prioritizes daily credits and repays existing debt", async () => {
    const { inviter, invitee } = await pair();
    await qualifyReferral(env, invitee, await wechatIdentityHash(crypto.randomUUID()));
    const stub = env.ACCOUNTS.getByName(invitee);
    await stub.snapshot();
    await runInDurableObject(stub, (_, state) =>
      new Wallet(state.storage).charge("debt", 108000, 108000),
    );
    await stub.applyReferralReward(invitee, "invitee");
    expect((await stub.snapshot()).wallet).toMatchObject({ debt: 0, balance: 492, referral: 492 });
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 365 * 86400000);
    expect((await stub.snapshot()).wallet).toMatchObject({ daily: 100, referral: 492 });
    await runInDurableObject(stub, (_, state) =>
      new Wallet(state.storage).charge("daily-first", 1000, 1000),
    );
    expect((await stub.snapshot()).wallet).toMatchObject({ daily: 99, referral: 492 });
    await runInDurableObject(env.ACCOUNTS.getByName(inviter), (instance) => {
      expect(() => instance.identify(invitee)).toThrow();
    });
  });
});
