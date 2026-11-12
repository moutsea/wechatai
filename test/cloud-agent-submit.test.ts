import { abortAllDurableObjects, env, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CloudAgentClientConfig } from "../src/server/cloud-agent-client";
import { pollCloudAgentTask } from "../src/server/cloud-agent-poll";
import { cloudAgentScope } from "../src/server/cloud-agent-provision";
import { reconcileCloudAgentJob } from "../src/server/cloud-agent-reconcile";
import { prepareCloudAgentRequest } from "../src/server/cloud-agent-request";
import { CloudAgentStore, type CloudTask } from "../src/server/cloud-agent-store";
import { submitCloudAgentTask } from "../src/server/cloud-agent-submit";
import { PLUGIN_PROTOCOL_VERSION, type PluginInvocation } from "../src/shared/plugins";

const config: CloudAgentClientConfig & { model: string } = {
  origin: "https://agt.example.com",
  appId: "app-one",
  tenantId: "tenant-one",
  appKey: "test-only-app-key",
  agentId: "profile-v1",
  model: "test-model",
};
function settings(values: Record<string, string> = {}): Env {
  return new Proxy(env, {
    get(target, name) {
      if (Reflect.has(values, name)) return Reflect.get(values, name);
      return name === "CLOUD_AGENT_ENABLED" ? "true" : Reflect.get(target, name);
    },
  });
}
const account = () => env.ACCOUNTS.getByName(crypto.randomUUID());
function inStore<T>(stub: ReturnType<typeof account>, run: (store: CloudAgentStore) => T) {
  return runInDurableObject(stub, (_, state) => {
    const store = new CloudAgentStore(state.storage);
    store.init();
    return run(store);
  });
}
const eligible = () => undefined;
function invocation(task: CloudTask): PluginInvocation {
  return {
    protocolVersion: PLUGIN_PROTOCOL_VERSION,
    runId: task.id,
    instanceId: task.pluginId,
    pluginId: "wechatai/cloud-agent",
    pluginVersion: "1.0.0",
    sessionId: task.sessionId,
    messages: [{ role: "user", content: [{ type: "text", text: "你好" }] }],
    limits: { inputTokens: 1000, outputTokens: 1000, outputImages: 0, creditUnits: null },
  };
}
async function setup(change: Partial<CloudTask> = {}) {
  const stub = account();
  const now = Date.now();
  const initial: CloudTask = {
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
    request: "",
    submittedAt: 0,
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
    prompt: "测试任务",
    idempotencyKey: crypto.randomUUID(),
    state: "submitting",
    upstreamStatus: "",
    jobId: "",
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
  const saved = await inStore(stub, async (store) => {
    store.save(initial);
    store.saveProvision({
      scope: cloudAgentScope(initial),
      profiles: [initial.profileId],
      externalId: `wechatai:${stub.id}`,
      appUserId: "user-one",
      workspaceId: "workspace-one",
      configured: 1,
      updatedAt: now,
    });
    await prepareCloudAgentRequest(settings(), store, stub.id.toString(), initial.id, eligible);
    return store.patch(initial, change);
  });
  return {
    stub,
    saved,
    submit: (store: CloudAgentStore, vars = settings(), client = config, reason = eligible) =>
      submitCloudAgentTask(vars, client, store, stub.id.toString(), saved.id, reason),
  };
}
const job = (change: Record<string, unknown> = {}) => ({
  id: "job-one",
  workspaceId: "workspace-one",
  tenantId: config.tenantId,
  conversationId: "conversation-one",
  status: "queued",
  ...change,
});
function network(reply: (request: Request) => Response | Promise<Response>) {
  const calls: Request[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    calls.push(request);
    return reply(request);
  });
  return calls;
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("durable AGT job submission", () => {
  it("explains how to resend consumed attachments after a definitive submission rejection", async () => {
    const { stub, saved, submit } = await setup({ hasAttachments: true });
    network(() => new Response("private provider response", { status: 429 }));
    await inStore(stub, async (store) => {
      const rejected = await submit(store);
      expect(rejected).toMatchObject({ state: "rejected", settled: 0, units: 0 });
      expect(rejected?.error).toContain("请重新发送附件，等暂存成功后再发送完整处理要求");
      expect(store.countSince(saved.createdAt)).toBe(0);
    });
  });
  it.each(["input", "credits", "empty"])(
    "rejects a never-attempted %s limit failure before POST",
    async (limit) => {
      const { stub, saved, submit } = await setup({ request: "" });
      const calls = network(() => {
        throw new Error("Must not submit an unusable invocation");
      });
      await inStore(stub, async (store) => {
        const request = invocation(saved);
        store.patch(saved, {
          invocation: {
            ...request,
            limits: {
              ...request.limits,
              ...(limit === "input"
                ? { inputTokens: 1 }
                : { creditUnits: limit === "credits" ? 0 : 1 }),
            },
          },
        });
        expect(await submit(store)).toMatchObject({
          state: "rejected",
          submittedAt: 0,
          unconfirmed: 0,
          units: 0,
          request: "",
        });
        expect(store.get(saved.id)!.error).toContain("任务未提交");
        expect(store.get(saved.id)!.error).toContain("未扣 credits");
        expect(store.active()).toEqual([]);
        expect(store.countSince(0)).toBe(0);
      });
      expect(calls).toHaveLength(0);
    },
  );

  it("does not reject an ambiguous original POST because its metering snapshot exceeds a limit", async () => {
    const { stub, saved, submit } = await setup({ submittedAt: 123, unconfirmed: 1 });
    const calls = network(() => Response.json(job(), { status: 202 }));
    await inStore(stub, async (store) => {
      const request = invocation(saved);
      store.patch(saved, {
        invocation: { ...request, limits: { ...request.limits, creditUnits: 0 } },
      });
      expect(await submit(store)).toMatchObject({ state: "accepted", jobId: "job-one" });
      expect(store.countSince(0)).toBe(1);
    });
    expect(calls).toHaveLength(1);
  });

  it("prepares a new task's encrypted body before the first POST", async () => {
    const { stub, saved, submit } = await setup({ request: "" });
    await inStore(stub, async (store) => {
      const calls = network(async (request) => {
        const task = store.get(saved.id)!;
        expect(task.request).toBeTruthy();
        expect(task.request).not.toContain(saved.prompt);
        expect(task).toMatchObject({ unconfirmed: 1, submittedAt: expect.any(Number) });
        expect(task.submittedAt).toBeGreaterThan(0);
        expect(JSON.parse(await request.text())).toMatchObject({
          workspaceId: "workspace-one",
          agentId: saved.profileId,
          model: saved.model,
          conversationId: saved.conversationId,
          message: saved.prompt,
        });
        return Response.json(job(), { status: 202 });
      });
      expect(await submit(store)).toMatchObject({ state: "accepted", jobId: "job-one" });
      expect(calls).toHaveLength(1);
    });
  });

  it("persists ambiguity before I/O, then replays identical bytes after restart and polls the associated job", async () => {
    const { stub, saved, submit } = await setup();
    const first = await inStore(stub, async (store) => {
      const calls = network(() => {
        expect(store.get(saved.id)).toMatchObject({
          unconfirmed: 1,
          submittedAt: expect.any(Number),
        });
        throw new DOMException("response lost", "TimeoutError");
      });
      await expect(submit(store)).rejects.toMatchObject({ code: "cloud_agent_unreachable" });
      const task = store.get(saved.id)!;
      expect(task.submittedAt).toBeGreaterThan(0);
      expect(task).toMatchObject({
        state: "submitting",
        unconfirmed: 1,
        jobId: "",
        settled: 0,
        units: 0,
      });
      expect(store.active()).toEqual([task]);
      expect(store.countSince(saved.createdAt)).toBe(1);
      expect(calls).toHaveLength(1);
      return { task, raw: await calls[0].text() };
    });
    await abortAllDurableObjects();
    const retryCalls = network(async (request) => {
      expect(await request.text()).toBe(first.raw);
      expect(request.headers.get("idempotency-key")).toBe(saved.idempotencyKey);
      expect(request.headers.get("x-app-user")).toBe(`wechatai:${stub.id}`);
      expect(request.headers.get("authorization")).toBe("Bearer rotated-key");
      return Response.json(job(), { status: 202 });
    });
    await inStore(env.ACCOUNTS.get(stub.id), async (store) => {
      const accepted = await submit(
        store,
        settings({
          AGT_CALLBACK_KEYS: JSON.stringify({
            v2: "test-only-rotated-callback-key-of-32-characters",
          }),
        }),
        { ...config, appKey: "rotated-key", agentId: "profile-v2", model: "new-model" },
      );
      expect(accepted).toMatchObject({
        state: "accepted",
        jobId: "job-one",
        unconfirmed: 0,
        submittedAt: first.task.submittedAt,
        request: saved.request,
        error: "",
      });
      expect(await submit(store)).toBeNull();
      network(() =>
        Response.json(
          job({ status: "completed", result: { text: "final-answer", finishReason: "stop" } }),
        ),
      );
      expect(await pollCloudAgentTask(config, store, saved.id, eligible)).toMatchObject({
        state: "accepted",
        outcome: { status: "completed", text: "final-answer" },
        settled: 0,
        units: 0,
      });
    });
    expect(retryCalls).toHaveLength(1);
  });

  it.each([401, 403, 404, 413, 422, 429])(
    "persists a definitive first-attempt HTTP %s rejection for notification and releases quota",
    async (status) => {
      const { stub, saved, submit } = await setup();
      const calls = network(() => new Response("private provider response", { status }));
      await inStore(stub, async (store) => {
        const rejected = await submit(store);
        expect(rejected).toMatchObject({
          state: "rejected",
          unconfirmed: 0,
          delivered: 0,
          settled: 0,
          units: 0,
        });
        expect(rejected?.error).toContain("未扣 credits");
        expect(rejected?.error).not.toContain("private provider");
        expect(store.due()).toEqual([rejected]);
        expect(store.active()).toEqual([]);
        expect(store.countSince(saved.createdAt)).toBe(0);
        expect(await submit(store)).toBeNull();
      });
      expect(calls).toHaveLength(1);
    },
  );

  it.each([401, 429])(
    "keeps an earlier durable attempt unresolved after a later HTTP %s refusal",
    async (status) => {
      const { stub, saved, submit } = await setup({
        submittedAt: Date.now() - 1000,
        unconfirmed: 0,
      });
      await abortAllDurableObjects();
      const calls = network(() => new Response(null, { status }));
      await inStore(env.ACCOUNTS.get(stub.id), async (store) => {
        await expect(submit(store)).rejects.toMatchObject({ upstreamStatus: status });
        expect(store.get(saved.id)).toMatchObject({
          state: "submitting",
          unconfirmed: 1,
          jobId: "",
          submittedAt: saved.submittedAt,
        });
        expect(store.active()).toHaveLength(1);
        expect(store.countSince(saved.createdAt)).toBe(1);
      });
      expect(calls).toHaveLength(1);
    },
  );

  it("does not claim rejection when a callback arrives before the refused response", async () => {
    const { stub, saved, submit } = await setup();
    await inStore(stub, async (store) => {
      network(() => {
        store.receiveCallback("delivery-one", saved.id, "body-hash", "job-one");
        return new Response(null, { status: 429 });
      });
      await expect(submit(store)).rejects.toMatchObject({ upstreamStatus: 429 });
      expect(store.get(saved.id)).toMatchObject({ state: "submitting", unconfirmed: 1 });
      expect(store.countSince(saved.createdAt)).toBe(1);
    });
  });

  it.each([400, 409])(
    "keeps HTTP %s for read-only reconciliation without another POST after restart",
    async (status) => {
      const { stub, saved, submit } = await setup();
      network(() => new Response(null, { status }));
      await inStore(stub, async (store) => {
        await expect(submit(store)).rejects.toMatchObject({ upstreamStatus: status });
        expect(store.get(saved.id)).toMatchObject({
          state: "submitting",
          stopRequested: 1,
          unconfirmed: 1,
        });
      });
      await abortAllDurableObjects();
      const calls = network(() => Response.json({ jobs: [job()], hasMore: false }));
      await inStore(env.ACCOUNTS.get(stub.id), async (store) => {
        expect(await submit(store)).toBeNull();
        expect(await reconcileCloudAgentJob(config, store, saved.id)).toBe("job-one");
      });
      expect(calls.map((request) => request.method)).toEqual(["GET"]);
    },
  );

  it.each(["server error", "invalid JSON", "invalid job", "unexpected success"])(
    "retains an ambiguous %s without releasing execution quota",
    async (response) => {
      const { stub, saved, submit } = await setup();
      const calls = network(() => {
        if (response === "server error") return new Response(null, { status: 503 });
        if (response === "invalid JSON") return new Response("not JSON");
        if (response === "invalid job") return Response.json({});
        return Response.json(job(), { status: 201 });
      });
      await inStore(stub, async (store) => {
        await expect(submit(store)).rejects.toBeInstanceOf(Error);
        expect(store.get(saved.id)).toMatchObject({
          state: "submitting",
          unconfirmed: 1,
          jobId: "",
          settled: 0,
          units: 0,
        });
        expect(store.active()).toHaveLength(1);
        expect(store.countSince(saved.createdAt)).toBe(1);
      });
      expect(calls).toHaveLength(1);
    },
  );

  it.each(["awaiting_approval", "completed", "failed", "cancelled"])(
    "immediately schedules GET for a %s submit response without freezing its result",
    async (status) => {
      const { stub, submit } = await setup();
      network(() =>
        Response.json(job({ status, result: { text: "unconfirmed-result" } }), { status: 202 }),
      );
      await inStore(stub, async (store) => {
        const accepted = await submit(store);
        expect(accepted).toMatchObject({
          state: "accepted",
          upstreamStatus: status,
          outcome: null,
          result: "",
          settled: 0,
          units: 0,
        });
        expect(store.due()).toEqual([accepted]);
      });
    },
  );

  it.each([
    { workspaceId: "another-workspace" },
    { tenantId: "another-tenant" },
    { tenantId: undefined },
    { conversationId: "another-conversation" },
    { conversationId: undefined },
    { appId: "another-app" },
    { appUserId: "another-user" },
  ])("never associates an unverified response: %j", async (change) => {
    const { stub, saved, submit } = await setup();
    const calls = network(() => Response.json(job(change), { status: 202 }));
    await inStore(stub, async (store) => {
      await expect(submit(store)).rejects.toMatchObject({ code: "cloud_job_identity" });
      expect(store.get(saved.id)).toMatchObject({
        state: "submitting",
        jobId: "",
        unconfirmed: 1,
        stopRequested: 1,
      });
      expect(await submit(store)).toBeNull();
    });
    expect(calls).toHaveLength(1);
  });

  it("rejects a response inconsistent with callback evidence or another local job owner", async () => {
    for (const conflict of ["callback", "owner"]) {
      const { stub, saved, submit } = await setup();
      await inStore(stub, async (store) => {
        if (conflict === "callback")
          store.receiveCallback("delivery-one", saved.id, "body-hash", "another-job");
        else
          store.save({
            ...saved,
            id: crypto.randomUUID(),
            sourceId: crypto.randomUUID(),
            jobId: "job-one",
            state: "accepted",
          });
        network(() => Response.json(job(), { status: 202 }));
        await expect(submit(store)).rejects.toMatchObject({ code: "cloud_job_identity" });
        expect(store.get(saved.id)).toMatchObject({
          state: "submitting",
          jobId: "",
          unconfirmed: 1,
          stopRequested: 1,
        });
      });
    }
  });

  it.each(["stop", "hide"])(
    "keeps a concurrent %s while associating a successful response for cancellation",
    async (action) => {
      const { stub, saved, submit } = await setup();
      await inStore(stub, async (store) => {
        network(() => {
          if (action === "hide") store.hideSession(saved.sessionId);
          else store.patch(saved, { stopRequested: 1, error: "用户已请求停止。" });
          return Response.json(job(), { status: 202 });
        });
        expect(await submit(store)).toMatchObject({
          state: "accepted",
          jobId: "job-one",
          stopRequested: 1,
          unconfirmed: 0,
        });
        const task = store.get(saved.id)!;
        expect(store.due()).toEqual([task]);
        if (action === "hide")
          expect(task).toMatchObject({ hidden: 1, request: "", prompt: "", error: "" });
        else expect(task.error).toBe("用户已请求停止。");
      });
    },
  );

  it("keeps a stop received during a lost submission response and resumes through GET only", async () => {
    const { stub, saved, submit } = await setup();
    await inStore(stub, async (store) => {
      network(() => {
        store.stopSession(saved.sessionId);
        store.receiveCallback("delivery-one", saved.id, "body-hash", "job-one");
        throw new TypeError("response lost");
      });
      await expect(submit(store)).rejects.toMatchObject({ code: "cloud_agent_unreachable" });
      expect(store.get(saved.id)).toMatchObject({
        state: "submitting",
        stopRequested: 1,
        unconfirmed: 1,
      });
    });
    await abortAllDurableObjects();
    const calls = network(() => Response.json(job()));
    await inStore(env.ACCOUNTS.get(stub.id), async (store) => {
      expect(await submit(store)).toBeNull();
      expect(await reconcileCloudAgentJob(config, store, saved.id)).toBe("job-one");
    });
    expect(calls.map((request) => request.method)).toEqual(["GET"]);
  });

  it("does not mark an attempt or POST when stopping during request decryption", async () => {
    const { stub, saved, submit } = await setup();
    const calls = network(() => Response.json(job()));
    await inStore(stub, async (store) => {
      const original = crypto.subtle.decrypt.bind(crypto.subtle);
      vi.spyOn(crypto.subtle, "decrypt").mockImplementation(async (...args) => {
        store.stopSession(saved.sessionId);
        return original(...args);
      });
      expect(await submit(store)).toBeNull();
      expect(store.get(saved.id)).toMatchObject({
        stopRequested: 1,
        submittedAt: 0,
        unconfirmed: 0,
      });
    });
    expect(calls).toHaveLength(0);
  });

  it.each<Partial<CloudTask>>([
    { stopRequested: 1 },
    { hidden: 1 },
    { deadline: 1 },
    { state: "accepted", jobId: "job-one" },
    { state: "rejected" },
  ])("does not POST tasks outside submission eligibility: %j", async (change) => {
    const { stub, saved, submit } = await setup(change);
    const calls = network(() => Response.json(job()));
    await inStore(stub, async (store) => {
      expect(await submit(store)).toBeNull();
      expect(store.get(saved.id)).toEqual(saved);
    });
    expect(calls).toHaveLength(0);
  });

  it("checks the live gate, task scope and eligibility before any POST", async () => {
    const { stub, saved, submit } = await setup();
    const calls = network(() => Response.json(job()));
    await inStore(stub, async (store) => {
      expect(await submit(store, settings({ CLOUD_AGENT_ENABLED: "false" }))).toBeNull();
      await expect(
        submit(store, settings(), { ...config, appId: "another-app" }),
      ).rejects.toMatchObject({ code: "cloud_config_changed" });
      expect(
        await submitCloudAgentTask(
          settings(),
          config,
          store,
          stub.id.toString(),
          saved.id,
          () => "插件已停用。",
        ),
      ).toBeNull();
      expect(store.get(saved.id)).toEqual(saved);
    });
    expect(calls).toHaveLength(0);
  });
});
