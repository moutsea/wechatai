import { abortAllDurableObjects, env, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentJobView } from "../src/server/cloud-agent-client";
import { prepareCloudAgentResult } from "../src/server/cloud-agent-result";
import { CloudAgentRuntime } from "../src/server/cloud-agent-runtime";
import { CloudAgentStore, type CloudTask } from "../src/server/cloud-agent-store";
import { countTextTokens } from "../src/server/tokenizer";
import { creditUnits } from "../src/server/wallet";
import { PLUGIN_PROTOCOL_VERSION } from "../src/shared/plugins";

const account = () => env.ACCOUNTS.getByName(crypto.randomUUID());
function inStore<T>(stub: ReturnType<typeof account>, run: (store: CloudAgentStore) => T) {
  return runInDurableObject(stub, (_, state) => {
    const store = new CloudAgentStore(state.storage);
    store.init();
    return run(store);
  });
}
async function setup(job: Partial<AgentJobView> = {}, change: Partial<CloudTask> = {}) {
  const stub = account();
  const id = crypto.randomUUID();
  const now = Date.now();
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
      pluginVersion: "1.0.0",
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
      text: "已回复",
      ...job,
    },
    reconcileCursor: "",
    reconcileCandidates: [],
    hidden: 0,
    deliveryStatus: "pending",
    pluginContext: "plugin-one",
    currentSessionId: "session-one",
    pluginId: "plugin-one",
    pluginName: "云端 Agent",
    sessionId: "session-one",
    connectionId: "link-one",
    generation: "generation-one",
    contextStart: now,
    resetAt: 0,
    conversationId: "conversation-one",
    prompt: "当前正文不参与重新计量",
    idempotencyKey: crypto.randomUUID(),
    state: "accepted",
    upstreamStatus: "completed",
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
    ...change,
  };
  await inStore(stub, (store) => store.save(task));
  return { stub, task };
}
afterEach(() => vi.unstubAllGlobals());

