import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { TypingIndicator } from "./typing.mjs";
const credentials = {
  token: "test-key",
  baseUrl: "https://ilinkai.weixin.qq.com",
  userId: "owner",
};
const config = () => ({ typingUntil: Date.now() + 10000, typingContextToken: "context" });
async function until(check) {
  const end = Date.now() + 1500;
  while (!check()) {
    if (Date.now() > end) assert.fail("typing condition timed out");
    await sleep(5);
  }
}
test("starts, refreshes and cancels with a cached per-user ticket", async (t) => {
  const calls = [],
    metrics = {};
  const indicator = new TypingIndicator(credentials, {
    intervalMs: 15,
    metrics,
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body);
      calls.push({ path: new URL(url).pathname, body });
      assert.equal(init.headers.Authorization, "Bearer test-key");
      assert.equal(body.ilink_user_id, "owner");
      return Response.json(
        url.endsWith("getconfig") ? { ret: 0, typing_ticket: "ticket" } : { ret: 0 },
      );
    },
  });
  t.after(() => indicator.stop());
  indicator.update(config());
  await until(() => metrics.typingSent >= 2);
  indicator.update({ typingUntil: 0 });
  await until(() => calls.some((c) => c.body.status === 2));
  assert.equal(calls.filter((c) => c.path.endsWith("getconfig")).length, 1);
  assert.equal(calls[0].body.context_token, "context");
  const count = calls.length;
  await sleep(40);
  assert.equal(calls.length, count);
  assert.equal(indicator.timer, null);
});
test("completion during ticket acquisition cannot start a stale indicator", async (t) => {
  let finish;
  const statuses = [];
  const indicator = new TypingIndicator(credentials, {
    fetchImpl: async (url, init) => {
      if (url.endsWith("getconfig"))
        return new Promise((resolve) => {
          finish = () => resolve(Response.json({ typing_ticket: "ticket" }));
        });
      statuses.push(JSON.parse(init.body).status);
      return Response.json({ ret: 0 });
    },
  });
  t.after(() => indicator.stop());
  indicator.update(config());
  await until(() => !!finish);
  indicator.update({ typingUntil: 0 });
  finish();
  await until(() => !indicator.work);
  assert.deepEqual(statuses, []);
});
test("cancels after an in-flight start even if the reply races it", async (t) => {
  let finish;
  const statuses = [];
  const indicator = new TypingIndicator(credentials, {
    fetchImpl: async (url, init) => {
      if (url.endsWith("getconfig")) return Response.json({ typing_ticket: "ticket" });
      const status = JSON.parse(init.body).status;
      statuses.push(status);
      if (status === 1)
        return new Promise((resolve) => {
          finish = () => resolve(Response.json({ ret: 0 }));
        });
      return Response.json({ ret: 0 });
    },
  });
  t.after(() => indicator.stop());
  indicator.update(config());
  await until(() => !!finish);
  indicator.update({ typingUntil: 0 });
  finish();
  await until(() => statuses.includes(2));
  assert.deepEqual(statuses, [1, 2]);
});
test("expires the original lease rather than refreshing indefinitely", async (t) => {
  const statuses = [];
  const indicator = new TypingIndicator(credentials, {
    intervalMs: 10,
    fetchImpl: async (url, init) => {
      if (url.endsWith("getconfig")) return Response.json({ typing_ticket: "ticket" });
      statuses.push(JSON.parse(init.body).status);
      return Response.json({ ret: 0 });
    },
  });
  t.after(() => indicator.stop());
  indicator.update({ typingUntil: Date.now() + 40, typingContextToken: "context" });
  await until(() => statuses.includes(2));
  assert.equal(statuses.at(-1), 2);
  assert.equal(indicator.timer, null);
});
test("optional API failure backs off without rejecting or preventing shutdown", async () => {
  let calls = 0;
  const metrics = {};
  const indicator = new TypingIndicator(credentials, {
    intervalMs: 1,
    retryMs: 1000,
    metrics,
    fetchImpl: async () => {
      calls++;
      throw new Error("network unavailable");
    },
  });
  indicator.update(config());
  await until(() => metrics.typingFailed === 1);
  await sleep(30);
  assert.equal(calls, 1);
  await indicator.stop();
  assert.equal(indicator.timer, null);
});
test("separate link generations do not reuse credentials or tickets", async (t) => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    seen.push({ key: init.headers.Authorization, ...body });
    return Response.json(
      url.endsWith("getconfig") ? { typing_ticket: body.ilink_user_id + "-ticket" } : { ret: 0 },
    );
  };
  const a = new TypingIndicator(credentials, { fetchImpl }),
    b = new TypingIndicator({ ...credentials, token: "other-key", userId: "other" }, { fetchImpl });
  t.after(() => Promise.all([a.stop(), b.stop()]));
  a.update(config());
  b.update(config());
  await until(() => seen.filter((c) => c.status === 1).length === 2);
  for (const c of seen.filter((c) => c.status === 1)) {
    assert.equal(c.typing_ticket, c.ilink_user_id + "-ticket");
    assert.equal(c.key, c.ilink_user_id === "owner" ? "Bearer test-key" : "Bearer other-key");
  }
  await a.stop();
  assert.equal(a.timer, null);
  assert.equal(b.active(), true);
});
