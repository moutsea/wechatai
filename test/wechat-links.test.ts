import {
  env,
  abortAllDurableObjects,
  runInDurableObject,
  runDurableObjectAlarm,
} from "cloudflare:test";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { WxMessage } from "../src/server/wechat";
import { encrypt } from "../src/server/security";
import { wechatLinkKey } from "../src/shared/wechat-links";
import { chatSetupIssue, notificationWechatIssue } from "../src/shared/wechat-readiness";
import { dashboardSetupProgress } from "../src/shared/onboarding";
import { parseOpenClawPairing, parseOpenClawToken } from "../src/server/openclaw-token";
import { parseNotificationToken } from "../src/server/notification-token";

const accounts: ReturnType<typeof env.ACCOUNTS.getByName>[] = [];
function account() {
  const stub = env.ACCOUNTS.getByName(crypto.randomUUID());
  accounts.push(stub);
  return stub;
}
type Account = ReturnType<typeof account>;
const api = async (stub: Account, action: string, payload: unknown = {}) =>
  JSON.parse(await stub.api(action, payload));
async function plus(stub: Account) {
  await stub.applyPayment({
    id: crypto.randomUUID(),
    kind: "subscription",
    units: 0,
    expires: Date.now() + 86400000,
  });
}
async function create(stub: Account, name: string) {
  const result = await api(stub, "wechat.create", { name });
  expect(result.ok).toBe(true);
  return result.data.selectedConnectionId as string;
}
function network() {
  let qr = 0;
  const queues = new Map<string, WxMessage[]>();
  const polls: string[] = [];
  const sends: { token: string; to: string; text: string; context: string; clientId: string }[] =
    [];
  const modelInputs: string[] = [];
  const modelIds: string[] = [];
  const control = { duplicateBot: false, failedSends: 0 };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(url, init);
      const target = new URL(request.url);
      const token = request.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
      if (target.pathname.endsWith("get_bot_qrcode")) {
        const code = String(++qr);
        return Response.json({
          qrcode: code,
          qrcode_img_content: `https://example.com/qr/${code}`,
        });
      }
      if (target.pathname.endsWith("get_qrcode_status")) {
        const code = target.searchParams.get("qrcode");
        return Response.json({
          status: "confirmed",
          bot_token: `token-${code}`,
          ilink_user_id: `owner-${code}`,
          ilink_bot_id: control.duplicateBot ? "same-bot" : `bot-${code}`,
        });
      }
      if (target.pathname.endsWith("getupdates")) {
        polls.push(token);
        const msgs = queues.get(token) ?? [];
        queues.set(token, []);
        return Response.json({ ret: 0, msgs, get_updates_buf: `cursor-${token}` });
      }
      if (target.pathname.endsWith("sendmessage")) {
        const { msg } = (await request.json()) as {
          msg: {
            client_id: string;
            to_user_id: string;
            context_token: string;
            item_list: { text_item: { text: string } }[];
          };
        };
        sends.push({
          token,
          to: msg.to_user_id,
          context: msg.context_token,
          text: msg.item_list[0].text_item.text,
          clientId: msg.client_id,
        });
        if (control.failedSends > 0) {
          control.failedSends--;
          return Response.json({ ret: 1 }, { status: 503 });
        }
        return Response.json({ ret: 0 });
      }
      if (target.hostname === "cloudflare-dns.com")
        return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
      if (target.hostname === "llm.example.com") {
        const body = (await request.json()) as { model: string; messages: { content: string }[] };
        modelInputs.push(JSON.stringify(body.messages));
        modelIds.push(body.model);
        return Response.json({
          choices: [{ message: { content: `回答：${body.messages.at(-1)?.content}` } }],
          usage: { prompt_tokens: 100, completion_tokens: 10 },
        });
      }
      throw new Error("Unexpected test endpoint");
    }),
  );
  return { queues, polls, sends, modelInputs, modelIds, control };
}
function msg(owner: number, text: string, id = 1): WxMessage {
  return {
    message_id: id,
    message_type: 1,
    from_user_id: `owner-${owner}`,
    context_token: `context-${owner}`,
    item_list: [{ type: 1, text_item: { text } }],
  };
}
const send = (stub: Account, link: string, text: string, id = crypto.randomUUID()) =>
  runInDurableObject(stub, (instance) =>
    (
      instance as unknown as {
        processWechat(id: string, message: WxMessage, connectionId: string): Promise<string>;
      }
    ).processWechat(id, msg(1, text), link),
  );
async function model(stub: Account) {
  const result = await api(stub, "assistant.save", {
    name: "测试模型",
    protocol: "chat-completions",
    baseUrl: "https://llm.example.com",
    apiKey: "test-secret",
    model: "test-model",
    systemPrompt: "",
    maxCredits: 100,
    maxOutputTokens: 128,
  });
  expect(result.ok).toBe(true);
  return result.data.id as string;
}
async function cycles(stub: Account, count: number) {
  for (let i = 0; i < count; i++) await runDurableObjectAlarm(stub);
}
async function skipWelcome(stub: Account, id: string) {
  await runInDurableObject(stub, (_, state) => {
    state.storage.sql.exec(
      "DELETE FROM settings WHERE key = ?",
      wechatLinkKey(id, "guideDelivery"),
    );
  });
}
beforeEach(() => network());
afterEach(async () => {
  for (const stub of accounts.splice(0))
    await runInDurableObject(stub, async (_, state) => {
      await state.storage.deleteAlarm();
    });
  vi.unstubAllGlobals();
});

