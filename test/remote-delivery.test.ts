import { abortAllDurableObjects, env, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WxMessage } from "../src/server/wechat";
import { connectForManualDelivery, deliverQueuedReplies } from "./helpers/wechat-delivery";

type Account = ReturnType<typeof env.ACCOUNTS.getByName>;
const accounts: Account[] = [];
const api = async (stub: Account, action: string, payload: unknown = {}) =>
  JSON.parse(await stub.api(action, payload));
const send = (stub: Account, text: string) =>
  runInDurableObject(stub, (instance) =>
    (
      instance as unknown as {
        processWechat(id: string, message: WxMessage, link: string): Promise<string>;
      }
    ).processWechat(
      crypto.randomUUID(),
      { item_list: [{ type: 1, text_item: { text } }] },
      "default",
    ),
  );

async function setup(kind: "openclaw" | "hermes" = "openclaw") {
  const stub = env.ACCOUNTS.getByName(crypto.randomUUID());
  accounts.push(stub);
  await stub.applyPayment({
    id: "plus",
    kind: "subscription",
    units: 0,
    expires: Date.now() + 86400000,
  });
  expect((await api(stub, "wechat.create", { name: "测试微信" })).ok).toBe(true);
  await connectForManualDelivery(stub);
  const name = kind === "openclaw" ? "OpenClaw" : "Hermes";
  const first = await api(stub, "plugin.save", {
    pluginId: `wechatai/${kind}`,
    name,
    shortcut: "work",
    maxOutputTokens: 16000,
  });
  const other = await api(stub, "plugin.save", {
    pluginId: "wechatai/openclaw",
    name: "生活助手",
    shortcut: "life",
  });
  expect(first.ok).toBe(true);
  expect(other.ok).toBe(true);
  const token = await api(stub, kind === "openclaw" ? "plugin.clawToken" : "plugin.hermesToken", {
    id: first.data.id,
  });
  expect(token.ok).toBe(true);
  const secret = token.data.token.split(".")[2];
  const runnerId = crypto.randomUUID();
  const call = async (action: string, body: Record<string, unknown> = {}) =>
    JSON.parse(
      await stub.openClawRequest(first.data.id, secret, action, { runnerId, ...body }, kind),
    );
  await send(stub, "/use work");
  await send(stub, "请执行任务");
  const job = (await call("poll")).data.jobs[0];
  expect((await call("claim", { id: job.id })).data.claimed).toBe(true);
  const event = {
    eventId: crypto.randomUUID(),
    routeId: job.routeId,
    jobId: job.id,
    text: "任务完成🌱",
  };
  return { stub, first: first.data, other: other.data, name, event, call };
}
afterEach(async () => {
  for (const stub of accounts.splice(0))
    await runInDurableObject(env.ACCOUNTS.get(stub.id), (_, state) => state.storage.deleteAlarm());
  vi.restoreAllMocks();
});

it("keeps a queued reply untouched while the test waits beyond the normal alarm deadline", async () => {
  const ctx = await setup();
  const result = await ctx.call("event", ctx.event);
  expect(result.ok).toBe(true);
  const unexpectedFetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("The test has not started delivery yet"));
  try {
    // A queued reply normally schedules a 100ms alarm. Reproduce the slower
    // full-suite timing without allowing a second, uncontrolled sender.
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(unexpectedFetch).not.toHaveBeenCalled();
    await runInDurableObject(ctx.stub, (_, state) => {
      const connection = JSON.parse(
        state.storage.sql
          .exec<{ value: string }>("SELECT value FROM settings WHERE key='connection'")
          .one().value,
      );
      expect(connection.encryptedCredentials).toBeTruthy();
      expect(connection.error).toBeUndefined();
      expect(
        state.storage.sql
          .exec("SELECT state,part,attempts FROM inbox WHERE id=?", result.data.id)
          .one(),
      ).toMatchObject({ state: "reply", part: 0, attempts: 0 });
    });
  } finally {
    unexpectedFetch.mockRestore();
  }
  expect((await deliverQueuedReplies(ctx.stub))[0].text).toBe(ctx.event.text);
});

