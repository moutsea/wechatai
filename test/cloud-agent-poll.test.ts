import { abortAllDurableObjects, env, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hasCompleteCloudAnswer,
  type CloudAgentClientConfig,
} from "../src/server/cloud-agent-client";
import { pollCloudAgentTask } from "../src/server/cloud-agent-poll";
import { prepareCloudAgentResult } from "../src/server/cloud-agent-result";
import { cloudAgentScope } from "../src/server/cloud-agent-provision";
import { CloudAgentStore, type CloudTask } from "../src/server/cloud-agent-store";

const config: CloudAgentClientConfig = {
  origin: "https://agt.example.com",
  appId: "app-one",
  tenantId: "tenant-one",
  appKey: "test-only-app-key",
  agentId: "profile-v1",
  model: "test-model",
};
const account = () => env.ACCOUNTS.getByName(crypto.randomUUID());
function inStore<T>(stub: ReturnType<typeof account>, run: (store: CloudAgentStore) => T) {
  return runInDurableObject(stub, (_, state) => {
    const store = new CloudAgentStore(state.storage);
    store.init();
    return run(store);
  });
}
const eligible = () => undefined;
async function setup(change: Partial<CloudTask> = {}) {
  const now = Date.now();
  const stub = account();
  const saved: CloudTask = {
    id: crypto.randomUUID(),
    sourceId: crypto.randomUUID(),
    origin: config.origin,
    appId: config.appId,
    tenantId: config.tenantId,
    profileId: config.agentId,
    model: config.model,
    workspaceName: "test-account",
    callbackVersion: "v1",
    callbackOrigin: "https://wechatai.example.com",
    invocation: null,
    request: "encrypted-request",
    submittedAt: now,
    outcome: null,
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
    prompt: "测试要求",
    idempotencyKey: crypto.randomUUID(),
    state: "accepted",
    upstreamStatus: "queued",
    jobId: "job-one",
    createdAt: now,
    updatedAt: now,
    deadline: now + 600_000,
    nextAt: now,
    attempts: 2,
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
  await inStore(stub, (store) => {
    store.save(saved);
    store.saveProvision({
      scope: cloudAgentScope(config),
      profiles: [config.agentId],
      externalId: `wechatai:${stub.id}`,
      appUserId: "user-one",
      workspaceId: "workspace-one",
      configured: 1,
      updatedAt: now,
    });
  });
  return {
    stub,
    saved,
    poll: (
      store: CloudAgentStore,
      reason: (task: CloudTask) => string | undefined = eligible,
      settings = config,
    ) => pollCloudAgentTask(settings, store, saved.id, reason),
  };
}
const job = (change: Record<string, unknown> = {}) => ({
  id: "job-one",
  workspaceId: "workspace-one",
  tenantId: config.tenantId,
  conversationId: "conversation-one",
  status: "running",
  ...change,
});
function network(reply: (request: Request) => Response | Promise<Response>) {
  const calls: Request[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      calls.push(request);
      return reply(request);
    }),
  );
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe("AGT job polling and durable cancellation", () => {
  it("polls an existing job without depending on profiles, request secrets or the new-submission gate", async () => {
    const { stub, saved, poll } = await setup({ request: "" });
    const calls = network(() => Response.json(job()));
    await inStore(stub, async (store) => {
      store.saveProvision({ ...store.provision()!, profiles: [], configured: 0 });
      expect(
        await poll(store, eligible, {
          ...config,
          appKey: "rotated-key",
          model: "new-model",
          agentId: "new-profile",
        }),
      ).toBeNull();
      const task = store.get(saved.id)!;
      expect(task).toMatchObject({
        state: "accepted",
        upstreamStatus: "running",
        outcome: null,
        stopRequested: 0,
        units: 0,
        settled: 0,
        attempts: 0,
      });
      expect(task.nextAt).toBeGreaterThan(Date.now());
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(`${config.origin}/api/agent/workspace-one/jobs/job-one`);
    expect(calls[0].headers.get("x-app-user")).toBe(`wechatai:${stub.id}`);
    expect(calls[0].headers.get("authorization")).toBe("Bearer rotated-key");
  });

  it.each([true, false])(
    "waits for a terminal GET after cancel returns %s, including across restart",
    async (cancelled) => {
      const { stub, saved, poll } = await setup({ stopRequested: 1 });
      let terminal = false;
      const calls = network((request) =>
        request.method === "POST"
          ? Response.json({ cancelled })
          : Response.json(job({ status: terminal ? "cancelled" : "running" })),
      );
      await inStore(stub, async (store) => {
        expect(await poll(store)).toBeNull();
        expect(store.get(saved.id)).toMatchObject({
          state: "accepted",
          stopRequested: 1,
          outcome: null,
          units: 0,
        });
      });
      expect(calls.map((request) => request.method)).toEqual(["GET", "POST"]);
      expect(calls[1].url).toBe(`${config.origin}/api/agent/workspace-one/jobs/job-one/cancel`);
      await abortAllDurableObjects();
      terminal = true;
      await inStore(env.ACCOUNTS.get(stub.id), async (store) => {
        expect(await poll(store)).toMatchObject({
          state: "accepted",
          stopRequested: 1,
          outcome: { status: "cancelled" },
          settled: 0,
          units: 0,
        });
      });
      expect(calls.map((request) => request.method)).toEqual(["GET", "POST", "GET"]);
    },
  );

  it.each(["stop", "eligibility", "deadline"])(
    "rechecks %s after GET before cancelling",
    async (cause) => {
      const { stub, saved, poll } = await setup();
      let stop = false;
      await inStore(stub, async (store) => {
        const calls = network((request) => {
          if (request.method === "POST") {
            expect(store.get(saved.id)?.stopRequested).toBe(1);
            return Response.json({ cancelled: true });
          }
          if (cause === "stop") store.stopSession(saved.sessionId);
          if (cause === "deadline") store.patch(saved, { deadline: 1 });
          stop = true;
          return Response.json(job());
        });
        expect(
          await poll(store, () => (cause === "eligibility" && stop ? "插件已停用。" : undefined)),
        ).toBeNull();
        expect(calls.map((request) => request.method)).toEqual(["GET", "POST"]);
        expect(store.get(saved.id)).toMatchObject({
          stopRequested: 1,
          state: "accepted",
          outcome: null,
        });
      });
    },
  );

  it("carries an approval stop cause through cancellation, restart and terminal preparation", async () => {
    const { stub, saved, poll } = await setup();
    await inStore(stub, async (store) => {
      network((request) =>
        request.method === "GET"
          ? Response.json(job({ status: "awaiting_approval" }))
          : Response.json({ cancelled: true }),
      );
      await poll(store);
      expect(store.get(saved.id)).toMatchObject({
        stopReason: "云端 Agent 暂不支持工具审批。",
        outcome: null,
      });
    });
    await abortAllDurableObjects();
    await inStore(env.ACCOUNTS.get(stub.id), async (store) => {
      network(() => Response.json(job({ status: "cancelled" })));
      await poll(store, () => {
        throw new Error("A persisted stop must not recheck current eligibility");
      });
      const result = (await prepareCloudAgentResult(store, saved.id))!;
      expect(result.error).toContain("暂不支持工具审批");
      expect(result.error).not.toMatch(/正在请求停止|后来插件/);
      expect(result.meter).toBeNull();
    });
  });

  it("explains a lifecycle stop that arrives while the terminal GET is in flight", async () => {
    const { stub, saved, poll } = await setup({ error: "提交结果尚未确认，正在恢复原任务。" });
    let stopped = false;
    await inStore(stub, async (store) => {
      network(() => {
        store.stopPlugin(saved.pluginId);
        stopped = true;
        return Response.json(job({ status: "cancelled" }));
      });
      await poll(store, () => (stopped ? "插件已停用，请重新启用。" : undefined));
      expect(store.get(saved.id)!.stopReason).toBe("插件已停用，请重新启用。");
      const result = (await prepareCloudAgentResult(store, saved.id))!;
      expect(result.error).toContain("插件已停用，请重新启用。");
      expect(result.error).not.toContain("正在恢复");
    });
  });

  it("does not replace an existing eligibility stop with an approval stop", async () => {
    const reason = "Plus 已到期，请续费后重新发送。";
    const { stub, saved, poll } = await setup({
      stopRequested: 1,
      stopReason: reason,
      error: reason,
    });
    await inStore(stub, async (store) => {
      network((request) =>
        request.method === "GET"
          ? Response.json(job({ status: "awaiting_approval" }))
          : Response.json({ cancelled: true }),
      );
      await poll(store);
      expect(store.get(saved.id)).toMatchObject({ stopReason: reason, error: reason });
    });
  });

  it("requests cancellation immediately for unsupported approvals and keeps the intent if cancellation fails", async () => {
    const { stub, saved, poll } = await setup();
    await inStore(stub, async (store) => {
      const calls = network((request) => {
        if (request.method === "GET") return Response.json(job({ status: "awaiting_approval" }));
        expect(store.get(saved.id)?.stopRequested).toBe(1);
        throw new TypeError("cancel response lost");
      });
      await expect(poll(store)).rejects.toMatchObject({ code: "cloud_agent_unreachable" });
      expect(calls.map((request) => request.method)).toEqual(["GET", "POST"]);
      expect(store.get(saved.id)).toMatchObject({
        state: "accepted",
        stopRequested: 1,
        outcome: null,
        error: "云端 Agent 暂不支持工具审批，正在请求停止。",
      });
    });
  });

  it("persists timeout cancellation intent even if the status request fails", async () => {
    const { stub, saved, poll } = await setup({ deadline: 1 });
    network(() => {
      throw new TypeError("GET response lost");
    });
    await inStore(stub, async (store) => {
      await expect(poll(store)).rejects.toMatchObject({ code: "cloud_agent_unreachable" });
      expect(store.get(saved.id)).toMatchObject({
        stopRequested: 1,
        error: "任务已超时，正在请求停止。",
      });
    });
  });

  it("retains timeout intent when the service scope changed, so error backoff can leave the expired deadline", async () => {
    const { stub, saved, poll } = await setup({ deadline: 1 });
    const calls = network(() => Response.json(job()));
    await inStore(stub, async (store) => {
      await expect(
        poll(store, eligible, { ...config, origin: "https://changed.example.com" }),
      ).rejects.toMatchObject({ code: "cloud_config_changed" });
      const task = store.get(saved.id)!;
      expect(task.stopRequested).toBe(1);
      store.patch(task, { nextAt: Date.now() + 60_000 });
      expect(store.due()).toEqual([]);
    });
    expect(calls).toHaveLength(0);
  });

  it("preserves content erasure that arrives during cancellation", async () => {
    const { stub, saved, poll } = await setup({ stopRequested: 1 });
    await inStore(stub, async (store) => {
      network((request) => {
        if (request.method === "GET") return Response.json(job());
        store.hideSession(saved.sessionId);
        return Response.json({ cancelled: true });
      });
      expect(await poll(store)).toBeNull();
      expect(store.get(saved.id)).toMatchObject({
        hidden: 1,
        stopRequested: 1,
        prompt: "",
        request: "",
        outcome: null,
        result: "",
        state: "accepted",
      });
    });
  });

  it.each(["completed", "failed", "cancelled"])(
    "freezes %s results and preserves settlement backoff past the deadline and across restart",
    async (status) => {
      const { stub, saved, poll } = await setup();
      const calls = network(() =>
        Response.json(
          job({
            status,
            result: { text: "original-result", finishReason: "stop", usage: { outputTokens: 10 } },
          }),
        ),
      );
      const frozen = await inStore(stub, (store) => poll(store));
      expect(frozen).toMatchObject({
        state: "accepted",
        outcome: { status, text: "original-result", finishReason: "stop" },
        result: "",
        settled: 0,
        units: 0,
        stopRequested: 0,
      });
      // A host settlement failure may postpone recovery past the execution deadline.
      const retryAt = saved.deadline + 60_000;
      const retrying = await inStore(stub, (store) =>
        store.patch(frozen!, { attempts: 3, nextAt: retryAt }),
      );
      await abortAllDurableObjects();
      await inStore(env.ACCOUNTS.get(stub.id), async (store) => {
        expect(store.nextAt(saved.deadline)).toBe(retryAt);
        expect(store.due(saved.deadline)).toEqual([]);
        expect(store.due(retryAt)).toEqual([retrying]);
        // Frozen proofs can be settled without a live provider configuration.
        expect(
          await poll(store, eligible, { ...config, origin: "https://changed.example.com" }),
        ).toEqual(retrying);
        expect(store.get(saved.id)).toEqual(retrying);
        store.patch(retrying, { attempts: 4, nextAt: retryAt + 120_000 });
        expect(store.nextAt(retryAt)).toBe(retryAt + 120_000);
        expect(store.due(retryAt)).toEqual([]);
      });
      expect(calls).toHaveLength(1);
    },
  );

  it("preserves partial-result metadata rather than treating any completed text as billable", async () => {
    const { stub, poll } = await setup();
    network(() =>
      Response.json(
        job({
          status: "completed",
          result: { text: "partial text", finishReason: "length", task: { outcome: "partial" } },
        }),
      ),
    );
    await inStore(stub, async (store) => {
      const task = await poll(store);
      expect(task?.outcome).toMatchObject({
        text: "partial text",
        finishReason: "length",
        task: { outcome: "partial" },
      });
      expect(hasCompleteCloudAnswer(task!.outcome!)).toBe(false);
      expect(task?.units).toBe(0);
    });
  });

  it("does not reintroduce content erased while a completed GET is in flight", async () => {
    const { stub, poll, saved } = await setup();
    await inStore(stub, async (store) => {
      network(() => {
        store.hideSession(saved.sessionId);
        return Response.json(
          job({
            status: "completed",
            result: {
              text: "private-result",
              refusal: "private-refusal",
              task: { question: "private-question" },
            },
          }),
        );
      });
      const task = await poll(store);
      expect(task).toMatchObject({
        hidden: 1,
        stopRequested: 1,
        prompt: "",
        request: "",
        outcome: { status: "completed" },
      });
      expect(JSON.stringify(task)).not.toContain("private-");
      expect(task?.outcome?.text).toBeUndefined();
      expect(task?.outcome?.task).toBeUndefined();
    });
  });

  it.each([
    { id: "another-job" },
    { workspaceId: "another-workspace" },
    { tenantId: "another-tenant" },
    { tenantId: undefined },
    { conversationId: "another-conversation" },
    { conversationId: undefined },
    { appId: "another-app" },
    { appUserId: "another-user" },
  ])("never freezes or cancels a job with mismatched identity: %j", async (change) => {
    const { stub, saved, poll } = await setup({ stopRequested: 1 });
    const calls = network(() => Response.json(job(change)));
    await inStore(stub, async (store) => {
      await expect(poll(store)).rejects.toMatchObject({ code: "cloud_job_identity" });
      expect(store.get(saved.id)).toEqual(saved);
    });
    expect(calls).toHaveLength(1);
  });

  it("requires the same service scope and account mapping before network I/O", async () => {
    const { stub, poll } = await setup();
    const calls = network(() => Response.json(job()));
    await inStore(stub, async (store) => {
      await expect(
        poll(store, eligible, { ...config, appId: "another-app" }),
      ).rejects.toMatchObject({ code: "cloud_config_changed" });
      store.saveProvision({ ...store.provision()!, scope: "another-scope" });
      await expect(poll(store)).rejects.toMatchObject({ code: "cloud_provision_missing" });
    });
    expect(calls).toHaveLength(0);
  });

  it.each<Partial<CloudTask>>([{ state: "completed" }, { state: "submitting", jobId: "" }])(
    "leaves tasks outside the polling stage alone: %j",
    async (change) => {
      const { stub, saved, poll } = await setup(change);
      const calls = network(() => Response.json(job()));
      await inStore(stub, async (store) => {
        expect(await poll(store)).toBeNull();
        expect(store.get(saved.id)).toEqual(saved);
      });
      expect(calls).toHaveLength(0);
    },
  );
});
