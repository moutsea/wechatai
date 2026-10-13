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
import { wechatSetupIssue } from "../src/shared/wechat-readiness";

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

describe("WeChat QR configuration preflight", () => {
  it.each([false, true])(
    "rejects an empty account before creating a link or requesting a QR (Plus=%s)",
    async (isPlus) => {
      const stub = account();
      if (isPlus) await plus(stub);
      vi.mocked(fetch).mockClear();
      const result = await api(stub, "wechat.bind");
      expect(result).toMatchObject({ ok: false, status: 422, error: "wechat_channel_required" });
      expect(result.message).toContain("渠道与模型");
      expect(wechatSetupIssue(await stub.snapshot())?.code).toBe(result.error);
      expect((await stub.snapshot()).connections).toHaveLength(0);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("requires a text model, even when an image plugin is configured", async () => {
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
    expect((await api(stub, "wechat.bind", { id })).error).toBe("wechat_model_required");
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
    expect(wechatSetupIssue(await stub.snapshot())?.code).toBe("wechat_model_required");
    expect((await api(stub, "wechat.bind", { id })).error).toBe("wechat_model_required");
    expect((await stub.snapshot()).connection.status).toBe("disconnected");
    expect(fetch).not.toHaveBeenCalled();
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
      expect(wechatSetupIssue(before)).toBeNull();
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

  it.each(["baseUrl", "encryptedKey"])("rejects a legacy channel missing %s", async (field) => {
    const stub = account();
    await model(stub);
    await runInDurableObject(stub, (_, state) => {
      const row = state.storage.sql
        .exec<{ id: string; data: string }>("SELECT * FROM channels")
        .one();
      state.storage.sql.exec(
        "UPDATE channels SET data=? WHERE id=?",
        JSON.stringify({ ...JSON.parse(row.data), [field]: "" }),
        row.id,
      );
    });
    expect((await api(stub, "wechat.bind")).error).toBe("wechat_channel_incomplete");
    expect((await stub.snapshot()).connections).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves an existing connection and pending messages when rebind validation fails", async () => {
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
    expect((await api(stub, "wechat.bind", { id })).error).toBe("wechat_model_required");
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

  it.each(["openclaw", "hermes", "notification"])(
    "does not exempt a configured %s plugin from the channel requirement",
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
      const tokenAction =
        kind === "notification"
          ? "notification.token"
          : `plugin.${kind === "openclaw" ? "claw" : "hermes"}Token`;
      expect((await api(stub, tokenAction, { id: saved.data.id })).ok).toBe(true);
      expect((await stub.snapshot()).plugins?.[0].hasKey).toBe(true);
      expect((await api(stub, "wechat.bind", { id })).error).toBe("wechat_channel_required");
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("does not combine a model from one channel with another channel's key", () => {
    const setup = {
      channels: [
        { id: "with-model", baseUrl: "https://llm.example.com", hasKey: false },
        { id: "with-key", baseUrl: "https://llm.example.com", hasKey: true },
      ],
      assistants: [{ channelId: "with-model", model: "chat-model" }],
    };
    expect(wechatSetupIssue(setup)).not.toBeNull();
    setup.assistants.push({ channelId: "with-key", model: "chat-model" });
    expect(wechatSetupIssue(setup)).toBeNull();
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

  it("pauses excess links on expiry without losing data and wakes them on renewal", async () => {
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
    });
  });
});