describe("WeChat sessions on demand", () => {
  const confirmCommand = (reply: string) => /60 秒内发送 (\/wx [^\n]+) 确认/.exec(reply)![1];

  async function emptyLink() {
    const stub = account();
    await plus(stub);
    const modelId = await model(stub);
    await create(stub, "已有会话的微信");
    const link = await create(stub, "新的微信");
    expect((await stub.snapshot()).currentSession).toBeNull();
    return { stub, link, modelId };
  }

  it("answers platform commands and invalid shortcuts without creating a default session", async () => {
    const { stub, link } = await emptyLink();
    for (const text of [
      "/wx help",
      "/wx status",
      "/wx balance",
      "/wx plugins",
      "/wx channels",
      "/wx models",
      "/wx sessions",
      "/wx cancel",
      "/wx reset",
      "/wx clear",
      "/wx delete",
      "/wx archive",
      "@不存在 你好",
    ]) {
      expect(await send(stub, link, text)).toBeTruthy();
      const snapshot = await stub.snapshot();
      expect(snapshot.currentSession, text).toBeNull();
      expect(snapshot.stats.sessions, text).toBe(1);
    }
    expect(await send(stub, link, "/wx status")).toContain("当前还没有会话");
    expect(await send(stub, link, "/wx sessions")).toContain("/wx new");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("creates one session for the first new command and replays it without creating another", async () => {
    const { stub, link } = await emptyLink();
    const id = crypto.randomUUID();
    const reply = await send(stub, link, "/wx new", id);
    expect(reply).toBe("已开始新的会话。");
    const first = await stub.snapshot();
    expect(first.stats.sessions).toBe(2);
    expect(first.currentSession).not.toBeNull();
    expect(await send(stub, link, "/wx new", id)).toBe(reply);
    expect((await stub.snapshot()).stats.sessions).toBe(2);
    expect(await send(stub, link, "/wx new")).toBe("已开始新的会话，原会话已保留。");
    const next = await stub.snapshot();
    expect(next.stats.sessions).toBe(3);
    expect(next.currentSession?.id).not.toBe(first.currentSession?.id);
  });

  it("enters the requested plugin without first creating an ordinary model session", async () => {
    const { stub, link, modelId } = await emptyLink();
    const plugin = await api(stub, "plugin.save", {
      pluginId: "wechatai/roleplay",
      name: "旅人",
      shortcut: "旅人",
      modelId,
      description: "森林中的旅人",
      firstMessage: "一起出发吧。",
    });
    expect(plugin.ok).toBe(true);
    expect(await send(stub, link, "@旅人")).toContain("请在后面加上问题");
    expect((await stub.snapshot()).currentSession).toBeNull();
    expect(await send(stub, link, "/use 旅人")).toContain("一起出发吧。");
    const snapshot = await stub.snapshot();
    expect(snapshot.stats.sessions).toBe(2);
    expect(snapshot.currentSession?.pluginInstanceId).toBe(plugin.data.id);
  });

  it("still starts ordinary chat after looking up platform commands", async () => {
    const net = network();
    const { stub, link, modelId } = await emptyLink();
    await send(stub, link, "/wx models");
    expect(await send(stub, link, "你好")).toBe("回答：你好");
    expect(net.modelInputs).toHaveLength(1);
    const snapshot = await stub.snapshot();
    expect(snapshot.stats.sessions).toBe(2);
    expect(snapshot.currentSession?.assistantId).toBe(modelId);
    expect(snapshot.connections[0].currentSessionId).not.toBe(snapshot.currentSession?.id);
  });

  it("uses the ordinary default model after first entering a plugin with a different model", async () => {
    const { stub, link, modelId } = await emptyLink();
    const original = (await stub.snapshot()).assistants.find((a) => a.id === modelId)!;
    await api(stub, "wechat.select", { id: "default" });
    const second = await api(stub, "model.save", {
      channelId: original.channelId,
      name: "插件模型",
      model: "plugin-model",
    });
    expect(second.ok).toBe(true);
    await api(stub, "wechat.select", { id: link });
    expect((await stub.snapshot()).currentSession).toBeNull();
    const plugin = await api(stub, "plugin.save", {
      pluginId: "wechatai/roleplay",
      name: "旅人",
      shortcut: "旅人",
      modelId: second.data.id,
      description: "森林中的旅人",
    });
    expect(plugin.ok).toBe(true);
    const entered = await send(stub, link, "/use 旅人");
    expect(entered).not.toContain("返回进入插件前");
    expect((await stub.snapshot()).currentSession?.assistantId).toBe(second.data.id);
    expect(await send(stub, link, "/exit")).toContain("新建普通模型会话");
    const snapshot = await stub.snapshot();
    expect(snapshot.currentSession?.assistantId).toBe(modelId);
    expect(snapshot.currentSession?.pluginInstanceId).toBeUndefined();
    const net = network();
    await send(stub, link, "你好");
    expect(net.modelIds).toEqual([original.model]);
  });

  it("checks the session limit for both WeChat and web exits and preserves the current mode on failure", async () => {
    const { stub, link, modelId } = await emptyLink();
    const plugin = await api(stub, "plugin.save", {
      pluginId: "wechatai/roleplay",
      name: "旅人",
      shortcut: "旅人",
      modelId,
      description: "森林中的旅人",
    });
    expect(plugin.ok).toBe(true);
    await send(stub, link, "/use 旅人");
    const before = await stub.snapshot();
    const disposable = await runInDurableObject(stub, (_, state) => {
      const source = JSON.parse(
        state.storage.sql
          .exec<{ data: string }>(
            "SELECT data FROM sessions WHERE id = ?",
            before.currentSession!.id,
          )
          .one().data,
      );
      let lastId = "";
      for (let n = before.stats.sessions; n < before.limits.sessions; n++) {
        const id = crypto.randomUUID();
        state.storage.sql.exec(
          "INSERT INTO sessions VALUES (?, ?)",
          id,
          JSON.stringify({ ...source, id }),
        );
        lastId = id;
      }
      return lastId;
    });
    await expect(send(stub, link, "/exit")).rejects.toMatchObject({ code: "session_limit" });
    expect(await api(stub, "plugin.exit", { connectionId: link })).toMatchObject({
      ok: false,
      error: "session_limit",
    });
    const full = await stub.snapshot();
    expect(full.stats.sessions).toBe(before.limits.sessions);
    expect(full.currentSession?.id).toBe(before.currentSession?.id);
    const otherLink = await create(stub, "空微信");
    await expect(send(stub, otherLink, "/exit")).rejects.toMatchObject({ code: "session_limit" });
    expect((await stub.snapshot()).currentSession).toBeNull();
    expect((await stub.snapshot()).stats.sessions).toBe(before.limits.sessions);
    expect((await api(stub, "session.action", { id: disposable, action: "delete" })).ok).toBe(true);
    await send(stub, link, "/exit");
    const plain = (await api(stub, "session.list")).data.find(
      (s: { connectionId: string; pluginInstanceId?: string }) =>
        s.connectionId === link && !s.pluginInstanceId,
    );
    expect(plain).toBeTruthy();
    await send(stub, link, "/use 旅人");
    expect(await send(stub, link, "/exit")).toContain("已退出插件，返回");
    const snapshot = await stub.snapshot();
    expect(snapshot.connections.find((c) => c.id === link)?.currentSessionId).toBe(plain.id);
    expect(snapshot.stats.sessions).toBe(before.limits.sessions);
  });

  it("lists and selects the default text model when the first channel only has images", async () => {
    const stub = account();
    await plus(stub);
    const image = await api(stub, "assistant.save", {
      name: "生图渠道",
      protocol: "chat-completions",
      baseUrl: "https://image.example.com",
      apiKey: "test",
      model: "qwen-image-3.0",
      kind: "image",
    });
    expect(image.ok).toBe(true);
    const modelId = await model(stub);
    await create(stub, "已有微信");
    const link = await create(stub, "新微信");
    expect(await send(stub, link, "/wx models")).toContain("测试模型");
    expect((await stub.snapshot()).currentSession).toBeNull();
    const selected = await send(stub, link, "/wx model 1");
    expect(selected).toContain("已切换到");
    const first = await stub.snapshot();
    expect(first.currentSession?.assistantId).toBe(modelId);
    expect(first.stats.sessions).toBe(2);
    await send(stub, link, "/wx new");
    expect((await stub.snapshot()).currentSession?.assistantId).toBe(modelId);
  });

  it("lets Free users delete an Agent session to free a slot and return to ordinary chat", async () => {
    const stub = account();
    const link = await create(stub, "微信");
    expect(
      (
        await api(stub, "plugin.save", {
          pluginId: "wechatai/openclaw",
          name: "我的 Agent",
          shortcut: "claw",
          agentId: "main",
        })
      ).ok,
    ).toBe(true);
    await send(stub, link, "/use claw");
    const first = await stub.snapshot();
    for (let count = 1; count < first.limits.sessions; count++) await send(stub, link, "/wx new");
    const modelId = await model(stub);
    await expect(send(stub, link, "/exit")).rejects.toMatchObject({ code: "session_limit" });
    const before = await stub.snapshot();
    expect(before.plan).toBe("free");
    expect(before.stats.sessions).toBe(before.limits.sessions);
    const warning = await send(stub, link, "/wx delete");
    expect(warning).toContain("释放一个会话名额");
    expect((await stub.snapshot()).stats.sessions).toBe(before.limits.sessions);
    const token = /\/wx delete ([a-f0-9]{6})/.exec(warning)![1];
    const id = crypto.randomUUID();
    const deleted = await send(stub, link, `/wx delete ${token}`, id);
    expect(deleted).toContain("已释放一个会话名额");
    const after = await stub.snapshot();
    expect(after.stats.sessions).toBe(before.limits.sessions - 1);
    expect(after.currentSession).toBeNull();
    expect(await send(stub, link, `/wx delete ${token}`, id)).toBe(deleted);
    expect((await stub.snapshot()).stats.sessions).toBe(before.limits.sessions - 1);
    await send(stub, link, "/exit");
    const returned = await stub.snapshot();
    expect(returned.stats.sessions).toBe(before.limits.sessions);
    expect(returned.currentSession?.assistantId).toBe(modelId);
    const net = network();
    expect(await send(stub, link, "你好")).toBe("回答：你好");
    expect(net.modelIds).toEqual(["test-model"]);
  });

  it("frees the current web session without creating a replacement and starts chat on demand", async () => {
    const { stub, link, modelId } = await emptyLink();
    await send(stub, link, "/wx new");
    const before = await stub.snapshot();
    const originalId = before.currentSession!.id;
    expect((await api(stub, "session.action", { id: originalId, action: "delete" })).ok).toBe(true);
    const deleted = await stub.snapshot();
    expect(deleted.stats.sessions).toBe(before.stats.sessions - 1);
    expect(deleted.currentSession).toBeNull();
    expect(deleted.connections[0].currentSessionId).toBe(before.connections[0].currentSessionId);
    expect(
      (await api(stub, "session.list")).data.some((s: { id: string }) => s.id === originalId),
    ).toBe(false);
    const net = network();
    await send(stub, link, "删除后继续聊天");
    const fresh = await stub.snapshot();
    expect(fresh.stats.sessions).toBe(before.stats.sessions);
    expect(fresh.currentSession?.id).not.toBe(originalId);
    expect(fresh.currentSession?.assistantId).toBe(modelId);
    expect(net.modelInputs).toHaveLength(1);
  });

  it.each(["deleted", "disabled"])(
    "lets Free users release all quota from a %s plugin, including archived sessions",
    async (availability) => {
      const stub = account();
      const link = await create(stub, "微信");
      const saved = await api(stub, "plugin.save", {
        pluginId: "wechatai/openclaw",
        name: "旧 Agent",
        shortcut: "old",
        agentId: "main",
      });
      expect(saved.ok).toBe(true);
      await send(stub, link, "/use old");
      await send(stub, link, "/wx archive");
      const initial = await stub.snapshot();
      for (let n = initial.stats.sessions; n < initial.limits.sessions; n++)
        await send(stub, link, "/wx new");
      expect(
        (
          await api(stub, availability === "deleted" ? "plugin.delete" : "plugin.save", {
            id: saved.data.id,
            enabled: false,
          })
        ).ok,
      ).toBe(true);
      expect((await stub.snapshot()).plan).toBe("free");
      expect((await api(stub, "session.list")).ok).toBe(false);
      await send(stub, link, confirmCommand(await send(stub, link, "/wx delete")));
      expect((await stub.snapshot()).currentSession).toBeNull();
      expect(await send(stub, link, "/wx delete")).toContain("/wx delete 编号");
      const net = network();
      let sawArchived = false;
      for (let remaining = initial.limits.sessions - 1; remaining > 0; remaining--) {
        const listing = await send(stub, link, "/wx sessions");
        sawArchived ||= listing.includes("[归档]");
        const warning = await send(stub, link, "/wx delete 1");
        expect(warning).toContain("会话「");
        expect((await stub.snapshot()).stats.sessions).toBe(remaining);
        const id = crypto.randomUUID();
        const command = confirmCommand(warning);
        const reply = await send(stub, link, command, id);
        expect(reply).toContain("已释放一个会话名额");
        expect(await send(stub, link, command, id)).toBe(reply);
        expect((await stub.snapshot()).stats.sessions).toBe(remaining - 1);
        expect((await stub.snapshot()).currentSession).toBeNull();
      }
      expect(sawArchived).toBe(true);
      expect(net.modelInputs).toHaveLength(0);
      const modelId = await model(stub);
      expect(await send(stub, link, "重新开始聊天")).toBe("回答：重新开始聊天");
      expect((await stub.snapshot()).currentSession?.assistantId).toBe(modelId);
      expect(net.modelInputs).toHaveLength(1);
    },
  );

  it("binds numbered deletion to the chosen session across switches and list changes", async () => {
    const { stub, link } = await emptyLink();
    await send(stub, link, "/wx new");
    const target = (await stub.snapshot()).currentSession!;
    await send(stub, link, "/wx new");
    await send(stub, link, "/wx sessions");
    const rows = (await api(stub, "session.list")).data as { id: string; connectionId: string }[];
    const number =
      rows.filter((s) => s.connectionId === link).findIndex((s) => s.id === target.id) + 1;
    const warning = await send(stub, link, `/wx delete ${number}`);
    expect(warning).toContain(`「${target.title}」`);
    const command = confirmCommand(warning);
    expect(await send(stub, link, `/wx delete ${number} invalid`)).toContain("确认码无效");
    await runInDurableObject(stub, (_, state) => {
      const key = wechatLinkKey(link, "clearConfirmation");
      const row = state.storage.sql
        .exec<{ value: string }>("SELECT value FROM settings WHERE key = ?", key)
        .one();
      const confirmation = JSON.parse(row.value);
      confirmation.expires = Date.now() - 1;
      state.storage.sql.exec(
        "UPDATE settings SET value = ? WHERE key = ?",
        JSON.stringify(confirmation),
        key,
      );
    });
    expect(await send(stub, link, command)).toContain("确认码无效或已过期");
    const freshCommand = confirmCommand(await send(stub, link, `/wx delete ${number}`));
    await send(stub, link, "/wx new");
    await send(stub, link, "/wx sessions");
    const before = await stub.snapshot();
    expect(await send(stub, link, freshCommand)).toContain("已释放一个会话名额");
    const after = await stub.snapshot();
    expect(after.currentSession?.id).toBe(before.currentSession?.id);
    expect(after.stats.sessions).toBe(before.stats.sessions - 1);
    const remaining = (await api(stub, "session.list")).data as { id: string }[];
    expect(remaining.some((s) => s.id === target.id)).toBe(false);
    expect(await send(stub, link, freshCommand)).toContain("确认码无效");
    expect((await stub.snapshot()).stats.sessions).toBe(after.stats.sessions);
  });

  it.each(["clear", "delete"])(
    "does not apply a current-session %s confirmation after switching sessions",
    async (operation) => {
      const { stub, link } = await emptyLink();
      await send(stub, link, "/wx new");
      const target = (await stub.snapshot()).currentSession!;
      const original = (await api(stub, "session.list")).data.find(
        (s: { id: string }) => s.id === target.id,
      );
      await send(stub, link, `/wx ${operation}`);
      await runInDurableObject(stub, (_, state) => {
        const key = wechatLinkKey(link, "clearConfirmation");
        const row = state.storage.sql
          .exec<{ value: string }>("SELECT value FROM settings WHERE key = ?", key)
          .one();
        state.storage.sql.exec(
          "UPDATE settings SET value = ? WHERE key = ?",
          JSON.stringify({ ...JSON.parse(row.value), token: "123456" }),
          key,
        );
      });
      const command = `/wx ${operation} 123456`;
      await send(stub, link, "/wx new");
      const before = await stub.snapshot();
      expect(await send(stub, link, command)).toContain("确认码无效");
      expect((await stub.snapshot()).currentSession?.id).toBe(before.currentSession?.id);
      const rows = (await api(stub, "session.list")).data as { id: string; resetAt: number }[];
      expect(rows.find((s) => s.id === target.id)?.resetAt).toBe(original.resetAt);
      expect(rows).toHaveLength(before.stats.sessions);
    },
  );
});

describe("WeChat transport binding independent of chat configuration", () => {
  it.each([false, true])(
    "binds an empty account without requiring or charging a model (Plus=%s)",
    async (isPlus) => {
      const stub = account();
      if (isPlus) await plus(stub);
      const before = await stub.snapshot();
      vi.mocked(fetch).mockClear();
      const result = await api(stub, "wechat.bind");
      expect(result.ok).toBe(true);
      const after = await stub.snapshot();
      expect(chatSetupIssue(after)?.code).toBe("wechat_channel_required");
      expect(after.connections).toHaveLength(1);
      expect(after.connection.status).toBe("waiting");
      expect(after.connection.qrUrl).toBeTruthy();
      expect(after.wallet.balance).toBe(before.wallet.balance);
      expect(after.ledger).toEqual(before.ledger);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(new Request(...vi.mocked(fetch).mock.calls[0]).url).toContain("get_bot_qrcode");
      const reply = await send(stub, after.selectedConnectionId, "你好");
      expect(reply).toContain("当前未选择模型或插件");
      expect((await stub.snapshot()).wallet.balance).toBe(before.wallet.balance);
      expect((await stub.snapshot()).ledger).toEqual(before.ledger);
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps image-only chat unready without preventing transport binding", async () => {
    const stub = account();
    await plus(stub);
    const channel = await api(stub, "channel.save", {
      name: "渠道",
      protocol: "chat-completions",
      baseUrl: "https://llm.example.com",
      apiKey: "test-key",
    });
    expect(channel.ok).toBe(true);
    const id = await create(stub, "日常");
    expect(chatSetupIssue(await stub.snapshot())?.code).toBe("wechat_model_required");
    const image = await api(stub, "model.save", {
      name: "生图模型",
      channelId: channel.data.id,
      model: "qwen-image-3.0",
    });
    expect(image.ok).toBe(true);
    expect(
      (
        await api(stub, "plugin.save", {
          pluginId: "wechatai/image-generation",
          name: "生图",
          shortcut: "画图",
          modelId: image.data.id,
        })
      ).ok,
    ).toBe(true);
    expect(chatSetupIssue(await stub.snapshot())?.code).toBe("wechat_model_required");
    expect((await api(stub, "wechat.bind", { id })).ok).toBe(true);
    expect((await stub.snapshot()).connection.status).toBe("waiting");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["chat-completions", "responses", "anthropic"])(
    "accepts a configured %s text model without calling or charging the LLM",
    async (protocol) => {
      const stub = account();
      const saved = await api(stub, "assistant.save", {
        name: "聊天",
        protocol,
        baseUrl: "https://llm.example.com",
        apiKey: "test-key",
        model: "chat-model",
      });
      expect(saved.ok).toBe(true);
      const before = await stub.snapshot();
      expect(chatSetupIssue(before)).toBeNull();
      vi.mocked(fetch).mockClear();
      expect((await api(stub, "wechat.bind")).ok).toBe(true);
      const after = await stub.snapshot();
      expect(after.connection.status).toBe("waiting");
      expect(after.connection.qrUrl).toBeTruthy();
      expect(after.wallet.balance).toBe(before.wallet.balance);
      expect(after.ledger).toEqual(before.ledger);
      expect(fetch).toHaveBeenCalledTimes(1);
      const [url, init] = vi.mocked(fetch).mock.calls[0];
      expect(new Request(url, init).url).toContain("get_bot_qrcode");
    },
  );

  it.each(["baseUrl", "hasKey"])(
    "permits binding while reporting a channel missing %s",
    async (field) => {
      const stub = account();
      await model(stub);
      await runInDurableObject(stub, (_, state) => {
        const row = state.storage.sql
          .exec<{ id: string; data: string }>("SELECT * FROM channels")
          .one();
        state.storage.sql.exec(
          "UPDATE channels SET data=? WHERE id=?",
          JSON.stringify({ ...JSON.parse(row.data), [field]: field === "hasKey" ? false : "" }),
          row.id,
        );
      });
      expect(chatSetupIssue(await stub.snapshot())?.code).toBe("wechat_channel_incomplete");
      expect((await api(stub, "wechat.bind")).ok).toBe(true);
      expect((await stub.snapshot()).connection.status).toBe("waiting");
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("preserves an existing connection and pending messages when the requested link is missing", async () => {
    const stub = account();
    const modelId = await model(stub);
    const id = await create(stub, "日常");
    expect((await api(stub, "wechat.bind", { id })).ok).toBe(true);
    await cycles(stub, 1);
    expect((await api(stub, "assistant.delete", { id: modelId })).ok).toBe(true);
    const previous = await stub.snapshot();
    await runInDurableObject(stub, async (_, state) => {
      await state.storage.deleteAlarm();
      state.storage.sql.exec(
        "INSERT INTO inbox(id,payload,createdAt,connectionId) VALUES ('pending-preflight','{}',1,?)",
        id,
      );
    });
    vi.mocked(fetch).mockClear();
    expect((await api(stub, "wechat.bind", { id: "missing-link" })).error).toBe(
      "connection_missing",
    );
    expect((await stub.snapshot()).connection).toEqual(previous.connection);
    expect(fetch).not.toHaveBeenCalled();
    await runInDurableObject(stub, (_, state) => {
      expect(
        state.storage.sql
          .exec<{ state: string }>("SELECT state FROM inbox WHERE id='pending-preflight'")
          .one().state,
      ).toBe("pending");
    });
  });

  it.each(["openclaw", "hermes", "muse", "notification"])(
    "binds with a configured %s plugin and no model channel",
    async (kind) => {
      const stub = account();
      await plus(stub);
      const id = await create(stub, "日常");
      const saved = await api(stub, "plugin.save", {
        pluginId: `wechatai/${kind}`,
        name: kind,
        shortcut: kind,
        connectionId: id,
      });
      expect(saved.ok).toBe(true);
      const before = await stub.snapshot();
      expect((await api(stub, "wechat.bind", { id })).ok).toBe(true);
      const after = await stub.snapshot();
      expect(after.channels).toEqual([]);
      expect(after.connection.status).toBe("waiting");
      expect(after.wallet.balance).toBe(before.wallet.balance);
      expect(after.ledger).toEqual(before.ledger);
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("connects a new free Muse account and returns a task result without a platform model", async () => {
    const net = network();
    const stub = account();
    expect((await api(stub, "wechat.bind")).ok).toBe(true);
    const link = (await stub.snapshot()).selectedConnectionId;
    await cycles(stub, 1);
    net.queues.set("token-1", [msg(1, "/wx help")]);
    await cycles(stub, 2);
    const saved = await api(stub, "plugin.save", {
      pluginId: "wechatai/muse",
      name: "Muse",
      shortcut: "muse",
    });
    expect(saved.ok).toBe(true);
    const id = saved.data.id;
    const pairing = await api(stub, "plugin.musePair", { id });
    const code = /"code":"([^"]+)"/.exec(pairing.data.command)![1];
    const auth = parseOpenClawPairing(env, `Bearer ${code}`, "muse")!;
    const pair = JSON.parse(
      await stub.openClawRequest(
        id,
        auth.secret,
        "pair",
        {
          proof: "b".repeat(43),
          agents: [{ id: "main", name: "Muse", isDefault: true }],
        },
        "muse",
      ),
    );
    expect(pair.ok).toBe(true);
    const secret = parseOpenClawToken(env, `Bearer ${pair.data.token}`, "muse")!.secret;
    const runnerId = crypto.randomUUID();
    const call = async (action: string, body = {}) =>
      JSON.parse(await stub.openClawRequest(id, secret, action, { runnerId, ...body }, "muse"));
    expect(await send(stub, link, "/use muse")).toContain("Muse");
    await send(stub, link, "请整理本周计划");
    const job = (await call("poll")).data.jobs[0];
    expect(job.text).toBe("请整理本周计划");
    expect((await call("claim", { id: job.id })).data.claimed).toBe(true);
    const balance = (await stub.snapshot()).wallet.balance;
    const result = await call("event", {
      eventId: crypto.randomUUID(),
      routeId: job.routeId,
      jobId: job.id,
      text: "计划已整理完成",
    });
    expect(result.ok).toBe(true);
    await cycles(stub, 2);
    expect(net.sends.some((s) => s.text.includes("计划已整理完成"))).toBe(true);
    const after = await stub.snapshot();
    expect(after.channels).toEqual([]);
    expect(after.wallet.balance).toBeCloseTo(balance - result.data.cost, 3);
    expect(net.modelInputs).toEqual([]);
  });

  it("keeps notification setup pending until the first WeChat message, without a model or credits charge", async () => {
    const net = network();
    let stub = account();
    const before = await stub.snapshot();
    expect((await api(stub, "wechat.bind")).ok).toBe(true);
    await cycles(stub, 1);
    const saved = await api(stub, "plugin.save", {
      pluginId: "wechatai/notification",
      name: "服务通知",
      connectionId: (await stub.snapshot()).selectedConnectionId,
    });
    expect(saved.ok).toBe(true);
    const token = (await api(stub, "notification.token", { id: saved.data.id })).data.token;
    const auth = parseNotificationToken(env, `Bearer ${token}`)!;
    const push = async (key = "build-1") =>
      JSON.parse(
        await stub.notificationRequest(
          saved.data.id,
          auth.credential,
          "send",
          { text: "构建成功" },
          key,
        ),
      );
    const pending = await stub.snapshot();
    expect(pending.connection.status).toBe("connected");
    expect(pending.connection.lastSeen).toBeGreaterThan(0);
    expect(pending.connection.hasReplyContext).toBe(false);
    expect(dashboardSetupProgress(pending)).toEqual({
      service: true,
      wechat: true,
      message: false,
    });
    expect(await push()).toMatchObject({
      ok: false,
      status: 409,
      error: "wechat_context_required",
    });

    net.queues.set("token-1", [msg(1, "/wx help")]);
    await cycles(stub, 2);
    const ready = await stub.snapshot();
    expect(ready.stats.messages).toBe(0);
    expect(ready.connection.hasReplyContext).toBe(true);
    expect(ready.connections[0].hasReplyContext).toBe(true);
    expect(ready.connection).not.toHaveProperty("contextToken");
    expect(ready.connection).not.toHaveProperty("encryptedCredentials");
    expect(dashboardSetupProgress(ready)).toEqual({ service: true, wechat: true, message: true });
    const accepted = await push();
    expect(accepted.ok).toBe(true);
    await stub.dispatchNotifications();
    expect(net.sends.some((s) => s.text.includes("构建成功"))).toBe(true);

    const oldInteraction = Date.now() - 2 * 86400000;
    await runInDurableObject(stub, (_, state) => {
      state.storage.sql.exec(
        "UPDATE settings SET value=json_set(value,'$.lastSeen',?) WHERE key='connection'",
        oldInteraction,
      );
    });
    await cycles(stub, 1);
    const stale = await stub.snapshot();
    expect(stale.connection.lastSeen).toBe(oldInteraction);
    expect(notificationWechatIssue(stale.connections[0])?.code).toBe("wechat_reply_window_expired");
    expect(dashboardSetupProgress(stale).message).toBe(true);
    net.control.failedSends = 1;
    expect((await push("build-2")).ok).toBe(true);
    await stub.dispatchNotifications();
    const deliveries = (await api(stub, "notification.status", { id: saved.data.id })).data
      .deliveries;
    expect(deliveries.find((d: { state: string }) => d.state === "pending")).toBeDefined();

    net.queues.set("token-1", [{ ...msg(1, "/wx help", 2), context_token: "context-refreshed" }]);
    await cycles(stub, 2);
    const refreshed = await stub.snapshot();
    expect(refreshed.connection.lastSeen).toBeGreaterThan(oldInteraction);
    expect(notificationWechatIssue(refreshed.connections[0])).toBeNull();
    await runInDurableObject(stub, (_, state) => {
      state.storage.sql.exec("UPDATE notification_jobs SET nextAt=0 WHERE state='pending'");
    });
    await stub.dispatchNotifications();
    expect(
      net.sends.some((s) => s.text.includes("构建成功") && s.context === "context-refreshed"),
    ).toBe(true);
    expect(
      (await api(stub, "notification.status", { id: saved.data.id })).data.deliveries.every(
        (d: { state: string }) => d.state === "sent",
      ),
    ).toBe(true);
    const after = await stub.snapshot();
    expect(after.channels).toEqual([]);
    expect(after.wallet.balance).toBe(before.wallet.balance);
    expect(after.ledger).toEqual(before.ledger);
    expect(net.modelInputs).toEqual([]);
    await runInDurableObject(env.REMINDERS.getByName(`${stub.id}:notifications`), (_, state) =>
      state.storage.deleteAlarm(),
    );
    await abortAllDurableObjects();
    const fresh = env.ACCOUNTS.get(stub.id);
    accounts[accounts.indexOf(stub)] = fresh;
    stub = fresh;
    expect((await stub.snapshot()).connection.hasReplyContext).toBe(true);
    expect((await api(stub, "wechat.bind")).ok).toBe(true);
    await cycles(stub, 1);
    const rebound = await stub.snapshot();
    expect(rebound.connection.status).toBe("connected");
    expect(rebound.connection.hasReplyContext).toBe(false);
    expect(dashboardSetupProgress(rebound).message).toBe(false);
  });

  it("does not combine a model from one channel with another channel's key", () => {
    const setup = {
      channels: [
        {
          id: "with-model",
          baseUrl: "https://llm.example.com",
          protocol: "responses" as const,
          hasKey: false,
        },
        {
          id: "with-key",
          baseUrl: "https://llm.example.com",
          protocol: "responses" as const,
          hasKey: true,
        },
      ],
      assistants: [{ channelId: "with-model", model: "chat-model" }],
    };
    expect(chatSetupIssue(setup)).not.toBeNull();
    setup.assistants.push({ channelId: "with-key", model: "chat-model" });
    expect(chatSetupIssue(setup)).toBeNull();
  });
});

describe("personal WeChat link limits and isolation", () => {
  it("receives, processes and delivers a message within one alarm, without repeating work", async () => {
    const net = network();
    const stub = account();
    await model(stub);
    const id = await create(stub, "日常");
    await api(stub, "wechat.bind", { id });
    await cycles(stub, 1);
    await skipWelcome(stub, id);
    net.queues.set("token-1", [msg(1, "你好")]);
    await cycles(stub, 1);
    expect(net.modelInputs).toHaveLength(1);
    expect(net.sends.map((s) => s.text)).toEqual(["回答：你好"]);
    net.queues.set("token-1", [msg(1, "你好")]);
    await cycles(stub, 1);
    expect(net.modelInputs).toHaveLength(1);
    expect(net.sends).toHaveLength(1);
  });

  it("sends a ready answer while another connection is still long polling", async () => {
    const net = network();
    const stub = account();
    await plus(stub);
    await model(stub);
    for (const name of ["日常", "工作"]) {
      const id = await create(stub, name);
      await api(stub, "wechat.bind", { id });
    }
    await cycles(stub, 1);
    for (const link of (await stub.snapshot()).connections) await skipWelcome(stub, link.id);
    const original = vi.mocked(fetch).getMockImplementation()!;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let polling = false;
    let deliveredWhilePolling = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const request = new Request(url, init);
      if (
        request.url.endsWith("getupdates") &&
        request.headers.get("Authorization") === "Bearer token-2"
      ) {
        polling = true;
        timeout = setTimeout(release, 1000);
        await held;
        polling = false;
      }
      const response = await original(url, init);
      if (request.url.endsWith("sendmessage") && net.sends.some((s) => s.text === "回答：你好")) {
        deliveredWhilePolling = polling;
        if (timeout) clearTimeout(timeout);
        release();
      }
      return response;
    });
    net.queues.set("token-1", [msg(1, "你好")]);
    try {
      await cycles(stub, 1);
      expect(deliveredWhilePolling).toBe(true);
      expect(net.sends.map((s) => s.text)).toEqual(["回答：你好"]);
    } finally {
      if (timeout) clearTimeout(timeout);
      release();
    }
  });

  it("retries delivery without rerunning or charging the model, before the next queued message", async () => {
    const net = network();
    const stub = account();
    await model(stub);
    const id = await create(stub, "日常");
    await api(stub, "wechat.bind", { id });
    await cycles(stub, 1);
    await skipWelcome(stub, id);
    net.queues.set("token-1", [msg(1, "第一条", 1), msg(1, "第二条", 2)]);
    net.control.failedSends = 1;
    await cycles(stub, 1);
    const balance = (await stub.snapshot()).wallet.balance;
    expect(net.modelInputs).toHaveLength(1);
    expect(net.sends.map((s) => s.text)).toEqual(["回答：第一条"]);
    await cycles(stub, 1);
    expect(net.sends[1].clientId).toBe(net.sends[0].clientId);
    expect(net.modelInputs).toHaveLength(1);
    expect((await stub.snapshot()).wallet.balance).toBe(balance);
    await cycles(stub, 1);
    expect(net.modelInputs).toHaveLength(2);
    expect(net.sends.map((s) => s.text)).toEqual(["回答：第一条", "回答：第一条", "回答：第二条"]);
  });

  it("atomically permits one Free link, rebinds in place, and releases a deleted slot", async () => {
    const stub = account();
    await model(stub);
    const results = await Promise.all(
      [1, 2, 3].map((i) => api(stub, "wechat.create", { name: `链接${i}` })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => r.error === "connection_limit")).toHaveLength(2);
    expect((await stub.snapshot()).limits.connections).toBe(1);
    const id = (await stub.snapshot()).selectedConnectionId;
    expect((await api(stub, "wechat.bind", { id })).ok).toBe(true);
    expect((await api(stub, "wechat.bind", { id })).ok).toBe(true);
    expect((await stub.snapshot()).connections).toHaveLength(1);
    expect((await api(stub, "wechat.disconnect", { id })).ok).toBe(true);
    expect((await api(stub, "wechat.create", { name: "不能绕过" })).error).toBe("connection_limit");
    expect((await api(stub, "wechat.delete", { id })).ok).toBe(true);
    // The legacy bind endpoint may start a new link, never reuse deleted history.
    expect((await api(stub, "wechat.bind")).ok).toBe(true);
    expect((await stub.snapshot()).selectedConnectionId).not.toBe(id);
    expect((await stub.snapshot()).connections).toHaveLength(1);
  });

  it("permits ten Plus links and rejects an eleventh even under concurrent creation", async () => {
    const stub = account();
    await plus(stub);
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => api(stub, "wechat.create", { name: `链接${i}` })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(10);
    expect(results.filter((r) => r.error === "connection_limit")).toHaveLength(2);
    const snapshot = await stub.snapshot();
    expect(snapshot.limits.connections).toBe(10);
    expect(snapshot.connections).toHaveLength(10);
    const other = account();
    for (const action of [
      "wechat.select",
      "wechat.bind",
      "wechat.disconnect",
      "wechat.rename",
      "wechat.delete",
    ])
      expect(
        (await api(other, action, { id: snapshot.connections[1].id, name: "不能越权" })).error,
      ).toBe("connection_missing");
    await api(stub, "wechat.delete", { id: snapshot.connections[1].id });
    await create(stub, "替代链接");
    expect((await stub.snapshot()).connections).toHaveLength(10);
  });

  it("preserves legacy credentials, pending inbox and current sessions across migration and restart", async () => {
    let stub = account();
    await model(stub);
    const current = (await stub.snapshot()).currentSession!.id;
    await runInDurableObject(stub, async (_, state) => {
      const credentials = await encrypt(
        env,
        JSON.stringify({
          token: "legacy-token",
          userId: "legacy-owner",
          botId: "legacy-bot",
          baseUrl: "https://ilinkai.weixin.qq.com",
        }),
        `${state.id}:wechat`,
      );
      state.storage.sql.exec(
        "INSERT INTO settings VALUES ('connection', ?)",
        JSON.stringify({
          status: "connected",
          generation: "legacy",
          encryptedCredentials: credentials,
          cursor: "legacy-cursor",
        }),
      );
      state.storage.sql.exec(
        "INSERT INTO inbox(id,payload,createdAt) VALUES ('old-message', '{}', 1)",
      );
    });
    await abortAllDurableObjects();
    const fresh = env.ACCOUNTS.get(stub.id);
    accounts[accounts.indexOf(stub)] = fresh;
    stub = fresh;
    const snapshot = await stub.snapshot();
    expect(snapshot.connections).toHaveLength(1);
    expect(snapshot.connections[0]).toMatchObject({ id: "default", currentSessionId: current });
    expect(snapshot.currentSession?.id).toBe(current);
    expect(JSON.stringify(snapshot)).not.toMatch(/legacy-token|encryptedCredentials|legacy-cursor/);
    await runInDurableObject(stub, (_, state) => {
      expect(
        state.storage.sql
          .exec<{ connectionId: string; state: string }>(
            "SELECT connectionId,state FROM inbox WHERE id = 'old-message'",
          )
          .one(),
      ).toMatchObject({ connectionId: "default", state: "pending" });
    });
  });

  it("routes two links to their own owner and history, and disconnecting one leaves the other running", async () => {
    const net = network();
    const stub = account();
    await plus(stub);
    await model(stub);
    const a = await create(stub, "日常");
    await api(stub, "wechat.bind", { id: a });
    const b = await create(stub, "工作");
    await api(stub, "wechat.bind", { id: b });
    await cycles(stub, 1);
    expect((await stub.snapshot()).connections.every((l) => l.status === "connected")).toBe(true);
    net.queues.set("token-1", [msg(1, "苹果问题"), msg(2, "错误发送者", 50)]);
    net.queues.set("token-2", [msg(2, "香蕉问题")]);
    await cycles(stub, 6);
    expect(net.modelInputs).toHaveLength(2);
    expect(net.modelInputs.some((s) => s.includes("苹果问题") && !s.includes("香蕉问题"))).toBe(
      true,
    );
    expect(net.modelInputs.some((s) => s.includes("香蕉问题") && !s.includes("苹果问题"))).toBe(
      true,
    );
    expect(net.modelInputs.every((s) => !s.includes("错误发送者"))).toBe(true);
    const snapshot = await stub.snapshot();
    expect(new Set(snapshot.connections.map((l) => l.currentSessionId)).size).toBe(2);
    expect(snapshot.wallet.spentToday).toBeCloseTo(0.032);
    for (const send of net.sends) {
      const owner = send.token.replace("token-", "");
      expect(send.to).toBe(`owner-${owner}`);
      expect(send.context).toBe(`context-${owner}`);
    }
    expect(net.sends.filter((s) => s.text.includes("你好，欢迎使用微伴"))).toHaveLength(2);
    // Same numeric message ID on another link must not be deduplicated away.
    expect(net.sends.filter((s) => s.text.startsWith("回答："))).toHaveLength(2);
    net.queues.set("token-1", [msg(1, "/new", 2)]);
    await cycles(stub, 3);
    const changed = await stub.snapshot();
    expect(changed.connections.find((l) => l.id === a)?.currentSessionId).not.toBe(
      snapshot.connections.find((l) => l.id === a)?.currentSessionId,
    );
    expect(changed.connections.find((l) => l.id === b)?.currentSessionId).toBe(
      snapshot.connections.find((l) => l.id === b)?.currentSessionId,
    );
    await api(stub, "wechat.disconnect", { id: a });
    net.polls.length = 0;
    net.queues.set("token-2", [msg(2, "香蕉的追问", 3)]);
    await cycles(stub, 3);
    expect(net.polls).not.toContain("token-1");
    expect(net.sends.at(-1)?.text).toBe("回答：香蕉的追问");
    expect(net.modelInputs.at(-1)).toContain("香蕉问题");
    expect(net.modelInputs.at(-1)).not.toContain("苹果问题");
  });

  it("keeps paused bindings receiving on expiry and resumes execution on renewal", async () => {
    const net = network();
    const stub = account();
    await plus(stub);
    await model(stub);
    const a = await create(stub, "保留链接");
    await api(stub, "wechat.bind", { id: a });
    const b = await create(stub, "暂停链接");
    await api(stub, "wechat.bind", { id: b });
    await cycles(stub, 1);
    await runInDurableObject(stub, (_, state) =>
      state.storage.sql.exec("UPDATE settings SET value = '0' WHERE key = 'planUntil'"),
    );
    expect((await stub.snapshot()).connections.map((l) => l.paused)).toEqual([false, true]);
    expect((await api(stub, "wechat.bind", { id: b })).error).toBe("connection_paused");
    net.polls.length = 0;
    await cycles(stub, 1);
    expect(net.polls).toEqual(["token-1", "token-2"]);
    await api(stub, "wechat.disconnect", { id: a });
    await runInDurableObject(stub, async (_, state) =>
      expect(await state.storage.getAlarm()).not.toBeNull(),
    );
    await plus(stub);
    await runInDurableObject(stub, async (_, state) =>
      expect(await state.storage.getAlarm()).not.toBeNull(),
    );
    expect((await stub.snapshot()).connections[1]).toMatchObject({
      status: "connected",
      paused: false,
    });
    net.polls.length = 0;
    await cycles(stub, 1);
    expect(net.polls).toEqual(["token-2"]);
  });

  it("replies to a paused link with an expiry notice, retries safely and restores chat after renewal", async () => {
    const net = network();
    const stub = account();
    await plus(stub);
    await model(stub);
    const first = await create(stub, "保留链接");
    const paused = await create(stub, "到期链接");
    for (const id of [first, paused]) await api(stub, "wechat.bind", { id });
    await cycles(stub, 1);
    for (const id of [first, paused]) await skipWelcome(stub, id);
    await runInDurableObject(stub, (_, state) =>
      state.storage.sql.exec(
        "UPDATE settings SET value=? WHERE key='planUntil'",
        JSON.stringify(Date.now() - 1000),
      ),
    );
    const balance = (await stub.snapshot()).wallet.balance;
    net.control.failedSends = 1;
    const message = msg(2, "你好，帮我整理今天的工作");
    net.queues.set("token-2", [message, { ...message, from_user_id: "stranger", message_id: 2 }]);
    await cycles(stub, 1);
    expect(net.sends).toHaveLength(1);
    expect(net.sends[0]).toMatchObject({ token: "token-2", to: "owner-2", context: "context-2" });
    expect(net.sends[0].text).toContain("你的 Plus 会员到期了");
    expect(net.sends[0].text).toContain("聊天记录和绑定都还在");
    expect(net.sends[0].text).toContain("https://wechatai.app/app/billing");
    expect(net.sends[0].text).toContain("本次未扣除 credits");
    expect(net.sends[0].text).not.toContain("无法连接");
    await cycles(stub, 1);
    expect(net.sends[1]).toEqual(net.sends[0]);
    net.queues.set("token-2", [message]);
    await cycles(stub, 1);
    expect(net.sends).toHaveLength(2);
    expect(net.modelInputs).toHaveLength(0);
    expect((await stub.snapshot()).wallet.balance).toBe(balance);
    await runInDurableObject(stub, (_, state) => {
      expect(state.storage.sql.exec("SELECT id FROM claw_jobs").toArray()).toHaveLength(0);
      expect(state.storage.sql.exec("SELECT id FROM usage").toArray()).toHaveLength(0);
      expect(state.storage.sql.exec("SELECT id FROM messages").toArray()).toHaveLength(0);
      expect(
        state.storage.sql.exec("SELECT id FROM inbox WHERE state='done'").toArray(),
      ).toHaveLength(1);
    });
    net.queues.set("token-1", [msg(1, "Free 链接仍可聊天")]);
    await cycles(stub, 1);
    expect(net.sends.at(-1)?.text).toBe("回答：Free 链接仍可聊天");
    await plus(stub);
    net.queues.set("token-2", [msg(2, "续费后继续聊天", 3)]);
    await cycles(stub, 1);
    expect(net.sends.at(-1)?.text).toBe("回答：续费后继续聊天");
    expect(net.modelInputs).toHaveLength(2);
  });

  it("rejects duplicate bot confirmations even if two scans complete concurrently", async () => {
    const net = network();
    net.control.duplicateBot = true;
    const stub = account();
    await plus(stub);
    await model(stub);
    const a = await create(stub, "一");
    const b = await create(stub, "二");
    await api(stub, "wechat.bind", { id: a });
    await api(stub, "wechat.bind", { id: b });
    await cycles(stub, 1);
    const links = (await stub.snapshot()).connections;
    expect(links.filter((l) => l.status === "connected")).toHaveLength(1);
    expect(links.filter((l) => l.error?.includes("已绑定"))).toHaveLength(1);
  });

  it("keeps command lists and destructive confirmations scoped to their connection", async () => {
    const stub = account();
    await plus(stub);
    const modelId = await model(stub);
    const a = await create(stub, "一");
    await api(stub, "assistant.activate", { id: modelId });
    const b = await create(stub, "二");
    await api(stub, "assistant.activate", { id: modelId });
    const sessions = (await api(stub, "session.list")).data as {
      id: string;
      connectionId: string;
    }[];
    expect(sessions).toHaveLength(2);
    await runInDurableObject(stub, async (instance, state) => {
      const processor = instance as unknown as {
        processWechat(id: string, message: WxMessage, connectionId: string): Promise<string>;
      };
      const call = (link: string, text: string) =>
        processor.processWechat(crypto.randomUUID(), msg(1, text), link);
      await call(a, "/sessions");
      await call(b, "/sessions");
      const value = (id: string, key: string) =>
        JSON.parse(
          state.storage.sql
            .exec<{ value: string }>(
              "SELECT value FROM settings WHERE key = ?",
              wechatLinkKey(id, key),
            )
            .one().value,
        );
      expect(value(a, "sessionList")).toEqual([sessions.find((s) => s.connectionId === a)!.id]);
      expect(value(b, "sessionList")).toEqual([sessions.find((s) => s.connectionId === b)!.id]);
      await call(a, "/delete");
      const token = value(a, "clearConfirmation").token;
      await call(b, `/delete ${token}`);
      expect(JSON.parse(await instance.api("session.list")).data).toHaveLength(2);
      await call(a, "/delete 1");
      const numbered = value(a, "clearConfirmation");
      await call(b, `/delete 1 ${numbered.token}`);
      expect(JSON.parse(await instance.api("session.list")).data).toHaveLength(2);
      state.storage.sql.exec(
        "UPDATE settings SET value = ? WHERE key = ?",
        JSON.stringify([numbered.id]),
        wechatLinkKey(b, "sessionList"),
      );
      expect(await call(b, "/delete 1")).toContain("会话编号无效");
      expect(JSON.parse(await instance.api("session.list")).data).toHaveLength(2);
    });
  });
});