describe("durable AGT terminal result preparation", () => {
  it.each([undefined, {}, { input_tokens: 0 }, { input_tokens: 1e9, output_tokens: 1e9 }])(
    "meters frozen invocation and returned text independently of upstream usage %j",
    async (usage) => {
      const { stub, task } = await setup({ usage });
      const fetch = vi.fn(() => {
        throw new Error("No network during local preparation");
      });
      vi.stubGlobal("fetch", fetch);
      await inStore(stub, async (store) => {
        const result = await prepareCloudAgentResult(store, task.id);
        expect(result).toMatchObject({
          state: "completed",
          result: "已回复",
          error: "",
          truncated: false,
          meter: { inputTokens: 2, outputTokens: 3, outputImages: 0, units: 6 },
        });
        expect(JSON.parse(store.get(task.id)!.frozen)).toMatchObject({
          text: result!.result,
          meter: result!.meter,
        });
        // Only a result snapshot is saved; settlement and terminal work remain atomic host work.
        expect(store.get(task.id)).toMatchObject({
          state: "accepted",
          settled: 0,
          units: 0,
          result: "",
          nextAt: task.nextAt,
        });
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    { text: "部分文本", task: { outcome: "partial" }, hint: "部分工作" },
    { text: "背景说明", task: { question: "需要查询哪一天？" }, hint: "补充信息" },
    { text: undefined, task: { outcome: "clarification_required" }, hint: "补充信息" },
    { text: undefined, refusal: "无法处理该请求", hint: "调整请求" },
    { text: "中途截断", finishReason: "length", hint: "完整结果" },
    { text: "内容受限", finishReason: "content_filter", hint: "完整结果" },
    { text: "工具尚未完成", finishReason: "tool_calls", hint: "完整结果" },
    { text: "异常结束", finishReason: "error", hint: "完整结果" },
    { text: "未知原因", finishReason: "unknown", hint: "完整结果" },
    { text: "   ", hint: "没有返回可用结果" },
    { text: "失败前的内容", status: "failed", hint: "执行失败" },
    { text: "停止前的内容", status: "cancelled", hint: "已停止" },
  ] as const)(
    "keeps useful unsuccessful output without billing: $hint / $text",
    async ({ hint, ...job }) => {
      const { stub, task } = await setup(job);
      await inStore(stub, async (store) => {
        const result = await prepareCloudAgentResult(store, task.id);
        expect(result).toMatchObject({
          state: job.status === "cancelled" ? "cancelled" : "failed",
          meter: null,
          truncated: false,
        });
        expect(result!.error).toContain(hint);
        expect(result!.error).toContain("未扣 credits");
        if (job.text?.trim()) expect(result!.result).toContain(job.text);
        if ("task" in job && job.task && "question" in job.task)
          expect(result!.result).toContain(job.task.question);
        if ("refusal" in job) expect(result!.result).toContain(job.refusal);
        expect(store.get(task.id)!.frozen).toBe("");
      });
    },
  );

  it("bounds retained partial output and does not duplicate a question already in the text", async () => {
    const { stub, task } = await setup({
      text: "需要哪个文件？",
      task: { question: "需要哪个文件？" },
    });
    await inStore(stub, async (store) => {
      expect((await prepareCloudAgentResult(store, task.id))!.result).toBe("需要哪个文件？");
      store.patch(task, { outcome: { ...task.outcome!, text: "长".repeat(70_000) } });
      const result = (await prepareCloudAgentResult(store, task.id))!;
      expect(result.result.length).toBe(64_000);
      expect(result.truncated).toBe(true);
      expect(result.error).toContain("仅保留前 64,000 字符");
    });
  });

  it.each(["tokens", "credits"])(
    "applies the original %s limit and meters only the clipped answer",
    async (limit) => {
      const { stub, task } = await setup({ text: "Hello, world! Extra words here." });
      await inStore(stub, async (store) => {
        const invocation = task.invocation!;
        store.patch(task, {
          invocation: {
            ...invocation,
            limits: {
              ...invocation.limits,
              ...(limit === "tokens" ? { outputTokens: 2 } : { creditUnits: 5 }),
            },
          },
        });
        const result = (await prepareCloudAgentResult(store, task.id))!;
        expect(result.state).toBe("completed");
        expect(result.truncated).toBe(true);
        expect(result.error).toContain("已截取");
        expect(task.outcome!.text!.startsWith(result.result)).toBe(true);
        expect(result.meter!.outputTokens).toBe(countTextTokens(result.result));
        expect(result.meter!.units).toBe(creditUnits(2, countTextTokens(result.result)));
        if (limit === "tokens") expect(result.meter!.outputTokens).toBeLessThanOrEqual(2);
        else expect(result.meter!.units).toBeLessThanOrEqual(5);
      });
    },
  );

  it("does not expose the unbounded answer or charge input when the budget leaves no usable output", async () => {
    const { stub, task } = await setup();
    await inStore(stub, async (store) => {
      store.patch(task, {
        invocation: { ...task.invocation!, limits: { ...task.invocation!.limits, creditUnits: 1 } },
      });
      const result = await prepareCloudAgentResult(store, task.id);
      expect(result).toMatchObject({ state: "failed", result: "", meter: null });
      expect(result!.error).toContain("请缩小任务范围后重试");
      expect(result!.error).not.toContain("提高");
      expect(store.get(task.id)!.frozen).toBe("");
    });
  });

  it.each(["input", "credits"])(
    "finishes a deterministic %s limit failure and releases execution occupancy",
    async (limit) => {
      const { stub, task } = await setup({}, { deadline: 1, stopRequested: 1 });
      let notice = "";
      await inStore(stub, async (store) => {
        const invocation = task.invocation!;
        store.patch(task, {
          invocation: {
            ...invocation,
            limits: {
              ...invocation.limits,
              ...(limit === "input" ? { inputTokens: 1 } : { creditUnits: 0 }),
            },
          },
        });
        const runner = new CloudAgentRuntime(env, store, stub.id.toString(), {
          stopReason: () => "任务已超时。",
          finalize: async (t) => {
            const result = (await prepareCloudAgentResult(store, t.id))!;
            expect(result).toMatchObject({ state: "failed", result: "", meter: null });
            store.patch(t, {
              state: result.state,
              result: result.result,
              error: result.error,
              nextAt: Date.now(),
            });
          },
          deliver: () => {
            throw new Error("delivery temporarily unavailable");
          },
        });
        await runner.process(Date.now() + 60_000);
        expect(store.active()).toEqual([]);
        expect(store.get(task.id)).toMatchObject({
          state: "failed",
          attempts: 0,
          frozen: "",
          units: 0,
          settled: 0,
        });
        notice = store.get(task.id)!.error;
        expect(notice).toContain(limit === "input" ? "输入超过" : "上限不足");
      });
      await abortAllDurableObjects();
      await inStore(env.ACCOUNTS.get(stub.id), async (store) => {
        store.patch(store.get(task.id)!, { nextAt: Date.now() });
        const finalize = vi.fn();
        const deliver = vi.fn((t: CloudTask) => {
          expect(t.error).toBe(notice);
          store.patch(t, { delivered: 1, nextAt: 0 });
        });
        await new CloudAgentRuntime(env, store, stub.id.toString(), {
          stopReason: () => undefined,
          finalize,
          deliver,
        }).process(Date.now() + 60_000);
        expect(finalize).not.toHaveBeenCalled();
        expect(deliver).toHaveBeenCalledOnce();
      });
    },
  );

  it.each([
    { reason: "任务已超时，正在请求停止。", hint: "任务已超时" },
    { reason: "Plus 已到期，请续费后重新发送。", hint: "续费" },
    { reason: "云端 Agent 暂不支持工具审批，正在请求停止。", hint: "不支持工具审批" },
    { reason: "插件已停用，请在网页插件页重新启用。", hint: "重新启用" },
  ])("preserves the terminal cancellation cause and guidance: $hint", async ({ reason, hint }) => {
    const { stub, task } = await setup(
      { status: "cancelled", text: undefined },
      {
        stopRequested: 1,
        stopReason: reason,
        error: "提交结果尚未确认，正在恢复原任务。",
      },
    );
    await inStore(stub, async (store) => {
      const result = (await prepareCloudAgentResult(store, task.id))!;
      expect(result).toMatchObject({ state: "cancelled", result: "", meter: null });
      expect(result.error).toContain(hint);
      expect(result.error).toContain("已停止，本次未扣 credits");
      expect(result.error).not.toMatch(/正在请求停止|正在恢复/);
    });
  });

  it("supports legacy stop causes and clears persisted causes when hiding a task", async () => {
    const { stub, task } = await setup(
      { status: "cancelled" },
      {
        stopRequested: 1,
        error: "任务已超时，正在请求停止。",
      },
    );
    await inStore(stub, async (store) => {
      expect((await prepareCloudAgentResult(store, task.id))!.error).toContain("任务已超时。");
      store.patch(task, { stopReason: "原会话已归档。" });
      store.hideSession(task.sessionId);
      expect(store.get(task.id)).toMatchObject({ stopReason: "", error: "" });
      expect(await prepareCloudAgentResult(store, task.id)).toBeNull();
    });
  });

  it("reuses the persisted bill after runner failure and restart, even without invocation or current AGT config", async () => {
    const { stub, task } = await setup(
      {},
      { deadline: Date.now() - 1000, stopRequested: 1, stale: 1 },
    );
    const first = await inStore(stub, async (store) => {
      const runner = new CloudAgentRuntime(env, store, stub.id.toString(), {
        stopReason: () => "已暂停",
        finalize: async (t) => {
          await prepareCloudAgentResult(store, t.id);
          throw new Error("Host transaction temporarily unavailable");
        },
        deliver: () => {
          throw new Error("No delivery before completion");
        },
      });
      await runner.process(Date.now() + 60_000);
      const saved = store.get(task.id)!;
      expect(saved).toMatchObject({ state: "accepted", settled: 0, attempts: 1 });
      expect(saved.nextAt).toBeGreaterThan(Date.now());
      expect(saved.frozen).not.toBe("");
      store.patch(saved, { invocation: null });
      return saved.frozen;
    });
    await abortAllDurableObjects();
    await inStore(env.ACCOUNTS.get(stub.id), async (store) => {
      const result = await prepareCloudAgentResult(store, task.id);
      const frozen = JSON.parse(first);
      expect(result).toMatchObject({
        state: "completed",
        result: frozen.text,
        meter: frozen.meter,
      });
      expect(store.get(task.id)!.frozen).toBe(first);
    });
  });

  it.each(["hidden", "completed", "concurrent-freeze"])(
    "honors %s state persisted while the gateway yields",
    async (change) => {
      const { stub, task } = await setup();
      await inStore(stub, async (store) => {
        const pending = prepareCloudAgentResult(store, task.id);
        if (change === "hidden") store.hideSession(task.sessionId);
        else if (change === "completed")
          store.patch(task, { state: "completed", settled: 1, result: "已结算" });
        else
          store.patch(task, {
            frozen: JSON.stringify({ text: "先保存的答案", meter: { units: 1 }, truncated: false }),
          });
        const result = await pending;
        if (change === "hidden") {
          expect(result).toMatchObject({ result: "", error: "", meter: null });
          expect(store.get(task.id)).toMatchObject({ hidden: 1, frozen: "", invocation: null });
        } else if (change === "completed") {
          expect(result).toBeNull();
          expect(store.get(task.id)).toMatchObject({ result: "已结算", settled: 1, frozen: "" });
        } else expect(result).toMatchObject({ result: "先保存的答案", meter: { units: 1 } });
      });
    },
  );

  it.each([null, "wrong-run"])(
    "defers complete-answer billing with a missing or mismatched invocation: %s",
    async (runId) => {
      const { stub, task } = await setup();
      await inStore(stub, async (store) => {
        store.patch(task, { invocation: runId ? { ...task.invocation!, runId } : null });
        await expect(prepareCloudAgentResult(store, task.id)).rejects.toMatchObject({
          code: "cloud_invocation_missing",
        });
        expect(store.get(task.id)).toMatchObject({ state: "accepted", frozen: "", settled: 0 });
      });
    },
  );

  it("ignores tasks without pending terminal work and rejects a nonterminal outcome", async () => {
    const { stub, task } = await setup({}, { outcome: null });
    await inStore(stub, async (store) => {
      expect(await prepareCloudAgentResult(store, task.id)).toBeNull();
      store.patch(task, {
        outcome: {
          id: "job-one",
          workspaceId: "workspace-one",
          status: "running",
        },
      });
      await expect(prepareCloudAgentResult(store, task.id)).rejects.toMatchObject({
        code: "cloud_outcome_pending",
      });
      store.patch(task, { state: "failed" });
      expect(await prepareCloudAgentResult(store, task.id)).toBeNull();
    });
  });
});
