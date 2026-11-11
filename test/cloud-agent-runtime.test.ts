import { abortAllDurableObjects, env, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentJobView } from "../src/server/cloud-agent-client";
import { cloudAgentScope } from "../src/server/cloud-agent-provision";
import { CloudAgentRuntime } from "../src/server/cloud-agent-runtime";
import { CloudAgentStore, type CloudTask } from "../src/server/cloud-agent-store";
import { cloudAgentConfig } from "../src/server/config";

const scope = { origin: "https://agt.example.com", appId: "app-one", tenantId: "tenant-one" };
const job = (change: Partial<AgentJobView> = {}): AgentJobView => ({
  id: "job-one",
  status: "running",
  workspaceId: "workspace-one",
  tenantId: scope.tenantId,
  conversationId: "conversation-one",
  ...change,
});
const account = () => env.ACCOUNTS.getByName(crypto.randomUUID());
function inStore<T>(stub: ReturnType<typeof account>, run: (store: CloudAgentStore) => T) {
  return runInDurableObject(stub, (_, state) => {
    const store = new CloudAgentStore(state.storage);
    store.init();
    return run(store);
  });
}
async function setup(change: Partial<CloudTask> = {}) {
  const stub = account();
  const now = Date.now();
  const saved: CloudTask = {
    id: crypto.randomUUID(),
    sourceId: crypto.randomUUID(),
    ...scope,
    profileId: "profile-v1",
    model: "test-model",
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
    ...change,
  };
  const values: Record<string, string> = {
    CLOUD_AGENT_ENABLED: "true",
    AGT_ORIGIN: scope.origin,
    AGT_APP_ID: scope.appId,
    AGT_TENANT_ID: scope.tenantId,
    AGT_APP_KEY: "test-only-app-key",
    AGT_AGENT_ID: "profile",
    AGT_MODEL: "test-model",
  };
  const settings = new Proxy(env, {
    get: (target, name) =>
      Reflect.has(values, name) ? Reflect.get(values, name) : Reflect.get(target, name),
  });
  await inStore(stub, (store) => store.save(saved));
  const runtime = (store: CloudAgentStore, reason: () => string | undefined = () => undefined) => {
    const host = {
      stopReason: vi.fn(reason),
      finalize: vi.fn((task: CloudTask, outcome: AgentJobView) =>
        store.patch(task, {
          state: outcome.status === "completed" ? "completed" : "failed",
          result: outcome.text ?? "",
          nextAt: Date.now(),
        }),
      ),
      deliver: vi.fn((task: CloudTask) =>
        store.patch(task, {
          delivered: 1,
          deliveryStatus: "sent",
          nextAt: 0,
        }),
      ),
    };
    return { host, runner: new CloudAgentRuntime(settings, store, stub.id.toString(), host) };
  };
  return { stub, saved, values, settings, runtime };
}
function provision(store: CloudAgentStore, id: string) {
  store.saveProvision({
    scope: cloudAgentScope(scope),
    profiles: ["profile-v1"],
    externalId: `wechatai:${id}`,
    appUserId: "user-one",
    workspaceId: "workspace-one",
    configured: 1,
    updatedAt: Date.now(),
  });
}
function wake(store: CloudAgentStore, id: string) {
  return store.patch(store.get(id)!, { nextAt: Date.now() });
}
function network(reply?: (request: Request) => Response | Promise<Response>) {
  const calls: Request[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      calls.push(request);
      if (reply) return reply(request);
      const path = new URL(request.url).pathname;
      if (path.endsWith("/users")) {
        const body = await request.clone().json<{ externalId: string }>();
        return Response.json(
          {
            appUser: {
              id: "user-one",
              appId: scope.appId,
              tenantId: scope.tenantId,
              externalId: body.externalId,
            },
          },
          { status: 201 },
        );
      }
      if (path === "/api/workspaces/ensure")
        return Response.json(
          {
            workspace: {
              id: "workspace-one",
              tenantId: scope.tenantId,
              name: "test-account",
              accessMode: "restricted",
            },
          },
          { status: 201 },
        );
      if (path.includes("/agents/")) return Response.json({ ok: true });
      return Response.json(job(), { status: path === "/api/agent/jobs" ? 202 : 200 });
    }),
  );
  return calls;
}
const pass = (runner: CloudAgentRuntime) => runner.process(Date.now() + 30_000);
const lifecycleStops = {
  plugin: (store: CloudAgentStore, task: CloudTask) => store.stopPlugin(task.pluginId),
  session: (store: CloudAgentStore, task: CloudTask) => store.stopSession(task.sessionId),
  connection: (store: CloudAgentStore, task: CloudTask) => store.stopConnection(task.connectionId),
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("durable AGT recovery runner", () => {
  it("provisions and submits, then resumes polling, finalization and delivery after restart", async () => {
    const { stub, saved, runtime } = await setup();
    const calls = network();
    await inStore(stub, async (store) => {
      const { runner } = runtime(store);
      await pass(runner);
      expect(store.get(saved.id)).toMatchObject({
        state: "accepted",
        jobId: "job-one",
        settled: 0,
        units: 0,
      });
      expect(calls.map((r) => new URL(r.url).pathname)).toEqual([
        "/api/apps/app-one/users",
        "/api/workspaces/ensure",
        "/api/workspaces/workspace-one/agents/profile-v1",
        "/api/agent/jobs",
      ]);
    });
    await abortAllDurableObjects();
    network(() => Response.json({ ...job({ status: "completed" }), result: { text: "最终结果" } }));
    await inStore(env.ACCOUNTS.get(stub.id), async (store) => {
      wake(store, saved.id);
      const { runner, host } = runtime(store);
      await pass(runner);
      expect(host.finalize).toHaveBeenCalledOnce();
      expect(host.finalize.mock.calls[0][1]).toMatchObject({ text: "最终结果" });
      expect(store.get(saved.id)).toMatchObject({
        state: "completed",
        delivered: 0,
        settled: 0,
        units: 0,
      });
      await pass(runner);
      expect(host.deliver).toHaveBeenCalledOnce();
      expect(store.get(saved.id)?.deliveryStatus).toBe("sent");
      await pass(runner);
      expect(host.finalize).toHaveBeenCalledOnce();
      expect(host.deliver).toHaveBeenCalledOnce();
    });
  });

  it.each(["stop", "expired", "disabled", "ineligible", "credits", "hidden"])(
    "rejects %s work before any upstream submission and releases its reservation",
    async (cause) => {
      const { stub, saved, values, runtime } = await setup({
        ...(cause === "stop" ? { stopRequested: 1 } : {}),
        ...(cause === "expired" ? { deadline: Date.now() - 1 } : {}),
        ...(cause === "hidden"
          ? { hidden: 1, prompt: "", delivered: 1, stale: 1, deliveryStatus: "stale" as const }
          : {}),
      });
      if (cause === "disabled") values.CLOUD_AGENT_ENABLED = "false";
      const calls = network();
      await inStore(stub, async (store) => {
        const reason =
          cause === "ineligible"
            ? "Plus 已到期，请续费后重新发送。"
            : cause === "credits"
              ? "credits 不足，请补充余额后重新发送。"
              : undefined;
        const { runner, host } = runtime(store, () => reason);
        await pass(runner);
        expect(calls).toHaveLength(0);
        expect(store.get(saved.id)).toMatchObject({ state: "rejected", unconfirmed: 0, units: 0 });
        expect(store.countSince(0)).toBe(0);
        if (cause === "hidden") {
          expect(host.deliver).not.toHaveBeenCalled();
          expect(store.get(saved.id)?.error).toBe("");
        } else {
          expect(host.deliver).toHaveBeenCalledOnce();
          const notice = host.deliver.mock.calls[0][0].error;
          expect(notice).toContain("任务未提交，未扣 credits。");
          expect(notice).toContain(
            reason ??
              {
                stop: "任务已停止。",
                expired: "任务已超时。",
                disabled: "云端服务已暂停，请稍后重试。",
              }[cause as "stop" | "expired" | "disabled"],
          );
          expect(notice).not.toMatch(/正在请求停止|正在核对/);
        }
      });
    },
  );

  it.each([200, 403, 503])(
    "preserves a stop reason when eligibility changes during provisioning (HTTP %i)",
    async (status) => {
      const { stub, saved, runtime } = await setup();
      let allowed = true;
      let stop = () => {};
      const calls = network(() => {
        stop();
        allowed = false;
        return Response.json({ ok: true }, { status });
      });
      await inStore(stub, async (store) => {
        stop = () => store.stopPlugin(saved.pluginId);
        // Only the profile request is outstanding; a response can race a stop.
        provision(store, stub.id.toString());
        store.saveProvision({ ...store.provision()!, profiles: [] });
        const { runner, host } = runtime(store, () =>
          allowed ? undefined : "插件已停用，请在网页插件页重新启用。",
        );
        await pass(runner);
        expect(calls).toHaveLength(1);
        expect(store.get(saved.id)).toMatchObject({ state: "rejected", submittedAt: 0 });
        expect(host.deliver.mock.calls[0][0].error).toBe(
          "插件已停用，请在网页插件页重新启用。\n\n任务未提交，未扣 credits。",
        );
      });
    },
  );

  it.each(Object.entries(lifecycleStops))(
    "preserves the %s lifecycle reason through rejection, delivery failure and restart",
    async (cause, stop) => {
      const reasons: Record<string, string> = {
        plugin: "插件已停用，请在网页插件页重新启用。",
        session: "原会话已归档，请在新会话重新发送。",
        connection: "微信链接已变更，请在当前链接重新发送。",
      };
      const reason = reasons[cause];
      const { stub, saved, runtime } = await setup();
      const calls = network();
      await inStore(stub, async (store) => {
        stop(store, saved);
        expect(store.get(saved.id)).toMatchObject({ stopRequested: 1, error: "" });
        const { runner, host } = runtime(store, () => reason);
        host.deliver.mockImplementationOnce(() => {
          throw new Error("temporary send failure");
        });
        await pass(runner);
        expect(host.stopReason).toHaveBeenCalledOnce();
        expect(store.get(saved.id)).toMatchObject({
          state: "rejected",
          error: `${reason}\n\n任务未提交，未扣 credits。`,
          delivered: 0,
          attempts: 1,
          units: 0,
        });
        expect(store.countSince(0)).toBe(0);
        const nextAt = store.get(saved.id)!.nextAt;
        await pass(runner);
        expect(host.deliver).toHaveBeenCalledOnce();
        expect(store.get(saved.id)!.nextAt).toBe(nextAt);
      });
      await abortAllDurableObjects();
      await inStore(env.ACCOUNTS.get(stub.id), async (store) => {
        wake(store, saved.id);
        const { runner, host } = runtime(store, () => "后来发生的其他原因");
        await pass(runner);
        expect(host.stopReason).not.toHaveBeenCalled();
        expect(host.deliver.mock.calls[0][0].error).toBe(`${reason}\n\n任务未提交，未扣 credits。`);
        expect(store.get(saved.id)?.delivered).toBe(1);
      });
      expect(calls).toHaveLength(0);
    },
  );

  it.each(Object.entries(lifecycleStops))(
    "fills a missing %s lifecycle reason without waking a submitted task before its retry time",
    async (_, stop) => {
      const { stub, saved, runtime } = await setup({
        state: "accepted",
        jobId: "job-one",
        submittedAt: Date.now(),
        attempts: 3,
      });
      const reason = "插件已停用，请在网页插件页重新启用。";
      const nextAt = Date.now() + 120_000;
      const calls = network();
      await inStore(stub, async (store) => {
        stop(store, saved);
        store.patch(saved, { nextAt });
        const { runner, host } = runtime(store, () => reason);
        await pass(runner);
        expect(host.stopReason).toHaveBeenCalledOnce();
        expect(store.get(saved.id)).toMatchObject({
          error: reason,
          stopRequested: 1,
          nextAt,
          attempts: 3,
        });
        expect(store.nextAt()).toBe(nextAt);
        await pass(runner);
        expect(host.stopReason).toHaveBeenCalledOnce();
        expect(store.get(saved.id)?.nextAt).toBe(nextAt);
        expect(host.deliver).not.toHaveBeenCalled();
      });
      expect(calls).toHaveLength(0);
    },
  );

  it.each(["lifecycle", "direct"])(
    "fills a %s stop cause instead of reusing an earlier reconciliation progress message",
    async (kind) => {
      const { stub, saved, runtime } = await setup({
        state: "accepted",
        jobId: "job-one",
        submittedAt: Date.now(),
        error: "提交结果尚未确认，正在恢复原任务。",
      });
      const reason = "插件已停用，请重新启用。";
      await inStore(stub, async (store) => {
        if (kind === "lifecycle") store.stopPlugin(saved.pluginId);
        else store.patch(saved, { stopRequested: 1 });
        store.patch(saved, { nextAt: Date.now() + 60_000 });
        const { runner } = runtime(store, () => reason);
        await pass(runner);
        expect(store.get(saved.id)).toMatchObject({
          stopRequested: 1,
          stopReason: reason,
          error: reason,
        });
      });
    },
  );

  it("does not replace a persisted stop reason after another lifecycle hook runs", async () => {
    const reason = "用户已请求停止。";
    const { stub, saved, runtime } = await setup({ stopRequested: 1, error: reason });
    await inStore(stub, async (store) => {
      store.stopPlugin(saved.pluginId);
      const { runner, host } = runtime(store, () => "插件已停用，请重新启用。");
      await pass(runner);
      expect(host.stopReason).not.toHaveBeenCalled();
      expect(host.deliver.mock.calls[0][0].error).toBe(`${reason}\n\n任务未提交，未扣 credits。`);
    });
  });

  it("retains the stopped notification and its guidance across a failed delivery and restart", async () => {
    const reason = "Plus 已到期，请续费后重新发送。";
    const { stub, saved, runtime } = await setup({ stopRequested: 1, error: reason });
    await inStore(stub, async (store) => {
      const { runner, host } = runtime(store);
      host.deliver.mockImplementationOnce(() => {
        throw new Error("delivery failed");
      });
      await pass(runner);
      expect(store.get(saved.id)).toMatchObject({ state: "rejected", delivered: 0, units: 0 });
      expect(store.countSince(0)).toBe(0);
    });
    await abortAllDurableObjects();
    await inStore(env.ACCOUNTS.get(stub.id), async (store) => {
      wake(store, saved.id);
      const { runner, host } = runtime(store);
      await pass(runner);
      expect(host.deliver.mock.calls[0][0].error).toBe(`${reason}\n\n任务未提交，未扣 credits。`);
      expect(store.get(saved.id)?.delivered).toBe(1);
    });
  });

  it("provisions an already-admitted task from its snapshot when new-task defaults are invalid", async () => {
    const { stub, saved, values, runtime } = await setup();
    Object.assign(values, {
      AGT_MODEL: "",
      AGT_AGENT_ID: "Uppercase",
      AGT_WORKSPACE_PREFIX: "bad/prefix",
    });
    const calls = network();
    await inStore(stub, async (store) => {
      await pass(runtime(store).runner);
      expect(store.get(saved.id)).toMatchObject({ state: "accepted", jobId: "job-one" });
      expect(await calls[1].json()).toMatchObject({ name: saved.workspaceName });
      expect(calls[2].url).toMatch(/\/agents\/profile-v1$/);
      expect(await calls[3].json()).toMatchObject({ agentId: saved.profileId, model: saved.model });
    });
  });

  it.each([403, 429])(
    "persists an unsubmitted provisioning refusal (%i) for delivery",
    async (status) => {
      const { stub, saved, runtime } = await setup();
      const calls = network(() => new Response(null, { status }));
      await inStore(stub, async (store) => {
        const { runner, host } = runtime(store);
        await pass(runner);
        expect(calls).toHaveLength(1);
        expect(store.get(saved.id)).toMatchObject({
          state: "rejected",
          submittedAt: 0,
          delivered: 1,
        });
        expect(host.deliver).toHaveBeenCalledOnce();
      });
    },
  );

  it("retries an ambiguous POST with the frozen body and original key after restart", async () => {
    const { stub, saved, values, runtime } = await setup();
    let originalBody = "";
    network(async (request) => {
      originalBody = await request.text();
      throw new TypeError("lost response");
    });
    await inStore(stub, async (store) => {
      provision(store, stub.id.toString());
      await pass(runtime(store).runner);
      expect(store.get(saved.id)).toMatchObject({
        state: "submitting",
        unconfirmed: 1,
        attempts: 1,
      });
    });
    await abortAllDurableObjects();
    values.AGT_MODEL = "";
    values.AGT_AGENT_ID = "Uppercase";
    values.AGT_WORKSPACE_PREFIX = "bad/prefix";
    let retryBody = "";
    const retries = network(async (request) => {
      retryBody = await request.text();
      return Response.json(job(), { status: 202 });
    });
    await inStore(env.ACCOUNTS.get(stub.id), async (store) => {
      wake(store, saved.id);
      await pass(runtime(store).runner);
      expect(store.get(saved.id)).toMatchObject({ state: "accepted", attempts: 0 });
    });
    expect(retryBody).toBe(originalBody);
    expect(retries[0].headers.get("idempotency-key")).toBe(saved.idempotencyKey);
  });

  it.each([400, 409])("uses only GET recovery after an ambiguous HTTP %i", async (status) => {
    const { stub, saved, runtime } = await setup();
    network(() => new Response(null, { status }));
    await inStore(stub, async (store) => {
      provision(store, stub.id.toString());
      await pass(runtime(store).runner);
      expect(store.get(saved.id)?.stopRequested).toBe(1);
      const calls = network(() => Response.json({ jobs: [job()], hasMore: false }));
      wake(store, saved.id);
      await pass(runtime(store).runner);
      expect(calls.map((r) => r.method)).toEqual(["GET"]);
      expect(store.get(saved.id)).toMatchObject({
        state: "accepted",
        jobId: "job-one",
        stopRequested: 1,
      });
    });
  });

  it("recovers a missing original request read-only instead of rebuilding it", async () => {
    const { stub, saved, runtime } = await setup({ submittedAt: Date.now(), unconfirmed: 1 });
    const calls = network(() => Response.json({ jobs: [job()], hasMore: false }));
    await inStore(stub, async (store) => {
      provision(store, stub.id.toString());
      await pass(runtime(store).runner);
      expect(calls.map((r) => r.method)).toEqual(["GET"]);
      expect(store.get(saved.id)).toMatchObject({
        state: "accepted",
        jobId: "job-one",
        stopRequested: 1,
        request: "",
      });
    });
  });

  it("uses verified callback evidence to recover instead of retrying a POST", async () => {
    const { stub, saved, runtime } = await setup({
      submittedAt: Date.now(),
      unconfirmed: 1,
      request: "original-encrypted-request",
    });
    const calls = network(() => Response.json(job()));
    await inStore(stub, async (store) => {
      provision(store, stub.id.toString());
      store.delivery("verified-delivery", saved.id, "body-hash", "job-one");
      await pass(runtime(store).runner);
      expect(calls.map((request) => request.method)).toEqual(["GET"]);
      expect(store.get(saved.id)).toMatchObject({
        state: "accepted",
        jobId: "job-one",
        unconfirmed: 0,
      });
    });
  });

  it("persists exponential retry times across eviction when the configured scope changes", async () => {
    const { stub, saved, values, runtime } = await setup({
      state: "accepted",
      jobId: "job-one",
      submittedAt: Date.now(),
      attempts: 4,
    });
    values.AGT_ORIGIN = "https://other.example.com";
    const calls = network();
    const now = Date.now();
    await inStore(stub, async (store) => {
      await pass(runtime(store).runner);
      expect(store.get(saved.id)).toMatchObject({
        state: "accepted",
        attempts: 5,
        jobId: "job-one",
      });
      expect(store.get(saved.id)!.nextAt).toBeGreaterThanOrEqual(now + 240_000);
    });
    await abortAllDurableObjects();
    await inStore(env.ACCOUNTS.get(stub.id), async (store) => {
      await pass(runtime(store).runner);
      expect(store.get(saved.id)?.attempts).toBe(5);
      expect(calls).toHaveLength(0);
      expect(store.countSince(0)).toBe(1);
    });
  });

  it("keeps an unresolved stopped submission reserved and respects reconciliation pagination", async () => {
    const { stub, saved, runtime } = await setup({
      submittedAt: Date.now(),
      unconfirmed: 1,
      stopRequested: 1,
    });
    let page = 0;
    network(() =>
      Response.json(
        page++ === 0
          ? { jobs: [], hasMore: true, nextCursor: "page-two" }
          : { jobs: [], hasMore: false },
      ),
    );
    await inStore(stub, async (store) => {
      provision(store, stub.id.toString());
      const { runner } = runtime(store);
      const now = Date.now();
      await pass(runner);
      expect(store.get(saved.id)?.reconcileCursor).toBe("page-two");
      expect(store.get(saved.id)!.nextAt - now).toBeLessThan(2000);
      wake(store, saved.id);
      await pass(runner);
      expect(store.get(saved.id)).toMatchObject({
        state: "submitting",
        unconfirmed: 1,
        reconcileCursor: "",
      });
      expect(store.get(saved.id)!.nextAt).toBeGreaterThanOrEqual(now + 60_000);
      expect(store.countSince(0)).toBe(1);
    });
  });

  it.each([
    ["AGT_MODEL", ""],
    ["AGT_AGENT_ID", "Uppercase"],
    ["AGT_WORKSPACE_PREFIX", "bad/prefix"],
  ])(
    "finishes GET/cancel recovery with invalid %s and submissions disabled",
    async (name, value) => {
      const { stub, saved, values, settings, runtime } = await setup({
        state: "accepted",
        jobId: "job-one",
        submittedAt: Date.now(),
        stopRequested: 1,
      });
      values.CLOUD_AGENT_ENABLED = "false";
      values[name] = value;
      values.AGT_APP_KEY = "rotated-test-only-key";
      expect(cloudAgentConfig(settings)).toBeNull();
      let cancelled = false;
      const calls = network((request) => {
        if (request.url.endsWith("/cancel")) cancelled = true;
        return Response.json(job({ status: cancelled ? "cancelled" : "running" }));
      });
      await inStore(stub, async (store) => {
        provision(store, stub.id.toString());
        store.saveProvision({ ...store.provision()!, profiles: [] });
        const { runner, host } = runtime(store);
        await pass(runner);
        expect(calls.map((r) => r.method)).toEqual(["GET", "POST"]);
        expect(calls[1].url).toMatch(/\/cancel$/);
        expect(
          calls.every(
            (request) => request.headers.get("authorization") === "Bearer rotated-test-only-key",
          ),
        ).toBe(true);
        expect(store.get(saved.id)).toMatchObject({
          state: "accepted",
          stopRequested: 1,
          outcome: null,
        });
        wake(store, saved.id);
        await pass(runner);
        expect(calls.map((request) => request.method)).toEqual(["GET", "POST", "GET"]);
        expect(host.finalize.mock.calls[0][1].status).toBe("cancelled");
      });
    },
  );

  it("reconciles an unknown job and cancels it with all new-task defaults invalid", async () => {
    const { stub, saved, values, runtime } = await setup({
      submittedAt: Date.now(),
      stopRequested: 1,
      unconfirmed: 1,
    });
    Object.assign(values, {
      CLOUD_AGENT_ENABLED: "false",
      AGT_MODEL: "",
      AGT_AGENT_ID: "Uppercase",
      AGT_WORKSPACE_PREFIX: "bad/prefix",
    });
    const calls = network((request) =>
      Response.json(
        new URL(request.url).pathname.endsWith("/jobs") ? { jobs: [job()], hasMore: false } : job(),
      ),
    );
    await inStore(stub, async (store) => {
      provision(store, stub.id.toString());
      const { runner } = runtime(store);
      await pass(runner);
      expect(store.get(saved.id)).toMatchObject({
        state: "accepted",
        jobId: "job-one",
        unconfirmed: 0,
      });
      await pass(runner);
      expect(calls.map((request) => request.method)).toEqual(["GET", "GET", "POST"]);
      expect(calls[2].url).toMatch(/\/cancel$/);
    });
  });

  it("delivers a definitive first-submit rejection without finalizing or polling", async () => {
    const { stub, saved, runtime } = await setup();
    const calls = network(() => new Response(null, { status: 429 }));
    await inStore(stub, async (store) => {
      provision(store, stub.id.toString());
      const { runner, host } = runtime(store);
      await pass(runner);
      expect(calls).toHaveLength(1);
      expect(host.deliver).toHaveBeenCalledOnce();
      expect(host.finalize).not.toHaveBeenCalled();
      expect(store.get(saved.id)).toMatchObject({ state: "rejected", delivered: 1, units: 0 });
    });
  });

  it("finalizes frozen outcomes offline and preserves backoff beyond the original deadline", async () => {
    const outcome = job({ status: "completed", text: "已冻结的结果" });
    const { stub, saved, values, runtime } = await setup({
      state: "accepted",
      jobId: "job-one",
      outcome,
      deadline: Date.now() - 1,
    });
    values.CLOUD_AGENT_ENABLED = "false";
    values.AGT_APP_KEY = "";
    const calls = network();
    await inStore(stub, async (store) => {
      const { runner, host } = runtime(store, () => "会员已到期");
      host.finalize.mockImplementationOnce(() => {
        throw new Error("temporary local failure");
      });
      const now = Date.now();
      await pass(runner);
      expect(store.get(saved.id)).toMatchObject({ outcome, stopRequested: 0, attempts: 1 });
      expect(store.due(now + 1000)).toEqual([]);
      await pass(runner);
      expect(host.finalize).toHaveBeenCalledOnce();
      wake(store, saved.id);
      await pass(runner);
      expect(host.finalize).toHaveBeenCalledTimes(2);
      expect(host.stopReason).not.toHaveBeenCalled();
      expect(calls).toHaveLength(0);
    });
  });

  it("bounds a pass, skips exhausted budgets and never loops on a no-op delivery hook", async () => {
    const { stub, saved, runtime } = await setup({ state: "rejected" });
    await inStore(stub, async (store) => {
      for (let i = 0; i < 7; i++)
        store.save({ ...saved, id: crypto.randomUUID(), sourceId: crypto.randomUUID() });
      const { runner, host } = runtime(store);
      host.deliver.mockImplementation((task) => task);
      await runner.process(Date.now() + 1000);
      expect(host.deliver).not.toHaveBeenCalled();
      await pass(runner);
      expect(host.deliver).toHaveBeenCalledTimes(6);
      expect(new Set(host.deliver.mock.calls.map(([t]) => t.id)).size).toBe(6);
      await pass(runner);
      expect(host.deliver).toHaveBeenCalledTimes(8);
    });
  });

  it("prevents overlapping passes and releases its guard after a failed hook", async () => {
    const { stub, saved, runtime } = await setup({ state: "failed" });
    await inStore(stub, async (store) => {
      let release!: () => void;
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      const deliver = vi.fn(async () => {
        await blocked;
        throw new Error("send failed");
      });
      const host = { ...runtime(store).host, deliver };
      const runner = new CloudAgentRuntime(env, store, stub.id.toString(), host);
      const first = pass(runner);
      await pass(runner);
      expect(deliver).toHaveBeenCalledOnce();
      release();
      await first;
      wake(store, saved.id);
      await pass(runner);
      expect(deliver).toHaveBeenCalledTimes(2);
    });
  });
});
