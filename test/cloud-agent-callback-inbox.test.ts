import { createHash, createHmac } from "node:crypto";
import { abortAllDurableObjects, env, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cloudCallbackSecret } from "../src/server/cloud-agent-callback";
import { receiveCloudAgentCallback } from "../src/server/cloud-agent-callback-inbox";
import { cloudAgentScope } from "../src/server/cloud-agent-provision";
import { reconcileCloudAgentJob } from "../src/server/cloud-agent-reconcile";
import { CloudAgentStore, type CloudTask } from "../src/server/cloud-agent-store";

const config = {
  origin: "https://agt.example.com",
  appId: "app-one",
  tenantId: "tenant-one",
  appKey: "test-only-app-key",
  agentId: "profile-v1",
  model: "test-model",
};
const account = () => env.ACCOUNTS.getByName(crypto.randomUUID());
function inStore<T>(
  stub: ReturnType<typeof account>,
  run: (store: CloudAgentStore, storage: DurableObjectStorage) => T,
) {
  return runInDurableObject(stub, (_, state) => {
    const store = new CloudAgentStore(state.storage);
    store.init();
    return run(store, state.storage);
  });
}
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
    request: "encrypted-original-request",
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
    deadline: now + 600_000,
    nextAt: now + 60_000,
    attempts: 0,
    stopRequested: 0,
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
  await inStore(stub, (store) => {
    store.save(saved);
    store.saveProvision({
      scope: cloudAgentScope(saved),
      profiles: [saved.profileId],
      externalId: `wechatai:${stub.id}`,
      appUserId: "user-one",
      workspaceId: "workspace-one",
      configured: 1,
      updatedAt: now,
    });
  });
  return { stub, saved };
}
function signed(
  accountId: string,
  task: CloudTask,
  change: Record<string, unknown> = {},
  settings = env,
) {
  const body = JSON.stringify({
    id: "delivery-one",
    type: "job.completed",
    callbackJobId: "job-one",
    jobId: "job-one",
    workspaceId: "workspace-one",
    tenantId: config.tenantId,
    data: { status: "completed", result: "sensitive-callback-result", task: { tool: "private" } },
    ...change,
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers = {
    event: "job.completed",
    delivery: "delivery-one",
    timestamp,
    signature: `sha256=${createHmac(
      "sha256",
      cloudCallbackSecret(settings, accountId, task.id, task.callbackVersion),
    )
      .update(`${timestamp}.${body}`)
      .digest("hex")}`,
  };
  return { body, headers };
}
function configuredEnv(values: Record<string, string>): Env {
  return new Proxy(env, {
    get(target, name) {
      return Reflect.has(values, name) ? Reflect.get(values, name) : Reflect.get(target, name);
    },
  });
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("durable AGT callback inbox", () => {
  it("records only authenticated identity/hash and wakes read-only reconciliation without accepting or billing the job", async () => {
    const { stub, saved } = await setup();
    const event = signed(stub.id.toString(), saved);
    await inStore(stub, async (store, storage) => {
      expect(
        receiveCloudAgentCallback(
          env,
          store,
          stub.id.toString(),
          saved.id,
          event.body,
          event.headers,
        ),
      ).toEqual({ ok: true });
      const current = store.get(saved.id)!;
      expect(current).toEqual({ ...saved, nextAt: current.nextAt, updatedAt: current.updatedAt });
      expect(current.nextAt).toBeLessThan(saved.nextAt);
      expect(store.callbackJobs(saved.id)).toEqual(["job-one"]);
      const rows = storage.sql.exec("SELECT * FROM cloud_callbacks").toArray();
      expect(rows).toEqual([
        {
          deliveryId: "delivery-one",
          taskId: saved.id,
          jobId: "job-one",
          hash: createHash("sha256").update(event.body).digest("hex"),
          createdAt: expect.any(Number),
        },
      ]);
      expect(JSON.stringify(rows)).not.toContain("sensitive-callback-result");
      const fetch = vi.fn(async () =>
        Response.json({
          id: "job-one",
          status: "completed",
          tenantId: saved.tenantId,
          workspaceId: "workspace-one",
          conversationId: saved.conversationId,
        }),
      );
      vi.stubGlobal("fetch", fetch);
      expect(await reconcileCloudAgentJob(config, store, saved.id)).toBe("job-one");
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(store.get(saved.id)).toMatchObject({
        state: "submitting",
        jobId: "",
        unconfirmed: 1,
        units: 0,
        settled: 0,
      });
    });
  });

  it("acknowledges exact retries after restart without moving the task's next attempt or duplicating the receipt", async () => {
    const { stub, saved } = await setup();
    const event = signed(stub.id.toString(), saved);
    const before = await inStore(stub, (store) => {
      expect(
        receiveCloudAgentCallback(
          env,
          store,
          stub.id.toString(),
          saved.id,
          event.body,
          event.headers,
        ),
      ).toEqual({ ok: true });
      return store.patch(saved, { nextAt: Date.now() + 120_000 });
    });
    await abortAllDurableObjects();
    await inStore(env.ACCOUNTS.get(stub.id), (store, storage) => {
      expect(
        receiveCloudAgentCallback(
          env,
          store,
          stub.id.toString(),
          saved.id,
          event.body,
          event.headers,
        ),
      ).toEqual({ ok: true });
      expect(store.get(saved.id)).toEqual(before);
      expect(storage.sql.exec("SELECT * FROM cloud_callbacks").toArray()).toHaveLength(1);
    });
  });

  it("rolls back deduplication when the durable wakeup fails, then accepts the retry", async () => {
    const { stub, saved } = await setup();
    const event = signed(stub.id.toString(), saved);
    await inStore(stub, (store, storage) => {
      vi.spyOn(store, "patch").mockImplementationOnce(() => {
        throw new Error("storage unavailable");
      });
      expect(() =>
        receiveCloudAgentCallback(
          env,
          store,
          stub.id.toString(),
          saved.id,
          event.body,
          event.headers,
        ),
      ).toThrow("storage unavailable");
      expect(storage.sql.exec("SELECT * FROM cloud_callbacks").toArray()).toHaveLength(0);
      expect(store.get(saved.id)).toEqual(saved);
      expect(
        receiveCloudAgentCallback(
          env,
          store,
          stub.id.toString(),
          saved.id,
          event.body,
          event.headers,
        ),
      ).toEqual({ ok: true });
      expect(store.callbackJobs(saved.id)).toEqual(["job-one"]);
    });
  });

  it.each([
    { workspaceId: "another-workspace" },
    { tenantId: "another-tenant" },
    { appId: "another-app" },
    { appUserId: "another-user" },
    { jobId: "another-job" },
  ])("rejects signed events with inconsistent ownership: %j", async (change) => {
    const { stub, saved } = await setup();
    const event = signed(stub.id.toString(), saved, change);
    await inStore(stub, (store) => {
      expect(
        receiveCloudAgentCallback(
          env,
          store,
          stub.id.toString(),
          saved.id,
          event.body,
          event.headers,
        ),
      ).toEqual({ ok: false, status: 409, error: "identity_mismatch" });
      expect(store.callbackJobs(saved.id)).toEqual([]);
      expect(store.get(saved.id)).toEqual(saved);
    });
  });

  it.each([
    { scope: "another-scope" },
    { externalId: "wechatai:another-account" },
    { appUserId: "" },
  ])("rejects inconsistent account mappings: %j", async (change) => {
    const { stub, saved } = await setup();
    const event = signed(stub.id.toString(), saved);
    await inStore(stub, (store) => {
      store.saveProvision({ ...store.provision()!, ...change });
      expect(
        receiveCloudAgentCallback(
          env,
          store,
          stub.id.toString(),
          saved.id,
          event.body,
          event.headers,
        ),
      ).toMatchObject({ ok: false, status: 409 });
      expect(store.callbackJobs(saved.id)).toEqual([]);
    });
  });

  it.each(["different bound job", "job owned by another task"])("rejects %s", async (reason) => {
    const { stub, saved } = await setup();
    const event = signed(stub.id.toString(), saved);
    await inStore(stub, (store) => {
      if (reason === "different bound job")
        store.patch(saved, { jobId: "another-job", state: "accepted" });
      else
        store.save({
          ...saved,
          id: crypto.randomUUID(),
          sourceId: crypto.randomUUID(),
          jobId: "job-one",
          state: "accepted",
        });
      expect(
        receiveCloudAgentCallback(
          env,
          store,
          stub.id.toString(),
          saved.id,
          event.body,
          event.headers,
        ),
      ).toEqual({ ok: false, status: 409, error: "job_mismatch" });
      expect(store.callbackJobs(saved.id)).toEqual([]);
    });
  });

  it("rejects a delivery ID reused with different signed content", async () => {
    const { stub, saved } = await setup();
    await inStore(stub, (store) => {
      for (const [index, change] of [{}, { data: { status: "completed", seq: 2 } }].entries()) {
        const event = signed(stub.id.toString(), saved, change);
        expect(
          receiveCloudAgentCallback(
            env,
            store,
            stub.id.toString(),
            saved.id,
            event.body,
            event.headers,
          ),
        ).toEqual(
          index === 0 ? { ok: true } : { ok: false, status: 409, error: "cloud_callback_conflict" },
        );
      }
      expect(store.callbackJobs(saved.id)).toEqual(["job-one"]);
    });
  });

  it("keeps accepting callbacks under the frozen key version when new tasks are disabled and keys rotate", async () => {
    const settings = configuredEnv({
      CLOUD_AGENT_ENABLED: "false",
      AGT_CALLBACK_KEY_VERSION: "v2",
      AGT_CALLBACK_KEYS: JSON.stringify({
        v1: "test-only-old-callback-key-32-characters",
        v2: "test-only-new-callback-key-32-characters",
      }),
    });
    const { stub, saved } = await setup();
    const event = signed(stub.id.toString(), saved, {}, settings);
    await inStore(stub, (store) => {
      expect(
        receiveCloudAgentCallback(
          settings,
          store,
          stub.id.toString(),
          saved.id,
          event.body,
          event.headers,
        ),
      ).toEqual({ ok: true });
      expect(store.callbackJobs(saved.id)).toEqual(["job-one"]);
    });
  });

  it.each(["invalid signature", "another account", "another task"])(
    "rejects %s before persisting anything",
    async (reason) => {
      const { stub, saved } = await setup();
      const event = signed(
        reason === "another account" ? "b".repeat(64) : stub.id.toString(),
        reason === "another task" ? { ...saved, id: crypto.randomUUID() } : saved,
      );
      if (reason === "invalid signature") event.headers.signature = `sha256=${"0".repeat(64)}`;
      await inStore(stub, (store) => {
        expect(
          receiveCloudAgentCallback(
            env,
            store,
            stub.id.toString(),
            saved.id,
            event.body,
            event.headers,
          ),
        ).toEqual({ ok: false, status: 401, error: "invalid_signature" });
        expect(store.callbackJobs(saved.id)).toEqual([]);
        expect(store.get(saved.id)).toEqual(saved);
      });
    },
  );

  it("returns not found for a missing task", async () => {
    const { stub, saved } = await setup();
    const event = signed(stub.id.toString(), saved);
    await inStore(stub, (store) => {
      expect(
        receiveCloudAgentCallback(
          env,
          store,
          stub.id.toString(),
          crypto.randomUUID(),
          event.body,
          event.headers,
        ),
      ).toEqual({ ok: false, status: 404, error: "task_missing" });
    });
  });

  it("acknowledges new and repeated late callbacks without bypassing frozen-outcome settlement backoff", async () => {
    const { stub, saved } = await setup({
      state: "accepted",
      jobId: "job-one",
      unconfirmed: 0,
      outcome: {
        id: "job-one",
        workspaceId: "workspace-one",
        status: "completed",
        text: "original-result",
      },
      deadline: Date.now() - 1,
      nextAt: Date.now() + 120_000,
      attempts: 3,
    });
    await inStore(stub, (store, storage) => {
      for (const delivery of ["delivery-one", "delivery-one", "delivery-two"]) {
        const event = signed(stub.id.toString(), saved, { id: delivery });
        event.headers.delivery = delivery;
        expect(
          receiveCloudAgentCallback(
            env,
            store,
            stub.id.toString(),
            saved.id,
            event.body,
            event.headers,
          ),
        ).toEqual({ ok: true });
        expect(store.get(saved.id)).toEqual(saved);
        expect(store.due()).toEqual([]);
        expect(store.nextAt()).toBe(saved.nextAt);
      }
      expect(storage.sql.exec("SELECT * FROM cloud_callbacks").toArray()).toHaveLength(2);
    });
  });

  it("never revives a completed task or changes its settlement on a late callback", async () => {
    const { stub, saved } = await setup({
      state: "completed",
      jobId: "job-one",
      settled: 1,
      units: 1234,
      result: "original-result",
      nextAt: 0,
      delivered: 1,
    });
    const event = signed(stub.id.toString(), saved, { data: { status: "running" } });
    await inStore(stub, (store) => {
      expect(
        receiveCloudAgentCallback(
          env,
          store,
          stub.id.toString(),
          saved.id,
          event.body,
          event.headers,
        ),
      ).toEqual({ ok: true });
      expect(store.get(saved.id)).toEqual(saved);
    });
  });

  it("preserves the stop and erasure intent of a hidden task", async () => {
    const { stub, saved } = await setup();
    const event = signed(stub.id.toString(), saved);
    await inStore(stub, (store) => {
      store.hideSession(saved.sessionId);
      expect(
        receiveCloudAgentCallback(
          env,
          store,
          stub.id.toString(),
          saved.id,
          event.body,
          event.headers,
        ),
      ).toEqual({ ok: true });
      expect(store.get(saved.id)).toMatchObject({
        hidden: 1,
        stopRequested: 1,
        prompt: "",
        request: "",
        result: "",
        outcome: null,
        units: 0,
      });
      expect(store.callbackJobs(saved.id)).toEqual(["job-one"]);
    });
  });
});
