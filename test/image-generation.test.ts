import {
  env,
  runInDurableObject,
  abortAllDurableObjects,
  runDurableObjectAlarm,
} from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDecipheriv } from "node:crypto";
import { verifyGeneratedImage } from "../src/server/media";
import { fetchGeneratedBytes } from "../src/server/plugins/image-generation";
import { encrypt } from "../src/server/security";
import type { WxMessage } from "../src/server/wechat";
import { wechatLinkKey } from "../src/shared/wechat-links";
import { creditUnits } from "../src/server/wallet";
import { countTextTokens } from "../src/server/tokenizer";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XcAAAAASUVORK5CYII=",
  "base64",
);
const accounts: ReturnType<typeof env.ACCOUNTS.getByName>[] = [];
type Account = (typeof accounts)[number];
const api = async (s: Account, action: string, p: unknown = {}) =>
  JSON.parse(await s.api(action, p));
afterEach(async () => {
  for (const s of accounts.splice(0))
    await runInDurableObject(env.ACCOUNTS.get(s.id), async (_, state) => {
      await state.storage.deleteAlarm();
    });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function setup(plus = true, cap = 0) {
  const s = env.ACCOUNTS.getByName(crypto.randomUUID());
  accounts.push(s);
  if (plus)
    await s.applyPayment({
      id: "plus",
      kind: "subscription",
      units: 0,
      expires: Date.now() + 86400000,
    });
  const a = await api(s, "assistant.save", {
    name: "生图模型",
    model: "qwen-image-3.0",
    protocol: "anthropic",
    baseUrl: "https://image.example.com/v1/messages",
    apiKey: "model-key",
    maxCredits: cap,
  });
  expect(a.ok).toBe(true);
  const p = await api(s, "plugin.save", {
    pluginId: "wechatai/image-generation",
    name: "AI 生图",
    shortcut: "画图",
    modelId: a.data.id,
    size: "1024x1024", // Older clients may still submit this deprecated setting.
  });
  await api(s, "wechat.create", { name: "微信" });
  return { s, modelId: a.data.id as string, p };
}
async function addChat(s: Account) {
  const model = await api(s, "assistant.save", {
    name: "回答模型",
    model: "chat-model",
    protocol: "chat-completions",
    baseUrl: "https://chat.example.com",
    apiKey: "chat-key",
    maxInputTokens: 8000,
    maxOutputTokens: 1024,
    contextTokens: 16000,
  });
  expect(model.ok).toBe(true);
  const plugin = await api(s, "plugin.save", {
    name: "DS Chat",
    shortcut: "DS",
    modelId: model.data.id,
    searchProvider: "tavily",
    searchEndpoint: "https://search.example.com/search",
    apiKey: "search-key",
  });
  expect(plugin.ok).toBe(true);
  await api(s, "assistant.activate", { id: model.data.id });
  return plugin.data;
}
function send(s: Account, text: string, id = crypto.randomUUID() as string) {
  return runInDurableObject(s, (instance) =>
    (
      instance as unknown as {
        processWechat(id: string, m: WxMessage, link: string): Promise<string>;
      }
    ).processWechat(id, { item_list: [{ type: 1, text_item: { text } }] }, "default"),
  );
}
async function queueWechat(s: Account, text: string, id = "wx-turn") {
  await runInDurableObject(s, async (_, state) => {
    const encryptedCredentials = await encrypt(
      env,
      JSON.stringify({
        token: "wx-key",
        baseUrl: "https://ilinkai.weixin.qq.com",
        userId: "owner",
        botId: "bot",
      }),
      `${s.id}:wechat`,
    );
    state.storage.sql.exec(
      "INSERT OR REPLACE INTO settings VALUES (?,?)",
      wechatLinkKey("default", "connection"),
      JSON.stringify({
        status: "connected",
        generation: "gen",
        encryptedCredentials,
        contextToken: "context",
        botId: "bot",
      }),
    );
    state.storage.sql.exec(
      "INSERT OR REPLACE INTO settings VALUES (?,?)",
      wechatLinkKey("default", "guideDelivery"),
      JSON.stringify({ status: "sent" }),
    );
    state.storage.sql.exec(
      "INSERT INTO inbox (id,payload,state,createdAt,connectionId) VALUES (?,?,'pending',?,'default')",
      id,
      JSON.stringify({ context_token: "context", item_list: [{ type: 1, text_item: { text } }] }),
      Date.now(),
    );
    await state.storage.setAlarm(Date.now() + 1000);
  });
}
function network() {
  const requests: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const chatRequests: Record<string, unknown>[] = [];
  const sends: Record<string, unknown>[] = [];
  const events: string[] = [];
  const controls = {
    failure: 0,
    failureBody: JSON.stringify({ error: { usage: 12345 } }),
    invalid: false,
    external: false,
    failSend: false,
    uploads: 0,
  };
  let key = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(url, init),
        u = new URL(request.url);
      if (u.hostname === "cloudflare-dns.com")
        return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
      if (u.hostname === "chat.example.com") {
        expect(u.pathname).toBe("/v1/chat/completions");
        expect(request.headers.get("authorization")).toBe("Bearer chat-key");
        const body = await request.json<Record<string, unknown>>();
        expect(body.model).toBe("chat-model");
        expect(body.tools).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ function: expect.objectContaining({ name: "web_search" }) }),
            expect.objectContaining({ function: expect.objectContaining({ name: "web_fetch" }) }),
          ]),
        );
        chatRequests.push(body);
        return Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: { role: "assistant", content: "这是 DS Chat 的回答" },
            },
          ],
        });
      }
      if (u.hostname === "image.example.com") {
        events.push("generate");
        requests.push({ url: request.url, headers: request.headers, body: await request.json() });
        if (controls.failure)
          return new Response(controls.failureBody, {
            status: controls.failure,
            headers: { "x-request-id": "10b1d925-5104-4f1a-beab-49e0f6bfdb4e" },
          });
        return Response.json({
          usage: { input_tokens: 0, output_images: 0 },
          data: [
            controls.external
              ? { url: "https://cdn.example.com/pic?signature=test" }
              : {
                  b64_json: controls.invalid
                    ? Buffer.from("<svg/>").toString("base64")
                    : png.toString("base64"),
                },
          ],
        });
      }
      if (u.hostname === "cdn.example.com") {
        expect(request.headers.has("authorization")).toBe(false);
        return new Response(png);
      }
      if (u.pathname.endsWith("getuploadurl")) {
        const data = await request.json<{ aeskey: string; rawsize: number; media_type: number }>();
        expect(data.rawsize).toBe(png.length);
        expect(data.media_type).toBe(1);
        key = data.aeskey;
        return Response.json({ upload_param: "upload-param" });
      }
      if (u.hostname === "novac2c.cdn.weixin.qq.com") {
        expect(request.headers.has("authorization")).toBe(false);
        controls.uploads++;
        const decipher = createDecipheriv("aes-128-ecb", Buffer.from(key, "hex"), Buffer.alloc(0));
        expect(
          Buffer.concat([
            decipher.update(Buffer.from(await request.arrayBuffer())),
            decipher.final(),
          ]),
        ).toEqual(png);
        return new Response(null, { headers: { "x-encrypted-param": "download-param" } });
      }
      if (u.pathname.endsWith("sendmessage")) {
        events.push("send");
        sends.push(await request.json());
        return controls.failSend ? new Response(null, { status: 503 }) : Response.json({ ret: 0 });
      }
      if (u.pathname.endsWith("getupdates")) return Response.json({ msgs: [] });
      throw new Error(`Unexpected endpoint: ${u.origin}${u.pathname}`);
    }),
  );
  return { requests, chatRequests, sends, controls, events };
}

