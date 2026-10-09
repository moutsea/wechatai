import { env, runInDurableObject } from "cloudflare:test";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Wallet, creditUnits, dayWindow } from "../src/server/wallet";
import { buildRequest, callModel, parseReply } from "../src/server/llm";
import { decrypt, encrypt, validateBaseUrl, validatePublicDNS } from "../src/server/security";
import { downloadImage, extractText, validateWechatHost, wxRequest } from "../src/server/wechat";
import type { ChatSession } from "../src/shared/types";

const assistant = {
  id: "a",
  channelId: "channel-a",
  channelName: "Test channel",
  name: "Test",
  description: "",
  protocol: "chat-completions" as const,
  baseUrl: "https://api.example.com/v1",
  model: "test-model",
  systemPrompt: "Be helpful",
  shortcut: "",
  maxOutputTokens: 256,
  maxInputTokens: 8000,
  contextTokens: 8000,
  maxCredits: 20,
  color: "sage",
  createdAt: 0,
  hasKey: true,
};
const input = { ...assistant, id: undefined, apiKey: "private-provider-key" };
const account = () => env.ACCOUNTS.getByName(crypto.randomUUID());
async function action(stub: ReturnType<typeof account>, name: string, data: unknown = {}) {
  return JSON.parse(await stub.api(name, data));
}
const grant = (stub: ReturnType<typeof account>) =>
  stub.applyPayment({
    id: crypto.randomUUID(),
    kind: "subscription",
    units: 0,
    expires: Date.now() + 86400000,
  });
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("Unexpected outbound network request in test"))),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("protocol adapters and token accounting", () => {
  const endpointCases = [
    { protocol: "chat-completions", path: "/v1/chat/completions" },
    { protocol: "responses", path: "/v1/responses" },
    { protocol: "anthropic", path: "/v1/messages" },
  ] as const;
  it.each(endpointCases)(
    "completes $protocol service URLs and preserves gateway prefixes",
    ({ protocol, path }) => {
      for (const baseUrl of [
        "https://api.example.com",
        "https://api.example.com/",
        "https://api.example.com/v1",
        "https://api.example.com/v1/",
        `https://api.example.com${path}`,
        `https://api.example.com${path}/`,
      ]) {
        expect(buildRequest({ ...assistant, protocol, baseUrl }, [], 100).url).toBe(
          `https://api.example.com${path}`,
        );
      }
      for (const baseUrl of [
        "https://api.example.com/gateway",
        "https://api.example.com/gateway/",
        "https://api.example.com/gateway/v1",
        `https://api.example.com/gateway${path}/`,
      ]) {
        expect(buildRequest({ ...assistant, protocol, baseUrl }, [], 100).url).toBe(
          `https://api.example.com/gateway${path}`,
        );
      }
    },
  );
  it.each(endpointCases)(
    "uses the selected $protocol endpoint after a protocol switch",
    ({ protocol, path }) => {
      for (const previous of ["/v1/chat/completions", "/v1/responses", "/v1/messages"]) {
        const baseUrl = `https://api.example.com/gateway${previous}`;
        expect(buildRequest({ ...assistant, protocol, baseUrl }, [], 100).url).toBe(
          `https://api.example.com/gateway${path}`,
        );
      }
    },
  );
  it.each(endpointCases)(
    "sends $protocol requests to the completed URL with the correct credentials",
    async ({ protocol, path }) => {
      vi.mocked(fetch).mockImplementation(async (url, init) => {
        // Use workerd's native Request validation so mocks cannot hide unsupported options.
        const request = new Request(url, init);
        expect(request.redirect).toBe("manual");
        if (String(url).includes("cloudflare-dns.com"))
          return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
        expect(String(url)).toBe(`https://api.example.com${path}`);
        return Response.json({
          choices: [{ message: { content: "ok" } }],
          output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }],
          content: [{ type: "text", text: "ok" }],
          usage: { prompt_tokens: 10, completion_tokens: 2, input_tokens: 10, output_tokens: 2 },
        });
      });
      const reply = await callModel(
        env,
        { ...assistant, protocol, baseUrl: "https://api.example.com" },
        "test-only-key",
        [{ role: "user", content: "hi" }],
        100,
      );
      expect(reply.text).toBe("ok");
      expect(fetch).toHaveBeenCalledWith(
        `https://api.example.com${path}`,
        expect.objectContaining({
          method: "POST",
          redirect: "manual",
          headers: expect.objectContaining(
            protocol === "anthropic"
              ? { "x-api-key": "test-only-key", "anthropic-version": "2023-06-01" }
              : { authorization: "Bearer test-only-key" },
          ),
        }),
      );
    },
  );
  it("falls back to max_tokens only when a compatible provider explicitly rejects the new parameter", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (String(url).includes("cloudflare-dns.com"))
        return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
      bodies.push(JSON.parse(String(init?.body)));
      return bodies.length === 1
        ? Response.json(
            { error: { message: "Unknown parameter max_completion_tokens" } },
            { status: 400 },
          )
        : Response.json({
            choices: [{ message: { content: "ok" } }],
            usage: { prompt_tokens: 10, completion_tokens: 2 },
          });
    });
    expect(
      (await callModel(env, assistant, "test-key", [{ role: "user", content: "hi" }], 100)).text,
    ).toBe("ok");
    expect(bodies).toHaveLength(2);
    expect(bodies[0].max_completion_tokens).toBe(100);
    expect(bodies[1].max_tokens).toBe(100);
    expect(bodies[1]).not.toHaveProperty("max_completion_tokens");
  });
  it("never retries an unrelated model validation failure", async () => {
    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url).includes("cloudflare-dns.com")
        ? Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] })
        : Response.json({ error: { message: "Unknown model" } }, { status: 400 }),
    );
    await expect(
      callModel(env, assistant, "secret", [{ role: "user", content: "hi" }]),
    ).rejects.toThrow("400");
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("charges fractional credits with eightfold output weight", () => {
    expect(creditUnits(4000, 500) / 1000).toBe(1.6);
    expect(creditUnits(100, 50) / 1000).toBe(0.1);
    expect(creditUnits(5000, 0)).toBe(1000);
    expect(creditUnits(0, 5000)).toBe(8000);
    expect(creditUnits(52, 10)).toBe(27);
    expect(creditUnits(1, 0)).toBe(1);
    expect(creditUnits(0, 0)).toBe(0);
  });
  it("uses Shanghai midnight without accumulating missed days", () => {
    const w = dayWindow(Date.parse("2026-10-07T16:00:00Z"));
    expect(w.day).toBe("2026-10-08");
    expect(w.start).toBe(Date.parse("2026-10-07T16:00:00Z"));
    expect(w.end - w.start).toBe(86400000);
  });
  it("builds all three distinct request formats", () => {
    const messages = [{ role: "user" as const, content: "hello" }];
    const cc = buildRequest(assistant, messages, 100);
    expect(cc.url).toBe("https://api.example.com/v1/chat/completions");
    expect(cc.body).toMatchObject({ max_completion_tokens: 100 });
    const responses = buildRequest({ ...assistant, protocol: "responses" }, messages, 100);
    expect(responses.body).toMatchObject({
      instructions: "Be helpful",
      store: false,
      max_output_tokens: 100,
    });
    const anthropic = buildRequest({ ...assistant, protocol: "anthropic" }, messages, 100);
    expect(anthropic.body).toMatchObject({ system: "Be helpful", max_tokens: 100, messages });
  });
  it("extracts visible text and ignores reasoning output", () => {
    expect(
      parseReply("responses", {
        output: [
          { type: "reasoning", summary: [] },
          { type: "message", content: [{ type: "output_text", text: "Hello" }] },
        ],
      }).text,
    ).toBe("Hello");
    expect(
      parseReply("anthropic", {
        content: [
          { type: "thinking", thinking: "hidden" },
          { type: "text", text: "Hi" },
        ],
      }).text,
    ).toBe("Hi");
    expect(() => parseReply("chat-completions", { choices: [] })).toThrow();
  });
});

