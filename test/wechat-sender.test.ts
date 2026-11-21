import { env, createExecutionContext, runInDurableObject } from "cloudflare:test";
import { it, expect } from "vitest";
import worker from "../src/server/index";
import { senderAccount } from "../src/server/wechat-sender";
import { connectForManualDelivery, deliverQueuedReplies } from "./helpers/wechat-delivery";

it("routes only the selected account and preserves its client ID when a VPS acknowledgement is lost", async () => {
  const own = env.ACCOUNTS.getByName(crypto.randomUUID());
  const other = env.ACCOUNTS.getByName(crypto.randomUUID());
  const settings = {
    WECHAT_SENDER_SECRET: "test-sender-secret-with-at-least-32-characters",
    WECHAT_SENDER_ACCOUNT: own.id.toString(),
    WECHAT_SENDER_ENABLED: "true",
  };
  const bindings = { ...env, ...settings };
  for (const invalid of ["all", "*", "", own.id + "," + other.id])
    expect(senderAccount({ ...bindings, WECHAT_SENDER_ACCOUNT: invalid } as Env)).toBe("");
  for (const stub of [own, other]) {
    await connectForManualDelivery(stub);
    await runInDurableObject(stub, (instance, state) => {
      Object.assign(Reflect.get(instance, "env"), settings);
      state.storage.sql.exec(
        "INSERT INTO inbox(id,payload,state,reply,createdAt) VALUES('canary','{}','reply','hello',?)",
        Date.now(),
      );
    });
  }
  const route = (action: string, account: string, bearer = settings.WECHAT_SENDER_SECRET) =>
    worker.fetch(
      new Request("https://example.com/api/internal/wechat-sender/" + action, {
        headers: {
          Authorization: "Bearer " + bearer,
          "X-Wechatai-Account": account,
          Upgrade: "websocket",
        },
      }),
      bindings,
      createExecutionContext(),
    );
  const id = own.id.toString();
  expect((await route("connect", other.id.toString())).status).toBe(403);
  expect((await route("connect", id, "wrong")).status).toBe(401);
  expect(await deliverQueuedReplies(other)).toEqual([{ id: "canary:0", text: "hello" }]);
  const seen: string[] = [];
  async function connect(drop: boolean) {
    const response = await route("connect", id);
    expect(response.status).toBe(101);
    const ws = response.webSocket!;
    ws.addEventListener("message", ({ data }) => {
      const req = JSON.parse(String(data));
      if (req.operation === "probe") {
        ws.send(JSON.stringify({ id: req.id, status: 204 }));
        return;
      }
      seen.push(JSON.parse(req.body).msg.client_id);
      if (drop) ws.close();
      else
        ws.send(JSON.stringify({ id: req.id, status: 200, body: '{"ret":0,"message_id":"123"}' }));
    });
    ws.accept();
    return ws;
  }
  await connect(true);
  expect(await deliverQueuedReplies(own)).toEqual([]);
  const failed = await runInDurableObject(
    own,
    (_, state) =>
      state.storage.sql
        .exec<{ receipt: string }>(
          "SELECT wechatTextReceipts AS receipt FROM inbox WHERE id='canary'",
        )
        .one().receipt,
  );
  expect(JSON.parse(failed)[0]).toMatchObject({
    transport: "vps",
    outcome: "error",
    httpStatus: null,
    attempt: 1,
  });
  const ws = await connect(false);
  try {
    expect(await (await route("status", id)).json()).toEqual({
      enabled: true,
      connected: true,
      ready: true,
    });
    expect(await deliverQueuedReplies(own)).toEqual([]);
    expect(seen).toEqual(["canary:0", "canary:0"]);
    const row = await runInDurableObject(own, (_, state) =>
      state.storage.sql
        .exec<{ state: string; receipt: string }>(
          "SELECT state,wechatTextReceipts AS receipt FROM inbox WHERE id='canary'",
        )
        .one(),
    );
    expect(row.state).toBe("done");
    expect(JSON.parse(row.receipt)[0]).toMatchObject({
      outcome: "accepted",
      transport: "vps",
      httpStatus: 200,
      hasMessageId: true,
      attempt: 2,
    });
  } finally {
    ws.close();
  }
});

