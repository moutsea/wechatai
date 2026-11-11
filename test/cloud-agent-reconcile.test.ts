import { abortAllDurableObjects, env, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CloudAgentClientConfig } from "../src/server/cloud-agent-client";
import { cloudAgentScope } from "../src/server/cloud-agent-provision";
import { reconcileCloudAgentJob } from "../src/server/cloud-agent-reconcile";
import {
  CloudAgentStore,
  type CloudProvision,
  type CloudTask,
} from "../src/server/cloud-agent-store";

const config: CloudAgentClientConfig = {
  origin: "https://agt.example.com",
  appId: "app-one",
  appKey: "test-only-app-key",
  tenantId: "tenant-one",
  agentId: "profile-v1",
  model: "test-model",
};
const provision: CloudProvision = {
  scope: cloudAgentScope(config),
  profiles: [config.agentId],
  externalId: "wechatai:account-one",
  appUserId: "internal-user-one",
  workspaceId: "workspace-one",
  configured: 1,
  updatedAt: Date.now(),
};
const job = (change: Record<string, unknown> = {}) => ({
  id: "job-one",
  status: "running",
  workspaceId: provision.workspaceId,
  tenantId: config.tenantId,
  conversationId: "conversation-one",
  ...change,
});
function task(change: Partial<CloudTask> = {}): CloudTask {
  const now = Date.now();
  return {
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
    state: "submitting",
    upstreamStatus: "",
    jobId: "",
    createdAt: now,
    updatedAt: now,
    deadline: now + 60_000,
    nextAt: now,
    attempts: 0,
    stopRequested: 1,
    settled: 0,
    stale: 0,
    delivered: 0,
    result: "",
    error: "",
    units: 0,
    frozen: "",
    unconfirmed: 1,
    ...change,
  };
}
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
  const saved = task(change);
  await inStore(stub, (store) => {
    store.saveProvision(provision);
    store.save(saved);
  });
  return { stub, saved };
}
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