describe.each(["openclaw", "hermes"] as const)("%s delivery-time source notices", (kind) => {
  it.each(["reply", "waiting_context"])(
    "deleting a plugin cancels its queued %s reply",
    async (status) => {
      const ctx = await setup(kind);
      const result = await ctx.call("event", ctx.event);
      expect(result.ok).toBe(true);
      await runInDurableObject(ctx.stub, (_, state) =>
        state.storage.sql.exec("UPDATE inbox SET state=? WHERE id=?", status, result.data.id),
      );
      expect((await api(ctx.stub, "plugin.delete", { id: ctx.first.id })).ok).toBe(true);
      await expectCancelledAfterNewMessage(ctx.stub, result.data.id);
    },
  );

  it.each(
    [
      { fail: true, attempts: 0 },
      { fail: true, attempts: 4 },
      { fail: false, attempts: 0 },
    ].flatMap((scenario) => [
      { ...scenario, viaAlarm: false },
      { ...scenario, viaAlarm: true },
    ]),
  )(
    "preserves cancellation during a send ($fail, attempt $attempts, alarm $viaAlarm)",
    async ({ fail, attempts, viaAlarm }) => {
      const ctx = await setup(kind);
      const result = await ctx.call("event", { ...ctx.event, text: "长回复".repeat(1000) });
      expect(result.ok).toBe(true);
      const previousError = await runInDurableObject(ctx.stub, (_, state) => {
        state.storage.sql.exec("UPDATE inbox SET attempts=? WHERE id=?", attempts, result.data.id);
        return JSON.parse(
          state.storage.sql
            .exec<{ value: string }>("SELECT value FROM settings WHERE key='connection'")
            .one().value,
        ).error;
      });
      const delivered = await deliverQueuedReplies(ctx.stub, 1, fail, {
        viaAlarm,
        beforeSendResult: async (instance) => {
          expect(JSON.parse(await instance.api("plugin.delete", { id: ctx.first.id })).ok).toBe(
            true,
          );
        },
      });
      expect(delivered).toHaveLength(1);
      await runInDurableObject(ctx.stub, (_, state) => {
        expect(
          state.storage.sql
            .exec("SELECT part,attempts FROM inbox WHERE id=?", result.data.id)
            .one(),
        ).toMatchObject({ part: 0, attempts });
        expect(
          JSON.parse(
            state.storage.sql
              .exec<{ value: string }>("SELECT value FROM settings WHERE key='connection'")
              .one().value,
          ).error,
        ).toBe(previousError);
      });
      await expectCancelledAfterNewMessage(ctx.stub, result.data.id);
    },
  );

  it("discards an orphaned reply even without a context token", async () => {
    const ctx = await setup(kind);
    const result = await ctx.call("event", { ...ctx.event, proactive: true });
    expect(result.ok).toBe(true);
    await runInDurableObject(ctx.stub, (_, state) => {
      // Simulate a legacy orphan: normal deletion already cancels these rows.
      state.storage.sql.exec("DELETE FROM plugins WHERE id=?", ctx.first.id);
      state.storage.sql.exec(
        "UPDATE settings SET value=json_remove(value,'$.contextToken') WHERE key='connection'",
      );
    });
    expect(await deliverQueuedReplies(ctx.stub)).toEqual([]);
    await expectCancelledAfterNewMessage(ctx.stub, result.data.id);
  });

  it.each(["completed", "failed"])(
    "labels a %s reply if the user switches after it is queued",
    async (status) => {
      const ctx = await setup(kind);
      const result = await ctx.call("event", { ...ctx.event, status });
      expect(result.ok).toBe(true);
      expect((await api(ctx.stub, "plugin.activate", { id: ctx.other.id })).ok).toBe(true);
      const before = (await ctx.stub.snapshot()).wallet.balance;
      await abortAllDurableObjects();
      const restored = env.ACCOUNTS.get(ctx.stub.id);
      const delivered = await deliverQueuedReplies(restored);
      expect(delivered).toHaveLength(1);
      expect(delivered[0].text).toContain(`消息来自 ${ctx.name}插件。`);
      expect(delivered[0].text).toContain("/use work");
      expect(delivered[0].text).toContain("\n\n──────────\n\n");
      expect(delivered[0].text).toContain(status === "completed" ? ctx.event.text : "本次未扣费");
      expect((await restored.snapshot()).currentSession?.pluginInstanceId).toBe(ctx.other.id);
      expect((await restored.snapshot()).wallet.balance).toBe(before);
    },
  );

  it("omits the notice if the user returns to the source before delivery", async () => {
    const ctx = await setup(kind);
    await api(ctx.stub, "plugin.activate", { id: ctx.other.id });
    expect((await ctx.call("event", ctx.event)).ok).toBe(true);
    await api(ctx.stub, "plugin.activate", { id: ctx.first.id });
    const delivered = await deliverQueuedReplies(ctx.stub);
    expect(delivered[0].text).toBe(ctx.event.text);
  });
});

