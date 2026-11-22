import { env, createExecutionContext, runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import worker from "../src/server/index";
import { connectForManualDelivery, deliverQueuedReplies } from "./helpers/wechat-delivery";

it("sends queued replies from unlisted accounts on both VPS slots, preserving retry IDs and rollback", async () => {
  const token = "test-shared-sender-credential-at-least-32-characters";
  const pilot = env.ACCOUNTS.getByName(crypto.randomUUID());
  const pilotToken = "test-independent-pilot-credential-at-least-32-characters";
  const config = {
    WECHAT_SENDER_POOL_SECRET: token,
    WECHAT_SENDER_POOL_ENABLED: "false",
    WECHAT_SENDER_ACCOUNT: pilot.id.toString(),
    WECHAT_SENDER_SECRET: pilotToken,
    WECHAT_SENDER_ENABLED: "true",
  };
  const route = (action: string, id: string, auth: string) =>
    worker.fetch(
      new Request("https://example.com/api/internal/wechat-sender/" + action, {
        headers: {
          Authorization: "Bearer " + auth,
          "X-Wechatai-Account": id,
          Upgrade: "websocket",
        },
      }),
      { ...env, ...config },
      createExecutionContext(),
    );
  const setConfig = (stub: typeof pilot) =>
    runInDurableObject(stub, (instance) => {
      Object.assign(Reflect.get(instance, "env"), config);
    });
  expect((await route("pool", "", "wrong")).status).toBe(401);
  expect((await route("pool", "", pilotToken)).status).toBe(403);
  const pool = await (await route("pool", "", token)).json<{ ids: string[] }>();
  expect(new Set(pool.ids).size).toBe(2);
  expect((await route("connect", pilot.id.toString(), token)).status).toBe(403);
  expect((await route("connect", pool.ids[0], pilotToken)).status).toBe(403);
  const hubs = pool.ids.map((id) => env.ACCOUNTS.get(env.ACCOUNTS.idFromString(id)));
  const seen: string[][] = [[], []];
  const drop = [true, false];
  async function open(index: number) {
    const response = await route("connect", pool.ids[index], token);
    expect(response.status).toBe(101);
    const socket = response.webSocket!;
    socket.addEventListener("message", ({ data }) => {
      const frame = JSON.parse(String(data));
      if (frame.operation === "probe") {
        socket.send(JSON.stringify({ id: frame.id, status: 204 }));
        return;
      }
      if (frame.operation === "upload") {
        socket.send(JSON.stringify({ id: frame.id, status: 200, downloadParam: frame.body }));
        return;
      }
      seen[index].push(JSON.parse(frame.body).msg.client_id);
      if (drop[index]) socket.close();
      else
        socket.send(
          JSON.stringify({ id: frame.id, status: 200, body: '{"ret":0,"message_id":"42"}' }),
        );
    });
    socket.accept();
    return socket;
  }
  const clients: Array<typeof pilot> = [];
  for (let i = 0; !clients[0] || !clients[1]; i++) {
    const account = env.ACCOUNTS.getByName("pool-test-user-" + i);
    clients[parseInt(account.id.toString().slice(0, 8), 16) % 2] = account;
  }
  const enqueue = (stub: typeof pilot, id: string) =>
    runInDurableObject(stub, (_, state) => {
      state.storage.sql.exec(
        "INSERT INTO inbox(id,payload,state,reply,createdAt) VALUES(?,'{}','reply','hello',?)",
        id,
        Date.now(),
      );
    });
  await Promise.all([...clients, ...hubs].map(setConfig));
  for (const c of clients) await connectForManualDelivery(c);
  const sockets = await Promise.all(hubs.map((_, i) => open(i)));
  try {
    expect(await (await route("status", pool.ids[0], token)).json()).toEqual({
      enabled: false,
      connected: true,
      ready: true,
    });
    await enqueue(clients[0], "disabled");
    expect(await deliverQueuedReplies(clients[0])).toEqual([{ id: "disabled:0", text: "hello" }]);
    config.WECHAT_SENDER_POOL_ENABLED = "true";
    await Promise.all([...clients, ...hubs].map(setConfig));
    for (let i = 0; i < 2; i++) await enqueue(clients[i], "queued-" + i);
    expect(await deliverQueuedReplies(clients[0])).toEqual([]);
    expect(await deliverQueuedReplies(clients[1])).toEqual([]);
    drop[0] = false;
    sockets[0] = await open(0);
    expect(await deliverQueuedReplies(clients[0])).toEqual([]);
    expect(seen).toEqual([["queued-0:0", "queued-0:0"], ["queued-1:0"]]);
    for (let i = 0; i < 2; i++) {
      const row = await runInDurableObject(clients[i], (_, state) =>
        state.storage.sql
          .exec<{ state: string; receipts: string }>(
            "SELECT state,wechatTextReceipts AS receipts FROM inbox WHERE id=?",
            "queued-" + i,
          )
          .one(),
      );
      expect(row.state).toBe("done");
      expect(JSON.parse(row.receipts)[0]).toMatchObject({
        transport: "vps",
        outcome: "accepted",
        hasMessageId: true,
      });
    }
    const upload = await hubs[1].forwardWechat(
      "upload",
      "https://novac2c.cdn.weixin.qq.com/c2c/upload",
      new Uint8Array([255, 0, 16]),
      {},
      1000,
    );
    expect(upload?.headers.get("x-encrypted-param")).toBe("/wAQ");
    await expect(
      clients[0].forwardWechat("upload", "https://example.org", new Uint8Array([1]), {}, 1000),
    ).resolves.toBeNull();
    config.WECHAT_SENDER_POOL_ENABLED = "false";
    await Promise.all([...clients, ...hubs].map(setConfig));
    await enqueue(clients[1], "rolled-back");
    expect(await deliverQueuedReplies(clients[1])).toEqual([
      { id: "rolled-back:0", text: "hello" },
    ]);
  } finally {
    for (const socket of sockets) socket.close();
  }
});
