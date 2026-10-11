import { env, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { roleplayInputSchema, roleVariables, type RoleplayPlugin } from "../src/shared/roleplay";
import { exportCharacterCard, readCharacterCard } from "../src/shared/character-card";
import { roleplayPrompt, ROLEPLAY_SUMMARY_PROMPT } from "../src/server/plugins/roleplay";
import { inputTokens, SUMMARY_PROMPT } from "../src/server/context";
import { countTextTokens } from "../src/server/tokenizer";
import { creditUnits } from "../src/server/wallet";
import type { ModelMessage } from "../src/server/llm";
import type { Protocol } from "../src/shared/types";
import type { WxMessage } from "../src/server/wechat";

const roleInput = (extra = {}) =>
  roleplayInputSchema.parse({
    name: "林",
    shortcut: "林",
    modelId: "model",
    description: "你是居住在森林中的旅人，喜欢观察植物。",
    ...extra,
  });
const card = (data = {}) => ({
  spec: "chara_card_v2",
  spec_version: "2.0",
  data: {
    name: "林",
    description: "森林里的旅人",
    personality: "好奇",
    first_mes: "欢迎，{{user}}！",
    mes_example: "{{char}}：一起出发吧。",
    ...data,
  },
});
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const read = (value: unknown) =>
  readCharacterCard(encode(value), { modelId: "model", shortcut: "林" });

describe("character cards and bounded lore", () => {
  it("imports V2 core fields, preserves opaque extensions and never injects them into the prompt", () => {
    const source = card({
      creator_notes: "private-creator-note",
      extensions: { script: "alert('never-execute')" },
    });
    const { input, warnings } = read(source);
    expect(input.name).toBe("林");
    expect(JSON.parse(input.sourceCard)).toEqual(source);
    expect(warnings.join(" ")).toContain("不会执行");
    const prompt = roleplayPrompt(input, [], 8000).systemPrompt;
    expect(prompt).toContain("林：一起出发吧");
    expect(prompt).not.toContain("private-creator-note");
    expect(prompt).not.toContain("never-execute");
  });
  it("round-trips editable fields and user persona through V2 JSON", () => {
    const input = roleInput({
      userName: "星",
      userPersona: "制图师",
      lore: [{ keys: ["酒馆"], content: "店主叫鹿", constant: false }],
    });
    const exported = exportCharacterCard(input);
    const imported = read(exported).input;
    expect(imported.userName).toBe("星");
    expect(imported.userPersona).toBe("制图师");
    expect(imported.lore[0].content).toBe("店主叫鹿");
    expect(roleVariables("{{char}} 看向 {{USER}}", imported)).toBe("林 看向 星");
  });
  it("decodes UTF-8 V2 metadata from PNG, rejects truncation and oversized metadata", () => {
    const bytes = encode(card());
    const payload = new TextEncoder().encode("chara\0" + btoa(String.fromCharCode(...bytes)));
    const png = new Uint8Array(8 + payload.length + 12);
    png.set([137, 80, 78, 71, 13, 10, 26, 10]);
    new DataView(png.buffer).setUint32(8, payload.length);
    png.set(new TextEncoder().encode("tEXt"), 12);
    png.set(payload, 16);
    expect(readCharacterCard(png, { modelId: "model", shortcut: "林" }).input.name).toBe("林");
    expect(() => readCharacterCard(png.slice(0, -6), { modelId: "model", shortcut: "林" })).toThrow(
      "不完整",
    );
    expect(() => read(card({ description: "x".repeat(65000) }))).toThrow("64 KB");
    expect(() => read({ spec: "chara_card_v3" })).toThrow("V2");
    expect(() =>
      read(card({ character_book: { entries: Array.from({ length: 51 }, () => ({})) } })),
    ).toThrow("50 条");
  });
  it("disables unsupported regex entries and reports unsupported macros", () => {
    const { input, warnings } = read(
      card({
        description: "{{random:1,2}}",
        character_book: {
          entries: [{ keys: [".*"], content: "unwanted", extensions: { use_regex: true } }],
        },
      }),
    );
    expect(input.lore[0].enabled).toBe(false);
    expect(warnings.join(" ")).toContain("正则");
    expect(warnings.join(" ")).toContain("其他宏");
    expect(
      roleplayPrompt(input, [{ role: "user", content: ".*" }], 8000).systemPrompt,
    ).not.toContain("unwanted");
  });
  it("matches keywords, secondary keys, case, constants and only recent messages", () => {
    const role = roleInput({
      lore: [
        { keys: ["酒馆"], content: "店主叫鹿", secondaryKeys: ["夜晚"] },
        { keys: ["Castle"], content: "城堡细节", caseSensitive: true },
        { keys: ["记忆"], content: "旧事" },
        { constant: true, content: "常驻背景" },
        { constant: true, content: "停用背景", enabled: false },
      ],
    });
    const prompt = roleplayPrompt(
      role,
      [
        { role: "user", content: "记忆" },
        ...Array.from({ length: 3 }, (): ModelMessage => ({ role: "user", content: "无关" })),
        { role: "user", content: "夜晚走进酒馆和 castle" },
      ],
      8000,
    ).systemPrompt;
    expect(prompt).toContain("店主叫鹿");
    expect(prompt).toContain("常驻背景");
    for (const text of ["城堡细节", "旧事", "停用背景"]) expect(prompt).not.toContain(text);
    expect(
      roleplayPrompt(role, [{ role: "user", content: "酒馆" }], 8000).systemPrompt,
    ).not.toContain("店主叫鹿");
  });
  it("respects lore token budget and model room without cutting the fixed character", () => {
    const role = roleInput({
      loreTokenBudget: 80,
      lore: [
        { constant: true, name: "低", content: "a ".repeat(40), priority: 0 },
        { constant: true, name: "高", content: "b ".repeat(40), priority: 10 },
      ],
    });
    const prompt = roleplayPrompt(role, [], 8000);
    expect(prompt.selected).toEqual([1]);
    const plain = roleplayPrompt({ ...role, loreTokenBudget: 0 }, [], 8000);
    expect(roleplayPrompt(role, [], inputTokens(plain.systemPrompt, [])).selected).toEqual([]);
    expect(plain.systemPrompt).toContain(role.description);
  });
});

const accounts: DurableObjectStub<import("../src/server/personal-account").PersonalAccount>[] = [];
type Account = (typeof accounts)[number];
const api = async (stub: Account, action: string, payload: unknown = {}) =>
  JSON.parse(await stub.api(action, payload));
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("Unexpected network"))),
  ),
);
afterEach(async () => {
  for (const stub of accounts.splice(0))
    await runInDurableObject(stub, async (_, state) => {
      await state.storage.deleteAlarm();
    });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function setup(protocol: Protocol = "chat-completions", plus = true, extra = {}) {
  const stub = env.ACCOUNTS.getByName(crypto.randomUUID());
  accounts.push(stub);
  const model = await api(stub, "assistant.save", {
    name: "测试",
    protocol,
    model: "test-model",
    baseUrl: "https://llm.example.com",
    apiKey: "test-key",
    systemPrompt: "generic-model-prompt-must-not-leak",
    maxInputTokens: 16000,
    maxOutputTokens: 512,
    contextTokens: 32000,
    maxCredits: 0,
    ...extra,
  });
  expect(model.ok).toBe(true);
  await api(stub, "wechat.create", { name: "测试微信" });
  if (plus)
    await stub.applyPayment({
      id: "plus",
      kind: "subscription",
      units: 0,
      expires: Date.now() + 86400000,
    });
  return { stub, model: model.data };
}
async function saveRole(stub: Account, modelId: string, extra = {}) {
  const result = await api(stub, "plugin.save", {
    ...roleInput({ modelId, ...extra }),
    pluginId: "wechatai/roleplay",
  });
  expect(result.ok, JSON.stringify(result)).toBe(true);
  return result.data as RoleplayPlugin;
}
const send = (
  stub: Account,
  text: string,
  id: string = crypto.randomUUID(),
  connectionId = "default",
) =>
  runInDurableObject(stub, (instance) =>
    (
      instance as unknown as {
        processWechat(id: string, message: WxMessage, connectionId: string): Promise<string>;
      }
    ).processWechat(id, { item_list: [{ type: 1, text_item: { text } }] }, connectionId),
  );
type RequestBody = {
  messages?: ModelMessage[];
  input?: ModelMessage[];
  system?: string;
  instructions?: string;
  max_tokens?: number;
  max_output_tokens?: number;
  max_completion_tokens?: number;
};
function mockModel(
  protocol: Protocol,
  handler?: (body: RequestBody, index: number) => Response | undefined,
) {
  const calls: RequestBody[] = [];
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url).includes("cloudflare-dns.com"))
      return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
    const body = JSON.parse(String(init?.body)) as RequestBody;
    calls.push(body);
    const override = handler?.(body, calls.length);
    if (override) return override;
    const prompt = body.system ?? body.instructions ?? body.messages?.[0].content;
    const text =
      prompt === ROLEPLAY_SUMMARY_PROMPT || prompt === SUMMARY_PROMPT
        ? "我们约定明天在森林入口碰面。"
        : "一起去森林吧。";
    return Response.json(
      protocol === "chat-completions"
        ? {
            choices: [{ message: { content: text } }],
            usage: { prompt_tokens: 999999, completion_tokens: 999999 },
          }
        : protocol === "responses"
          ? { output: [{ content: [{ type: "output_text", text }] }] }
          : { content: [{ type: "text", text }] },
    );
  });
  return calls;
}