describe("AI image plugin", () => {
  it("uses the image endpoint regardless of chat protocol and bills verified images once", async () => {
    const n = network(),
      { s, p } = await setup();
    expect(p.ok).toBe(true);
    expect(p.data).not.toHaveProperty("size");
    const before = await s.snapshot();
    const prompt = "画一只橘猫";
    const text = await send(s, "@画图 " + prompt, "image-turn");
    const id = /\/api\/assets\/([0-9a-f-]+)/.exec(text)![1];
    expect(n.requests).toHaveLength(1);
    expect(n.requests[0].url).toBe("https://image.example.com/v1/images/generations");
    expect(n.requests[0].body).toEqual({
      model: "qwen-image-3.0",
      prompt,
      n: 1,
    });
    expect(n.requests[0].headers.get("authorization")).toBe("Bearer model-key");
    const after = await s.snapshot();
    expect(before.wallet.balance - after.wallet.balance).toBeCloseTo(
      5 + creditUnits(countTextTokens(prompt), 0) / 1000,
      6,
    );
    expect(after.ledger[0].meter?.outputImages).toBe(1);
    expect(await send(s, "ignored", "image-turn")).toBe(text);
    expect(n.requests).toHaveLength(1);
    const image = await s.imageAsset(id);
    expect(image.status).toBe(200);
    expect(image.headers.get("cache-control")).toContain("no-store");
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(new Uint8Array(png));
    const other = await setup();
    expect((await other.s.imageAsset(id)).status).toBe(404);
    await abortAllDurableObjects();
    const restored = env.ACCOUNTS.get(s.id);
    expect((await restored.snapshot()).plugins![0]).toMatchObject({
      pluginId: "wechatai/image-generation",
      version: "1.2.0",
      name: "AI 生图",
    });
    const restoredImage = await restored.imageAsset(id);
    expect(restoredImage.status).toBe(200);
    await restoredImage.body?.cancel();
    expect((await restored.snapshot()).wallet.balance).toBe(after.wallet.balance);
  });
  it("removes legacy defaults but sends an explicit per-message size while preserving the prompt", async () => {
    const n = network(),
      { s, p } = await setup();
    await send(s, "/use 画图");
    const original = await s.snapshot();
    await runInDurableObject(s, (_, state) => {
      const row = state.storage.sql
        .exec<{ data: string }>("SELECT data FROM plugins WHERE id = ?", p.data.id)
        .one();
      const legacy = { ...JSON.parse(row.data), version: "1.0.0", size: "1536x1024" };
      state.storage.sql.exec(
        "UPDATE plugins SET data = ? WHERE id = ?",
        JSON.stringify(legacy),
        p.data.id,
      );
    });
    await abortAllDurableObjects();
    const restored = env.ACCOUNTS.get(s.id);
    const current = await restored.snapshot();
    expect(current.plugins![0]).toMatchObject({
      id: p.data.id,
      version: "1.2.0",
      name: "AI 生图",
      shortcut: "画图",
      modelId: p.data.modelId,
    });
    expect(current.plugins![0]).not.toHaveProperty("size");
    expect(current.currentSession?.id).toBe(original.currentSession?.id);
    expect(current.wallet.balance).toBe(original.wallet.balance);
    for (const [prompt, size] of [
      ["16:9 横版，山间日出", "1536x864"],
      ["9:16 竖版，一只橘猫", "864x1536"],
      ["城市里的女孩，3:4", "960x1280"],
      ["窗边的花", undefined],
    ] as const) {
      await send(restored, prompt);
      expect(n.requests.at(-1)!.body).toEqual({
        model: "qwen-image-3.0",
        prompt,
        n: 1,
        ...(size ? { size } : {}),
      });
    }
    expect(n.requests).toHaveLength(4);
  });
  it("extracts a portrait canvas for a one-shot image command without billing extra input", async () => {
    const n = network(),
      { s } = await setup();
    const prompt = "城市街景，3:4";
    const before = (await s.snapshot()).wallet.balance;
    await send(s, "@画图 " + prompt);
    expect(n.requests[0].body).toEqual({ model: "qwen-image-3.0", prompt, n: 1, size: "960x1280" });
    expect(before - (await s.snapshot()).wallet.balance).toBeCloseTo(
      5 + creditUnits(countTextTokens(prompt), 0) / 1000,
      6,
    );
  });
  it("supports enter/exit and never sends old turns or system prompts to image generation", async () => {
    const n = network(),
      { s, p } = await setup();
    await send(s, "/use 画图");
    const session = (await s.snapshot()).currentSession!.id;
    await send(s, "第一张猫");
    await send(s, "第二张狗");
    expect(n.requests.map((r) => r.body.prompt)).toEqual(["第一张猫", "第二张狗"]);
    expect((await s.snapshot()).currentSession?.pluginInstanceId).toBe(p.data.id);
    await send(s, "/exit");
    expect((await s.snapshot()).currentSession?.pluginInstanceId).toBeUndefined();
    const assets = await runInDurableObject(s, (_, state) =>
      state.storage.sql
        .exec<{ id: string }>("SELECT id FROM output_assets WHERE sessionId = ?", session)
        .toArray(),
    );
    expect((await api(s, "session.action", { id: session, action: "clear" })).ok).toBe(true);
    expect((await s.imageAsset(assets[0].id)).status).toBe(404);
  });
  it("routes @ between DS Chat and images once, preserving the active plugin and charging only the target", async () => {
    const n = network(),
      { s, p } = await setup(),
      chat = await addChat(s);
    await send(s, "/use DS");
    const before = await s.snapshot();
    const chatSession = before.currentSession!.id;
    const prompt = "一只窗边读书的橘猫";
    const image = await send(s, `@画图 ${prompt}`, "cross-plugin-image");
    const after = await s.snapshot();
    expect(after.currentSession).toMatchObject({ id: chatSession, pluginInstanceId: chat.id });
    expect(n.chatRequests).toHaveLength(0);
    expect(n.requests.map((r) => r.body.prompt)).toEqual([prompt]);
    expect(n.requests[0].headers.get("authorization")).toBe("Bearer model-key");
    expect(before.wallet.balance - after.wallet.balance).toBeCloseTo(
      5 + creditUnits(countTextTokens(prompt), 0) / 1000,
      6,
    );
    const meters = await runInDurableObject(s, (_, state) =>
      state.storage.sql
        .exec<{ pluginId: string }>("SELECT pluginId FROM platform_metering")
        .toArray(),
    );
    expect(meters.map((m) => m.pluginId)).toEqual(["wechatai/image-generation"]);
    expect(
      (await api(s, "session.list")).data.some(
        (v: { pluginInstanceId?: string }) => v.pluginInstanceId === p.data.id,
      ),
    ).toBe(false);
    const history = (await api(s, "session.messages", { id: chatSession })).data;
    expect(history.map((m: { content: string }) => m.content)).toEqual([prompt, image]);
    expect(await send(s, "给刚才的画面起个标题")).toBe("这是 DS Chat 的回答");
    expect(n.chatRequests).toHaveLength(1);
    expect(JSON.stringify(n.chatRequests[0].messages)).toContain(prompt);
    expect((await s.snapshot()).currentSession?.id).toBe(chatSession);

    // The reverse works too: one DS Chat request while image generation stays the default.
    await send(s, "/use 画图");
    const imageSession = (await s.snapshot()).currentSession!.id;
    expect(await send(s, "@DS 帮我想一个画面主题")).toBe("这是 DS Chat 的回答");
    expect((await s.snapshot()).currentSession).toMatchObject({
      id: imageSession,
      pluginInstanceId: p.data.id,
    });
    await send(s, "森林里的小屋");
    expect(n.requests.map((r) => r.body.prompt)).toEqual([prompt, "森林里的小屋"]);
    expect(n.chatRequests).toHaveLength(2);
    expect((await s.snapshot()).currentSession?.id).toBe(imageSession);

    // Retrying an already completed temporary call cannot run it or restore its old default.
    const balance = (await s.snapshot()).wallet.balance;
    expect(await send(s, `@画图 ${prompt}`, "cross-plugin-image")).toBe(image);
    expect(n.requests).toHaveLength(2);
    expect((await s.snapshot()).currentSession?.id).toBe(imageSession);
    expect((await s.snapshot()).wallet.balance).toBe(balance);
  });
  it("switches plugins directly, resumes their sessions after restart and exits to the original plain chat", async () => {
    const n = network(),
      { s, p } = await setup(),
      chat = await addChat(s);
    const plain = (await s.snapshot()).currentSession!.id;
    await send(s, "/use DS Chat");
    const chatSession = (await s.snapshot()).currentSession!.id;
    await send(s, "你好");
    const entered = await send(s, "/use 画图", "switch-to-image");
    expect(entered).toContain("已切换到「AI 生图」");
    expect(entered).toContain("画面描述");
    expect(entered).not.toContain("联网");
    const imageSession = (await s.snapshot()).currentSession!.id;
    await send(s, "山间小屋");
    const balance = (await s.snapshot()).wallet.balance;
    expect(await send(s, "/use DS Chat")).toContain("已切换到「DS Chat」");
    expect((await s.snapshot()).currentSession).toMatchObject({
      id: chatSession,
      pluginInstanceId: chat.id,
    });
    expect((await api(s, "session.messages", { id: chatSession })).data).toHaveLength(2);
    expect(await send(s, "/use 画图", "switch-to-image")).toBe(entered);
    expect((await s.snapshot()).currentSession?.id).toBe(chatSession);

    await abortAllDurableObjects();
    const restored = env.ACCOUNTS.get(s.id);
    expect(await send(restored, "/plugins")).toContain("直接切换插件");
    await send(restored, "/use 1");
    expect((await restored.snapshot()).currentSession).toMatchObject({
      id: imageSession,
      pluginInstanceId: p.data.id,
    });
    expect((await api(restored, "session.messages", { id: imageSession })).data).toHaveLength(2);
    await send(restored, "/use DS");
    expect((await restored.snapshot()).currentSession?.id).toBe(chatSession);
    expect(await send(restored, "/exit")).toContain("已退出插件");
    expect((await restored.snapshot()).currentSession).toMatchObject({ id: plain });
    expect((await restored.snapshot()).currentSession?.pluginInstanceId).toBeUndefined();
    expect((await restored.snapshot()).wallet.balance).toBe(balance);
    expect(n.requests).toHaveLength(1);
    expect(n.chatRequests).toHaveLength(1);
  });
  it("keeps DS Chat active when a temporary image call or direct switch fails", async () => {
    const n = network(),
      { s, p } = await setup(),
      chat = await addChat(s);
    await send(s, "/use DS");
    const before = await s.snapshot();
    n.controls.failure = 503;
    await expect(send(s, "@画图 一只橘猫")).rejects.toThrow("上游生图服务暂时异常");
    expect((await s.snapshot()).wallet.balance).toBe(before.wallet.balance);
    await api(s, "plugin.save", { ...p.data, enabled: false });
    await expect(send(s, "/use 画图")).rejects.toThrow("插件已停用");
    await expect(send(s, "@画图 一只橘猫")).rejects.toThrow("插件已停用");
    expect(await send(s, "/use 不存在的插件")).toContain("没有找到这个插件");
    expect((await s.snapshot()).currentSession).toMatchObject({
      id: before.currentSession!.id,
      pluginInstanceId: chat.id,
    });
    expect(await send(s, "继续聊天")).toBe("这是 DS Chat 的回答");
    expect(n.requests).toHaveLength(1);
    expect(n.chatRequests).toHaveLength(1);
  });
  it("blocks Free, missing credits, disabled instances and too-small caps before provider calls", async () => {
    const n = network();
    expect((await setup(false)).p.ok).toBe(false);
    const capped = await setup(true, 5);
    expect((await api(capped.s, "plugin.test", { id: capped.p.data.id, query: "cat" })).error).toBe(
      "budget_too_small",
    );
    const paid = await setup();
    await api(paid.s, "plugin.save", { ...paid.p.data, enabled: false });
    expect((await api(paid.s, "plugin.test", { id: paid.p.data.id, query: "cat" })).error).toBe(
      "plugin_disabled",
    );
    const depleted = await setup();
    await runInDurableObject(depleted.s, (_, state) => {
      state.storage.sql.exec("UPDATE credit_buckets SET remaining = 0");
    });
    expect(
      (await api(depleted.s, "plugin.test", { id: depleted.p.data.id, query: "cat" })).error,
    ).toBe("insufficient_credits");
    expect(n.requests).toHaveLength(0);
  });
  it.each(["upstream", "invalid"])("does not charge for %s failure", async (kind) => {
    const n = network(),
      { s, p } = await setup();
    const before = (await s.snapshot()).wallet.balance;
    if (kind === "upstream") n.controls.failure = 503;
    else n.controls.invalid = true;
    const result = await api(s, "plugin.test", { id: p.data.id, query: "cat" });
    expect(result.ok).toBe(false);
    expect((await s.snapshot()).wallet.balance).toBe(before);
    expect(
      await runInDurableObject(s, (_, state) =>
        state.storage.sql.exec("SELECT * FROM output_assets").toArray(),
      ),
    ).toHaveLength(0);
  });
  it("downloads signed URL output without disclosing credentials and expires access", async () => {
    const n = network();
    n.controls.external = true;
    const { s, p } = await setup();
    const result = await api(s, "plugin.test", { id: p.data.id, query: "猫" });
    expect(result.ok).toBe(true);
    const id = result.data.images[0];
    await runInDurableObject(s, (_, state) =>
      state.storage.sql.exec("UPDATE output_assets SET expiresAt = 0 WHERE id = ?", id),
    );
    expect((await s.imageAsset(id)).status).toBe(404);
  });
  it("rejects untrusted image hosts and incomplete/non-raster bytes", async () => {
    network();
    await expect(
      fetchGeneratedBytes("http://127.0.0.1/image", AbortSignal.timeout(1000)),
    ).rejects.toThrow();
    expect(() => verifyGeneratedImage(png.subarray(0, png.length - 8))).toThrow();
    expect(() => verifyGeneratedImage(Buffer.from("<svg/>"))).toThrow();
    vi.mocked(fetch).mockImplementation(async () =>
      Response.json({ Answer: [{ type: 1, data: "127.0.0.1" }] }),
    );
    await expect(
      fetchGeneratedBytes("https://cdn.example.com/image", AbortSignal.timeout(1000)),
    ).rejects.toThrow("公网");
  });
  it("retries native WeChat delivery after restart without regenerating or charging twice", async () => {
    const n = network(),
      { s } = await setup();
    await queueWechat(s, "@画图 一个花园");
    await runDurableObjectAlarm(s);
    expect(n.events).toEqual(["send", "generate"]);
    expect(n.sends[0].msg).toMatchObject({
      client_id: "wx-turn:image-progress",
      context_token: "context",
      to_user_id: "owner",
      item_list: [{ type: 1, text_item: { text: "已提交 AI 生图，等待上游返回..." } }],
    });
    const balance = (await s.snapshot()).wallet.balance;
    expect(
      await runInDurableObject(s, (_, state) => ({
        messages: state.storage.sql.exec("SELECT * FROM messages").toArray().length,
        metering: state.storage.sql.exec("SELECT * FROM platform_metering").toArray().length,
        referrals: state.storage.sql
          .exec("SELECT * FROM settings WHERE key = 'referralUse'")
          .toArray().length,
      })),
    ).toEqual({ messages: 2, metering: 1, referrals: 0 });
    n.controls.failSend = true;
    await runDurableObjectAlarm(s);
    expect(n.controls.uploads).toBe(1);
    expect(n.sends).toHaveLength(2);
    await abortAllDurableObjects();
    n.controls.failSend = false;
    const restored = env.ACCOUNTS.get(s.id);
    await runDurableObjectAlarm(restored);
    expect(n.controls.uploads).toBe(1);
    expect(n.sends).toHaveLength(3);
    expect(n.requests).toHaveLength(1);
    expect(n.sends[1]).toEqual(n.sends[2]);
    const msg = n.sends[2].msg as {
      item_list: {
        type: number;
        image_item: { media: { aes_key: string; encrypt_query_param: string } };
      }[];
    };
    expect(msg.item_list[0].type).toBe(2);
    expect(msg.item_list[0].image_item.media.encrypt_query_param).toBe("download-param");
    expect(Buffer.from(msg.item_list[0].image_item.media.aes_key, "base64").toString()).toMatch(
      /^[a-f0-9]{32}$/,
    );
    expect((await restored.snapshot()).wallet.balance).toBe(balance);
  });

  it("sends progress in image mode, then explains an invalid upstream response without charging", async () => {
    const n = network(),
      { s } = await setup();
    await send(s, "/use 画图");
    const before = (await s.snapshot()).wallet.balance;
    n.controls.failure = 502;
    n.controls.failureBody = JSON.stringify({
      error: {
        code: "upstream_error",
        message:
          "The upstream image service returned an invalid response. Bearer model-key private-prompt",
      },
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    await queueWechat(s, "一只猫");
    await runDurableObjectAlarm(s);
    expect(n.events).toEqual(["send", "generate"]);
    await runDurableObjectAlarm(s);
    expect(n.sends).toHaveLength(2);
    expect(n.sends[1].msg).toMatchObject({
      item_list: [
        {
          type: 1,
          text_item: {
            text: "上游生图服务返回了无效响应（502），请稍后重试或更换渠道；本次未扣 credits",
          },
        },
      ],
    });
    expect(n.requests).toHaveLength(1);
    expect((await s.snapshot()).wallet.balance).toBe(before);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('"reason":"invalid_response"'));
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('"requestId":"10b1d925-5104-4f1a-beab-49e0f6bfdb4e"'),
    );
    expect(JSON.stringify([n.sends, warning.mock.calls])).not.toMatch(/model-key|private-prompt/);
    expect(
      await runInDurableObject(s, (_, state) => ({
        messages: state.storage.sql.exec("SELECT * FROM messages").toArray().length,
        metering: state.storage.sql.exec("SELECT * FROM platform_metering").toArray().length,
        referrals: state.storage.sql
          .exec("SELECT * FROM settings WHERE key = 'referralUse'")
          .toArray().length,
      })),
    ).toEqual({ messages: 0, metering: 0, referrals: 0 });
  });

  it("still generates and delivers the image when the progress notice fails", async () => {
    const n = network(),
      { s } = await setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    n.controls.failSend = true;
    await queueWechat(s, "@画图 花园");
    await runDurableObjectAlarm(s);
    expect(n.events).toEqual(["send", "generate"]);
    n.controls.failSend = false;
    await runDurableObjectAlarm(s);
    expect(n.requests).toHaveLength(1);
    expect(n.sends).toHaveLength(2);
    expect(n.sends[1].msg).toMatchObject({ item_list: [{ type: 2 }] });
  });

  it.each([true, false])(
    "persists a custom image notice, enabled=%s, without changing generation or billing",
    async (enabled) => {
      const n = network(),
        { s, p } = await setup();
      const notice = "正在创作，请稍候 🎨";
      const saved = await api(s, "plugin.save", {
        ...p.data,
        waitingMessageEnabled: enabled,
        waitingMessage: notice,
      });
      expect(saved.ok).toBe(true);
      // A PATCH from an older client must not reset the user's notice preferences.
      expect((await api(s, "plugin.save", { id: p.data.id, name: "我的画图" })).data).toMatchObject(
        {
          waitingMessageEnabled: enabled,
          waitingMessage: notice,
        },
      );
      await abortAllDurableObjects();
      const restored = env.ACCOUNTS.get(s.id);
      const before = (await restored.snapshot()).wallet.balance;
      await queueWechat(restored, "@画图 城市街景");
      await runDurableObjectAlarm(restored);
      expect(n.events).toEqual(enabled ? ["send", "generate"] : ["generate"]);
      if (enabled)
        expect(n.sends[0].msg).toMatchObject({
          item_list: [{ type: 1, text_item: { text: notice } }],
        });
      expect(n.requests[0].body.prompt).toBe("城市街景");
      await runDurableObjectAlarm(restored);
      expect(n.sends).toHaveLength(enabled ? 2 : 1);
      expect(n.sends.at(-1)!.msg).toMatchObject({ item_list: [{ type: 2 }] });
      expect(before - (await restored.snapshot()).wallet.balance).toBeCloseTo(
        5 + creditUnits(countTextTokens("城市街景"), 0) / 1000,
        6,
      );
    },
  );

  it("still sends upstream errors when image waiting notices are disabled", async () => {
    const n = network(),
      { s, p } = await setup();
    await api(s, "plugin.save", { ...p.data, waitingMessageEnabled: false });
    n.controls.failure = 502;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await queueWechat(s, "@画图 花园");
    await runDurableObjectAlarm(s);
    expect(n.sends).toHaveLength(0);
    await runDurableObjectAlarm(s);
    expect(n.sends).toHaveLength(1);
    expect(n.sends[0].msg).toMatchObject({
      item_list: [
        {
          text_item: {
            text: expect.stringContaining("上游生图服务暂时异常（502）"),
          },
        },
      ],
    });
  });

  it("does not announce a request rejected by the credit cap", async () => {
    const n = network(),
      { s } = await setup(true, 5);
    await queueWechat(s, "@画图 花园");
    await runDurableObjectAlarm(s);
    expect(n.events).toEqual([]);
    await runDurableObjectAlarm(s);
    expect(n.sends).toHaveLength(1);
    expect(n.sends[0].msg).toMatchObject({
      item_list: [
        {
          text_item: {
            text: expect.stringContaining("单次 credits 上限不足"),
          },
        },
      ],
    });
  });

  it.each([
    [502, "<html>Bad Gateway</html>", "上游生图服务暂时异常（502）"],
    [502, "x".repeat(20_000), "上游生图服务暂时异常（502）"],
    [429, '{"error":{"code":"insufficient_quota"}}', "余额或额度不足"],
    [429, "{}", "请求过于频繁"],
  ])("handles bounded upstream errors (%s)", async (status, body, message) => {
    const n = network(),
      { s, p } = await setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    n.controls.failure = status;
    n.controls.failureBody = body;
    const result = await api(s, "plugin.test", { id: p.data.id, query: "cat" });
    expect(result).toMatchObject({
      ok: false,
      error: "image_upstream",
      message: expect.stringContaining(message),
    });
    expect(n.requests).toHaveLength(1);
    expect(n.sends).toHaveLength(0);
  });
});
