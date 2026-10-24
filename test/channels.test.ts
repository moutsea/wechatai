import { env, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateChannels } from "../src/server/channels";
import { encrypt } from "../src/server/security";
import type { WxMessage } from "../src/server/wechat";

const account = () => env.ACCOUNTS.getByName(crypto.randomUUID());
type Account = ReturnType<typeof account>;
const input = {
  name: "我的渠道",
  protocol: "responses",
  baseUrl: "https://llm.example.com",
  apiKey: "channel-secret",
  color: "sage",
};
const api = async (stub: Account, action: string, payload: unknown = {}) =>
  JSON.parse(await stub.api(action, payload));
async function channel(stub: Account, extra = {}) {
  const result = await api(stub, "channel.save", { ...input, ...extra });
  expect(result.ok).toBe(true);
  return result.data;
}
async function model(stub: Account, channelId: string, model = "model-a", extra = {}) {
  const result = await api(stub, "model.save", { channelId, model, name: model, ...extra });
  expect(result.ok).toBe(true);
  return result.data;
}
async function command(stub: Account, text: string) {
  if (!(await stub.snapshot()).connections.length)
    await api(stub, "wechat.create", { name: "测试微信" });
  return runInDurableObject(stub, (instance) => {
    const processor = instance as unknown as {
      processWechat(id: string, message: WxMessage, connectionId: string): Promise<string>;
    };
    return processor.processWechat(
      crypto.randomUUID(),
      {
        item_list: [{ type: 1, text_item: { text } }],
      },
      "default",
    );
  });
}
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("Unexpected network call"))),
  ),
);
afterEach(() => vi.unstubAllGlobals());