describe("roleplay account and gateway", () => {
  it("isolates the same role across WeChat links and supports web-created stories", async () => {
    const { stub, model } = await setup();
    const role = await saveRole(stub, model.id, { firstMessage: "开场白" });
    const a = await api(stub, "session.create", {
      pluginInstanceId: role.id,
      connectionId: "default",
    });
    expect(a.ok).toBe(true);
    expect(a.data.assistantId).toBe(model.id);
    expect((await api(stub, "session.messages", { id: a.data.id })).data[0].content).toBe("开场白");
    const beforeClear = (await api(stub, "session.summary", { id: a.data.id })).data;
    await api(stub, "session.action", { id: a.data.id, action: "clear" });
    expect(
      (
        await api(stub, "session.summary.save", {
          id: a.data.id,
          ...beforeClear,
          text: "过期编辑不能带回旧剧情",
        })
      ).error,
    ).toBe("summary_changed");
    const link = await api(stub, "wechat.create", { name: "第二个微信" });
    expect(link.ok).toBe(true);
    const secondLink = (await stub.snapshot()).connections.find((c) => c.name === "第二个微信")!;
    const b = await api(stub, "plugin.activate", { id: role.id, connectionId: secondLink.id });
    expect(b.ok).toBe(true);
    expect(b.data.id).not.toBe(a.data.id);
    const calls = mockModel("chat-completions");
    await send(stub, "第一条链接的私有剧情");
    await send(stub, "另一段故事", crypto.randomUUID(), secondLink.id);
    expect(JSON.stringify(calls.at(-1))).not.toContain("第一条链接的私有剧情");
    await api(stub, "plugin.save", { id: role.id, enabled: false });
    expect(
      (await api(stub, "plugin.activate", { id: role.id, connectionId: "default" })).error,
    ).toBe("plugin_disabled");
    await expect(send(stub, "继续")).rejects.toThrow("停用");
  });
  it("retries an upstream context overflow once, retains role settings and bills only the answer", async () => {
    const { stub, model } = await setup("chat-completions", true, {
      contextTokens: 8000,
      maxInputTokens: 8000,
      maxOutputTokens: 256,
    });
    await saveRole(stub, model.id, {
      loreTokenBudget: 2000,
      lore: [{ constant: true, content: "x ".repeat(1700), name: "OVERFLOW_LORE" }],
    });
    await send(stub, "/use 林");
    let rejected = false;
    const calls = mockModel("chat-completions", (body) => {
      if (body.messages?.[0].content !== ROLEPLAY_SUMMARY_PROMPT && !rejected) {
        rejected = true;
        return Response.json(
          {
            error: {
              code: "context_length_exceeded",
              message: "maximum context length is 2048 tokens",
            },
          },
          { status: 400 },
        );
      }
    });
    const before = (await stub.snapshot()).wallet.balance;
    expect(await send(stub, "你好")).toBe("一起去森林吧。");
    expect(calls).toHaveLength(2);
    expect(JSON.stringify(calls[0])).toContain("OVERFLOW_LORE");
    expect(JSON.stringify(calls[1])).not.toContain("OVERFLOW_LORE");
    expect(JSON.stringify(calls[1])).toContain("森林中的旅人");
    const cost =
      creditUnits(
        calls[1].messages!.reduce((n, m) => n + countTextTokens(m.content), 0),
        countTextTokens("一起去森林吧。"),
      ) / 1000;
    expect((await stub.snapshot()).wallet.balance).toBeCloseTo(before - cost);
  });
  it("uses the current conversation's summary policy for a one-off role invocation", async () => {
    const { stub, model } = await setup("chat-completions", true, {
      contextTokens: 4000,
      maxInputTokens: 4000,
      maxOutputTokens: 256,
    });
    const role = await saveRole(stub, model.id);
    const target = await api(stub, "plugin.activate", { id: role.id });
    await send(stub, "/exit");
    const plain = (await stub.snapshot()).currentSession!.id;
    await runInDurableObject(stub, (_, state) => {
      for (let i = 0; i < 12; i++)
        for (const speaker of ["user", "assistant"])
          state.storage.sql.exec(
            "INSERT INTO messages (sessionId,role,content,createdAt) VALUES (?, ?, ?, ?)",
            plain,
            speaker,
            `第${i}轮 ${"旅行".repeat(60)}`,
            Date.now(),
          );
    });
    const calls = mockModel("chat-completions");
    await send(stub, "@林 你好");
    expect(calls.some((c) => c.messages?.[0].content === SUMMARY_PROMPT)).toBe(true);
    expect(calls.some((c) => c.messages?.[0].content === ROLEPLAY_SUMMARY_PROMPT)).toBe(false);
    expect((await stub.snapshot()).currentSession!.id).toBe(plain);
    expect((await api(stub, "session.summary", { id: target.data.id })).data.text).toBe("");
    expect((await api(stub, "session.messages", { id: target.data.id })).data).toHaveLength(0);
  });

  it("requires Plus for creation and use, rejects duplicate shortcuts and preserves configs on expiry", async () => {
    const { stub, model } = await setup("chat-completions", false);
    expect(
      (
        await api(stub, "plugin.save", {
          ...roleInput({ modelId: model.id }),
          pluginId: "wechatai/roleplay",
        })
      ).ok,
    ).toBe(false);
    await stub.applyPayment({
      id: "plus",
      kind: "subscription",
      units: 0,
      expires: Date.now() + 86400000,
    });
    const role = await saveRole(stub, model.id, { shortcut: "Lin" });
    expect(
      (
        await api(stub, "plugin.save", {
          ...roleInput({ shortcut: "lin", modelId: model.id }),
          pluginId: "wechatai/roleplay",
        })
      ).error,
    ).toBe("shortcut_exists");
    await runInDurableObject(stub, (_, state) => {
      state.storage.sql.exec(
        "UPDATE settings SET value = ? WHERE key = ?",
        JSON.stringify(Date.now() - 1000),
        "planUntil",
      );
    });
    expect((await stub.snapshot()).plugins?.[0].id).toBe(role.id);
    await expect(send(stub, "@Lin 你好")).rejects.toThrow("Plus");
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each<Protocol>(["chat-completions", "responses", "anthropic"])(
    "uses %s with character, opening and matched lore, platform token billing and idempotency",
    async (protocol) => {
      const { stub, model } = await setup(protocol);
      const role = await saveRole(stub, model.id, {
        firstMessage: "你好，{{user}}，我是{{char}}。",
        userName: "星",
        lore: [
          { keys: ["酒馆"], content: "老板叫鹿" },
          { keys: ["城堡"], content: "hidden-castle" },
        ],
      });
      const balance = (await stub.snapshot()).wallet.balance;
      expect(await send(stub, "/use 林")).toContain("你好，星，我是林");
      expect(await send(stub, "/use 林")).not.toContain("你好，星，我是林");
      expect((await stub.snapshot()).wallet.balance).toBe(balance);
      const calls = mockModel(protocol);
      const text = await send(stub, "去酒馆吧", "same-run");
      expect(text).toBe("一起去森林吧。");
      expect(await send(stub, "去酒馆吧", "same-run")).toBe(text);
      expect(calls).toHaveLength(1);
      const serialized = JSON.stringify(calls[0]);
      for (const expected of ["老板叫鹿", "你好，星，我是林", "森林中的旅人"])
        expect(serialized).toContain(expected);
      for (const absent of ["hidden-castle", "generic-model-prompt-must-not-leak"])
        expect(serialized).not.toContain(absent);
      const body = calls[0];
      const texts = body.messages
        ? [body.system || "", ...body.messages.map((m) => m.content)]
        : [body.instructions || "", ...(body.input || []).map((m) => m.content)];
      const cost =
        creditUnits(
          texts.reduce((n, s) => n + countTextTokens(s), 0),
          countTextTokens(text),
        ) / 1000;
      expect((await stub.snapshot()).wallet.balance).toBeCloseTo(balance - cost);
      await runInDurableObject(stub, (_, state) => {
        expect(
          state.storage.sql
            .exec<{ pluginId: string; instanceId: string }>(
              "SELECT pluginId,instanceId FROM platform_metering WHERE id = ?",
              "same-run",
            )
            .one(),
        ).toMatchObject({ pluginId: "wechatai/roleplay", instanceId: role.id });
      });
    },
  );
  it("isolates stories, one-off calls, new/reset/archive and model edits", async () => {
    const { stub, model } = await setup();
    const first = await saveRole(stub, model.id, { firstMessage: "opening-A" });
    const second = await saveRole(stub, model.id, {
      name: "鹿",
      shortcut: "鹿",
      description: "你是画家，住在城里。",
      firstMessage: "opening-B",
    });
    mockModel("chat-completions");
    await send(stub, "/use 林");
    const a = (await stub.snapshot()).currentSession!.id;
    await send(stub, "story-A-secret");
    await send(stub, "/use 鹿");
    const b = (await stub.snapshot()).currentSession!.id;
    const calls = mockModel("chat-completions");
    await send(stub, "story-B-secret");
    expect(JSON.stringify(calls[0])).not.toContain("story-A-secret");
    await send(stub, "/use 林");
    await send(stub, "@鹿 临时对话");
    expect((await stub.snapshot()).currentSession!.id).toBe(a);
    expect(JSON.stringify(calls.at(-1))).toContain("你是画家");
    expect(JSON.stringify(calls.at(-1))).not.toContain("story-B-secret");
    const bMessages = await api(stub, "session.messages", { id: b });
    expect(bMessages.data.some((m: { content: string }) => m.content.includes("临时对话"))).toBe(
      false,
    );
    const summary = (await api(stub, "session.summary", { id: a })).data;
    expect(
      (await api(stub, "session.summary.save", { id: a, ...summary, text: "已约好去远足" })).ok,
    ).toBe(true);
    await send(stub, "/reset");
    expect((await api(stub, "session.summary", { id: a })).data.text).toBe("");
    expect(await send(stub, "/new")).toContain("opening-A");
    expect((await stub.snapshot()).currentSession!.id).not.toBe(a);
    expect(await send(stub, "/archive")).toContain("opening-A");
    const newModel = await api(stub, "model.save", {
      channelId: model.channelId,
      name: "新模型",
      model: "new-model",
    });
    expect((await api(stub, "plugin.save", { id: first.id, modelId: newModel.data.id })).ok).toBe(
      true,
    );
    const stories = (await api(stub, "session.list")).data;
    expect(
      stories
        .filter((s: { pluginInstanceId: string }) => s.pluginInstanceId === first.id)
        .every((s: { assistantId: string }) => s.assistantId === newModel.data.id),
    ).toBe(true);
    expect(stories.find((s: { id: string }) => s.id === b).pluginInstanceId).toBe(second.id);
  });
  it("compacts story facts, keeps fixed settings and lets users safely correct only their summary", async () => {
    const { stub, model } = await setup("chat-completions", true, {
      contextTokens: 4000,
      maxInputTokens: 4000,
      maxOutputTokens: 256,
    });
    await saveRole(stub, model.id);
    await send(stub, "/use 林");
    const id = (await stub.snapshot()).currentSession!.id;
    await runInDurableObject(stub, (_, state) => {
      for (let i = 0; i < 12; i++)
        for (const role of ["user", "assistant"])
          state.storage.sql.exec(
            "INSERT INTO messages (sessionId,role,content,createdAt) VALUES (?, ?, ?, ?)",
            id,
            role,
            `第${i}轮 ${"旅行".repeat(60)}`,
            Date.now(),
          );
    });
    const calls = mockModel("chat-completions");
    await send(stub, "继续故事");
    expect(calls.some((c) => c.messages?.[0].content === ROLEPLAY_SUMMARY_PROMPT)).toBe(true);
    expect(JSON.stringify(calls.at(-1))).toContain("我们约定明天在森林入口碰面");
    expect(JSON.stringify(calls.at(-1))).toContain("森林中的旅人");
    const summary = (await api(stub, "session.summary", { id })).data;
    expect(summary.throughId).toBeGreaterThan(0);
    const result = await api(stub, "session.summary.save", {
      id,
      ...summary,
      text: "更正：约定地点是城门。",
    });
    expect(result.ok).toBe(true);
    expect(result.data.throughId).toBe(summary.throughId);
    expect(
      (await api(stub, "session.summary.save", { id, ...summary, text: "旧编辑" })).error,
    ).toBe("summary_changed");
    const calls2 = mockModel("chat-completions");
    await send(stub, "再继续");
    expect(JSON.stringify(calls2.at(-1))).toContain("更正：约定地点是城门");
    const another = await setup();
    expect((await api(another.stub, "session.summary", { id })).ok).toBe(false);
    await send(stub, "/exit");
    const plain = (await stub.snapshot()).currentSession!.id;
    expect((await api(stub, "session.summary", { id: plain })).error).toBe("role_session_required");
  });
  it("enforces input and credits caps before calling upstream and output caps at the gateway", async () => {
    const { stub, model } = await setup("chat-completions", true, {
      maxInputTokens: 512,
      maxOutputTokens: 64,
    });
    const role = await saveRole(stub, model.id, { description: "长角色设定".repeat(1000) });
    const balance = (await stub.snapshot()).wallet.balance;
    const calls = mockModel("chat-completions");
    const result = await api(stub, "plugin.test", { id: role.id, query: "你好" });
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
    expect((await stub.snapshot()).wallet.balance).toBe(balance);
    await api(stub, "plugin.save", { id: role.id, description: "林间旅人" });
    const okay = await api(stub, "plugin.test", { id: role.id, query: "你好" });
    expect(okay.ok).toBe(true);
    expect(calls.at(-1)!.max_completion_tokens).toBeLessThanOrEqual(64);
    await api(stub, "model.save", {
      id: model.id,
      channelId: model.channelId,
      name: model.name,
      model: model.model,
      maxCredits: 0.01,
    });
    expect((await api(stub, "plugin.test", { id: role.id, query: "你好" })).ok).toBe(false);
    expect(calls).toHaveLength(1);
  });
});
