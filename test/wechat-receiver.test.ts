import accountRoutes from "../migrations/0019_account_backend_routes.sql?raw";
import { env, runInDurableObject, createExecutionContext } from "cloudflare:test";
import worker from "../src/server/index";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import watchdogMigration from "../migrations/0018_receiver_watchdog.sql?raw";
import {
  fallbackWatchdogs,
  recoverReceiverSession,
  watchdogHeader,
} from "../src/server/receiver-watchdog";
import migration from "../migrations/0011_wechat_receivers.sql?raw";
import { RECEIVER_PING, RECEIVER_PONG, receiverAuthorized } from "../src/server/wechat-receiver";
import { connectForManualDelivery, useManualAlarms } from "./helpers/wechat-delivery";
import { encrypt } from "../src/server/security";
import { orderedWechatMessages, wxRequest, type WxMessage } from "../src/server/wechat";
import { wechatLinkKey } from "../src/shared/wechat-links";

const accounts: ReturnType<typeof env.ACCOUNTS.getByName>[] = [];
const sockets: WebSocket[] = [];
const serviceSecret = "test-receiver-secret-with-at-least-32-characters";
beforeAll(async () => {
  await env.DB.exec(accountRoutes.replace(/^--.*$/gm, "").replace(/\n/g, " "));
  for (const statement of (migration + "\n" + watchdogMigration)
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
async function setup(supervised = false) {
  const stub = env.ACCOUNTS.getByName(crypto.randomUUID());
  accounts.push(stub);
  await connectForManualDelivery(stub);
  await runInDurableObject(stub, (instance) => {
    Object.assign(Reflect.get(instance, "env"), {
      WECHAT_RECEIVER_SECRET: serviceSecret,
      WECHAT_RECEIVER_ACCOUNTS: "all",
      WECHAT_RECEIVER_WATCHDOG_ACCOUNTS: supervised ? stub.id.toString() : "",
    });
  });
  return stub;
}
async function connect(stub: ReturnType<typeof env.ACCOUNTS.getByName>, supervised = false) {
  const response = await stub.fetch("https://internal/wechat-receiver", {
    headers: { Upgrade: "websocket", ...(supervised ? { [watchdogHeader]: "1" } : {}) },
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
  it("partitions discovery and rejects cross-pool connections before contacting an account", async () => {
    const [shared, dedicated] = await Promise.all([setup(), setup()]);
    for (const stub of [shared, dedicated])
      await env.DB.prepare("INSERT OR REPLACE INTO wechat_receivers VALUES (?,1,?)")
        .bind(stub.id.toString(), Date.now())
        .run();
    const bindings = {
      ...env,
      WECHAT_RECEIVER_SECRET: serviceSecret,
      WECHAT_RECEIVER_ACCOUNTS: "all",
      WECHAT_RECEIVER_DEDICATED_ACCOUNTS: dedicated.id.toString(),
    };
    const request = (path: string, pool?: string) =>
      worker.fetch(
        new Request("https://example.com/api/internal/wechat-receiver/" + path, {
          headers: {
            Authorization: "Bearer " + serviceSecret,
            ...(pool ? { "X-Wechatai-Receiver-Pool": pool } : {}),
          },
        }),
        bindings,
        createExecutionContext(),
      );
    for (const [pool, allowed, excluded] of [
      [undefined, shared.id.toString(), dedicated.id.toString()],
      ["dedicated", dedicated.id.toString(), shared.id.toString()],
    ] as const) {
      const result = (await (await request("accounts", pool)).json()) as {
        accounts: string[];
        pool?: string;
      };
      expect(result.pool).toBe(pool);
      expect(result.accounts).toContain(allowed);
      expect(result.accounts).not.toContain(excluded);
      expect((await request("connect/" + excluded, pool)).status).toBe(404);
      expect((await request("connect/" + allowed, pool)).status).toBe(426);
    }
  });
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
  it("hands idle checks to the VPS only after a healthy scan, and wakes promptly for real work", async () => {
    const stub = await setup(true);
    const bindings = {
      ...env,
      WECHAT_RECEIVER_SECRET: serviceSecret,
      WECHAT_RECEIVER_WATCHDOG_ACCOUNTS: stub.id.toString(),
    };
    const request = (path: string, method = "GET", secret = serviceSecret) =>
      worker.fetch(
        new Request("https://edge.test/api/internal/wechat-receiver/watchdog/" + path, {
          method,
          headers: { Authorization: "Bearer " + secret },
        }),
        bindings,
        createExecutionContext(),
      );
    expect((await request("heartbeat", "POST", "bad")).status).toBe(401);
    await env.DB.prepare("DELETE FROM receiver_watchdog_supervisor").run();
    const before = await connect(stub, true);
    expect(before.config.watchdogSession).toBeUndefined();
    expect((await request("heartbeat", "POST")).status).toBe(200);
    const legacy = await connect(stub);
    expect(legacy.config.watchdogSession).toBeUndefined();
    const { socket, next, config } = await connect(stub, true);
    const session = config.watchdogSession as string;
    expect(session).toMatch(/^[0-9a-f-]{36}$/);
    await runInDurableObject(stub, (_, state) => {
      const at = Number(vi.mocked(state.storage.setAlarm).mock.calls.at(-1)![0]);
      expect(at - Date.now()).toBeGreaterThan(14 * 60000);
    });
    expect(await (await request("sessions")).json()).toMatchObject({ sessions: [] });
    await env.DB.prepare("UPDATE receiver_watchdog_sessions SET check_after=0 WHERE session=?")
      .bind(session)
      .run();
    expect(await (await request("sessions")).json()).toMatchObject({ sessions: [session] });
    await fallbackWatchdogs(bindings);
    expect(
      await env.DB.prepare("SELECT check_after FROM receiver_watchdog_sessions WHERE session=?")
        .bind(session)
        .first("check_after"),
    ).toBe(0);
    socket.send(JSON.stringify(batch()));
    await next("ack");
    expect((await inspect(stub)).inbox).toHaveLength(1);
    await runInDurableObject(stub, (_, state) => {
      const at = Number(vi.mocked(state.storage.setAlarm).mock.calls.at(-1)![0]);
      expect(at - Date.now()).toBeLessThan(2000);
    });
  });
  it("fences recovery by session, restores the local lease after a supervisor outage and retries safely", async () => {
    const stub = await setup(true);
    const bindings = {
      ...env,
      WECHAT_RECEIVER_SECRET: serviceSecret,
      WECHAT_RECEIVER_WATCHDOG_ACCOUNTS: "all",
    };
    await env.DB.prepare("INSERT OR REPLACE INTO receiver_watchdog_supervisor VALUES(1,?)")
      .bind(Date.now())
      .run();
    const first = await connect(stub, true);
    const second = await connect(stub, true);
    const old = first.config.watchdogSession as string,
      current = second.config.watchdogSession as string;
    expect(current).not.toBe(old);
    const recover = async (id: string) =>
      worker.fetch(
        new Request("https://edge.test/api/internal/wechat-receiver/watchdog/recover/" + id, {
          method: "POST",
          headers: { Authorization: "Bearer " + serviceSecret },
        }),
        bindings,
        createExecutionContext(),
      );
    await env.DB.prepare("UPDATE receiver_watchdog_sessions SET check_after=0").run();
    expect((await recover(old)).status).toBe(200);
    // A recovery already claimed just before the old connection closed.
    await stub.recoverReceiverWatchdog(old);
    expect((await recover(old)).status).toBe(200);
    await runInDurableObject(stub, (_, state) => {
      const socket = state
        .getWebSockets("wechat-receiver")
        .find((ws) => ws.readyState === WebSocket.OPEN)!;
      expect(socket.deserializeAttachment()).toMatchObject({ watchdogSession: current });
      expect(socket.deserializeAttachment().localWatchdog).toBeFalsy();
    });
    await env.DB.prepare("UPDATE receiver_watchdog_supervisor SET seen_at=0").run();
    await fallbackWatchdogs(bindings);
    expect(await second.next("config")).not.toHaveProperty("watchdogSession");
    await runInDurableObject(stub, (_, state) => {
      const at = Number(vi.mocked(state.storage.setAlarm).mock.calls.at(-1)![0]);
      expect(at - Date.now()).toBeGreaterThan(0);
      expect(at - Date.now()).toBeLessThanOrEqual(60000);
    });
    expect(
      await env.DB.prepare("SELECT session FROM receiver_watchdog_sessions WHERE session=?")
        .bind(current)
        .first(),
    ).toBeNull();
  });
  it("retains a failed handoff for retry and re-enrolls the live connection after the VPS recovers", async () => {
    const stub = await setup(true);
    const sessionDB = env.DB;
    await sessionDB
      .prepare("INSERT OR REPLACE INTO receiver_watchdog_supervisor VALUES(1,?)")
      .bind(Date.now())
      .run();
    const { config, next } = await connect(stub, true);
    const id = config.watchdogSession as string;
    await sessionDB
      .prepare("UPDATE receiver_watchdog_sessions SET check_after=0 WHERE session=?")
      .bind(id)
      .run();
    const offline = {
      DB: sessionDB,
      ACCOUNTS: {
        ...env.ACCOUNTS,
        idFromString: () => stub.id,
        get: () => ({ recoverReceiverWatchdog: () => Promise.reject(new Error("fixture outage")) }),
      },
    } as unknown as Pick<Env, "DB" | "ACCOUNTS">;
    await expect(recoverReceiverSession(offline, id)).rejects.toThrow("fixture outage");
    const due = await sessionDB
      .prepare("SELECT check_after FROM receiver_watchdog_sessions WHERE session=?")
      .bind(id)
      .first<number>("check_after");
    expect(due).toBeGreaterThan(Date.now());
    await recoverReceiverSession(offline, id); // Retry grace prevents a second call.
    await sessionDB
      .prepare("UPDATE receiver_watchdog_sessions SET check_after=0 WHERE session=?")
      .bind(id)
      .run();
    await recoverReceiverSession(env, id);
    expect(await next("config")).not.toHaveProperty("watchdogSession");
    await runInDurableObject(stub, async (instance, state) => {
      const socket = state.getWebSockets("wechat-receiver")[0];
      socket.serializeAttachment({ ...socket.deserializeAttachment(), retryWatchdogAt: 0 });
      await Reflect.get(instance, "scheduleWechat").call(instance);
    });
    const newID = (await next("config")).watchdogSession;
    expect(newID).toMatch(/^[0-9a-f-]{36}$/);
    expect(newID).not.toBe(id);
    expect(await stub.receiverStatus()).toMatchObject({ watchdog: "vps" });
    await sessionDB
      .prepare("UPDATE receiver_watchdog_sessions SET check_after=0 WHERE session=?")
      .bind(newID)
      .run();
    // Removing the account from a partial rollout must win even if Go is healthy.
    await fallbackWatchdogs({
      ...env,
      WECHAT_RECEIVER_WATCHDOG_ACCOUNTS: "another-account",
    } as Env);
    expect(await stub.receiverStatus()).toMatchObject({ watchdog: "account" });
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
  it("keeps paused bindings in receive configuration and sends only an expiry notice", async () => {
    const stub = await setup();
    await stub.applyPayment({
      id: "membership",
      kind: "subscription",
      units: 0,
      expires: Date.now() + 86400000,
    });
    const created = JSON.parse(await stub.api("wechat.create", { name: "暂停的微信" }));
    expect(created.ok).toBe(true);
    const id = created.data.selectedConnectionId as string;
    await runInDurableObject(stub, async (_, state) => {
      const encryptedCredentials = await encrypt(
        env,
        JSON.stringify({
          token: "paused-token",
          baseUrl: "https://ilinkai.weixin.qq.com",
          userId: "owner",
          botId: "paused-bot",
        }),
        `${state.id}:wechat`,
      );
      state.storage.sql.exec(
        "INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        wechatLinkKey(id, "connection"),
        JSON.stringify({ status: "connected", generation: "g2", encryptedCredentials }),
      );
      state.storage.sql.exec(
        "UPDATE settings SET value=? WHERE key='planUntil'",
        JSON.stringify(Date.now() - 1000),
      );
    });
    const { socket, next, config } = await connect(stub);
    expect(config.links).toMatchObject([
      { id: "default" },
      { id, generation: "g2", typingUntil: 0 },
    ]);
    expect((await stub.receiverStatus()).connectedLinks).toBe(2);
    const request = batch({
      connectionId: id,
      generation: "g2",
      msgs: [{ ...batch().msgs[0], item_list: [{ type: 1, text_item: { text: "你好" } }] }],
    });
    socket.send(JSON.stringify(request));
    expect(await next("ack")).toMatchObject({ id: request.id, cursor: request.cursor });
    const sent: string[] = [];
    await runInDurableObject(stub, async (instance, state) => {
      const network = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        const request = new Request(url, init);
        if (!request.url.endsWith("sendmessage")) throw new Error("unexpected_network_request");
        const body = await request.json<{
          msg: { item_list: { text_item: { text: string } }[] };
        }>();
        sent.push(body.msg.item_list[0].text_item.text);
        return Response.json({ ret: 0 });
      });
      await instance.alarm();
      expect(network).toHaveBeenCalledOnce();
      expect(sent[0]).toContain("你的 Plus 会员到期了");
      expect(sent[0]).toContain("/app/billing");
      expect(sent[0]).toContain("本次未扣除 credits");
      expect(state.storage.sql.exec("SELECT id FROM usage").toArray()).toEqual([]);
      expect(state.storage.sql.exec("SELECT id FROM claw_jobs").toArray()).toEqual([]);
      expect(state.storage.sql.exec("SELECT id FROM messages").toArray()).toEqual([]);
    });
    socket.send(JSON.stringify(request));
    await next("ack");
    await runInDurableObject(stub, async (instance) => instance.alarm());
    expect(sent).toHaveLength(1);
    socket.send(JSON.stringify({ type: "expired", connectionId: id, generation: "g2" }));
    expect((await next("config")).links).toMatchObject([{ id: "default" }]);
    expect((await stub.snapshot()).connections.find((l) => l.id === id)?.status).toBe("expired");
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
  it("preserves upstream 64-bit IDs and stores socket replays once in exact sequence order", async () => {
    const stub = await setup();
    const { socket, next } = await connect(stub);
    const raw =
      '{"msgs":[{"message_id":1234567890123456790,"seq":9007199254740993},{"message_id":1234567890123456789,"seq":9007199254740992},{"seq":18446744073709551615}],"get_updates_buf":"cursor-1"}';
    const result = await runInDurableObject(stub, async () => {
      const network = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(raw));
      try {
        return await wxRequest<{ msgs: WxMessage[] }>("getupdates", {});
      } finally {
        network.mockRestore();
      }
    });
    const msgs = result.msgs.map((m) => ({ message_type: 1, from_user_id: "owner", ...m }));
    const ordered = orderedWechatMessages(msgs);
    expect(ordered.map((m) => m.seq)).toEqual([
      "9007199254740992",
      "9007199254740993",
      "18446744073709551615",
    ]);
    const message = batch({ msgs });
    for (let i = 0; i < 2; i++) {
      socket.send(JSON.stringify(message));
      expect(await next("ack")).toMatchObject({ id: message.id, cursor: "cursor-1" });
    }
    await runInDurableObject(stub, (_, state) => {
      const rows = state.storage.sql
        .exec<{ payload: string }>("SELECT payload FROM inbox ORDER BY rowid")
        .toArray();
      expect(
        rows.map((r) => JSON.parse(r.payload).message_id ?? JSON.parse(r.payload).seq),
      ).toEqual(["1234567890123456789", "1234567890123456790", "18446744073709551615"]);
    });
  });
  it.each([0, "0", "-0"])(
    "uses the sequence for zero ID %j and ignores empty identities",
    async (message_id) => {
      const stub = await setup();
      const { socket, next } = await connect(stub);
      const base = batch().msgs[0];
      const msg = batch({
        msgs: [0, "0", "-0", undefined, 102, 101, "18446744073709551615"].map((seq) => ({
          ...base,
          message_id,
          seq,
        })),
      });
      for (let i = 0; i < 2; i++) {
        socket.send(JSON.stringify(msg));
        expect(await next("ack")).toMatchObject({ id: msg.id, cursor: msg.cursor });
      }
      const state = await inspect(stub);
      expect(state.connection.cursor).toBe(msg.cursor);
      expect(state.inbox.map((r) => r.id).sort()).toEqual([
        "bot:owner:101",
        "bot:owner:102",
        "bot:owner:wx64:18446744073709551615",
      ]);
    },
  );
  it.each([true, false])(
    "retains a historic zero receipt on replay after payload cleanup=%j",
    async (cleaned) => {
      const stub = await setup(),
        { socket, next } = await connect(stub);
      const base = batch().msgs[0];
      await runInDurableObject(stub, (_, state) => {
        state.storage.sql.exec(
          "INSERT INTO inbox(id,payload,state,createdAt) VALUES(?,?,'done',?)",
          "bot:owner:0",
          cleaned ? "{}" : JSON.stringify({ ...base, message_id: 0, seq: 101 }),
          Date.now(),
        );
      });
      socket.send(JSON.stringify(batch({ msgs: [] })));
      await next("ack");
      const msg = batch({ msgs: [102, 101].map((seq) => ({ ...base, message_id: "0", seq })) });
      for (let i = 0; i < 2; i++) {
        socket.send(JSON.stringify(msg));
        await next("ack");
      }
      const state = await inspect(stub);
      expect(state.inbox.map((r) => r.id).sort()).toEqual(["bot:owner:0", "bot:owner:102"]);
      expect(state.inbox.find((r) => r.id === "bot:owner:0")?.state).toBe("done");
    },
  );
  it("recovers distinct uint64 sequences from an old zero-ID batch with a rounded stored sequence", async () => {
    const stub = await setup(),
      { socket, next } = await connect(stub),
      first = "1234567890123456789",
      second = "1234567890123456790";
    await runInDurableObject(stub, (_, state) => {
      state.storage.sql.exec(
        "INSERT INTO inbox(id,payload,createdAt) VALUES('bot:owner:0',?,?)",
        JSON.stringify({ message_id: 0, seq: Number(first) }),
        Date.now(),
      );
    });
    socket.send(JSON.stringify(batch({ msgs: [] })));
    await next("ack");
    const msg = batch({
      msgs: [second, first].map((seq) => ({ ...batch().msgs[0], message_id: 0, seq })),
    });
    for (let i = 0; i < 2; i++) {
      socket.send(JSON.stringify(msg));
      await next("ack");
    }
    expect((await inspect(stub)).inbox.map((row) => row.id).sort()).toEqual([
      "bot:owner:0",
      "bot:owner:wx64:" + second,
    ]);
  });
  it("bridges rounded historical rows and disk replays without merging distinct precise IDs", async () => {
    const stub = await setup();
    const { socket, next } = await connect(stub);
    const base = batch().msgs[0];
    const first = "1234567890123456789",
      second = "1234567890123456790",
      third = "1234567890123456791";
    const rounded = Number(first);
    const historical = await runInDurableObject(stub, (_, state) => {
      const id = "bot:owner:" + rounded;
      state.storage.sql.exec(
        "INSERT INTO inbox(id,payload,state,createdAt) VALUES(?,'{}','done',?)",
        id,
        Date.now(),
      );
      return id;
    });
    // Advance the cursor to reproduce a pre-upgrade ACK lost after payload cleanup.
    const advance = batch({ msgs: [] });
    socket.send(JSON.stringify(advance));
    await next("ack");
    const send = async (
      message_id: number | string,
      seq: number,
      fromCursor: string,
      cursor: string,
    ) => {
      const message = batch({ fromCursor, cursor, msgs: [{ ...base, message_id, seq }] });
      socket.send(JSON.stringify(message));
      expect(await next("ack")).toMatchObject({ id: message.id });
    };
    await send(first, 41, "", "cursor-1");
    await send(second, 42, "cursor-1", "cursor-2");
    await send(rounded, 42, "cursor-1", "cursor-2");
    await send(rounded, 43, "cursor-2", "cursor-3");
    await send(third, 43, "cursor-2", "cursor-3");
    await send(rounded, 41, "", "cursor-1");
    await runInDurableObject(stub, (_, state) => {
      const rows = state.storage.sql
        .exec<{ id: string; wechatExactId: string }>(
          "SELECT id,wechatExactId FROM inbox ORDER BY rowid",
        )
        .toArray();
      expect(rows.map((r) => r.wechatExactId)).toEqual([first, second, third]);
      expect(rows[0].id).toBe(historical);
    });
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
    const exact = "18446744073709551615";
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
      const network = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).endsWith("/getupdates"))
          return new Response(
            `{"ret":0,"get_updates_buf":"fallback","msgs":[{"message_id":${exact},"message_type":1,"from_user_id":"owner"}]}`,
          );
        return Response.json({ ret: 0 });
      });
      await instance.alarm();
      expect(network).toHaveBeenCalled();
    });
    const reconnected = await connect(stub);
    const replay = batch({ cursor: "fallback", msgs: [{ ...batch().msgs[0], message_id: exact }] });
    reconnected.socket.send(JSON.stringify(replay));
    await reconnected.next("ack");
    const state = await inspect(stub);
    expect(state.connection.cursor).toBe("fallback");
    expect(state.inbox.map((row) => row.id)).toEqual(["bot:owner:wx64:" + exact]);
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
