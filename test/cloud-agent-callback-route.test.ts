import { createHmac } from "node:crypto";
import { createExecutionContext, env, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/server/index";
import {
  CLOUD_CALLBACK_MAX_BYTES,
  CLOUD_CALLBACK_PATH,
  cloudCallbackSecret,
  createCloudCallbackToken,
} from "../src/server/cloud-agent-callback";
import { CloudAgentStore, type CloudTask } from "../src/server/cloud-agent-store";
import { cloudAgentScope } from "../src/server/cloud-agent-provision";
import { useManualAlarms } from "./helpers/wechat-delivery";

type Account = ReturnType<typeof env.ACCOUNTS.getByName>;
const accounts: Account[] = [];
async function setup(change: Partial<CloudTask> = {}) {
  const stub = env.ACCOUNTS.getByName(crypto.randomUUID());
  accounts.push(stub);
  const now = Date.now();
  const task: CloudTask = {
    id: crypto.randomUUID(),
    sourceId: crypto.randomUUID(),
    origin: "https://agt.example.com",
    appId: "app-one",
    tenantId: "tenant-one",
    profileId: "profile-v1",
    model: "test-model",
    workspaceName: "test-account",
    callbackVersion: "v1",
    callbackOrigin: env.APP_URL,
    invocation: null,
    request: "",
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
    upstreamStatus: "running",
    jobId: "job-one",
    createdAt: now,
    updatedAt: now,
    deadline: now + 600_000,
    nextAt: now + 60_000,
    attempts: 0,
    stopRequested: 1,
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
  await runInDurableObject(stub, async (_, state) => {
    await useManualAlarms(state);
    const store = new CloudAgentStore(state.storage);
    store.save(task);
    store.saveProvision({
      scope: cloudAgentScope(task),
      profiles: [task.profileId],
      externalId: `wechatai:${state.id}`,
      appUserId: "user-one",
      workspaceId: "workspace-one",
      configured: 1,
      updatedAt: now,
    });
  });
  const token = createCloudCallbackToken(env, stub.id.toString(), task.id, now + 600_000);
  return { stub, task, token };
}
function signed(
  stub: Account,
  task: CloudTask,
  change: Record<string, unknown> = {},
  settings = env,
) {
  const body = JSON.stringify({
    id: "delivery-one",
    type: "job.completed",
    callbackJobId: "job-one",
    workspaceId: "workspace-one",
    tenantId: task.tenantId,
    data: { status: "completed", result: "callback-only-sensitive-result" },
    ...change,
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  return {
    body,
    headers: {
      "x-agent-event": "job.completed",
      "x-agent-delivery": "delivery-one",
      "x-agent-timestamp": timestamp,
      "x-agent-signature": `sha256=${createHmac(
        "sha256",
        cloudCallbackSecret(settings, stub.id.toString(), task.id, task.callbackVersion),
      )
        .update(`${timestamp}.${body}`)
        .digest("hex")}`,
    },
  };
}
const request = (token: string, init: RequestInit, settings = env) =>
  worker.fetch(
    new Request(`${env.APP_URL}${CLOUD_CALLBACK_PATH}/${token}`, { method: "POST", ...init }),
    settings,
    createExecutionContext(),
  );
const inspect = (stub: Account, id: string) =>
  runInDurableObject(stub, (_, state) => ({
    task: new CloudAgentStore(state.storage).get(id)!,
    receipts: state.storage.sql.exec("SELECT * FROM cloud_callbacks").toArray(),
    charges: state.storage.sql.exec("SELECT * FROM credit_ledger WHERE kind='usage'").toArray(),
    wakeups: vi.mocked(state.storage.setAlarm).mock.calls.map(([time]) => Number(time)),
  }));
afterEach(async () => {
  for (const stub of accounts.splice(0))
    await runInDurableObject(stub, (_, state) => state.storage.deleteAlarm());
  vi.restoreAllMocks();
});

describe("public AGT callback route", () => {
  it("accepts without browser credentials while new jobs are disabled, persists only a signal and rearms recovery", async () => {
    const { stub, task, token } = await setup();
    const fetch = vi.spyOn(globalThis, "fetch");
    const response = await request(token, signed(stub, task), {
      ...env,
      CLOUD_AGENT_ENABLED: "false",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
    const saved = await inspect(stub, task.id);
    expect(saved.task).toEqual({
      ...task,
      nextAt: saved.task.nextAt,
      updatedAt: saved.task.updatedAt,
    });
    expect(saved.task.nextAt).toBeLessThan(task.nextAt);
    expect(saved.receipts).toHaveLength(1);
    expect(JSON.stringify(saved.receipts)).not.toContain("callback-only-sensitive-result");
    expect(saved.charges).toEqual([]);
    expect(saved.wakeups.at(-1)).toBeLessThan(Date.now() + 1000);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["invalid", "expired"])(
    "rejects an %s routing token before selecting an account",
    async (kind) => {
      const { stub, task, token } = await setup();
      const invalid =
        kind === "invalid"
          ? `${token}x`
          : createCloudCallbackToken(env, stub.id.toString(), task.id, Date.now() - 1000);
      const get = vi.spyOn(env.ACCOUNTS, "get");
      const response = await request(invalid, signed(stub, task));
      expect(response.status).toBe(401);
      expect(get).not.toHaveBeenCalled();
      expect((await inspect(stub, task.id)).receipts).toEqual([]);
    },
  );

  it.each([
    ["signature", 401],
    ["delivery", 400],
    ["workspace", 409],
    ["job", 409],
  ] as const)("rejects a mismatched %s without saving or scheduling", async (kind, status) => {
    const { stub, task, token } = await setup();
    const event = signed(stub, task, {
      ...(kind === "workspace" ? { workspaceId: "other-workspace" } : {}),
      ...(kind === "job" ? { callbackJobId: "other-job" } : {}),
    });
    if (kind === "signature") event.headers["x-agent-signature"] = `sha256=${"0".repeat(64)}`;
    if (kind === "delivery") event.headers["x-agent-delivery"] = "other-delivery";
    expect((await request(token, event)).status).toBe(status);
    expect(await inspect(stub, task.id)).toMatchObject({ task, receipts: [], wakeups: [] });
  });

  it("returns 404 for an unknown task and 429 for an account over quota", async () => {
    const { stub, task, token } = await setup();
    const missing = createCloudCallbackToken(
      env,
      stub.id.toString(),
      crypto.randomUUID(),
      Date.now() + 60_000,
    );
    expect((await request(missing, signed(stub, task))).status).toBe(404);
    const limit = vi.fn(async () => ({ success: false }));
    expect(
      (await request(token, signed(stub, task), { ...env, API_LIMIT: { limit } })).status,
    ).toBe(429);
    expect(limit).toHaveBeenCalledWith({ key: `agt-callback:${stub.id}` });
    expect((await inspect(stub, task.id)).receipts).toEqual([]);
  });

  it("accepts signed bodies beyond the ordinary API cap and limits both declared and streamed bytes", async () => {
    const { stub, task, token } = await setup();
    const event = signed(stub, task, { padding: "中".repeat(50_000) });
    expect((await request(token, event)).status).toBe(200);
    expect(
      (
        await request(token, {
          ...event,
          headers: { ...event.headers, "content-length": String(CLOUD_CALLBACK_MAX_BYTES + 1) },
        })
      ).status,
    ).toBe(413);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(CLOUD_CALLBACK_MAX_BYTES));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });
    const response = await request(token, { ...event, body });
    expect(response.status).toBe(413);
    expect((await inspect(stub, task.id)).receipts).toHaveLength(1);
  });

  it("returns 400 on invalid UTF-8 without acknowledging a receipt", async () => {
    const { stub, task, token } = await setup();
    expect(
      (await request(token, { ...signed(stub, task), body: new Uint8Array([0xff]) })).status,
    ).toBe(400);
    expect((await inspect(stub, task.id)).receipts).toEqual([]);
  });

  it("returns 503 on storage failure, then accepts the retry without losing its signal", async () => {
    const { stub, task, token } = await setup();
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    await runInDurableObject(stub, (_, state) => {
      vi.spyOn(state.storage, "transactionSync").mockImplementationOnce(() => {
        throw new Error("private storage details");
      });
    });
    const event = signed(stub, task);
    const failed = await request(token, event);
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: "unavailable" });
    expect((await inspect(stub, task.id)).receipts).toEqual([]);
    expect((await request(token, event)).status).toBe(200);
    expect((await inspect(stub, task.id)).receipts).toHaveLength(1);
    expect(errorLog).toHaveBeenCalledWith(
      JSON.stringify({ event: "cloud.callback_failed", errorType: "Error" }),
    );
  });

  it("rearms after an alarm failure on a duplicate without resetting the saved retry time", async () => {
    const { stub, task, token } = await setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    await runInDurableObject(stub, (_, state) => {
      vi.mocked(state.storage.setAlarm).mockRejectedValueOnce(new Error("alarm unavailable"));
    });
    const event = signed(stub, task);
    expect((await request(token, event)).status).toBe(503);
    const before = await runInDurableObject(stub, (_, state) => {
      const store = new CloudAgentStore(state.storage);
      return store.patch(store.get(task.id)!, { nextAt: Date.now() + 40_000 });
    });
    expect((await request(token, event)).status).toBe(200);
    const saved = await inspect(stub, task.id);
    expect(saved.receipts).toHaveLength(1);
    expect(saved.task).toEqual(before);
    expect(saved.wakeups.at(-1)).toBe(before.nextAt);
    const conflict = signed(stub, task, { data: { status: "failed" } });
    expect((await request(token, conflict)).status).toBe(409);
    expect((await inspect(stub, task.id)).task).toEqual(before);
  });

  it("preserves earlier shared work and verifies retained task keys after rotation", async () => {
    const { stub, task } = await setup();
    const oldKey = "test-only-old-callback-key-at-least-32-characters";
    const settings = {
      ...env,
      AGT_CALLBACK_KEY_VERSION: "v2",
      AGT_CALLBACK_KEYS: JSON.stringify({ v1: oldKey, v2: `${oldKey}-new` }),
    };
    const token = createCloudCallbackToken(
      settings,
      stub.id.toString(),
      task.id,
      Date.now() + 60_000,
      "v1",
    );
    await runInDurableObject(stub, (instance, state) => {
      Object.assign(Reflect.get(instance, "env"), settings);
      vi.spyOn(state.storage, "getAlarm").mockResolvedValue(Date.now() + 10);
    });
    expect((await request(token, signed(stub, task, {}, settings), settings)).status).toBe(200);
    expect((await inspect(stub, task.id)).wakeups).toEqual([]);
  });

  it("keeps ordinary browser API requests behind their Origin check and body cap", async () => {
    const call = (body: string) =>
      worker.fetch(
        new Request(`${env.APP_URL}/api/plugins`, { method: "POST", body }),
        env,
        createExecutionContext(),
      );
    expect((await call("{}")).status).toBe(403);
    expect((await call("x".repeat(128 * 1024 + 1))).status).toBe(413);
  });
});
