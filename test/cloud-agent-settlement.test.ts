import { abortAllDurableObjects, env, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentJobView } from "../src/server/cloud-agent-client";
import { prepareCloudAgentResult } from "../src/server/cloud-agent-result";
import { CloudAgentRuntime } from "../src/server/cloud-agent-runtime";
import { settleCloudAgentTask } from "../src/server/cloud-agent-settlement";
import { CloudAgentStore, type CloudTask } from "../src/server/cloud-agent-store";
import { Wallet } from "../src/server/wallet";
import { PLUGIN_PROTOCOL_VERSION } from "../src/shared/plugins";

const account = () => env.ACCOUNTS.getByName(crypto.randomUUID());
function inAccount<T>(
  stub: ReturnType<typeof account>,
  run: (storage: DurableObjectStorage, store: CloudAgentStore, wallet: Wallet) => T,
) {
  return runInDurableObject(stub, (_, state) => {
    const store = new CloudAgentStore(state.storage);
    store.init();
    return run(state.storage, store, new Wallet(state.storage));
  });
}
async function setup(job: Partial<AgentJobView> = {}, change: Partial<CloudTask> = {}) {
  const stub = account();
  const id = crypto.randomUUID();
  const now = Date.now() - 60_000;
  const task: CloudTask = {
    id,
    sourceId: crypto.randomUUID(),
    origin: "https://agt.example.com",
    appId: "app-one",
    tenantId: "tenant-one",
    profileId: "profile-v1",
    model: "old-model",
    workspaceName: "workspace-one",
    callbackVersion: "v1",
    callbackOrigin: "https://wechatai.example.com",
    invocation: {
      protocolVersion: PLUGIN_PROTOCOL_VERSION,
      runId: id,
      instanceId: "plugin-one",
      pluginId: "wechatai/cloud-agent",
      pluginVersion: "1.2.3",
      sessionId: "session-one",
      messages: [{ role: "user", content: [{ type: "text", text: "你好" }] }],
      limits: { inputTokens: 1000, outputTokens: 1000, outputImages: 0, creditUnits: null },
    },
    request: "",
    submittedAt: now,
    outcome: {
      id: "job-one",
      workspaceId: "workspace-one",
      status: "completed",
      text: "已完成任务",
      ...job,
    },
    reconcileCursor: "",
    reconcileCandidates: [],
    hidden: 0,
    deliveryStatus: "pending",
    pluginContext: "plugin-one",
    currentSessionId: "session-one",
    pluginId: "plugin-one",
    pluginName: "我的云端助手",
    sessionId: "session-one",
    connectionId: "link-one",
    generation: "generation-one",
    contextStart: 0,
    resetAt: 0,
    conversationId: "conversation-one",
    prompt: "你好",
    idempotencyKey: crypto.randomUUID(),
    state: "accepted",
    upstreamStatus: "completed",
    jobId: "job-one",
    createdAt: now,
    updatedAt: now,
    deadline: now + 600_000,
    nextAt: now,
    attempts: 3,
    stopRequested: 0,
    settled: 0,
    stale: 0,
    delivered: 0,
    result: "",
    error: "",
    units: 0,
    frozen: "",
    unconfirmed: 0,
    ...change,
  };
  await inAccount(stub, (storage, store, wallet) => {
    store.save(task);
    wallet.grant("test", "purchase", 1000, Date.now() + 86_400_000, "test");
    storage.sql.exec(
      "INSERT INTO sessions VALUES (?,?)",
      task.sessionId,
      JSON.stringify({
        id: task.sessionId,
        connectionId: task.connectionId,
        pluginInstanceId: task.pluginContext,
        assistantId: null,
        title: "自定义标题",
        autoTitle: false,
        archived: false,
        createdAt: now,
        updatedAt: now,
        contextStart: task.contextStart,
        resetAt: task.resetAt,
        messageCount: 1,
      }),
    );
    storage.sql.exec(
      "INSERT INTO messages (sessionId,role,content,createdAt) VALUES (?,'user',?,?)",
      task.sessionId,
      task.prompt,
      now,
    );
  });
  return { stub, task };
}

function unbilled(storage: DurableObjectStorage, wallet: Wallet) {
  expect(wallet.balance()).toBe(1000);
  for (const table of ["platform_metering", "usage", "runs"])
    expect(storage.sql.exec(`SELECT * FROM ${table}`).toArray()).toEqual([]);
  expect(storage.sql.exec("SELECT * FROM credit_ledger WHERE kind='usage'").toArray()).toEqual([]);
  expect(storage.sql.exec("SELECT * FROM messages WHERE role='assistant'").toArray()).toEqual([]);
}

