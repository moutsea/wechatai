import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocketServer } from "ws";
import { ReceiverAccount, PING, PONG } from "./receiver.mjs";
import { setTimeout as sleep } from "node:timers/promises";

test(
  "typing config updates keep the existing receive poll and cancel on disconnect",
  { timeout: 10000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "receiver-typing-"));
    const server = createServer();
    const websocket = new WebSocketServer({ server });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const account = new ReceiverAccount("b".repeat(64), {
      directory,
      endpoint: `http://127.0.0.1:${server.address().port}`,
      secret: "receiver-test",
      metrics: {},
    });
    t.after(async () => {
      account.stop();
      await account.done;
      websocket.close();
      server.close();
      await rm(directory, { recursive: true, force: true });
    });
    let polls = 0;
    const statuses = [];
    t.mock.method(globalThis, "fetch", async (url, options) => {
      if (url.endsWith("getconfig")) return Response.json({ ret: 0, typing_ticket: "ticket" });
      if (url.endsWith("sendtyping")) {
        statuses.push(JSON.parse(options.body).status);
        return Response.json({ ret: 0 });
      }
      assert.ok(url.endsWith("getupdates"));
      polls++;
      await new Promise((resolve) =>
        options.signal.addEventListener("abort", resolve, { once: true }),
      );
      throw new Error("aborted");
    });
    let socket;
    const config = (active) =>
      socket.send(
        JSON.stringify({
          type: "config",
          links: [
            {
              id: "default",
              generation: "g1",
              cursor: "",
              typingUntil: active ? Date.now() + 60000 : 0,
              typingContextToken: active ? "context" : "",
              credentials: {
                token: "test",
                userId: "user",
                baseUrl: "https://ilinkai.weixin.qq.com",
              },
            },
          ],
        }),
      );
    websocket.on("connection", (value) => {
      socket = value;
      socket.on("message", (raw) => {
        if (raw.toString() === PING) socket.send(PONG);
      });
      config(false);
    });
    const until = async (check) => {
      const deadline = Date.now() + 3000;
      while (!check() && Date.now() < deadline) await sleep(5);
      assert.ok(check());
    };
    account.done = account.run();
    await until(() => polls === 1);
    config(true);
    await until(() => statuses.length === 1);
    config(false);
    await until(() => statuses.length === 2);
    assert.deepEqual(statuses, [1, 2]);
    assert.equal(polls, 1, "typing changes must not restart getupdates");
    config(true);
    await until(() => statuses.length === 3);
    account.stop();
    await account.done;
    assert.deepEqual(statuses, [1, 2, 1, 2]);
  },
);

test(
  "reconnects a real WebSocket and replays a durable batch after acknowledgement loss",
  { timeout: 10000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "receiver-session-"));
    const server = createServer();
    const websocket = new WebSocketServer({ server });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const metrics = { polls: 0, forwarded: 0 };
    const account = new ReceiverAccount("a".repeat(64), {
      directory,
      endpoint: `http://127.0.0.1:${server.address().port}`,
      secret: "receiver-test",
      metrics,
    });
    t.after(async () => {
      account.stop();
      await account.done;
      websocket.close();
      server.close();
      await rm(directory, { recursive: true, force: true });
    });
    let fetches = 0;
    let firstBatch;
    t.mock.method(globalThis, "fetch", async (_url, options) => {
      fetches++;
      if (fetches === 1)
        return Response.json({ ret: 0, msgs: [{ message_id: 1 }], get_updates_buf: "accepted" });
      await new Promise((resolve) =>
        options.signal.addEventListener("abort", resolve, { once: true }),
      );
      throw new Error("aborted");
    });
    let finish;
    const completed = new Promise((resolve) => {
      finish = resolve;
    });
    websocket.on("connection", (socket, request) => {
      assert.equal(request.headers.authorization, "Bearer receiver-test");
      socket.send(
        JSON.stringify({
          type: "config",
          links: [
            {
              id: "default",
              generation: "g1",
              cursor: firstBatch ? "accepted" : "",
              credentials: { token: "test", baseUrl: "https://ilinkai.weixin.qq.com" },
            },
          ],
        }),
      );
      socket.on("message", (raw) => {
        if (raw.toString() === PING) {
          socket.send(PONG);
          return;
        }
        const batch = JSON.parse(raw.toString());
        if (!firstBatch) {
          firstBatch = batch;
          socket.terminate();
          return;
        }
        assert.equal(batch.id, firstBatch.id);
        assert.equal(fetches, 1, "must retry saved batch before fetching again");
        socket.send(JSON.stringify({ type: "ack", id: batch.id, cursor: "accepted" }));
        finish();
      });
    });
    account.done = account.run();
    await completed;
    account.stop();
    await account.done;
  },
);