it("isolates concurrent senders, including a standby pilot and an unlisted account", async () => {
  const [owner, pilot, other] = Array.from({ length: 3 }, () =>
    env.ACCOUNTS.getByName(crypto.randomUUID()),
  );
  const ownerToken = "owner-test-credential-of-at-least-32-characters";
  const pilotToken = "pilot-test-credential-of-at-least-32-characters";
  const entry = { account: pilot.id.toString(), token: pilotToken, enabled: false };
  const bindings = {
    ...env,
    WECHAT_SENDER_ACCOUNT: owner.id.toString(),
    WECHAT_SENDER_SECRET: ownerToken,
    WECHAT_SENDER_ENABLED: "true",
    WECHAT_SENDER_PILOTS: JSON.stringify([entry]),
  };
  const route = (action: string, account: string, token: string) =>
    worker.fetch(
      new Request("https://example.com/api/internal/wechat-sender/" + action, {
        headers: {
          Authorization: "Bearer " + token,
          "X-Wechatai-Account": account,
          Upgrade: "websocket",
        },
      }),
      bindings,
      createExecutionContext(),
    );
  for (const stub of [owner, pilot, other]) {
    await connectForManualDelivery(stub);
    await runInDurableObject(stub, (instance, state) => {
      Object.assign(Reflect.get(instance, "env"), bindings);
      state.storage.sql.exec(
        "INSERT INTO inbox(id,payload,state,reply,createdAt) VALUES('pilot-test','{}','reply','hello',?)",
        Date.now(),
      );
    });
  }
  const got: string[] = [];
  async function open(account: string, token: string) {
    const r = await route("connect", account, token);
    expect(r.status).toBe(101);
    const ws = r.webSocket!;
    ws.addEventListener("message", ({ data }) => {
      const m = JSON.parse(String(data));
      if (m.operation !== "probe") got.push(account);
      ws.send(
        JSON.stringify({
          id: m.id,
          status: m.operation === "probe" ? 204 : 200,
          body: '{"ret":0}',
        }),
      );
    });
    ws.accept();
    return ws;
  }
  const ownerId = owner.id.toString(),
    pilotId = pilot.id.toString();
  const first = await open(ownerId, ownerToken);
  const second = await open(pilotId, pilotToken);
  try {
    for (const [id, token] of [
      [ownerId, pilotToken],
      [pilotId, ownerToken],
      [other.id.toString(), pilotToken],
    ])
      expect((await route("connect", id, token)).status).toBe(403);
    expect(await (await route("status", pilotId, pilotToken)).json()).toEqual({
      enabled: false,
      connected: true,
      ready: true,
    });
    await runInDurableObject(pilot, (instance) => {
      Reflect.get(instance, "env").WECHAT_SENDER_PILOTS = JSON.stringify([
        { ...entry, enabled: true },
      ]);
    });
    expect(await (await route("status", pilotId, pilotToken)).json()).toEqual({
      enabled: true,
      connected: true,
      ready: true,
    });
    expect(await deliverQueuedReplies(owner)).toEqual([]);
    expect(await deliverQueuedReplies(pilot)).toEqual([]);
    expect(got).toEqual([ownerId, pilotId]);
    expect(await deliverQueuedReplies(other)).toEqual([{ id: "pilot-test:0", text: "hello" }]);
    for (const bad of [
      "{",
      "{}",
      JSON.stringify([entry, entry]),
      JSON.stringify([entry, { ...entry, account: other.id.toString() }]),
      JSON.stringify([{ ...entry, token: ownerToken }]),
      JSON.stringify([{ ...entry, account: "*" }]),
    ]) {
      bindings.WECHAT_SENDER_PILOTS = bad;
      expect((await route("status", pilotId, pilotToken)).status).toBe(401);
      expect((await route("status", ownerId, ownerToken)).status).toBe(200);
    }
  } finally {
    first.close();
    second.close();
  }
});
