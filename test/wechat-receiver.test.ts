import { env, runInDurableObject, createExecutionContext } from "cloudflare:test";
import worker from "../src/server/index";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import migration from "../migrations/0011_wechat_receivers.sql?raw";
import { RECEIVER_PING, RECEIVER_PONG, receiverAuthorized } from "../src/server/wechat-receiver";
import { connectForManualDelivery, useManualAlarms } from "./helpers/wechat-delivery";

const accounts: ReturnType<typeof env.ACCOUNTS.getByName>[] = [];
const sockets: WebSocket[] = [];
const serviceSecret = "test-receiver-secret-with-at-least-32-characters";
beforeAll(async () => {
  for (const statement of migration
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean))
    await env.DB.prepare(statement).run();
});
afterEach(async () => {
  for (const ws of sockets.splice(0)) ws.close();
  for (const stub of accounts.splice(0))
    await runInDurableObject(stub, async (_, state) => {
      for (const ws of state.getWebSockets()) ws.close();
      await state.storage.deleteAlarm();
    });
  vi.restoreAllMocks();
});
async function setup() {
  const stub = env.ACCOUNTS.getByName(crypto.randomUUID());
  accounts.push(stub);
  await connectForManualDelivery(stub);
  await runInDurableObject(stub, (instance) => {
    Object.assign(Reflect.get(instance, "env"), {
      WECHAT_RECEIVER_SECRET: serviceSecret,
      WECHAT_RECEIVER_ACCOUNTS: "all",
    });
  });
  return stub;
}
async function connect(stub: ReturnType<typeof env.ACCOUNTS.getByName>) {
  const response = await stub.fetch("https://internal/wechat-receiver", {
    headers: { Upgrade: "websocket" },
  });
  expect(response.status).toBe(101);
  const socket = response.webSocket!;
  sockets.push(socket);
  const messages: Record<string, unknown>[] = [];
  socket.addEventListener("message", (event) => {
    messages.push(event.data === RECEIVER_PONG ? { type: "pong" } : JSON.parse(String(event.data)));
  });
  socket.accept();
  const next = async (type: string) => {
    await vi.waitFor(() => expect(messages.some((m) => m.type === type)).toBe(true));
    return messages.splice(
      messages.findIndex((m) => m.type === type),
      1,
    )[0];
  };
  const config = await next("config");
  return { socket, next, config };
}
const batch = (overrides = {}) => ({
  type: "batch",
  id: crypto.randomUUID(),
  connectionId: "default",
  generation: "g1",
  fromCursor: "",
  cursor: "cursor-1",
  msgs: [
    {
      message_id: 1,
      message_type: 1,
      from_user_id: "owner",
      context_token: "context-1",
      item_list: [{ type: 1, text_item: { text: "/wx status" } }],
    },
  ],
  ...overrides,
});
async function inspect(stub: ReturnType<typeof env.ACCOUNTS.getByName>) {
  return runInDurableObject(stub, (_, state) => ({
    connection: JSON.parse(
      state.storage.sql
        .exec<{ value: string }>("SELECT value FROM settings WHERE key='connection'")
        .one().value,
    ),
    inbox: state.storage.sql.exec("SELECT id,state FROM inbox").toArray(),
  }));
}
describe("external WeChat receiver", () => {
  it("pushes typing state only for accepted text, restores it on reconnect, and clears it after processing", async () => {
    const stub = await setup();
    const { socket, next } = await connect(stub);
    const typingContext = "context-ticket".repeat(400);
    const request = batch({
      msgs: [
        {
          message_id: 9,
          message_type: 1,
          from_user_id: "owner",
          context_token: typingContext,
          item_list: [{ type: 1, text_item: { text: "今天上海天气如何" } }],
        },
      ],
    });
    socket.send(JSON.stringify(request));
    await next("ack");
    const active = await next("config");
    expect(active.links).toMatchObject([
      { typingContextToken: typingContext, typingUntil: expect.any(Number) },
    ]);
    const lease = (active.links as { typingUntil: number }[])[0].typingUntil;
    expect(lease).toBeGreaterThan(Date.now());
    const restored = await connect(stub);
    expect(restored.config.links).toMatchObject([{ typingUntil: lease }]);
    await runInDurableObject(stub, async (instance, state) => {
      state.storage.sql.exec("UPDATE inbox SET state='done',payload='{}'");
      await Reflect.get(instance, "receiver").sync();
    });
    expect((await restored.next("config")).links).toMatchObject([
      { typingUntil: 0, typingContextToken: "" },
    ]);
  });
  it("does not show typing for attachment staging, platform commands, or unsolicited replies", async () => {
    const stub = await setup();
    await runInDurableObject(stub, async (instance, state) => {
      const items = [
        { type: 2, image_item: {} },
        { type: 1, text_item: { text: "/wx status" } },
      ];
      for (let i = 0; i < items.length; i++)
        state.storage.sql.exec(
          "INSERT INTO inbox(id,payload,createdAt,connectionId) VALUES(?,?,?,'default')",
          String(i),
          JSON.stringify({ item_list: [items[i]] }),
          Date.now(),
        );
      state.storage.sql.exec(
        "INSERT INTO inbox(id,payload,createdAt,connectionId,state,reply) VALUES('notice','{}',?,'default','reply','通知')",
        Date.now(),
      );
      expect(
        Reflect.get(instance, "wechatTyping").call(instance, "default", "g1", "context"),
      ).toEqual({ typingUntil: 0 });
    });
  });
  it.each(["openclaw", "hermes"])(
    "tracks claimed %s tasks and stops at failure without connector changes",
    async (kind) => {
      const stub = await setup();
      const plugin = JSON.parse(
        await stub.api("plugin.save", {
          pluginId: "wechatai/" + kind,
          name: "Agent",
          shortcut: "agent",
          agentId: "main",
        }),
      );
      expect(plugin.ok).toBe(true);
      const token = JSON.parse(
        await stub.api(kind === "hermes" ? "plugin.hermesToken" : "plugin.clawToken", {
          id: plugin.data.id,
        }),
      ).data.token;
      const [, pluginId, secret] = token.split(".");
      const runnerId = crypto.randomUUID();
      const call = async (action: string, payload: Record<string, unknown> = {}) =>
        JSON.parse(
          await stub.openClawRequest(
            pluginId,
            secret,
            action,
            { runnerId, ...payload },
            kind as "openclaw" | "hermes",
          ),
        );
      const { next } = await connect(stub);
      await runInDurableObject(stub, async (instance) => {
        const process = Reflect.get(instance, "processWechat").bind(instance);
        await process(
          "enter",
          { item_list: [{ type: 1, text_item: { text: "/use agent" } }] },
          "default",
        );
        await process(
          "job",
          { item_list: [{ type: 1, text_item: { text: "帮我检查一下" } }] },
          "default",
        );
        expect(
          Reflect.get(instance, "wechatTyping").call(instance, "default", "g1", "context"),
        ).toEqual({ typingUntil: 0 });
      });
      const jobs = await call("poll");
      const job = jobs.data.jobs[0];
      expect((await call("claim", { id: "job" })).ok).toBe(true);
      expect((await next("config")).links).toMatchObject([
        { typingUntil: expect.any(Number), typingContextToken: "context" },
      ]);
      expect(
        (
          await call("event", {
            eventId: crypto.randomUUID(),
            jobId: "job",
            routeId: job.routeId,
            status: "failed",
            text: "",
          })
        ).ok,
      ).toBe(true);
      expect((await next("config")).links).toMatchObject([{ typingUntil: 0 }]);
    },
  );
  it("requires a dedicated secret, independently of a user login", () => {
    const configured = { ...env, WECHAT_RECEIVER_SECRET: serviceSecret };
    expect(receiverAuthorized(configured, `Bearer ${serviceSecret}`)).toBe(true);
    expect(receiverAuthorized(configured, "Bearer another-secret")).toBe(false);
    const disabled = { ...env, WECHAT_RECEIVER_SECRET: "" };
    expect(receiverAuthorized(disabled, "Bearer ")).toBe(false);
  });
  it("protects discovery and preserves WebSocket upgrades through the real Worker middleware", async () => {
    const stub = await setup();
    await runInDurableObject(stub, async (instance) => {
      await Reflect.get(instance, "receiver").sync();
    });
    const bindings = {
      ...env,
      WECHAT_RECEIVER_SECRET: serviceSecret,
      WECHAT_RECEIVER_ACCOUNTS: "all",
    };
    const base = "https://example.com/api/internal/wechat-receiver";
    const unauthorized = await worker.fetch(
      new Request(`${base}/accounts`),
      bindings,
      createExecutionContext(),
    );
    expect(unauthorized.status).toBe(401);
    const discovery = await worker.fetch(
      new Request(`${base}/accounts`, { headers: { Authorization: `Bearer ${serviceSecret}` } }),
      bindings,
      createExecutionContext(),
    );
    expect(await discovery.json()).toMatchObject({
      accounts: expect.arrayContaining([stub.id.toString()]),
    });
    const response = await worker.fetch(
      new Request(`${base}/connect/${stub.id}`, {
        headers: { Authorization: `Bearer ${serviceSecret}`, Upgrade: "websocket" },
      }),
      bindings,
      createExecutionContext(),
    );
    expect(response.status).toBe(101);
    expect(response.webSocket).not.toBeNull();
    sockets.push(response.webSocket!);
    response.webSocket!.accept();
  });
  it("discovers active accounts, auto-responds to heartbeats and stops idle DO polling", async () => {
    const stub = await setup();
    const { socket, next, config } = await connect(stub);
    expect(config.links).toMatchObject([
      { id: "default", generation: "g1", credentials: { token: "test", userId: "owner" } },
    ]);
    expect(
      await env.DB.prepare("SELECT active FROM wechat_receivers WHERE account_id=?")
        .bind(stub.id.toString())
        .first("active"),
    ).toBe(1);
    socket.send(RECEIVER_PING);
    await next("pong");
    await runInDurableObject(stub, async (instance, state) => {
      const network = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("idle account must not fetch"));
      await instance.alarm();
      expect(network).not.toHaveBeenCalled();
      const alarm = vi.mocked(state.storage.setAlarm).mock.calls.at(-1)![0];
      expect(Number(alarm)).toBeGreaterThan(Date.now() + 55000);
    });
  });
  it("commits batches before ack, isolates senders and safely replays a lost acknowledgement", async () => {
    const stub = await setup();
    const { socket, next } = await connect(stub);
    const first = batch();
    first.msgs.push({ ...first.msgs[0], message_id: 2, from_user_id: "someone-else" });
    socket.send(JSON.stringify(first));
    expect(await next("ack")).toMatchObject({ id: first.id, cursor: "cursor-1" });
    expect((await inspect(stub)).inbox).toHaveLength(1);
    const second = batch({
      fromCursor: "cursor-1",
      cursor: "cursor-2",
      msgs: [{ ...first.msgs[0], message_id: 3, context_token: "context-2" }],
    });
    socket.send(JSON.stringify(second));
    await next("ack");
    socket.send(JSON.stringify(first));
    expect(await next("ack")).toMatchObject({ id: first.id, cursor: "cursor-2" });
    const state = await inspect(stub);
    expect(state.inbox).toHaveLength(2);
    expect(state.connection).toMatchObject({ cursor: "cursor-2", contextToken: "context-2" });
  });
  it("rejects previous link generations and disconnects the receive configuration", async () => {
    const stub = await setup();
    const { socket, next } = await connect(stub);
    socket.send(JSON.stringify(batch({ generation: "old" })));
    expect(await next("ack")).toMatchObject({ stale: true });
    expect((await inspect(stub)).inbox).toHaveLength(0);
    expect(JSON.parse(await stub.api("wechat.disconnect", { connectionId: "default" })).ok).toBe(
      true,
    );
    expect((await next("config")).links).toEqual([]);
    expect(
      await env.DB.prepare("SELECT active FROM wechat_receivers WHERE account_id=?")
        .bind(stub.id.toString())
        .first("active"),
    ).toBe(0);
  });
  it("accepts WeChat's large numeric message IDs and deduplicates their replay", async () => {
    const stub = await setup();
    const { socket, next } = await connect(stub);
    const message = batch();
    message.msgs[0].message_id = Number("1234567890123456789");
    for (let attempt = 0; attempt < 2; attempt++) {
      socket.send(JSON.stringify(message));
      expect(await next("ack")).toMatchObject({ id: message.id, cursor: "cursor-1" });
    }
    expect((await inspect(stub)).inbox).toHaveLength(1);
  });
  it("falls back to local receiving after the server disconnects", async () => {
    const stub = await setup();
    const { socket } = await connect(stub);
    socket.close();
    await vi.waitFor(async () => {
      const open = await runInDurableObject(
        stub,
        (_, state) => state.getWebSockets().filter((s) => s.readyState === WebSocket.OPEN).length,
      );
      expect(open).toBe(0);
    });
    await runInDurableObject(stub, async (instance, state) => {
      await useManualAlarms(state);
      const network = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(Response.json({ ret: 0, get_updates_buf: "fallback" }));
      await instance.alarm();
      expect(network).toHaveBeenCalledOnce();
    });
    expect((await inspect(stub)).connection.cursor).toBe("fallback");
  });
  it("fences a stale receiver heartbeat and resumes local polling", async () => {
    const stub = await setup();
    await connect(stub);
    await runInDurableObject(stub, async (instance, state) => {
      const socket = state.getWebSockets("wechat-receiver")[0];
      socket.serializeAttachment({
        ...socket.deserializeAttachment(),
        connectedAt: Date.now() - 61000,
      });
      const network = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ret: 0 }));
      await instance.alarm();
      expect(network).toHaveBeenCalledOnce();
    });
  });
});
