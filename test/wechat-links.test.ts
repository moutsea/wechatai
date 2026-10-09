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
  const sends: { token: string; to: string; text: string; context: string }[] = [];
  const modelInputs: string[] = [];
  const control = { duplicateBot: false };
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
        });
        return Response.json({ ret: 0 });
      }
      if (target.hostname === "cloudflare-dns.com")
        return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
      if (target.hostname === "llm.example.com") {
        const body = (await request.json()) as { messages: { content: string }[] };
        modelInputs.push(JSON.stringify(body.messages));
        return Response.json({
          choices: [{ message: { content: `回答：${body.messages.at(-1)?.content}` } }],
          usage: { prompt_tokens: 100, completion_tokens: 10 },
        });
      }
      throw new Error("Unexpected test endpoint");
    }),
  );
  return { queues, polls, sends, modelInputs, control };
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
beforeEach(() => network());
afterEach(async () => {
  for (const stub of accounts.splice(0))
    await runInDurableObject(stub, async (_, state) => {
      await state.storage.deleteAlarm();
    });
  vi.unstubAllGlobals();
});

describe("personal WeChat link limits and isolation", () => {
  it("atomically permits one Free link, rebinds in place, and releases a deleted slot", async () => {
    const stub = account();
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

  it("pauses excess links on expiry without losing data and wakes them on renewal", async () => {
    const net = network();
    const stub = account();
    await plus(stub);
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
    expect(net.polls).toEqual(["token-1"]);
    await api(stub, "wechat.disconnect", { id: a });
    await runInDurableObject(stub, async (_, state) =>
      expect(await state.storage.getAlarm()).toBeNull(),
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

  it("rejects duplicate bot confirmations even if two scans complete concurrently", async () => {
    const net = network();
    net.control.duplicateBot = true;
    const stub = account();
    await plus(stub);
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
    });
  });
});