async function expectCancelledAfterNewMessage(stub: Account, id: string) {
  const expectCancelled = () =>
    runInDurableObject(stub, (_, state) => {
      expect(
        state.storage.sql.exec("SELECT state,payload,reply FROM inbox WHERE id=?", id).one(),
      ).toMatchObject({ state: "done", payload: "{}", reply: "" });
    });
  await expectCancelled();
  // A fresh WeChat message resumes waiting_context replies, but never cancelled ones.
  expect(
    await deliverQueuedReplies(stub, 1, false, {
      incoming: [
        {
          message_type: 1,
          from_user_id: "owner",
          message_id: 1,
          context_token: "fresh-context",
          item_list: [{ type: 1, text_item: { text: "hello" } }],
        },
      ],
    }),
  ).toEqual([]);
  await expectCancelled();
}

it("freezes retry bodies and multipart offsets across switches, renames and restarts", async () => {
  const ctx = await setup();
  const text = "任务进展🌱".repeat(650);
  expect((await ctx.call("event", { ...ctx.event, text })).ok).toBe(true);
  await api(ctx.stub, "plugin.activate", { id: ctx.other.id });
  const expected =
    "消息来自 OpenClaw插件。\n使用 /use work 进入插件，或发送 @work 回复内容。\n\n──────────\n\n" +
    text;
  const parts = Array.from(expected).reduce<string[]>((chunks, ch, index) => {
    const i = Math.floor(index / 1500);
    chunks[i] = (chunks[i] ?? "") + ch;
    return chunks;
  }, []);
  const balance = (await ctx.stub.snapshot()).wallet.balance;
  const failed = await deliverQueuedReplies(ctx.stub, 1, true);
  expect(failed).toHaveLength(1);
  expect(failed[0].text).toBe(parts[0]);
  await api(ctx.stub, "plugin.activate", { id: ctx.first.id });
  expect(
    (await api(ctx.stub, "plugin.save", { ...ctx.first, name: "新名称", shortcut: "new-alias" }))
      .ok,
  ).toBe(true);
  await abortAllDurableObjects();
  let restored = env.ACCOUNTS.get(ctx.stub.id);
  const first = await deliverQueuedReplies(restored);
  expect(first).toEqual(failed);
  await api(restored, "plugin.activate", { id: ctx.other.id });
  await abortAllDurableObjects();
  restored = env.ACCOUNTS.get(ctx.stub.id);
  const rest = await deliverQueuedReplies(restored, parts.length - 1);
  const delivered = [...first, ...rest];
  expect(delivered.map((v) => v.text)).toEqual(parts);
  expect(new Set(delivered.map((v) => v.id)).size).toBe(parts.length);
  expect(delivered.map((v) => v.text).join("")).toBe(expected);
  expect((await restored.snapshot()).wallet.balance).toBe(balance);
});