describe("channels and their models", () => {
  it.each([
    { modelId: "gpt-audio-1.5", unsupported: "responses", supported: "chat-completions" },
    { modelId: "o3-pro", unsupported: "chat-completions", supported: "responses" },
  ] as const)(
    "rechecks $modelId compatibility for saved models, plugin entry points and default selection",
    async ({ modelId, unsupported, supported }) => {
      const stub = account();
      await stub.applyPayment({
        id: "plus-model-protocol",
        kind: "subscription",
        units: 0,
        expires: Date.now() + 86400000,
      });
      const c = await channel(stub, {
        baseUrl: "https://api.openai.com/v1",
        protocol: unsupported,
      });
      const restricted = await model(stub, c.id, modelId, { kind: "text" });
      expect((await stub.snapshot()).currentSession).toBeNull();
      const text = await model(stub, c.id, "gpt-4.1-mini");
      const before = await stub.snapshot();
      for (const action of ["assistant.activate", "assistant.test"])
        expect(await api(stub, action, { id: restricted.id })).toMatchObject({
          ok: false,
          error: "model_protocol",
          status: 422,
        });
      expect(await api(stub, "session.create", { assistantId: restricted.id })).toMatchObject({
        ok: false,
        error: "model_protocol",
      });
      expect(
        await api(stub, "plugin.save", {
          pluginId: "wechatai/personal-assistant",
          modelId: restricted.id,
        }),
      ).toMatchObject({ ok: false, error: "model_protocol" });
      expect((await stub.snapshot()).ledger).toEqual(before.ledger);
      expect((await api(stub, "channel.activate", { id: c.id })).ok).toBe(true);
      expect((await stub.snapshot()).currentSession?.assistantId).toBe(text.id);

      expect((await api(stub, "channel.save", { ...c, protocol: supported })).ok).toBe(true);
      expect((await api(stub, "assistant.activate", { id: restricted.id })).ok).toBe(true);
      const session = (await stub.snapshot()).currentSession!;
      const plugin = await api(stub, "plugin.save", {
        pluginId: "wechatai/personal-assistant",
        modelId: restricted.id,
      });
      expect(plugin.ok).toBe(true);
      expect((await api(stub, "channel.save", { ...c, protocol: unsupported })).ok).toBe(true);
      expect(await api(stub, "session.action", { id: session.id, action: "switch" })).toMatchObject(
        {
          ok: false,
          error: "model_protocol",
        },
      );
      expect(await api(stub, "plugin.activate", { id: plugin.data.id })).toMatchObject({
        ok: false,
        error: "model_protocol",
      });
      expect((await api(stub, "channel.activate", { id: c.id })).ok).toBe(true);
      expect((await stub.snapshot()).currentSession?.assistantId).toBe(text.id);
      expect((await api(stub, "assistant.delete", { id: text.id })).ok).toBe(true);
      expect((await stub.snapshot()).currentSession).toBeNull();
      expect(await api(stub, "wechat.bind")).toMatchObject({
        ok: false,
        error: "wechat_model_required",
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("keeps non-text models out of WeChat selection and rejects direct chat and text-plugin entry points", async () => {
    const stub = account();
    await stub.applyPayment({
      id: "plus-model-kinds",
      kind: "subscription",
      units: 0,
      expires: Date.now() + 86400000,
    });
    const c = await channel(stub);
    const text = await model(stub, c.id, "text-model");
    const image = await model(stub, c.id, "qwen-image-3.0", { kind: "image", shortcut: "paint" });
    const embedding = await model(stub, c.id, "text-embedding-3-large", { kind: "other" });
    const listed = await command(stub, "/wx models");
    expect(listed).toContain("text-model");
    expect(listed).not.toContain("qwen-image");
    expect(listed).not.toContain("text-embedding");
    expect(await command(stub, "/wx model 2")).toContain("编号无效");
    for (const nonText of [image, embedding]) {
      for (const action of ["assistant.activate", "assistant.test"])
        expect(await api(stub, action, { id: nonText.id })).toMatchObject({
          ok: false,
          error: "model_type",
        });
      expect(await api(stub, "session.create", { assistantId: nonText.id })).toMatchObject({
        ok: false,
        error: "model_type",
      });
      for (const pluginId of [
        "wechatai/personal-assistant",
        "wechatai/roleplay",
        "wechatai/web-research",
      ])
        expect(
          await api(stub, "plugin.save", {
            pluginId,
            modelId: nonText.id,
            name: "Test",
            shortcut: "test",
            description: "Test role",
            searchProvider: "searxng",
            searchEndpoint: "https://search.example.com/search",
          }),
        ).toMatchObject({ ok: false, error: "model_type" });
    }
    await expect(command(stub, "@paint hello")).rejects.toMatchObject({ code: "model_type" });
    expect((await stub.snapshot()).currentSession?.assistantId).toBe(text.id);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not auto-select an image model when no text model remains", async () => {
    const stub = account();
    const c = await channel(stub);
    await model(stub, c.id, "qwen-image-3.0", { kind: "image" });
    expect(await command(stub, "/wx models")).toContain("没有文本模型");
    expect((await stub.snapshot()).currentSession).toBeNull();
    const text = await model(stub, c.id, "text-model");
    expect((await stub.snapshot()).currentSession?.assistantId).toBe(text.id);
    expect((await api(stub, "assistant.delete", { id: text.id })).ok).toBe(true);
    expect((await stub.snapshot()).currentSession).toBeNull();
    expect(await command(stub, "/exit")).toContain("请先");
    expect((await stub.snapshot()).currentSession).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rechecks model classification for cached command lists, existing sessions and plugins", async () => {
    const stub = account();
    await stub.applyPayment({
      id: "plus-reclassified",
      kind: "subscription",
      units: 0,
      expires: Date.now() + 86400000,
    });
    const c = await channel(stub);
    const a = await model(stub, c.id, "first-text");
    const b = await model(stub, c.id, "custom-model");
    const plugin = await api(stub, "plugin.save", {
      pluginId: "wechatai/personal-assistant",
      modelId: b.id,
    });
    expect(plugin.ok).toBe(true);
    await command(stub, "/wx models");
    await command(stub, "/wx model 2");
    const session = (await stub.snapshot()).currentSession!;
    expect((await api(stub, "model.save", { ...b, kind: "image" })).ok).toBe(true);
    expect(await command(stub, "/wx model 2")).toContain("编号无效");
    await expect(command(stub, "hello")).rejects.toMatchObject({ code: "model_type" });
    expect(await api(stub, "plugin.activate", { id: plugin.data.id })).toMatchObject({
      ok: false,
      error: "model_type",
    });
    expect(await api(stub, "session.action", { id: session.id, action: "switch" })).toMatchObject({
      ok: false,
      error: "model_type",
    });
    await command(stub, "/exit");
    expect((await stub.snapshot()).currentSession?.assistantId).toBe(a.id);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("reports no current plugin or model on an unconfigured Free account", async () => {
    const stub = account();
    expect(await command(stub, "/status")).toContain("当前未使用插件或模型");
    expect((await stub.snapshot()).currentSession).toBeNull();
    const help = await command(stub, "/help");
    expect(help).toContain("`/wx status`");
    expect(help).toContain("`/wx plugins`");
    expect(help).toContain("`/use ds`");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("shares one encrypted key across models, propagates channel edits, and exposes no credentials", async () => {
    const stub = account();
    const c = await channel(stub);
    const a = await model(stub, c.id);
    const b = await model(stub, c.id, "model-b");
    expect(a.channelId).toBe(b.channelId);
    expect((await stub.snapshot()).channels).toHaveLength(1);
    await channel(stub, {
      id: c.id,
      name: "更新的渠道",
      baseUrl: "https://new.example.com",
      apiKey: undefined,
    });
    const snapshot = await stub.snapshot();
    expect(
      snapshot.assistants.every(
        (a) => a.channelName === "更新的渠道" && a.baseUrl === "https://new.example.com",
      ),
    ).toBe(true);
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toMatch(/channel-secret|encryptedKey|keyContext|apiKey/);
    await runInDurableObject(stub, (_instance, state) => {
      const stored = state.storage.sql
        .exec<{ data: string }>("SELECT data FROM assistants")
        .toArray();
      expect(JSON.stringify(stored)).not.toMatch(/encryptedKey|baseUrl|protocol|hasKey/);
      expect(
        state.storage.sql.exec<{ data: string }>("SELECT data FROM channels").one().data,
      ).not.toContain("channel-secret");
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses the selected model ID and its channel's rotated key, endpoint and protocol", async () => {
    const stub = account();
    const c = await channel(stub);
    const a = await model(stub, c.id, "alpha");
    const b = await model(stub, c.id, "beta");
    await channel(stub, {
      id: c.id,
      protocol: "anthropic",
      baseUrl: "https://new.example.com",
      apiKey: "rotated-secret",
    });
    const requests: { url: string; headers: Headers; body: { model: string } }[] = [];
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (String(url).includes("cloudflare-dns.com"))
        return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
      requests.push({
        url: String(url),
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)),
      });
      return Response.json({
        content: [{ type: "text", text: "连接成功" }],
        usage: { input_tokens: 10, output_tokens: 10 },
      });
    });
    expect((await api(stub, "assistant.test", { id: a.id })).ok).toBe(true);
    expect((await api(stub, "assistant.test", { id: b.id })).ok).toBe(true);
    expect(requests.map((r) => r.body.model)).toEqual(["alpha", "beta"]);
    expect(
      requests.every(
        (r) =>
          r.url === "https://new.example.com/v1/messages" &&
          r.headers.get("x-api-key") === "rotated-secret",
      ),
    ).toBe(true);
  });
  it("switches channel and model independently, remembers the last model, and preserves session identity without billing", async () => {
    const stub = account();
    const c1 = await channel(stub, { name: "渠道一" });
    const c2 = await channel(stub, { name: "渠道二" });
    const a = await model(stub, c1.id, "alpha");
    const b = await model(stub, c1.id, "beta");
    const c = await model(stub, c2.id, "gamma");
    const initial = (await stub.snapshot()).currentSession!;
    const balance = (await stub.snapshot()).wallet.balance;
    expect(await command(stub, "/channels")).toContain("渠道二");
    expect(await command(stub, "/models")).not.toContain("gamma");
    expect(await command(stub, "/model 2")).toContain("beta");
    const betaSession = (await stub.snapshot()).currentSession!;
    expect(betaSession.assistantId).toBe(b.id);
    expect(betaSession.id).not.toBe(initial.id);
    await model(stub, c1.id, "beta", { id: b.id, name: "我的回答模型" });
    expect(await command(stub, "/status")).toBe(
      "当前为普通模型对话，未使用插件。\n\n- 渠道：渠道一\n- 模型：我的回答模型（beta）",
    );
    expect((await stub.snapshot()).currentSession?.id).toBe(betaSession.id);
    expect(await command(stub, "/channel 2")).toContain("gamma");
    expect((await stub.snapshot()).currentSession?.assistantId).toBe(c.id);
    expect(await command(stub, "/model 2")).toContain("编号无效");
    expect(await command(stub, "/channel 1")).toContain("beta");
    expect((await stub.snapshot()).currentSession?.id).toBe(betaSession.id);
    await command(stub, "/models");
    await command(stub, "/model 1");
    expect((await stub.snapshot()).currentSession).toMatchObject({
      id: initial.id,
      assistantId: a.id,
    });
    expect((await stub.snapshot()).wallet.balance).toBe(balance);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not reuse another model's history when switching within a channel", async () => {
    const stub = account();
    const c = await channel(stub);
    const a = await model(stub, c.id, "alpha");
    const b = await model(stub, c.id, "beta");
    const calls: { model: string; input: { content: string }[] }[] = [];
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (String(url).includes("cloudflare-dns.com"))
        return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
      calls.push(JSON.parse(String(init?.body)));
      return Response.json({
        output: [{ type: "message", content: [{ type: "output_text", text: "收到" }] }],
        usage: { input_tokens: 10, output_tokens: 10 },
      });
    });
    await command(stub, "只属于甲的话题");
    await api(stub, "assistant.activate", { id: b.id });
    await command(stub, "只属于乙的话题");
    await api(stub, "assistant.activate", { id: a.id });
    await command(stub, "继续甲的话题");
    expect(calls.map((c) => c.model)).toEqual(["alpha", "beta", "alpha"]);
    expect(calls[1].input).toHaveLength(1);
    expect(JSON.stringify(calls[2].input)).toContain("只属于甲的话题");
    expect(JSON.stringify(calls[2].input)).not.toContain("只属于乙的话题");
  });
  it("rejects duplicates and moving a model's existing sessions to another channel or model ID", async () => {
    const stub = account();
    const c = await channel(stub);
    const other = await channel(stub, { name: "另一个渠道" });
    const a = await model(stub, c.id);
    expect(
      await api(stub, "model.save", { channelId: c.id, model: a.model, name: "重复" }),
    ).toMatchObject({ ok: false, error: "model_exists" });
    for (const extra of [{ channelId: other.id }, { model: "different-model" }])
      expect(await api(stub, "model.save", { ...a, ...extra })).toMatchObject({
        ok: false,
        error: "model_identity",
      });
    expect((await model(stub, other.id)).channelId).toBe(other.id);
  });
  it("allows more than three models on Free while enforcing channel limits, including concurrent creates", async () => {
    const stub = account();
    const c = await channel(stub);
    for (let i = 0; i < 5; i++) await model(stub, c.id, `model-${i}`);
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        api(stub, "channel.save", { ...input, name: `channel-${i}` }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect((await stub.snapshot()).channels).toHaveLength(3);
    expect((await stub.snapshot()).assistants).toHaveLength(5);
  });
  it("isolates channel keys and model operations between users and rejects empty-channel activation", async () => {
    const first = account();
    const second = account();
    const c = await channel(first);
    expect(await api(first, "channel.activate", { id: c.id })).toMatchObject({
      ok: false,
      error: "channel_empty",
    });
    expect(
      await api(second, "model.save", { channelId: c.id, name: "bad", model: "bad" }),
    ).toMatchObject({ ok: false, error: "channel_missing" });
    expect(await api(second, "channel.delete", { id: c.id })).toMatchObject({
      ok: false,
      error: "channel_missing",
    });
    expect((await second.snapshot()).channels).toHaveLength(0);
  });
  it("deleting a model preserves siblings; deleting a channel clears only its models and sessions", async () => {
    const stub = account();
    const c1 = await channel(stub);
    const c2 = await channel(stub);
    const a = await model(stub, c1.id);
    const b = await model(stub, c1.id, "model-b");
    const c = await model(stub, c2.id);
    await api(stub, "assistant.activate", { id: b.id });
    await api(stub, "assistant.delete", { id: a.id });
    expect((await stub.snapshot()).channels).toHaveLength(2);
    expect((await stub.snapshot()).assistants.map((a) => a.id)).toEqual([b.id, c.id]);
    await api(stub, "channel.delete", { id: c1.id });
    const state = await stub.snapshot();
    expect(state.channels.map((c) => c.id)).toEqual([c2.id]);
    expect(state.assistants.map((a) => a.id)).toEqual([c.id]);
    expect(state.currentSession?.assistantId).toBe(c.id);
    await runInDurableObject(stub, (_instance, state) => {
      const sessions = state.storage.sql
        .exec<{ data: string }>("SELECT data FROM sessions")
        .toArray();
      expect(sessions.every((s) => JSON.parse(s.data).assistantId === c.id)).toBe(true);
    });
  });
  it("rolls back a legacy client create when model validation fails", async () => {
    const stub = account();
    expect(
      await api(stub, "assistant.save", { ...input, model: "alpha", shortcut: "plus-only" }),
    ).toMatchObject({ ok: false, error: "plus_required" });
    expect((await stub.snapshot()).channels).toHaveLength(0);
  });
  it("migrates legacy credentials once, preserving messages, connection and current session; migrated keys still work", async () => {
    const stub = account();
    await stub.snapshot();
    await runInDurableObject(stub, async (_instance, state) => {
      const encryptedKey = await encrypt(env, "legacy-secret", `${state.id}:assistant:legacy-id`);
      const legacy = {
        ...input,
        apiKey: undefined,
        id: "legacy-id",
        model: "legacy-model",
        createdAt: 123,
        hasKey: true,
        encryptedKey,
        description: "旧备注",
        systemPrompt: "旧提示词",
        shortcut: "",
        maxOutputTokens: 256,
        contextTokens: 8000,
        maxCredits: 30,
      };
      state.storage.sql.exec(
        "INSERT INTO assistants VALUES (?, ?)",
        legacy.id,
        JSON.stringify(legacy),
      );
      const session = {
        id: "legacy-session",
        assistantId: legacy.id,
        title: "保留会话",
        archived: false,
        createdAt: 1,
        updatedAt: 2,
        resetAt: 0,
        messageCount: 1,
        contextStart: 0,
      };
      state.storage.sql.exec(
        "INSERT INTO sessions VALUES (?, ?)",
        session.id,
        JSON.stringify(session),
      );
      state.storage.sql.exec(
        "INSERT INTO messages(sessionId,role,content,createdAt) VALUES (?, 'user', '保留旧记录', 1)",
        session.id,
      );
      state.storage.sql.exec(
        "INSERT INTO settings VALUES ('current', ?)",
        JSON.stringify(session.id),
      );
      state.storage.sql.exec(
        "INSERT INTO settings VALUES ('connection', ?)",
        JSON.stringify({ status: "disconnected", generation: "original" }),
      );
      migrateChannels(state.storage);
      migrateChannels(state.storage);
      expect(
        state.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM channels").one().n,
      ).toBe(1);
      expect(
        state.storage.sql
          .exec<{ value: string }>("SELECT value FROM settings WHERE key='connection'")
          .one().value,
      ).toContain("original");
    });
    const snapshot = await stub.snapshot();
    expect(snapshot.stats.messages).toBe(1);
    expect(snapshot.currentSession?.id).toBe("legacy-session");
    expect(snapshot.assistants[0]).toMatchObject({
      id: "legacy-id",
      model: "legacy-model",
      systemPrompt: "旧提示词",
      channelId: "legacy-id",
    });
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (String(url).includes("cloudflare-dns.com"))
        return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer legacy-secret");
      return Response.json({
        output: [{ type: "message", content: [{ type: "output_text", text: "连接成功" }] }],
        usage: { input_tokens: 10, output_tokens: 10 },
      });
    });
    expect((await api(stub, "assistant.test", { id: "legacy-id" })).ok).toBe(true);
  });
});
