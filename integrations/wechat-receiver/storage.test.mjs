import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadState, saveState, stateFile } from "./storage.mjs";
import { receiveLink, wechatURL } from "./receiver.mjs";

const config = {
  id: "default",
  generation: "g1",
  cursor: "start",
  credentials: {
    token: "test",
    userId: "owner",
    baseUrl: "https://ilinkai.weixin.qq.com",
  },
};
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "wechat-receiver-test-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  return {
    directory,
    file: stateFile(directory, "account", config.id),
    metrics: { polls: 0, forwarded: 0 },
  };
}
test("retains unacknowledged messages across process restarts, before requesting more updates", async (t) => {
  const f = await fixture(t);
  const abort = new AbortController();
  let fetched = 0;
  await assert.rejects(
    receiveLink({
      ...f,
      config,
      accountId: "account",
      signal: abort.signal,
      fetchImpl: async () => {
        fetched++;
        return new Response(
          '{"msgs":[{"message_id":1234567890123456789,"seq":9007199254740993},{"message_id":1234567890123456790,"seq":9007199254740994}],"get_updates_buf":"next"}',
        );
      },
      sendBatch: async (batch) => {
        assert.equal(JSON.parse(await readFile(f.file, "utf8")).pending.id, batch.id);
        throw new Error("lost_ack");
      },
      sendExpired: () => assert.fail(),
    }),
    /lost_ack/,
  );
  assert.equal(fetched, 1);
  const saved = await loadState(f.file, config);
  await receiveLink({
    ...f,
    config: { ...config, cursor: "next" },
    accountId: "account",
    signal: abort.signal,
    fetchImpl: async () => assert.fail("must replay before fetching"),
    sendBatch: async (batch) => {
      assert.equal(batch.id, saved.pending.id);
      assert.deepEqual(JSON.parse(JSON.stringify(batch.msgs)), [
        { message_id: "1234567890123456789", seq: "9007199254740993" },
        { message_id: "1234567890123456790", seq: "9007199254740994" },
      ]);
      abort.abort();
      return { cursor: "next" };
    },
    sendExpired: () => assert.fail(),
  });
  assert.equal(JSON.parse(await readFile(f.file, "utf8")).pending, null);
});
test("keeps a backpressured batch on disk across shutdown without advancing the accepted cursor", async (t) => {
  const f = await fixture(t);
  const abort = new AbortController();
  let calls = 0;
  await receiveLink({
    ...f,
    config,
    accountId: "account",
    signal: abort.signal,
    sendExpired: () => assert.fail(),
    fetchImpl: async () => {
      calls++;
      return Response.json({ msgs: [{ message_id: "31" }], get_updates_buf: "next" });
    },
    sendBatch: async () => {
      abort.abort();
      return { retryAfterMs: 5000 };
    },
  });
  const state = await loadState(f.file, config);
  assert.equal(calls, 1);
  assert.equal(state.pending.msgs[0].message_id, "31");
  assert.equal(state.baseCursor, config.cursor);
});
test("replays a pre-upgrade pending batch with its original numeric identity", async (t) => {
  const f = await fixture(t);
  const abort = new AbortController();
  const rounded = Number("1234567890123456789");
  const pending = {
    id: "old-batch",
    fromCursor: "start",
    cursor: "next",
    msgs: [{ message_id: rounded, seq: 41 }],
  };
  await writeFile(
    f.file,
    JSON.stringify({ generation: "g1", baseCursor: "start", cursor: "next", pending }),
  );
  await receiveLink({
    ...f,
    config,
    accountId: "account",
    signal: abort.signal,
    fetchImpl: async () => assert.fail("must replay before fetching"),
    sendBatch: async (batch) => {
      assert.deepEqual(batch, pending);
      abort.abort();
      return { cursor: "next" };
    },
    sendExpired: () => assert.fail(),
  });
  assert.equal((await loadState(f.file, { ...config, cursor: "next" })).pending, null);
});
test("keeps empty poll cursors locally and forwards only actual message batches", async (t) => {
  const f = await fixture(t);
  const abort = new AbortController();
  let polls = 0;
  let sent = 0;
  await receiveLink({
    ...f,
    config,
    accountId: "account",
    signal: abort.signal,
    fetchImpl: async (_url, request) => {
      const body = JSON.parse(request.body);
      assert.equal(body.get_updates_buf, polls++ === 0 ? "start" : "empty-cursor");
      return Response.json(
        polls === 1
          ? { msgs: [], get_updates_buf: "empty-cursor" }
          : { msgs: [{ message_id: 1 }], get_updates_buf: "message-cursor" },
      );
    },
    sendBatch: async (batch) => {
      sent++;
      assert.equal(batch.fromCursor, "start");
      abort.abort();
      return { cursor: "message-cursor" };
    },
    sendExpired: () => assert.fail(),
  });
  assert.equal(polls, 2);
  assert.equal(sent, 1);
});
test("resets obsolete local cursors after cloud fallback but preserves outstanding batches", async (t) => {
  const f = await fixture(t);
  await saveState(f.file, {
    generation: "g1",
    cursor: "empty",
    baseCursor: "start",
    pending: null,
  });
  assert.equal((await loadState(f.file, config)).cursor, "empty");
  assert.equal(
    (await loadState(f.file, { ...config, cursor: "cloud-advanced" })).cursor,
    "cloud-advanced",
  );
  await saveState(f.file, {
    generation: "g1",
    cursor: "empty",
    baseCursor: "start",
    pending: { id: "batch" },
  });
  assert.equal(
    (await loadState(f.file, { ...config, cursor: "cloud-advanced" })).pending.id,
    "batch",
  );
  assert.equal((await loadState(f.file, { ...config, generation: "g2" })).pending, null);
});
test("fails closed for corrupted state and blocks non-WeChat credential hosts", async (t) => {
  const f = await fixture(t);
  await writeFile(f.file, "broken json");
  await assert.rejects(loadState(f.file, config));
  for (const baseUrl of [
    "http://ilinkai.weixin.qq.com",
    "https://localhost",
    "https://ilinkai.weixin.qq.com.evil.test",
    "https://ilinkai.weixin.qq.com:444",
    "https://user:pass@ilinkai.weixin.qq.com",
  ])
    assert.throws(() => wechatURL({ baseUrl }), /invalid_wechat_host/);
});
