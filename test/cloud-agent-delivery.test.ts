import { abortAllDurableObjects, env, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudAgentDelivery } from "../src/server/cloud-agent-delivery";
import { settleCloudAgentTask } from "../src/server/cloud-agent-settlement";
import { CloudAgentStore, type CloudTask } from "../src/server/cloud-agent-store";
import { Wallet } from "../src/server/wallet";
import { publicSiteUrl } from "../src/server/config";
import type { WxMessage } from "../src/server/wechat";
import { wechatHelp } from "../src/shared/guide";
import { wechatLinkKey } from "../src/shared/wechat-links";
import { PLUGIN_PROTOCOL_VERSION } from "../src/shared/plugins";
import {
  connectForManualDelivery,
  deliverQueuedReplies,
  useManualAlarms,
} from "./helpers/wechat-delivery";

type Account = ReturnType<typeof env.ACCOUNTS.getByName>;
const incoming = (id: number, token?: string): WxMessage => ({
  message_type: 1,
  from_user_id: "owner",
  message_id: id,
  ...(token ? { context_token: token } : {}),
  item_list: [{ type: 1, text_item: { text: "/wx help" } }],
});
const accounts: Account[] = [];
const api = async (stub: Account, action: string, body: unknown = {}) => {
  const result = JSON.parse(await stub.api(action, body));
  expect(result.ok).toBe(true);
  return result.data;
};
function inAccount<T>(
  stub: Account,
  run: (storage: DurableObjectStorage, store: CloudAgentStore, delivery: CloudAgentDelivery) => T,
) {
  return runInDurableObject(stub, (_, state) =>
    run(
      state.storage,
      new CloudAgentStore(state.storage),
      new CloudAgentDelivery(state.storage, () => false),
    ),
  );
}
async function setup(
  text = "任务已完成🌱",
  status: "completed" | "failed" | "cancelled" = "completed",
  plainSession = false,
) {
  const stub = env.ACCOUNTS.getByName(crypto.randomUUID());
  accounts.push(stub);
  await stub.applyPayment({
    id: "plus",
    kind: "subscription",
    units: 0,
    expires: Date.now() + 86_400_000,
  });
  await api(stub, "wechat.create", { name: "测试微信" });
  await connectForManualDelivery(stub);
  // Use an existing plugin/session fixture: this slice does not expose the AGT plugin UI.
  const plugin = await api(stub, "plugin.save", {
    pluginId: "wechatai/openclaw",
    name: "测试助手",
    shortcut: "work",
  });
  await api(stub, "plugin.activate", { id: plugin.id });
  const model = plainSession
    ? await api(stub, "assistant.save", {
        name: "测试模型",
        model: "test-model",
        protocol: "chat-completions",
        baseUrl: "https://llm.example.com",
        apiKey: "test-key",
      })
    : null;
  if (model) await api(stub, "assistant.activate", { id: model.id });
  const session = (await stub.snapshot()).currentSession!;
  const task = await inAccount(stub, async (storage, store) => {
    const saved = JSON.parse(
      storage.sql.exec<{ data: string }>("SELECT data FROM sessions WHERE id=?", session.id).one()
        .data,
    );
    const id = crypto.randomUUID();
    const now = Date.now();
    const task: CloudTask = {
      id,
      sourceId: crypto.randomUUID(),
      origin: "https://agt.example.com",
      appId: "app-one",
      tenantId: "tenant-one",
      profileId: "profile-v1",
      model: "test-model",
      workspaceName: "workspace-one",
      callbackVersion: "v1",
      callbackOrigin: "https://wechatai.example.com",
      invocation: {
        protocolVersion: PLUGIN_PROTOCOL_VERSION,
        runId: id,
        instanceId: plugin.id,
        pluginId: "wechatai/cloud-agent",
        pluginVersion: "1.0.0",
        sessionId: session.id,
        messages: [{ role: "user", content: [{ type: "text", text: "执行任务" }] }],
        limits: { inputTokens: 1000, outputTokens: 16_000, outputImages: 0, creditUnits: null },
      },
      request: "",
      submittedAt: now,
      outcome: { id: "job-one", workspaceId: "workspace-one", status, text },
      reconcileCursor: "",
      reconcileCandidates: [],
      hidden: 0,
      deliveryStatus: "pending",
      pluginContext: saved.pluginInstanceId ?? null,
      currentSessionId: session.id,
      pluginId: plugin.id,
      pluginName: plugin.name,
      sessionId: session.id,
      connectionId: "default",
      generation: "g1",
      contextStart: saved.contextStart,
      resetAt: saved.resetAt,
      conversationId: "conversation-one",
      prompt: "执行任务",
      idempotencyKey: crypto.randomUUID(),
      state: "accepted",
      upstreamStatus: status,
      jobId: "job-one",
      createdAt: now,
      updatedAt: now,
      deadline: now + 600_000,
      nextAt: now,
      attempts: 0,
      stopRequested: 0,
      settled: 0,
      stale: 0,
      delivered: 0,
      result: "",
      error: "",
      units: 0,
      frozen: "",
      unconfirmed: 0,
    };
    store.save(task);
    return (await settleCloudAgentTask(storage, id, () => false))!;
  });
  return { stub, task, plugin, model, inboxId: `cloud:${task.id}` };
}
afterEach(async () => {
  for (const stub of accounts.splice(0))
    await runInDurableObject(env.ACCOUNTS.get(stub.id), (_, state) => state.storage.deleteAlarm());
  vi.restoreAllMocks();
});