afterEach(() => vi.unstubAllGlobals());

describe("durable AGT terminal settlement", () => {
  it("commits the frozen bill, snapshot identity, history, session count and pending delivery", async () => {
    const { stub, task } = await setup({ usage: { input_tokens: 1e9, output_tokens: 1e9 } });
    const fetch = vi.fn(() => {
      throw new Error("Settlement must not use the network");
    });
    vi.stubGlobal("fetch", fetch);
    await inAccount(stub, async (storage, store, wallet) => {
      const result = (await settleCloudAgentTask(storage, task.id, () => false))!;
      const frozen = JSON.parse(result.frozen);
      expect(result).toMatchObject({
        state: "completed",
        result: "已完成任务",
        error: "",
        units: frozen.meter.units,
        settled: 1,
        attempts: 0,
        delivered: 0,
        deliveryStatus: "pending",
      });
      expect(wallet.balance()).toBe(1000 - result.units);
      const metering = storage.sql.exec<{ data: string }>("SELECT * FROM platform_metering").one();
      expect(metering).toMatchObject({
        id: task.id,
        pluginId: task.invocation!.pluginId,
        pluginVersion: "1.2.3",
        instanceId: task.pluginId,
      });
      expect(JSON.parse(metering.data)).toEqual(frozen.meter);
      expect(storage.sql.exec("SELECT * FROM usage").one()).toMatchObject({
        id: task.id,
        tokens: frozen.meter.inputTokens + frozen.meter.outputTokens,
        units: result.units,
      });
      const run = storage.sql.exec<{ response: string }>("SELECT * FROM runs").one();
      expect(run).toMatchObject({ id: task.id, sessionId: task.sessionId, status: "complete" });
      expect(JSON.parse(run.response)).toEqual({ text: result.result, cost: result.units / 1000 });
      expect(storage.sql.exec("SELECT * FROM messages WHERE role='assistant'").one()).toMatchObject(
        {
          sessionId: task.sessionId,
          content: result.result,
          inputTokens: frozen.meter.inputTokens,
          outputTokens: frozen.meter.outputTokens,
          cost: result.units / 1000,
          model: task.pluginName,
        },
      );
      const session = JSON.parse(
        storage.sql.exec<{ data: string }>("SELECT data FROM sessions").one().data,
      );
      expect(session).toMatchObject({ title: "自定义标题", autoTitle: false, messageCount: 2 });
      expect(session.updatedAt).toBeGreaterThan(task.createdAt);
      expect(store.due().map((t) => t.id)).toEqual([task.id]);
      expect(storage.sql.exec("SELECT * FROM inbox").toArray()).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  it("persists the clipped answer, its warning and the exact frozen bill", async () => {
    const { stub, task } = await setup({ text: "这是一个很长的答案。".repeat(100) });
    await inAccount(stub, async (storage, store, wallet) => {
      store.patch(task, {
        invocation: {
          ...task.invocation!,
          limits: { ...task.invocation!.limits, outputTokens: 10 },
        },
      });
      const result = (await settleCloudAgentTask(storage, task.id, () => false))!;
      const frozen = JSON.parse(result.frozen);
      expect(result).toMatchObject({ state: "completed", settled: 1, result: frozen.text });
      expect(frozen.truncated).toBe(true);
      expect(result.result.length).toBeLessThan(task.outcome!.text!.length);
      expect(result.error).toContain("按本次输入和截取后结果计费");
      expect(result.units).toBe(frozen.meter.units);
      expect(wallet.balance()).toBe(1000 - result.units);
      expect(storage.sql.exec("SELECT content FROM messages WHERE role='assistant'").one()).toEqual(
        { content: frozen.text },
      );
    });
  });

  it("settles concurrent completions once and remains idempotent after eviction", async () => {
    let { stub, task } = await setup();
    await inAccount(stub, async (storage, store, wallet) => {
      const results = await Promise.all([
        settleCloudAgentTask(storage, task.id, () => false),
        settleCloudAgentTask(storage, task.id, () => false),
      ]);
      expect(results[0]).toEqual(results[1]);
      expect(wallet.balance()).toBe(1000 - results[0]!.units);
      store.patch(task, { delivered: 1, deliveryStatus: "sent", nextAt: 0 });
    });
    await abortAllDurableObjects();
    stub = env.ACCOUNTS.get(stub.id);
    await inAccount(stub, async (storage, store, wallet) => {
      const before = store.get(task.id)!;
      const stale = vi.fn(() => true);
      expect(await settleCloudAgentTask(storage, task.id, stale)).toEqual(before);
      expect(stale).not.toHaveBeenCalled();
      expect(wallet.balance()).toBe(1000 - before.units);
      for (const table of ["platform_metering", "usage", "runs"])
        expect(storage.sql.exec(`SELECT * FROM ${table}`).toArray()).toHaveLength(1);
      expect(storage.sql.exec("SELECT * FROM messages").toArray()).toHaveLength(2);
      expect(store.due()).toEqual([]);
    });
  });

  it("rolls every settlement write back on a late failure and retries the frozen price", async () => {
    const { stub, task } = await setup();
    await inAccount(stub, async (storage, store, wallet) => {
      storage.sql.exec(`CREATE TRIGGER fail_completion BEFORE UPDATE ON cloud_tasks
        WHEN NEW.state='completed' BEGIN SELECT RAISE(ABORT,'test settlement failure'); END`);
      await expect(settleCloudAgentTask(storage, task.id, () => false)).rejects.toThrow(
        "test settlement failure",
      );
      unbilled(storage, wallet);
      const pending = store.get(task.id)!;
      expect(pending).toMatchObject({ state: "accepted", settled: 0, attempts: 3 });
      const frozen = JSON.parse(pending.frozen);
      expect(frozen.text).toBe("已完成任务");
      const session = JSON.parse(
        storage.sql.exec<{ data: string }>("SELECT data FROM sessions").one().data,
      );
      expect(session).toMatchObject({ messageCount: 1, updatedAt: task.createdAt });
      storage.sql.exec("DROP TRIGGER fail_completion");
      store.patch(task, { outcome: { ...task.outcome!, text: "这次内容不能参与重新计价" } });
      const result = (await settleCloudAgentTask(storage, task.id, () => false))!;
      expect(result.result).toBe(frozen.text);
      expect(result.units).toBe(frozen.meter.units);
      expect(wallet.balance()).toBe(1000 - frozen.meter.units);
    });
  });

  it("records the exact frozen charge as debt when credits were spent during execution", async () => {
    const { stub, task } = await setup();
    await inAccount(stub, async (storage, _store, wallet) => {
      wallet.charge("other-task", 1000, 1000);
      const result = (await settleCloudAgentTask(storage, task.id, () => false))!;
      expect(result.units).toBeGreaterThan(0);
      expect(wallet.balance()).toBe(-result.units);
      expect(wallet.debt()).toBe(result.units);
      expect(storage.sql.exec("SELECT * FROM usage").one()).toMatchObject({ units: result.units });
    });
  });

  it.each([
    { status: "cancelled", text: "已停止" },
    { status: "failed", text: "失败信息" },
    { status: "completed", refusal: "无法处理这项请求" },
    { status: "completed", task: { outcome: "partial" } },
    {
      status: "completed",
      task: { outcome: "clarification_required", question: "请问具体日期？" },
    },
    { status: "completed", finishReason: "length" },
  ] satisfies Partial<AgentJobView>[])(
    "finishes unsuccessful outcome %j without any charge",
    async (job) => {
      const { stub, task } = await setup(job);
      await inAccount(stub, async (storage, store, wallet) => {
        const result = (await settleCloudAgentTask(storage, task.id, () => false))!;
        expect(result.state).toBe(job.status === "cancelled" ? "cancelled" : "failed");
        expect(result).toMatchObject({
          units: 0,
          settled: 0,
          delivered: 0,
          deliveryStatus: "pending",
        });
        expect(result.error).toContain("未扣 credits");
        if (job.task?.question) expect(result.result).toContain(job.task.question);
        unbilled(storage, wallet);
        expect(store.active()).toEqual([]);
        expect(store.due().map((t) => t.id)).toEqual([task.id]);
      });
    },
  );

  it.each(["input", "credits"])(
    "ends a fixed %s limit failure without trapping execution occupancy",
    async (limit) => {
      const { stub, task } = await setup();
      await inAccount(stub, async (storage, store, wallet) => {
        store.patch(task, {
          invocation: {
            ...task.invocation!,
            limits: {
              ...task.invocation!.limits,
              ...(limit === "input" ? { inputTokens: 1 } : { creditUnits: 0 }),
            },
          },
        });
        expect(await settleCloudAgentTask(storage, task.id, () => false)).toMatchObject({
          state: "failed",
          units: 0,
        });
        unbilled(storage, wallet);
        expect(store.active()).toEqual([]);
      });
    },
  );

  it.each(["host", "sticky", "missing", "archive", "reset", "context", "plugin", "connection"])(
    "bills a completed %s-stale task without attaching it to a changed conversation",
    async (reason) => {
      const { stub, task } = await setup();
      await inAccount(stub, async (storage, store, wallet) => {
        if (reason === "missing") storage.sql.exec("DELETE FROM sessions");
        else if (reason === "sticky") store.patch(task, { stale: 1 });
        else {
          const change = {
            archive: { archived: true },
            reset: { resetAt: 99 },
            context: { contextStart: 99 },
            plugin: { pluginInstanceId: "other-plugin" },
            connection: { connectionId: "other-link" },
          }[reason];
          if (change)
            storage.sql.exec("UPDATE sessions SET data=json_patch(data,?)", JSON.stringify(change));
        }
        const sessions = storage.sql.exec("SELECT * FROM sessions").toArray();
        const result = (await settleCloudAgentTask(storage, task.id, () => reason === "host"))!;
        expect(result).toMatchObject({
          state: "completed",
          result: "已完成任务",
          settled: 1,
          stale: 1,
          delivered: 1,
          deliveryStatus: "stale",
          nextAt: 0,
        });
        expect(wallet.balance()).toBe(1000 - result.units);
        expect(storage.sql.exec("SELECT * FROM runs").one()).toMatchObject({ sessionId: null });
        expect(storage.sql.exec("SELECT * FROM messages").toArray()).toHaveLength(1);
        expect(storage.sql.exec("SELECT * FROM sessions").toArray()).toEqual(sessions);
        expect(store.due()).toEqual([]);
      });
    },
  );

  it("rereads deletion after preparation and never restores or bills the cleared result", async () => {
    const { stub, task } = await setup();
    await inAccount(stub, async (storage, store, wallet) => {
      await prepareCloudAgentResult(store, task.id);
      const settling = settleCloudAgentTask(storage, task.id, () => false);
      store.hideSession(task.sessionId);
      storage.sql.exec("DELETE FROM messages");
      expect(await settling).toMatchObject({
        state: "completed",
        hidden: 1,
        result: "",
        error: "",
        frozen: "",
        units: 0,
        settled: 0,
        delivered: 1,
        stale: 1,
      });
      unbilled(storage, wallet);
      expect(store.due()).toEqual([]);
    });
  });

  it.each(["runId", "instanceId", "sessionId"])(
    "defers mismatched invocation %s without billing",
    async (field) => {
      const { stub, task } = await setup();
      await inAccount(stub, async (storage, store, wallet) => {
        store.patch(task, { invocation: { ...task.invocation!, [field]: "another-task" } });
        await expect(settleCloudAgentTask(storage, task.id, () => false)).rejects.toThrow(
          "调用记录",
        );
        unbilled(storage, wallet);
        expect(store.get(task.id)).toMatchObject({ state: "accepted", settled: 0 });
      });
    },
  );

  it("keeps unverified work pending and tolerates repeated delivery failures without rebilling", async () => {
    const { stub, task } = await setup({}, { deadline: 1, stopRequested: 1 });
    await inAccount(stub, async (storage, store, wallet) => {
      store.patch(task, { outcome: null });
      expect(await settleCloudAgentTask(storage, task.id, () => false)).toBeNull();
      unbilled(storage, wallet);
      store.patch(task, { outcome: task.outcome });
      const runner = new CloudAgentRuntime(
        { ...env, CLOUD_AGENT_ENABLED: "false" },
        store,
        stub.id.toString(),
        {
          stopReason: () => "任务已超时。",
          finalize: (t) => settleCloudAgentTask(storage, t.id, () => false),
          deliver: () => {
            throw new Error("delivery unavailable");
          },
        },
      );
      await runner.process(Date.now() + 60_000);
      const completed = store.get(task.id)!;
      expect(completed).toMatchObject({ state: "completed", settled: 1, delivered: 0 });
      await runner.process(Date.now() + 60_000);
      expect(store.get(task.id)).toMatchObject({
        attempts: 1,
        delivered: 0,
        units: completed.units,
      });
      expect(wallet.balance()).toBe(1000 - completed.units);
      expect(storage.sql.exec("SELECT * FROM usage").toArray()).toHaveLength(1);
      expect(storage.sql.exec("SELECT * FROM messages").toArray()).toHaveLength(2);
    });
  });
});
