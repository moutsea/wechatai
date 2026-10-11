import { env, runInDurableObject, createExecutionContext } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { secret } from "../src/server/config";
import { callKimiseek, type KimiseekFlow } from "../src/server/kimiseek";
import { integrationNonce, kimiseekRequest, type KimiseekResponse } from "../src/server/kimiseek";
import { validateModelBaseUrl, validateModelDNS } from "../src/server/security";
import { inferModelKind } from "../src/shared/model-kind";
import { parseAvailableModel } from "../src/server/model-catalog";
import worker from "../src/server/index";
import migration from "../migrations/0001_auth.sql?raw";
import referrals from "../migrations/0003_referrals.sql?raw";

const api = async (
  stub: DurableObjectStub<import("../src/server/personal-account").PersonalAccount>,
  action: string,
  data = {},
) => JSON.parse(await stub.api(action, data));
const result: KimiseekResponse = {
  apiKey: "ks-test-secret-not-public",
  code: "x".repeat(43),
  balance: { amount: 12.5, currency: "CNY", checkedAt: Date.now() },
  models: [
    { id: "qwen-image-3.0", kind: "image" },
    { id: "qwen3.8-max", kind: "chat", name: "千问 Max", context_window: 262144 },
  ],
};
afterEach(() => vi.unstubAllGlobals());
describe("KimiSeek import", () => {
  it("imports once, selects text before images, encrypts the key and preserves model settings on reconnect", async () => {
    const account = env.ACCOUNTS.getByName(crypto.randomUUID());
    const flow = await callKimiseek<KimiseekFlow>(account, {
      action: "start",
      operation: "connect",
    });
    await callKimiseek(account, { action: "claim", id: flow.id });
    await callKimiseek(account, { action: "complete", id: flow.id, result });
    const before = await account.snapshot();
    expect(before.channels).toHaveLength(1);
    expect(before.channels[0]).toMatchObject({ integration: "kimiseek", hasKey: true });
    expect(before.assistants.map((a) => a.kind)).toEqual(["text", "image"]);
    expect(before.currentSession?.model).toBe("qwen3.8-max");
    expect(before.assistants[0].contextTokens).toBe(262144);
    expect(before.assistants[0].maxOutputTokens).toBe(8192);
    expect(JSON.stringify(before)).not.toMatch(/ks-test-secret|encryptedKey|keyContext/);
    const model = before.assistants[0];
    await api(account, "model.save", {
      ...model,
      systemPrompt: "用户的提示词",
      maxInputTokens: 4096,
      maxOutputTokens: 2048,
    });
    const again = await callKimiseek<KimiseekFlow>(account, {
      action: "start",
      operation: "connect",
    });
    await callKimiseek(account, { action: "claim", id: again.id });
    await callKimiseek(account, { action: "complete", id: again.id, result });
    const after = await account.snapshot();
    expect(after.channels[0].id).toBe(before.channels[0].id);
    expect(after.assistants).toHaveLength(2);
    expect(after.assistants[0]).toMatchObject({
      id: model.id,
      systemPrompt: "用户的提示词",
      maxInputTokens: 4096,
      maxOutputTokens: 2048,
    });
    expect(after.currentSession).toEqual(before.currentSession);
    await expect(callKimiseek(account, { action: "claim", id: again.id })).rejects.toThrow();
  });
  it("rejects expired, cross-account and unclaimed flows and enforces channel limits", async () => {
    const a = env.ACCOUNTS.getByName(crypto.randomUUID());
    const b = env.ACCOUNTS.getByName(crypto.randomUUID());
    const flow = await callKimiseek<KimiseekFlow>(a, { action: "start", operation: "connect" });
    await expect(callKimiseek(b, { action: "complete", id: flow.id, result })).rejects.toThrow();
    await expect(callKimiseek(a, { action: "complete", id: flow.id, result })).rejects.toThrow();
    await runInDurableObject(a, (_, state) =>
      state.storage.sql.exec(
        "UPDATE settings SET value=? WHERE key='kimiseekFlow'",
        JSON.stringify({ ...flow, expires: 1 }),
      ),
    );
    await expect(callKimiseek(a, { action: "claim", id: flow.id })).rejects.toThrow();
    for (let i = 0; i < 3; i++)
      await api(a, "channel.save", {
        name: `channel ${i}`,
        baseUrl: "https://api.example.com",
        protocol: "chat-completions",
        apiKey: "key",
      });
    await expect(
      callKimiseek<KimiseekFlow>(a, { action: "start", operation: "connect" }),
    ).rejects.toThrow();
  });
  it("signs only server identity and never follows a service redirect", async () => {
    const identity = {
      id: "user-a",
      name: "Name",
      email: "test@example.com",
      emailVerified: false,
    };
    let captured: Request | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (request: Request) => {
        captured = request;
        return Response.json(result);
      }),
    );
    await kimiseekRequest(env, identity, "connect", {
      id: integrationNonce(),
      state: integrationNonce(),
      challenge: integrationNonce(),
    });
    const body = await captured!.text();
    expect(captured?.redirect).toBe("manual");
    expect(JSON.parse(body)).toMatchObject({
      sub: identity.id,
      emailVerified: false,
      operation: "connect",
      aud: "https://kimiseek.example.com",
    });
    expect(captured!.headers.get("x-wechatai-signature")).toBe(
      createHmac("sha256", secret(env, "KIMISEEK_CONNECT_SECRET")).update(body).digest("hex"),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(null, {
            status: 302,
            headers: { location: "https://attacker.example.com" },
          }),
      ),
    );
    await expect(kimiseekRequest(env, identity, "balance")).rejects.toThrow("暂不可用");
  });
  it("limits the local HTTP exception to the configured development service", async () => {
    const local: Env = { ...env, KIMISEEK_API_URL: "http://localhost:3000" };
    expect(validateModelBaseUrl(local, "http://localhost:3000")).toBe("http://localhost:3000");
    await validateModelDNS(local, "http://localhost:3000/v1/models");
    for (const url of [
      "http://localhost:8080",
      "http://localhost:3000/private",
      "http://user:secret@localhost:3000",
      "http://localhost:3000?foo=1",
    ])
      expect(() => validateModelBaseUrl(local, url)).toThrow();
    expect(() =>
      validateModelBaseUrl({ ...local, APP_URL: "https://wechatai.app" }, "http://localhost:3000"),
    ).toThrow();
  });
});
describe("model classification", () => {
  it("uses output capability and explicit upstream metadata without confusing vision input with generation", () => {
    for (const id of [
      "qwen-image-3.0",
      "wan2.7-image-pro",
      "openai/gpt-image-1",
      "flux.1-schnell",
      "z-image-turbo",
    ])
      expect(inferModelKind(id)).toBe("image");
    for (const id of ["qwen3-vl", "deepseek-v4-flash-vision-exp", "gpt-4o", "kimi-k3"])
      expect(inferModelKind(id)).toBe("text");
    expect(inferModelKind("custom", { kind: "image" })).toBe("image");
    expect(
      inferModelKind("custom", { architecture: { output_modalities: ["text", "image"] } }),
    ).toBe("image");
    expect(inferModelKind("qwen-image-3.0", { kind: "chat" })).toBe("text");
    expect(inferModelKind("text-embedding-3-large")).toBe("other");
    expect(parseAvailableModel({ id: "custom", name: "自定义画图", kind: "image" })).toMatchObject({
      name: "自定义画图",
      kind: "image",
    });
  });
});
describe("browser flow boundary", () => {
  beforeAll(async () => {
    await env.DB.exec(migration);
    await env.DB.exec(referrals);
  });
  const request = (path: string, init?: RequestInit) =>
    worker.fetch(new Request(`${env.APP_URL}${path}`, init), env, createExecutionContext());
  it("requires login, Origin and a browser-bound flow before issuing a KimiSeek assertion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(result)),
    );
    const headers = { origin: env.APP_URL, "content-type": "application/json" };
    expect(
      (
        await request("/api/kimiseek/start", {
          method: "POST",
          headers,
          body: '{"operation":"connect"}',
        })
      ).status,
    ).toBe(401);
    const registered = await request("/api/auth/sign-up/email", {
      method: "POST",
      headers,
      body: JSON.stringify({
        email: `connect-${crypto.randomUUID()}@example.com`,
        password: "test-password-long",
        name: "Test",
      }),
    });
    expect(registered.status).toBe(200);
    const cookie = registered.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    expect(
      (
        await request("/api/kimiseek/start", {
          method: "POST",
          headers: { ...headers, cookie, origin: "https://evil.example" },
          body: '{"operation":"connect"}',
        })
      ).status,
    ).toBe(403);
    const start = await request("/api/kimiseek/start", {
      method: "POST",
      headers: { ...headers, cookie },
      body: '{"operation":"connect"}',
    });
    const flow = await start.json<{ flowId: string; url: string }>();
    expect(start.status).toBe(200);
    const url = `/api/kimiseek/callback?flow=${flow.flowId}&state=${integrationNonce()}&challenge=${integrationNonce()}`;
    expect((await request(url, { headers: { cookie } })).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    const flowCookie = start.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const callback = await request(url, { headers: { cookie: `${cookie}; ${flowCookie}` } });
    expect(callback.status).toBe(303);
    expect(callback.headers.get("location")).toContain("/api/integrations/wechatai/finish?code=");
    expect(callback.headers.get("location")).not.toContain(result.apiKey);
    expect(
      (await request(`/api/kimiseek/status/${flow.flowId}`, { headers: { cookie } })).status,
    ).toBe(200);
  });
});