it("keeps legacy already-formatted queued replies unchanged", async () => {
  const ctx = await setup();
  const result = await ctx.call("event", ctx.event);
  const legacy = "旧版来源提示\n\n" + ctx.event.text;
  await runInDurableObject(ctx.stub, (_, state) =>
    state.storage.sql.exec(
      "UPDATE inbox SET payload='{}', reply=? WHERE id=?",
      legacy,
      result.data.id,
    ),
  );
  await api(ctx.stub, "plugin.activate", { id: ctx.other.id });
  expect((await deliverQueuedReplies(ctx.stub))[0].text).toBe(legacy);
});

it("still retries an active reply when a fresh context arrives after repeated failures", async () => {
  const ctx = await setup();
  const result = await ctx.call("event", ctx.event);
  expect(result.ok).toBe(true);
  const failed = await deliverQueuedReplies(ctx.stub, 5, true);
  expect(failed).toHaveLength(5);
  await runInDurableObject(ctx.stub, (_, state) =>
    expect(
      state.storage.sql.exec("SELECT state,attempts FROM inbox WHERE id=?", result.data.id).one(),
    ).toMatchObject({ state: "waiting_context", attempts: 5 }),
  );
  await deliverQueuedReplies(ctx.stub, 1, false, {
    incoming: [
      {
        message_type: 1,
        from_user_id: "owner",
        message_id: 1,
        context_token: "fresh-context",
        item_list: [{ type: 1, text_item: { text: "hello" } }],
      },
    ],
  });
  expect(await deliverQueuedReplies(ctx.stub)).toEqual([failed[0]]);
});

it("discards an empty reply left waiting by the old cancellation race", async () => {
  const ctx = await setup();
  const result = await ctx.call("event", ctx.event);
  expect(result.ok).toBe(true);
  expect((await api(ctx.stub, "plugin.delete", { id: ctx.first.id })).ok).toBe(true);
  await runInDurableObject(ctx.stub, (_, state) =>
    state.storage.sql.exec("UPDATE inbox SET state='waiting_context' WHERE id=?", result.data.id),
  );
  expect(
    await deliverQueuedReplies(ctx.stub, 2, false, {
      incoming: [
        {
          message_type: 1,
          from_user_id: "owner",
          message_id: 1,
          context_token: "fresh-context",
          item_list: [{ type: 1, text_item: { text: "hello" } }],
        },
      ],
    }),
  ).toEqual([]);
  await runInDurableObject(ctx.stub, (_, state) =>
    expect(
      state.storage.sql.exec("SELECT state FROM inbox WHERE id=?", result.data.id).one(),
    ).toMatchObject({ state: "done" }),
  );
});

it("waits for a sendable context before freezing the source notice", async () => {
  const ctx = await setup();
  expect((await ctx.call("event", ctx.event)).ok).toBe(true);
  await runInDurableObject(ctx.stub, (_, state) =>
    state.storage.sql.exec(
      "UPDATE settings SET value=json_remove(value, '$.contextToken') WHERE key='connection'",
    ),
  );
  expect(await deliverQueuedReplies(ctx.stub)).toEqual([]);
  await api(ctx.stub, "plugin.activate", { id: ctx.other.id });
  await runInDurableObject(ctx.stub, (_, state) =>
    state.storage.sql.exec(
      "UPDATE settings SET value=json_set(value, '$.contextToken', 'fresh') WHERE key='connection'",
    ),
  );
  const delivered = await deliverQueuedReplies(ctx.stub);
  expect(delivered[0].text).toContain("消息来自 OpenClaw插件。");
});

it("reports a mock failure even when cancellation makes the sender ignore the late result", async () => {
  const ctx = await setup();
  expect((await ctx.call("event", ctx.event)).ok).toBe(true);
  const injected = new Error("Injected mock callback failure");
  await expect(
    deliverQueuedReplies(ctx.stub, 1, false, {
      beforeSendResult: async (instance) => {
        expect(JSON.parse(await instance.api("plugin.delete", { id: ctx.first.id })).ok).toBe(true);
        throw injected;
      },
    }),
  ).rejects.toMatchObject({ name: "AggregateError", cause: injected, errors: [injected] });
});