describe("durable AGT reply delivery", () => {
  it.each(["wechat.disconnect", "wechat.delete", "wechat.bind"])(
    "%s stops only the old connection's tasks and prevents late delivery after restart",
    async (action) => {
      const { stub, task, inboxId, model } = await setup("保留的云端结果", "completed", true);
      const otherLink = await api(stub, "wechat.create", { name: "其他微信" });
      const otherSession = await api(stub, "session.create", {
        assistantId: model!.id,
        connectionId: otherLink.selectedConnectionId,
      });
      const before = await inAccount(stub, (storage, store, delivery) => {
        delivery.sync(task.id);
        storage.sql.exec("UPDATE inbox SET state='waiting_context' WHERE id=?", inboxId);
        const id = crypto.randomUUID();
        const active: CloudTask = {
          ...task,
          id,
          sourceId: id,
          idempotencyKey: id,
          jobId: `job-${id}`,
          state: "accepted",
          outcome: null,
          result: "",
          frozen: "",
          settled: 0,
          units: 0,
          delivered: 0,
          deliveryQueuedAt: undefined,
          request: "frozen-submit-request",
          invocation: { ...task.invocation!, runId: id },
          nextAt: Date.now() + 60_000,
        };
        const otherId = crypto.randomUUID();
        const unrelated: CloudTask = {
          ...active,
          id: otherId,
          sourceId: otherId,
          idempotencyKey: otherId,
          jobId: `job-${otherId}`,
          sessionId: otherSession.id,
          currentSessionId: otherSession.id,
          connectionId: otherSession.connectionId,
          contextStart: otherSession.contextStart,
          resetAt: otherSession.resetAt,
          invocation: { ...active.invocation!, runId: otherId, sessionId: otherSession.id },
        };
        store.save(active);
        store.save(unrelated);
        return {
          active,
          unrelated,
          balance: new Wallet(storage).balance(),
          ledger: storage.sql.exec("SELECT * FROM credit_ledger").toArray(),
          messages: storage.sql.exec("SELECT * FROM messages").toArray(),
          sessions: storage.sql.exec("SELECT * FROM sessions").toArray(),
        };
      });
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async () =>
          Response.json({ qrcode: "new-qr", qrcode_img_content: "https://qr.example.com/new" }),
        );
      await api(stub, action, { id: task.connectionId });
      expect(fetch).toHaveBeenCalledTimes(action === "wechat.bind" ? 1 : 0);
      fetch.mockRestore();
      expect(
        (await stub.snapshot()).connections.find((c) => c.id === task.connectionId)?.error,
      ).toBeUndefined();
      await inAccount(stub, (storage, store) => {
        expect(store.get(before.active.id)).toMatchObject({
          stopRequested: 1,
          stale: 1,
          hidden: 0,
          prompt: before.active.prompt,
          request: before.active.request,
          invocation: before.active.invocation,
        });
        expect(store.get(before.active.id)!.nextAt).toBeLessThan(before.active.nextAt);
        expect(store.get(task.id)).toMatchObject({
          stale: 1,
          delivered: 1,
          deliveryStatus: "stale",
          result: task.result,
          frozen: task.frozen,
          units: task.units,
          settled: 1,
        });
        expect(store.get(before.unrelated.id)).toEqual(before.unrelated);
        expect(
          storage.sql.exec("SELECT state,reply,payload FROM inbox WHERE id=?", inboxId).one(),
        ).toEqual({ state: "done", reply: "", payload: "{}" });
        expect(new Wallet(storage).balance()).toBe(before.balance);
        expect(storage.sql.exec("SELECT * FROM credit_ledger").toArray()).toEqual(before.ledger);
        expect(storage.sql.exec("SELECT * FROM messages").toArray()).toEqual(before.messages);
        expect(storage.sql.exec("SELECT * FROM sessions").toArray()).toEqual(before.sessions);
      });
      // Even restoring the old credentials/generation cannot revive old work.
      if (action !== "wechat.delete") await connectForManualDelivery(stub);
      await abortAllDurableObjects();
      const restored = env.ACCOUNTS.get(stub.id);
      await runInDurableObject(restored, (_, state) => useManualAlarms(state));
      await inAccount(restored, async (storage, store, delivery) => {
        store.patch(before.active, {
          outcome: { ...task.outcome!, id: before.active.jobId, text: "迟到的云端结果" },
        });
        expect(await settleCloudAgentTask(storage, before.active.id, () => false)).toMatchObject({
          state: "completed",
          stopRequested: 1,
          stale: 1,
          delivered: 1,
          deliveryStatus: "stale",
          result: "迟到的云端结果",
          settled: 1,
        });
        const balance = new Wallet(storage).balance();
        await settleCloudAgentTask(storage, before.active.id, () => false);
        expect(new Wallet(storage).balance()).toBe(balance);
        expect(
          storage.sql
            .exec("SELECT * FROM credit_ledger WHERE id=?", `usage:${before.active.id}`)
            .toArray(),
        ).toHaveLength(1);
        expect(storage.sql.exec("SELECT * FROM messages").toArray()).toEqual(before.messages);
        expect(delivery.sync(before.active.id)!.deliveryStatus).toBe("stale");
        expect(store.get(before.unrelated.id)).toEqual(before.unrelated);
      });
      expect(await deliverQueuedReplies(restored)).toEqual([]);
    },
  );

  it.each(["validation", "qr"])(
    "handles a failed rebind at %s without confusing old task eligibility",
    async (failure) => {
      const { stub, task, inboxId } = await setup("保留结果", "completed", failure === "qr");
      const queued = await inAccount(stub, (_, _store, delivery) => delivery.sync(task.id));
      const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("QR unavailable"));
      expect(JSON.parse(await stub.api("wechat.bind", { id: task.connectionId })).ok).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(failure === "qr" ? 1 : 0);
      await inAccount(stub, (storage, store) => {
        if (failure === "validation") expect(store.get(task.id)).toEqual(queued);
        else
          expect(store.get(task.id)).toMatchObject({
            stale: 1,
            delivered: 1,
            deliveryStatus: "stale",
          });
        expect(storage.sql.exec("SELECT state,reply FROM inbox WHERE id=?", inboxId).one()).toEqual(
          failure === "validation"
            ? { state: "reply", reply: task.result }
            : { state: "done", reply: "" },
        );
      });
    },
  );

  it.each([true, false])(
    "does not acknowledge or resume a reply disconnected during send (failure %s)",
    async (fail) => {
      const { stub, task, inboxId } = await setup("长答案🌱".repeat(600));
      await inAccount(stub, (_, _store, delivery) => delivery.sync(task.id));
      expect(
        await deliverQueuedReplies(stub, 1, fail, {
          beforeSendResult: async (instance) => {
            expect(
              JSON.parse(await instance.api("wechat.disconnect", { id: task.connectionId })).ok,
            ).toBe(true);
          },
        }),
      ).toHaveLength(1);
      await connectForManualDelivery(stub);
      expect(await deliverQueuedReplies(stub)).toEqual([]);
      await inAccount(stub, (storage, store) => {
        expect(store.get(task.id)).toMatchObject({
          stale: 1,
          delivered: 1,
          deliveryStatus: "stale",
        });
        expect(
          storage.sql.exec("SELECT state,part,reply FROM inbox WHERE id=?", inboxId).one(),
        ).toEqual({ state: "done", part: 0, reply: "" });
      });
    },
  );

  it.each(["same", "other"])(
    "keeps recovery guidance scoped to remaining replies on the %s link",
    async (link) => {
      const { stub, task, plugin } = await setup();
      await inAccount(stub, (_, _store, delivery) => delivery.sync(task.id));
      expect(await deliverQueuedReplies(stub, 5, true)).toHaveLength(5);
      let connectionId = task.connectionId;
      if (link === "other") {
        const snapshot = await api(stub, "wechat.create", { name: "另一个微信" });
        connectionId = snapshot.selectedConnectionId;
        await inAccount(stub, (storage) => {
          storage.sql.exec(
            "UPDATE settings SET value=(SELECT value FROM settings WHERE key='connection') WHERE key=?",
            wechatLinkKey(connectionId, "connection"),
          );
        });
      }
      const session = await api(stub, "session.create", {
        pluginInstanceId: plugin.id,
        connectionId,
      });
      await inAccount(stub, (storage, store, delivery) => {
        const id = crypto.randomUUID();
        store.save({
          ...task,
          id,
          sourceId: crypto.randomUUID(),
          idempotencyKey: crypto.randomUUID(),
          jobId: `job-${id}`,
          sessionId: session.id,
          currentSessionId: session.id,
          connectionId,
          invocation: { ...task.invocation!, runId: id, sessionId: session.id },
        });
        delivery.sync(id);
        storage.sql.exec("UPDATE inbox SET state='waiting_context' WHERE id=?", `cloud:${id}`);
      });
      await api(stub, "session.action", { id: task.sessionId, action: "reset" });
      const snapshot = await stub.snapshot();
      expect(snapshot.connection.error).toContain("/wx help");
      expect(snapshot.connections.find((c) => c.id === task.connectionId)?.error).toBe(
        link === "same" ? snapshot.connection.error : undefined,
      );
      expect(snapshot.connections.find((c) => c.id === connectionId)?.error).toContain("/wx help");
      await api(stub, "session.action", { id: session.id, action: "reset" });
      expect((await stub.snapshot()).connections.every((c) => c.error === undefined)).toBe(true);
    },
  );

  it.each(["connected", "expired"])(
    "preserves a genuine %s connection error when waiting replies are cancelled",
    async (status) => {
      const { stub, task } = await setup();
      await inAccount(stub, (_, _store, delivery) => delivery.sync(task.id));
      expect(await deliverQueuedReplies(stub, 5, true)).toHaveLength(5);
      const error =
        status === "expired" ? "微信连接已过期，请重新扫码" : "连接暂时中断，正在自动重试";
      await inAccount(stub, (storage) => {
        storage.sql.exec(
          "UPDATE settings SET value=json_set(value,'$.status',?,'$.error',?) WHERE key='connection'",
          status,
          error,
        );
      });
      expect((await stub.snapshot()).connection.error).toBe(error);
      await api(stub, "session.action", { id: task.sessionId, action: "reset" });
      const snapshot = await stub.snapshot();
      expect(snapshot.connection).toMatchObject({ status, error });
      expect(snapshot.connections.find((c) => c.id === task.connectionId)?.error).toBe(error);
    },
  );

  it.each(["reset", "archive"])(
    "persists %s cancellation without erasing history or delivering after restoration",
    async (action) => {
      const { stub, task, inboxId } = await setup();
      await inAccount(stub, (_, _store, delivery) => delivery.sync(task.id));
      expect(await deliverQueuedReplies(stub, 5, true)).toHaveLength(5);
      expect((await stub.snapshot()).connection.error).toContain("/wx help");
      const before = await inAccount(stub, (storage, store) => {
        const id = crypto.randomUUID();
        const active: CloudTask = {
          ...task,
          id,
          sourceId: crypto.randomUUID(),
          idempotencyKey: crypto.randomUUID(),
          jobId: `job-${id}`,
          state: "accepted",
          outcome: null,
          result: "",
          frozen: "",
          settled: 0,
          units: 0,
          delivered: 0,
          deliveryQueuedAt: undefined,
          request: "frozen-submit-request",
          invocation: { ...task.invocation!, runId: id },
          nextAt: Date.now() + 60_000,
        };
        const otherId = crypto.randomUUID();
        const unrelated = {
          ...active,
          id: otherId,
          sourceId: crypto.randomUUID(),
          jobId: `job-${otherId}`,
          sessionId: "another-session",
        };
        store.save(active);
        store.save(unrelated);
        return {
          active,
          unrelated,
          balance: new Wallet(storage).balance(),
          ledger: storage.sql.exec("SELECT * FROM credit_ledger").toArray(),
          runs: storage.sql.exec("SELECT * FROM runs").toArray(),
        };
      });
      await api(stub, "session.action", { id: task.sessionId, action });
      expect((await stub.snapshot()).connection.error).toBeUndefined();
      await inAccount(stub, (storage, store) => {
        expect(store.get(before.active.id)).toMatchObject({
          state: "accepted",
          stopRequested: 1,
          stale: 1,
          hidden: 0,
          prompt: before.active.prompt,
          request: before.active.request,
          invocation: before.active.invocation,
        });
        expect(store.get(before.active.id)!.nextAt).toBeLessThan(before.active.nextAt);
        expect(store.get(task.id)).toMatchObject({
          stale: 1,
          delivered: 1,
          deliveryStatus: "stale",
          result: task.result,
          frozen: task.frozen,
          units: task.units,
          settled: 1,
        });
        expect(store.get(before.unrelated.id)).toEqual(before.unrelated);
        expect(
          storage.sql.exec("SELECT state,reply,payload FROM inbox WHERE id=?", inboxId).one(),
        ).toEqual({ state: "done", reply: "", payload: "{}" });
        expect(new Wallet(storage).balance()).toBe(before.balance);
        expect(storage.sql.exec("SELECT * FROM credit_ledger").toArray()).toEqual(before.ledger);
        expect(storage.sql.exec("SELECT * FROM runs").toArray()).toEqual(before.runs);
      });
      if (action === "archive") {
        await api(stub, "session.action", { id: task.sessionId, action: "restore" });
        await api(stub, "session.action", { id: task.sessionId, action: "switch" });
      }
      await abortAllDurableObjects();
      const restored = env.ACCOUNTS.get(stub.id);
      await runInDurableObject(restored, (_, state) => useManualAlarms(state));
      expect((await restored.snapshot()).connection.error).toBeUndefined();
      await inAccount(restored, async (storage, store, delivery) => {
        const messages = storage.sql.exec("SELECT * FROM messages").toArray();
        // Cancellation can lose a race to a valid completion. Retain and settle
        // that result once, but never resume automatic delivery after restoration.
        store.patch(before.active, {
          outcome: { ...task.outcome!, id: before.active.jobId, text: "late-cloud-answer" },
        });
        const completed = await settleCloudAgentTask(storage, before.active.id, () => false);
        expect(completed).toMatchObject({
          state: "completed",
          stopRequested: 1,
          stale: 1,
          hidden: 0,
          delivered: 1,
          deliveryStatus: "stale",
          result: "late-cloud-answer",
          settled: 1,
        });
        const balance = new Wallet(storage).balance();
        await settleCloudAgentTask(storage, before.active.id, () => false);
        expect(new Wallet(storage).balance()).toBe(balance);
        expect(
          storage.sql
            .exec("SELECT * FROM credit_ledger WHERE id=?", `usage:${before.active.id}`)
            .toArray(),
        ).toHaveLength(1);
        expect(storage.sql.exec("SELECT * FROM messages").toArray()).toEqual(messages);
        expect(delivery.sync(before.active.id)!.deliveryStatus).toBe("stale");
      });
      expect(await deliverQueuedReplies(restored)).toEqual([]);
    },
  );

  it("keeps cloud work and queued replies when archiving is rejected", async () => {
    const { stub, task, inboxId } = await setup();
    const queued = await inAccount(stub, (_, _store, delivery) => delivery.sync(task.id));
    await runInDurableObject(stub, async (instance) => {
      const settings = Reflect.get(instance, "env");
      const previous = settings.PLUS_SESSIONS;
      settings.PLUS_SESSIONS = "1";
      try {
        expect(
          JSON.parse(
            await instance.api("session.action", {
              id: task.sessionId,
              action: "archive",
            }),
          ),
        ).toMatchObject({ ok: false, error: "session_limit" });
      } finally {
        settings.PLUS_SESSIONS = previous;
      }
    });
    await inAccount(stub, (storage, store) => {
      expect(store.get(task.id)).toEqual(queued);
      expect(storage.sql.exec("SELECT state,reply FROM inbox WHERE id=?", inboxId).one()).toEqual({
        state: "reply",
        reply: task.result,
      });
    });
  });

  it.each(["clear", "delete", "privacy.clear", "assistant.delete", "channel.delete"])(
    "erases cloud content through %s without changing bills or restoring late results",
    async (action) => {
      const deletingModel = action === "assistant.delete" || action === "channel.delete";
      const { stub, task, inboxId, model } = await setup(
        "private-cloud-answer",
        "completed",
        deletingModel,
      );
      await inAccount(stub, (_, _store, delivery) => delivery.sync(task.id));
      expect(await deliverQueuedReplies(stub, 5, true)).toHaveLength(5);
      expect((await stub.snapshot()).connection.error).toContain("/wx help");
      const before = await inAccount(stub, async (storage, store) => {
        const pending = (sessionId = task.sessionId): CloudTask => {
          const id = crypto.randomUUID();
          return {
            ...task,
            id,
            sourceId: crypto.randomUUID(),
            idempotencyKey: crypto.randomUUID(),
            jobId: `job-${id}`,
            sessionId,
            state: "accepted",
            delivered: 0,
            settled: 0,
            units: 0,
            result: "",
            frozen: "",
            prompt: "private-cloud-prompt",
            request: "private-encrypted-request",
            invocation: { ...task.invocation!, runId: id, sessionId },
            outcome: { ...task.outcome!, id: `job-${id}` },
          };
        };
        const stale = pending();
        store.save(stale);
        await settleCloudAgentTask(storage, stale.id, () => true);
        expect(storage.sql.exec("SELECT sessionId FROM runs WHERE id=?", stale.id).one()).toEqual({
          sessionId: null,
        });
        const active = { ...pending(), outcome: null };
        const unrelated = { ...pending(crypto.randomUUID()), outcome: null };
        store.save(active);
        store.save(unrelated);
        return {
          active,
          unrelated,
          ids: [task.id, stale.id, active.id],
          balance: new Wallet(storage).balance(),
          ledger: storage.sql.exec("SELECT * FROM credit_ledger").toArray(),
          usage: storage.sql.exec("SELECT * FROM usage").toArray(),
          metering: storage.sql.exec("SELECT * FROM platform_metering").toArray(),
        };
      });
      if (action === "privacy.clear") await api(stub, action);
      else if (deletingModel)
        await api(stub, action, { id: action === "assistant.delete" ? model.id : model.channelId });
      else await api(stub, "session.action", { id: task.sessionId, action });
      expect((await stub.snapshot()).connection.error).toBeUndefined();
      expect(await deliverQueuedReplies(stub)).toEqual([]);
      await inAccount(stub, async (storage, store, delivery) => {
        const ids = action === "privacy.clear" ? [...before.ids, before.unrelated.id] : before.ids;
        for (const id of ids) {
          expect(store.get(id)).toMatchObject({
            hidden: 1,
            stale: 1,
            delivered: 1,
            deliveryStatus: "stale",
            prompt: "",
            result: "",
            error: "",
            stopReason: "",
            frozen: "",
            request: "",
            invocation: null,
            outcome: null,
          });
          expect(storage.sql.exec("SELECT id FROM runs WHERE id=?", id).toArray()).toEqual([]);
          expect(delivery.pending(id, 0)).toBe(false);
        }
        if (action !== "privacy.clear")
          expect(store.get(before.unrelated.id)).toEqual(before.unrelated);
        expect(store.get(before.active.id)).toMatchObject({
          stopRequested: 1,
          settled: 0,
          units: 0,
        });
        expect(store.get(task.id)).toMatchObject({ settled: 1, units: task.units });
        expect(
          storage.sql.exec("SELECT state,reply,payload FROM inbox WHERE id=?", inboxId).one(),
        ).toEqual({
          state: "done",
          reply: "",
          payload: "{}",
        });
        // An in-flight poll/preparation may still hold a snapshot from before erasure.
        store.patch(before.active, {
          outcome: { ...task.outcome!, id: before.active.jobId, text: "private-late-answer" },
          prompt: "private-late-prompt",
          result: "private-late-answer",
          frozen: task.frozen,
        });
        await settleCloudAgentTask(storage, before.active.id, () => false);
        expect(JSON.stringify(store.get(before.active.id))).not.toContain("private");
        expect(delivery.sync(before.active.id)!.deliveryStatus).toBe("stale");
        expect(new Wallet(storage).balance()).toBe(before.balance);
        expect(storage.sql.exec("SELECT * FROM credit_ledger").toArray()).toEqual(before.ledger);
        expect(storage.sql.exec("SELECT * FROM usage").toArray()).toEqual(before.usage);
        expect(storage.sql.exec("SELECT * FROM platform_metering").toArray()).toEqual(
          before.metering,
        );
      });
      expect(await deliverQueuedReplies(stub)).toEqual([]);
    },
  );

  it("ignores active tasks and cancels an orphan reply without sending fallback text", async () => {
    const { stub, task, inboxId } = await setup();
    await inAccount(stub, (storage, store, delivery) => {
      store.patch(task, { state: "accepted" });
      expect(delivery.sync(task.id)).toBeNull();
      expect(storage.sql.exec("SELECT * FROM inbox WHERE id=?", inboxId).toArray()).toEqual([]);
      store.patch(task, { state: "completed" });
      delivery.sync(task.id);
      store.remove(task.id);
    });
    expect(await deliverQueuedReplies(stub)).toEqual([]);
    await inAccount(stub, (storage) => {
      expect(storage.sql.exec("SELECT state,reply FROM inbox WHERE id=?", inboxId).one()).toEqual({
        state: "done",
        reply: "",
      });
    });
  });

  it.each(["hidden", "stale", "host"])("never queues a %s task", async (reason) => {
    const { stub, task, inboxId } = await setup();
    await inAccount(stub, (storage, store) => {
      if (reason === "hidden") store.hideSession(task.sessionId);
      if (reason === "stale") store.patch(task, { stale: 1 });
      const delivery = new CloudAgentDelivery(storage, () => reason === "host");
      expect(delivery.sync(task.id)).toMatchObject({ delivered: 1, deliveryStatus: "stale" });
      expect(storage.sql.exec("SELECT * FROM inbox WHERE id=?", inboxId).toArray()).toEqual([]);
    });
  });

  it("discards an empty queued reply instead of sending the generic completion message", async () => {
    const { stub, task, inboxId } = await setup();
    await inAccount(stub, (storage, _store, delivery) => {
      delivery.sync(task.id);
      storage.sql.exec("UPDATE inbox SET reply='' WHERE id=?", inboxId);
    });
    expect(await deliverQueuedReplies(stub)).toEqual([]);
    await inAccount(stub, (_, store) =>
      expect(store.get(task.id)).toMatchObject({ deliveryStatus: "failed", delivered: 1 }),
    );
  });

  it("queues once and freezes the body and cursor without changing the bill", async () => {
    const { stub, task, inboxId } = await setup();
    await inAccount(stub, (storage, store, delivery) => {
      const balance = new Wallet(storage).balance();
      expect(delivery.sync(task.id)).toMatchObject({ deliveryStatus: "pending", delivered: 0 });
      const row = storage.sql.exec("SELECT * FROM inbox WHERE id=?", inboxId).one();
      expect(row).toMatchObject({
        state: "reply",
        part: 0,
        attempts: 0,
        sessionId: task.sessionId,
        connectionId: task.connectionId,
        reply: task.result,
      });
      store.patch(task, { result: "不能替换首次入队的正文" });
      storage.sql.exec("UPDATE inbox SET part=1,attempts=2 WHERE id=?", inboxId);
      delivery.sync(task.id);
      expect(
        storage.sql.exec("SELECT reply,part,attempts FROM inbox WHERE id=?", inboxId).one(),
      ).toEqual({ reply: task.result, part: 1, attempts: 2 });
      expect(new Wallet(storage).balance()).toBe(balance);
      expect(storage.sql.exec("SELECT * FROM usage").toArray()).toHaveLength(1);
    });
  });

  it("rolls back inbox creation and its marker together after a storage failure", async () => {
    const { stub, task, inboxId } = await setup();
    await inAccount(stub, (storage, store, delivery) => {
      storage.sql.exec(`CREATE TRIGGER fail_queue BEFORE UPDATE ON cloud_tasks
        WHEN json_extract(NEW.data,'$.deliveryQueuedAt') IS NOT NULL BEGIN SELECT RAISE(ABORT,'test queue failure'); END`);
      expect(() => delivery.sync(task.id)).toThrow("test queue failure");
      expect(storage.sql.exec("SELECT * FROM inbox WHERE id=?", inboxId).toArray()).toEqual([]);
      expect(store.get(task.id)!.deliveryQueuedAt).toBeUndefined();
      storage.sql.exec("DROP TRIGGER fail_queue");
      expect(delivery.sync(task.id)!.deliveryQueuedAt).toBeGreaterThan(0);
    });
  });

  it.each(["missing", "done", "failed"])(
    "never requeues or claims delivery for a %s queued row",
    async (state) => {
      const { stub, task, inboxId } = await setup();
      await inAccount(stub, (storage, store, delivery) => {
        delivery.sync(task.id);
        if (state === "missing") storage.sql.exec("DELETE FROM inbox WHERE id=?", inboxId);
        else storage.sql.exec("UPDATE inbox SET state=?,reply='' WHERE id=?", state, inboxId);
        expect(delivery.sync(task.id)).toMatchObject({ delivered: 1, deliveryStatus: "failed" });
        delivery.sync(task.id);
        expect(store.get(task.id)!.deliveryStatus).toBe("failed");
        expect(storage.sql.exec("SELECT * FROM inbox WHERE state='reply'").toArray()).toEqual([]);
      });
    },
  );

  it("tolerates a changed part cursor and atomically rolls back a failed receipt", async () => {
    const { stub, task, inboxId } = await setup();
    await inAccount(stub, (storage, store, delivery) => {
      delivery.sync(task.id);
      storage.sql.exec("UPDATE inbox SET part=1 WHERE id=?", inboxId);
      expect(delivery.pending(task.id, 0)).toBe(false);
      expect(storage.sql.exec("SELECT state,part FROM inbox WHERE id=?", inboxId).one()).toEqual({
        state: "reply",
        part: 1,
      });
      storage.sql.exec(`CREATE TRIGGER fail_receipt BEFORE UPDATE ON cloud_tasks
        WHEN NEW.delivered=1 BEGIN SELECT RAISE(ABORT,'test receipt failure'); END`);
      expect(() => delivery.acknowledge(task.id, 1)).toThrow("test receipt failure");
      expect(storage.sql.exec("SELECT state FROM inbox WHERE id=?", inboxId).one()).toEqual({
        state: "reply",
      });
      expect(store.get(task.id)!.delivered).toBe(0);
      storage.sql.exec("DROP TRIGGER fail_receipt");
      expect(delivery.acknowledge(task.id, 1)).toBe(true);
      expect(delivery.acknowledge(task.id, 1)).toBe(false);
      expect(store.get(task.id)).toMatchObject({ delivered: 1, deliveryStatus: "sent", nextAt: 0 });
    });
  });

  it.each(["failed", "cancelled"] as const)(
    "delivers the %s explanation without creating a bill or successful-answer metrics",
    async (status) => {
      const { stub, task } = await setup("保留的执行信息", status);
      await inAccount(stub, (_, _store, delivery) => delivery.sync(task.id));
      const messages = await deliverQueuedReplies(stub);
      expect(messages).toHaveLength(1);
      expect(messages[0].text).toBe(`${task.error}\n\n${task.result}`);
      expect(messages[0].text).toContain("本次未扣 credits");
      await inAccount(stub, (storage, store) => {
        expect(store.get(task.id)).toMatchObject({
          delivered: 1,
          deliveryStatus: "sent",
          units: 0,
        });
        expect(storage.sql.exec("SELECT * FROM usage").toArray()).toEqual([]);
        expect(
          storage.sql.exec("SELECT * FROM settings WHERE key='deliveredWechatReplies'").toArray(),
        ).toEqual([]);
      });
    },
  );

  it("retries multipart delivery across eviction with identical IDs and no rebilling", async () => {
    const { stub, task } = await setup("任务进展🌱".repeat(650));
    await inAccount(stub, (_, _store, delivery) => delivery.sync(task.id));
    const balance = (await stub.snapshot()).wallet.balance;
    const failed = await deliverQueuedReplies(stub, 1, true);
    expect(failed).toHaveLength(1);
    expect(await deliverQueuedReplies(stub)).toEqual(failed);
    await inAccount(stub, (_, store) => expect(store.get(task.id)!.delivered).toBe(0));
    await abortAllDurableObjects();
    const restored = env.ACCOUNTS.get(stub.id);
    await runInDurableObject(restored, (_, state) => useManualAlarms(state));
    const rest = await deliverQueuedReplies(restored, 10);
    const delivered = [...failed, ...rest];
    expect(delivered.map((part) => part.text).join("")).toBe(task.result);
    expect(new Set(delivered.map((part) => part.id)).size).toBe(delivered.length);
    expect(await deliverQueuedReplies(restored)).toEqual([]);
    expect((await restored.snapshot()).wallet.balance).toBe(balance);
    await inAccount(restored, (storage, store) => {
      expect(store.get(task.id)).toMatchObject({ delivered: 1, deliveryStatus: "sent", nextAt: 0 });
      expect(
        storage.sql.exec("SELECT value FROM settings WHERE key='deliveredWechatReplies'").one(),
      ).toEqual({ value: "1" });
      expect(storage.sql.exec("SELECT * FROM usage").toArray()).toHaveLength(1);
    });
  });

  it.each(["reset", "clear", "delete", "archive", "switch", "disable", "generation"])(
    "discards a queued reply after %s before sending",
    async (change) => {
      const { stub, task, inboxId, plugin } = await setup();
      await inAccount(stub, (_, _store, delivery) => delivery.sync(task.id));
      if (["reset", "clear", "delete", "archive"].includes(change))
        await api(stub, "session.action", { id: task.sessionId, action: change });
      else
        await inAccount(stub, (storage) => {
          if (change === "switch")
            storage.sql.exec("UPDATE settings SET value='\"another-session\"' WHERE key='current'");
          if (change === "disable")
            storage.sql.exec(
              "UPDATE plugins SET data=json_set(data,'$.enabled',0) WHERE id=?",
              plugin.id,
            );
          if (change === "generation")
            storage.sql.exec(
              "UPDATE settings SET value=json_set(value,'$.generation','new-generation') WHERE key='connection'",
            );
        });
      expect(await deliverQueuedReplies(stub)).toEqual([]);
      await inAccount(stub, (storage, store, delivery) => {
        delivery.sync(task.id);
        expect(store.get(task.id)).toMatchObject({ delivered: 1, deliveryStatus: "stale" });
        expect(storage.sql.exec("SELECT reply FROM inbox WHERE id=?", inboxId).one()).toEqual({
          reply: "",
        });
      });
    },
  );

  it.each([true, false])(
    "does not revive a cleared task when an in-flight send returns (failure %s)",
    async (fail) => {
      const { stub, task, inboxId } = await setup("长答案🌱".repeat(600));
      await inAccount(stub, (_, _store, delivery) => delivery.sync(task.id));
      expect(
        await deliverQueuedReplies(stub, 1, fail, {
          beforeSendResult: async (instance) => {
            const result = JSON.parse(
              await instance.api("session.action", { id: task.sessionId, action: "clear" }),
            );
            expect(result.ok).toBe(true);
          },
        }),
      ).toHaveLength(1);
      expect(await deliverQueuedReplies(stub)).toEqual([]);
      await inAccount(stub, (storage, store, delivery) => {
        delivery.sync(task.id);
        expect(store.get(task.id)).toMatchObject({ delivered: 1, deliveryStatus: "stale" });
        expect(
          storage.sql.exec("SELECT state,reply,part FROM inbox WHERE id=?", inboxId).one(),
        ).toMatchObject({ state: "done", reply: "", part: 0 });
      });
    },
  );

  it.each(["completed", "failed", "cancelled"] as const)(
    "resumes the %s reply via the suggested platform command without another task or charge",
    async (status) => {
      const { stub, task, inboxId, plugin } = await setup("任务执行信息", status);
      await api(stub, "plugin.clawToken", { id: plugin.id });
      const help = wechatHelp(publicSiteUrl(env));
      const helpSteps = 1 + Math.ceil(Array.from(help).length / 1500);
      await inAccount(stub, (_, _store, delivery) => delivery.sync(task.id));
      const balance = (await stub.snapshot()).wallet.balance;
      const failures = await deliverQueuedReplies(stub, 5, true);
      expect(failures).toHaveLength(5);
      expect(new Set(failures.map((part) => part.id)).size).toBe(1);
      await inAccount(stub, (storage, store, delivery) => {
        delivery.sync(task.id);
        expect(store.get(task.id)).toMatchObject({
          state: status,
          delivered: 0,
          deliveryStatus: "pending",
          units: task.units,
          result: task.result,
          frozen: task.frozen,
        });
        expect(
          storage.sql.exec("SELECT state,reply,part,attempts FROM inbox WHERE id=?", inboxId).one(),
        ).toEqual({ state: "waiting_context", reply: failures[0].text, part: 0, attempts: 5 });
        expect(new Wallet(storage).balance()).toBe(balance * 1000);
      });
      expect(await deliverQueuedReplies(stub)).toEqual([]);
      expect(await deliverQueuedReplies(stub, 1, false, { incoming: [incoming(1)] })).toEqual([]);
      const hint = (await stub.snapshot()).connection.error;
      expect(hint).toContain("/wx help");
      expect(hint).toContain("不消耗 credits");
      expect(hint).toContain("无需重新提交任务");
      expect((await deliverQueuedReplies(stub, helpSteps)).map((part) => part.text).join("")).toBe(
        help,
      );
      // Handling a command without a new context must leave the cloud reply parked.
      await inAccount(stub, (storage) =>
        expect(storage.sql.exec("SELECT state FROM inbox WHERE id=?", inboxId).one()).toEqual({
          state: "waiting_context",
        }),
      );
      expect(
        await deliverQueuedReplies(stub, 1, false, { incoming: [incoming(2, "fresh-context")] }),
      ).toEqual([]);
      expect((await stub.snapshot()).connection.error).toBeUndefined();
      expect(await deliverQueuedReplies(stub)).toEqual([failures[0]]);
      // Process and send the recovery command too; do not skip the new inbox row.
      expect((await deliverQueuedReplies(stub, helpSteps)).map((part) => part.text).join("")).toBe(
        help,
      );
      expect(await deliverQueuedReplies(stub)).toEqual([]);
      await inAccount(stub, (storage, store) => {
        expect(store.get(task.id)).toMatchObject({
          state: status,
          delivered: 1,
          deliveryStatus: "sent",
          units: task.units,
        });
        expect(new Wallet(storage).balance()).toBe(balance * 1000);
        expect(storage.sql.exec("SELECT id FROM cloud_tasks").toArray()).toEqual([{ id: task.id }]);
        expect(storage.sql.exec("SELECT id FROM claw_jobs").toArray()).toEqual([]);
        expect(storage.sql.exec("SELECT id FROM inbox WHERE state!='done'").toArray()).toEqual([]);
        const commands = storage.sql
          .exec<{ sessionId: string | null; response: string }>(
            "SELECT sessionId,response FROM runs WHERE id IN ('bot:owner:1','bot:owner:2')",
          )
          .toArray();
        expect(commands).toHaveLength(2);
        for (const command of commands) {
          expect(command.sessionId).toBeNull();
          expect(JSON.parse(command.response)).toEqual({ text: help, cost: 0 });
        }
        expect(storage.sql.exec("SELECT * FROM usage").toArray()).toHaveLength(
          status === "completed" ? 1 : 0,
        );
        const metrics = storage.sql
          .exec<{ value: string }>("SELECT value FROM settings WHERE key='deliveredWechatReplies'")
          .toArray();
        expect(metrics).toEqual(status === "completed" ? [{ value: "1" }] : []);
      });
    },
  );

  it("preserves the failed multipart cursor across eviction and resumes only the remaining parts", async () => {
    const { stub, task, inboxId } = await setup("任务进展🌱".repeat(650));
    await inAccount(stub, (_, _store, delivery) => delivery.sync(task.id));
    const balance = (await stub.snapshot()).wallet.balance;
    const first = await deliverQueuedReplies(stub);
    const failures = await deliverQueuedReplies(stub, 5, true);
    expect(first).toHaveLength(1);
    expect(failures).toHaveLength(5);
    expect(failures[0].id).toBe(`${inboxId}:1`);
    await abortAllDurableObjects();
    const restored = env.ACCOUNTS.get(stub.id);
    await runInDurableObject(restored, (_, state) => useManualAlarms(state));
    await inAccount(restored, (storage, store, delivery) => {
      delivery.sync(task.id);
      expect(
        storage.sql.exec("SELECT state,part,attempts FROM inbox WHERE id=?", inboxId).one(),
      ).toEqual({ state: "waiting_context", part: 1, attempts: 5 });
      expect(store.get(task.id)).toMatchObject({
        delivered: 0,
        deliveryStatus: "pending",
        frozen: task.frozen,
      });
    });
    expect(
      await deliverQueuedReplies(restored, 1, false, { incoming: [incoming(1, "fresh-context")] }),
    ).toEqual([]);
    const remaining = await deliverQueuedReplies(
      restored,
      Math.ceil(Array.from(task.result).length / 1500) - 1,
    );
    expect(remaining[0]).toEqual(failures[0]);
    expect([...first, ...remaining].map((part) => part.text).join("")).toBe(task.result);
    expect((await restored.snapshot()).wallet.balance).toBe(balance);
    await inAccount(restored, (storage, store) => {
      expect(store.get(task.id)).toMatchObject({ delivered: 1, deliveryStatus: "sent" });
      expect(storage.sql.exec("SELECT * FROM usage").toArray()).toHaveLength(1);
      expect(
        storage.sql.exec("SELECT value FROM settings WHERE key='deliveredWechatReplies'").one(),
      ).toEqual({ value: "1" });
    });
  });

  it("waits immediately when context is missing and resumes after a user message", async () => {
    const { stub, task, inboxId } = await setup();
    await inAccount(stub, (storage, _store, delivery) => {
      delivery.sync(task.id);
      storage.sql.exec(
        "UPDATE settings SET value=json_remove(value,'$.contextToken') WHERE key='connection'",
      );
    });
    expect(await deliverQueuedReplies(stub)).toEqual([]);
    const hint = (await stub.snapshot()).connection.error;
    expect(hint).toContain("/wx help");
    expect(hint).toContain("不消耗 credits");
    expect(hint).toContain("无需重新提交任务");
    await inAccount(stub, (storage, store) => {
      expect(
        storage.sql.exec("SELECT state,attempts FROM inbox WHERE id=?", inboxId).one(),
      ).toEqual({ state: "waiting_context", attempts: 1 });
      expect(store.get(task.id)).toMatchObject({ delivered: 0, deliveryStatus: "pending" });
    });
    await deliverQueuedReplies(stub, 1, false, { incoming: [incoming(1, "fresh-context")] });
    expect(await deliverQueuedReplies(stub)).toEqual([{ id: `${inboxId}:0`, text: task.result }]);
  });

  it("does not lose a fresh-context wakeup received during the final failed send", async () => {
    const { stub, task, inboxId } = await setup();
    await inAccount(stub, (storage, _store, delivery) => {
      delivery.sync(task.id);
      storage.sql.exec("UPDATE inbox SET attempts=4 WHERE id=?", inboxId);
    });
    expect(
      await deliverQueuedReplies(stub, 1, true, {
        beforeSendResult: async (instance) => {
          // Exercise the same ingestion called by fallback polls and receiver RPCs.
          Reflect.get(instance, "ingestWechat").call(
            instance,
            "default",
            "g1",
            "",
            { msgs: [incoming(1, "fresh-context")] },
            {
              token: "test",
              baseUrl: "https://ilinkai.weixin.qq.com",
              userId: "owner",
              botId: "bot",
            },
          );
        },
      }),
    ).toHaveLength(1);
    await inAccount(stub, (storage) =>
      expect(
        storage.sql.exec("SELECT state,attempts FROM inbox WHERE id=?", inboxId).one(),
      ).toEqual({ state: "reply", attempts: 0 }),
    );
    expect(await deliverQueuedReplies(stub)).toEqual([{ id: `${inboxId}:0`, text: task.result }]);
  });

  it.each(["clear", "delete", "reset", "switch", "disable", "generation"])(
    "does not revive a waiting reply after %s",
    async (action) => {
      const { stub, task, inboxId, plugin } = await setup();
      await inAccount(stub, (_, _store, delivery) => delivery.sync(task.id));
      await deliverQueuedReplies(stub, 5, true);
      if (["clear", "delete", "reset"].includes(action))
        await api(stub, "session.action", { id: task.sessionId, action });
      else
        await inAccount(stub, (storage) => {
          if (action === "switch")
            storage.sql.exec("UPDATE settings SET value='\"another-session\"' WHERE key='current'");
          if (action === "disable")
            storage.sql.exec(
              "UPDATE plugins SET data=json_set(data,'$.enabled',0) WHERE id=?",
              plugin.id,
            );
          if (action === "generation")
            storage.sql.exec(
              "UPDATE settings SET value=json_set(value,'$.generation','new-generation') WHERE key='connection'",
            );
        });
      expect(
        await deliverQueuedReplies(stub, 1, false, { incoming: [incoming(1, "fresh-context")] }),
      ).toEqual([]);
      expect(await deliverQueuedReplies(stub)).toEqual([]);
      await inAccount(stub, (storage, store, delivery) => {
        delivery.sync(task.id);
        expect(store.get(task.id)).toMatchObject({ delivered: 1, deliveryStatus: "stale" });
        expect(storage.sql.exec("SELECT reply FROM inbox WHERE id=?", inboxId).one()).toEqual({
          reply: "",
        });
      });
    },
  );
});