describe("read-only AGT submission reconciliation", () => {
  it("persists a scan across restart and waits for the last page before returning a unique ID", async () => {
    const { stub, saved } = await setup();
    const calls = network((request) =>
      Response.json({
        jobs: [job()],
        hasMore: !new URL(request.url).searchParams.has("after"),
        nextCursor: "page-two",
      }),
    );
    await inStore(stub, async (store) => {
      expect(await reconcileCloudAgentJob(config, store, saved.id)).toBeNull();
      expect(store.get(saved.id)).toMatchObject({
        reconcileCursor: "page-two",
        reconcileCandidates: ["job-one"],
        stopRequested: 1,
      });
    });
    expect(calls).toHaveLength(1);
    await abortAllDurableObjects();
    await inStore(env.ACCOUNTS.get(stub.id), async (store) => {
      expect(await reconcileCloudAgentJob(config, store, saved.id)).toBe("job-one");
      expect(store.get(saved.id)).toMatchObject({
        reconcileCursor: "",
        reconcileCandidates: [],
        state: "submitting",
        jobId: "",
        stopRequested: 1,
        settled: 0,
        units: 0,
      });
    });
    expect(new URL(calls[1].url).searchParams.get("after")).toBe("page-two");
    for (const request of calls) {
      expect(request.method).toBe("GET");
      expect(request.headers.get("x-app-user")).toBe(provision.externalId);
      expect(request.headers.get("authorization")).toBe(`Bearer ${config.appKey}`);
    }
  });

  it("does not guess when different pages contain two eligible jobs", async () => {
    const { stub, saved } = await setup();
    network((request) => {
      const first = !new URL(request.url).searchParams.has("after");
      return Response.json({
        jobs: [job({ id: first ? "first" : "second" })],
        hasMore: first,
        nextCursor: "page-two",
      });
    });
    await inStore(stub, async (store) => {
      expect(await reconcileCloudAgentJob(config, store, saved.id)).toBeNull();
      expect(await reconcileCloudAgentJob(config, store, saved.id)).toBeNull();
      expect(store.get(saved.id)).toMatchObject({
        jobId: "",
        reconcileCursor: "",
        reconcileCandidates: [],
      });
    });
  });

  it.each([
    { workspaceId: "other-workspace" },
    { tenantId: "other-tenant" },
    { conversationId: "other-conversation" },
    { appId: "other-app" },
    { appUserId: "other-user" },
    { tenantId: undefined },
    { conversationId: undefined },
  ])("ignores list entries outside the persisted identity (%j)", async (change) => {
    const { stub, saved } = await setup();
    network(() => Response.json({ jobs: [job(change)], hasMore: false }));
    await inStore(stub, async (store) => {
      expect(await reconcileCloudAgentJob(config, store, saved.id)).toBeNull();
      expect(store.get(saved.id)?.jobId).toBe("");
    });
  });

  it("confirms an authenticated callback hint with GET without adopting a different task's job", async () => {
    const { stub, saved } = await setup();
    const calls = network(() => Response.json(job()));
    await inStore(stub, async (store) => {
      store.delivery("delivery-one", saved.id, "signed-body-hash", "job-one");
      expect(await reconcileCloudAgentJob(config, store, saved.id)).toBe("job-one");
      store.save(task({ state: "accepted", jobId: "job-one" }));
      await expect(reconcileCloudAgentJob(config, store, saved.id)).rejects.toMatchObject({
        code: "cloud_job_identity",
      });
      expect(store.get(saved.id)?.jobId).toBe("");
    });
    expect(calls).toHaveLength(2);
    expect(
      calls.every((request) => request.method === "GET" && request.url.endsWith("/jobs/job-one")),
    ).toBe(true);
  });

  it.each([
    { id: "different-job" },
    { tenantId: "other-tenant" },
    { conversationId: "other-conversation" },
  ])("rejects callback hints contradicted by the authoritative job (%j)", async (change) => {
    const { stub, saved } = await setup();
    const calls = network(() => Response.json(job(change)));
    await inStore(stub, async (store) => {
      store.delivery("delivery-one", saved.id, "hash", "job-one");
      await expect(reconcileCloudAgentJob(config, store, saved.id)).rejects.toMatchObject({
        code: "cloud_job_identity",
      });
      expect(store.get(saved.id)).toEqual(saved);
    });
    expect(calls).toHaveLength(1);
  });

  it("does not choose between conflicting callback job IDs", async () => {
    const { stub, saved } = await setup();
    const calls = network(() => Response.json(job()));
    await inStore(stub, async (store) => {
      store.delivery("delivery-one", saved.id, "hash-one", "job-one");
      store.delivery("delivery-two", saved.id, "hash-two", "job-two");
      await expect(reconcileCloudAgentJob(config, store, saved.id)).rejects.toMatchObject({
        code: "cloud_job_identity",
      });
    });
    expect(calls).toHaveLength(0);
  });

  it("rechecks callback evidence received during a query before returning any candidate", async () => {
    const { stub, saved } = await setup();
    await inStore(stub, async (store) => {
      network(() => {
        store.delivery("delivery-one", saved.id, "hash-one", "job-two");
        return Response.json({ jobs: [job()], hasMore: false });
      });
      expect(await reconcileCloudAgentJob(config, store, saved.id)).toBeNull();
      network(() => {
        store.delivery("delivery-two", saved.id, "hash-two", "job-one");
        return Response.json(job({ id: "job-two" }));
      });
      await expect(reconcileCloudAgentJob(config, store, saved.id)).rejects.toMatchObject({
        code: "cloud_job_identity",
      });
      expect(store.get(saved.id)).toEqual(saved);
    });
  });

  it("keeps scan progress on network failure and rejects a cursor that does not advance", async () => {
    const { stub, saved } = await setup({
      reconcileCursor: "page-two",
      reconcileCandidates: ["job-one"],
    });
    const calls = network(() => Response.json({ error: "unavailable" }, { status: 503 }));
    await inStore(stub, async (store) => {
      await expect(reconcileCloudAgentJob(config, store, saved.id)).rejects.toMatchObject({
        code: "cloud_agent_failed",
      });
      expect(store.get(saved.id)).toEqual(saved);
      network(() => Response.json({ jobs: [], hasMore: true, nextCursor: "page-two" }));
      await expect(reconcileCloudAgentJob(config, store, saved.id)).rejects.toMatchObject({
        code: "cloud_cursor_invalid",
      });
      expect(store.get(saved.id)).toEqual(saved);
    });
    expect(calls).toHaveLength(1);
  });

  it("does not return a candidate claimed by another local task between pages", async () => {
    const { stub, saved } = await setup({
      reconcileCursor: "page-two",
      reconcileCandidates: ["job-one"],
    });
    network(() => Response.json({ jobs: [], hasMore: false }));
    await inStore(stub, async (store) => {
      store.save(task({ state: "accepted", jobId: "job-one" }));
      expect(await reconcileCloudAgentJob(config, store, saved.id)).toBeNull();
    });
  });

  it.each([
    { submittedAt: 0 },
    { state: "cancelled" as const },
    { state: "accepted" as const, jobId: "already-known" },
  ])(
    "does no recovery I/O for an unsubmitted, terminal or already-associated task (%j)",
    async (change) => {
      const { stub, saved } = await setup(change);
      const calls = network(() => Response.json(job()));
      await inStore(stub, async (store) => {
        expect(await reconcileCloudAgentJob(config, store, saved.id)).toBeNull();
        expect(store.get(saved.id)).toEqual(saved);
      });
      expect(calls).toHaveLength(0);
    },
  );

  it("rejects a changed service scope or mismatched mapping before making requests", async () => {
    const { stub, saved } = await setup();
    const calls = network(() => Response.json(job()));
    await inStore(stub, async (store) => {
      await expect(
        reconcileCloudAgentJob({ ...config, appId: "other-app" }, store, saved.id),
      ).rejects.toMatchObject({ code: "cloud_config_changed" });
      store.saveProvision({ ...provision, scope: "different-scope" });
      await expect(reconcileCloudAgentJob(config, store, saved.id)).rejects.toMatchObject({
        code: "cloud_provision_missing",
      });
    });
    expect(calls).toHaveLength(0);
  });
});