describe("secrets and endpoint boundaries", () => {
  it("encrypts API keys with account-bound authenticated context", async () => {
    const encrypted = await encrypt(env, "do-not-leak", "account-a");
    expect(encrypted).not.toContain("do-not-leak");
    expect(await decrypt(env, encrypted, "account-a")).toBe("do-not-leak");
    await expect(decrypt(env, encrypted, "account-b")).rejects.toThrow();
  });
  it.each([
    "http://api.example.com/v1",
    "https://127.0.0.1/v1",
    "https://2130706433/v1",
    "https://[::1]/v1",
    "https://example.local/v1",
    "https://u:p@api.example.com/v1",
    "https://api.example.com:8443/v1",
    "https://api.example.com/v1?token=x",
  ])("rejects unsafe URL %s", (url) => {
    expect(() => validateBaseUrl(url)).toThrow();
  });
  it("preserves custom API path prefixes and applies configured host allowlists", () => {
    expect(validateBaseUrl("https://api.example.com/custom/v1/")).toBe(
      "https://api.example.com/custom/v1",
    );
    expect(() => validateBaseUrl("https://other.example.com", "api.example.com")).toThrow();
  });
  it("restricts WeChat credential destinations to the observed API domain", () => {
    expect(validateWechatHost("https://ilinkai.weixin.qq.com")).toContain("weixin.qq.com");
    expect(() => validateWechatHost("https://ilinkai.weixin.qq.com.evil.example")).toThrow();
  });
  it("rejects DNS redirects before sending model credentials", async () => {
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const request = new Request(url, init);
      expect(request.redirect).toBe("manual");
      expect(new URL(request.url).hostname).toBe("cloudflare-dns.com");
      return Response.redirect("https://other.example.com/dns-query", 302);
    });
    await expect(validatePublicDNS(assistant.baseUrl)).rejects.toMatchObject({
      code: "dns_unavailable",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("uses runtime-compatible WeChat request options", async () => {
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const request = new Request(url, init);
      expect(request.redirect).toBe("manual");
      return Response.json({ ret: 0, qrcode: "test-qr" });
    });
    await expect(wxRequest("get_bot_qrcode")).resolves.toMatchObject({ qrcode: "test-qr" });
  });
  it("rejects WeChat redirects without forwarding credentials", async () => {
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const request = new Request(url, init);
      expect(request.redirect).toBe("manual");
      return Response.redirect("https://other.example.com/collect", 307);
    });
    await expect(
      wxRequest(
        "getupdates",
        {},
        {
          token: "test-token",
          baseUrl: "https://ilinkai.weixin.qq.com",
          userId: "u",
          botId: "b",
        },
      ),
    ).rejects.toMatchObject({ code: "wechat_unavailable" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects image download redirects", async () => {
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const request = new Request(url, init);
      expect(request.redirect).toBe("manual");
      return Response.redirect("https://other.example.com/image", 302);
    });
    await expect(
      downloadImage({
        image_item: { media: { full_url: "https://novac2c.cdn.weixin.qq.com/test" } },
      }),
    ).rejects.toMatchObject({ code: "image_download" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("includes quoted text without treating it as a system instruction", () => {
    const longText = "字".repeat(25000);
    expect(extractText({ item_list: [{ type: 1, text_item: { text: longText } }] })).toBe(longText);
    expect(
      extractText({
        item_list: [
          {
            text_item: { text: "解释一下" },
            ref_msg: { message_item: { text_item: { text: "引用原文" } } },
          },
        ],
      }),
    ).toBe("引用消息：\n引用原文\n\n解释一下");
  });
});

describe("transactional credit wallet", () => {
  it("records expired grants and late refunds without making them spendable again", async () => {
    const stub = account();
    await runInDurableObject(stub, (_instance, state) => {
      const w = new Wallet(state.storage);
      w.grant("expired", "daily", 10000, Date.now() + 100000, "gift");
      w.reserve("pending", 2000);
      state.storage.sql.exec("UPDATE credit_buckets SET expires = 0");
      w.expire();
      w.expire();
      w.settle("pending", 0);
      w.expire();
      expect(w.balance()).toBe(0);
      expect(
        state.storage.sql
          .exec<{ amount: number }>("SELECT SUM(amount) AS amount FROM credit_ledger")
          .one().amount,
      ).toBe(0);
    });
  });
  it("grants daily credits once, rejects overdraft, and settles once", async () => {
    const stub = account();
    await runInDurableObject(stub, (_instance, state) => {
      const w = new Wallet(state.storage);
      w.daily(10);
      w.daily(10);
      expect(w.balance()).toBe(10000);
      w.reserve("r1", 9000);
      expect(() => w.reserve("r2", 2000)).toThrow();
      expect(w.settle("r1", 1250)).toBe(1250);
      expect(w.balance()).toBe(8750);
      w.settle("r1", 0);
      expect(w.balance()).toBe(8750);
    });
  });
  it("consumes expiring grants first and does not resurrect expired refunds", async () => {
    const stub = account();
    await runInDurableObject(stub, (_instance, state) => {
      const w = new Wallet(state.storage);
      w.grant("gift", "daily", 1000, Date.now() + 100000, "gift");
      w.grant("paid", "purchase", 10000, Number.MAX_SAFE_INTEGER, "paid");
      w.reserve("request", 1500);
      expect(w.buckets().find((b) => b.kind === "purchase")?.remaining).toBe(9500);
      state.storage.sql.exec("UPDATE credit_buckets SET expires = 0 WHERE id = ?", "gift");
      w.settle("request", 0);
      expect(w.balance()).toBe(10000);
    });
  });
  it("caps platform charges to the reserved budget even for excessive reported usage", async () => {
    const stub = account();
    await runInDurableObject(stub, (_instance, state) => {
      const w = new Wallet(state.storage);
      w.grant("g", "purchase", 10000, Number.MAX_SAFE_INTEGER, "test");
      w.reserve("r", 1000);
      expect(w.settle("r", 999999)).toBe(1000);
      expect(w.balance()).toBe(9000);
    });
  });
  it("makes completed payment grants idempotent", async () => {
    const stub = account();
    const event = {
      id: "checkout-1",
      kind: "purchase" as const,
      units: 10000,
      expires: Number.MAX_SAFE_INTEGER,
    };
    await stub.applyPayment(event);
    await stub.applyPayment(event);
    expect((await stub.snapshot()).wallet.purchased).toBe(10);
  });
});

describe("account and session isolation", () => {
  it("lets Free users delete an assistant together with its messages and queued replies", async () => {
    const stub = account();
    const a = (await action(stub, "assistant.save", input)).data;
    const sessionId = (await stub.snapshot()).currentSession!.id;
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "INSERT INTO messages (sessionId,role,content,createdAt) VALUES (?, 'user', 'private history', ?)",
        sessionId,
        Date.now(),
      );
      state.storage.sql.exec(
        "INSERT INTO inbox (id,payload,state,reply,createdAt,sessionId) VALUES ('old', '{}', 'reply', 'private reply', ?, ?)",
        Date.now(),
        sessionId,
      );
    });
    expect((await action(stub, "assistant.delete", { id: a.id })).ok).toBe(true);
    const result = await stub.snapshot();
    expect(result.assistants).toHaveLength(0);
    expect(result.currentSession).toBeNull();
    expect(result.stats.messages).toBe(0);
    await runInDurableObject(stub, (_instance, state) => {
      expect(
        state.storage.sql
          .exec<{ reply: string; state: string }>("SELECT reply,state FROM inbox")
          .one(),
      ).toMatchObject({ reply: "", state: "done" });
    });
  });
  it("stores encrypted keys and never returns them in dashboard responses", async () => {
    const stub = account();
    const created = await action(stub, "assistant.save", input);
    expect(created.ok).toBe(true);
    expect(JSON.stringify(created)).not.toContain(input.apiKey);
    expect(JSON.stringify(await stub.snapshot())).not.toContain(input.apiKey);
    await runInDurableObject(stub, (_instance, state) => {
      expect(
        JSON.stringify(state.storage.sql.exec("SELECT * FROM assistants").toArray()),
      ).not.toContain("private-provider-key");
    });
  });
  it("blocks Free history and web session operations on the server", async () => {
    const stub = account();
    const created = await action(stub, "assistant.save", input);
    expect(created.ok).toBe(true);
    expect(await action(stub, "session.list")).toMatchObject({ ok: false, status: 403 });
    expect(await action(stub, "session.messages", { id: "anything" })).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await action(stub, "session.create", { assistantId: created.data.id })).toMatchObject({
      ok: false,
      status: 403,
    });
  });
  it("does not leak records across accounts, even with a valid session id", async () => {
    const a = account();
    const b = account();
    await grant(a);
    await grant(b);
    await action(a, "assistant.save", input);
    const list = await action(a, "session.list");
    expect((await action(b, "session.list")).data).toHaveLength(0);
    expect(await action(b, "session.messages", { id: list.data[0].id })).toMatchObject({
      ok: false,
      status: 404,
    });
  });
  it("enforces assistant limits and paid shortcuts", async () => {
    const stub = account();
    expect(await action(stub, "assistant.save", { ...input, shortcut: "writer" })).toMatchObject({
      ok: false,
      status: 403,
    });
    for (let i = 0; i < 3; i++)
      expect((await action(stub, "assistant.save", { ...input, name: `a${i}` })).ok).toBe(true);
    expect(await action(stub, "assistant.save", input)).toMatchObject({ ok: false, status: 403 });
  });
  it("keeps web browsing separate from the WeChat active session", async () => {
    const stub = account();
    await grant(stub);
    const a = (await action(stub, "assistant.save", input)).data;
    const first = (await stub.snapshot()).currentSession!.id;
    await action(stub, "session.create", { assistantId: a.id, title: "second" });
    const current = (await stub.snapshot()).currentSession!.id;
    await action(stub, "session.messages", { id: first });
    expect((await stub.snapshot()).currentSession!.id).toBe(current);
  });
  it("archives current session, starts a blank one and preserves original records", async () => {
    const stub = account();
    await grant(stub);
    await action(stub, "assistant.save", input);
    const id = (await stub.snapshot()).currentSession!.id;
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "INSERT INTO messages (sessionId,role,content,createdAt) VALUES (?, 'user', 'keep me', ?)",
        id,
        Date.now(),
      );
    });
    await action(stub, "session.action", { id, action: "archive" });
    expect((await stub.snapshot()).currentSession!.id).not.toBe(id);
    const sessions = (await action(stub, "session.list")).data as ChatSession[];
    expect(sessions.find((s) => s.id === id)?.archived).toBe(true);
    expect((await action(stub, "session.messages", { id })).data[0].content).toBe("keep me");
  });
  it("distinguishes context reset from permanent clear", async () => {
    const stub = account();
    await grant(stub);
    await action(stub, "assistant.save", input);
    const id = (await stub.snapshot()).currentSession!.id;
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "INSERT INTO messages (sessionId,role,content,createdAt) VALUES (?, 'user', 'old message', ?)",
        id,
        Date.now(),
      );
    });
    await action(stub, "session.action", { id, action: "reset" });
    const afterReset = (await action(stub, "session.messages", { id })).data;
    expect(afterReset).toHaveLength(2);
    expect(afterReset[0].content).toBe("old message");
    await action(stub, "session.action", { id, action: "clear" });
    expect((await action(stub, "session.messages", { id })).data).toEqual([]);
  });
  it("refunds model failures and never exposes upstream errors containing credentials", async () => {
    const stub = account();
    const a = (await action(stub, "assistant.save", input)).data;
    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url).includes("cloudflare-dns.com")
        ? Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] })
        : Response.json({ error: "secret leaked private-provider-key" }, { status: 401 }),
    );
    const before = (await stub.snapshot()).wallet.balance;
    const result = await action(stub, "assistant.test", { id: a.id });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("401");
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(result)).not.toContain("private-provider-key");
    expect((await stub.snapshot()).wallet.balance).toBe(before);
  });
  it("refunds redirected model tests and returns an actionable error", async () => {
    const stub = account();
    const a = (await action(stub, "assistant.save", input)).data;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const request = new Request(url, init);
      expect(request.redirect).toBe("manual");
      return new URL(request.url).hostname === "cloudflare-dns.com"
        ? Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] })
        : Response.redirect("https://other.example.com/collect", 307);
    });
    const before = (await stub.snapshot()).wallet.balance;
    const result = await action(stub, "assistant.test", { id: a.id });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("model_redirect");
    expect(result.message).toContain("最终 API 地址");
    expect(fetch).toHaveBeenCalledTimes(3);
    expect((await stub.snapshot()).wallet.balance).toBe(before);
  });
});
