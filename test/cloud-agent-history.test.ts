import { createExecutionContext, env, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import authMigration from "../migrations/0001_auth.sql?raw";
import referralMigration from "../migrations/0003_referrals.sql?raw";
import { authEmailMigration, verifiedFixtureCookie } from "./auth-fixtures";
import worker from "../src/server/index";
import { CloudAgentStore, type CloudTask } from "../src/server/cloud-agent-store";
import { Wallet } from "../src/server/wallet";
import type { CloudAgentTask, CloudAgentTaskPage } from "../src/shared/cloud-agent";
import { useManualAlarms } from "./helpers/wechat-delivery";

type Account = ReturnType<typeof env.ACCOUNTS.getByName>;
let owner: { stub: Account; cookie: string };
let other: typeof owner;
const request = (path: string, cookie = owner.cookie) =>
  worker.fetch(
    new Request(`${env.APP_URL}/api/cloud/tasks${path}`, { headers: { cookie } }),
    env,
    createExecutionContext(),
  );
async function account() {
  const response = await worker.fetch(
    new Request(`${env.APP_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { origin: env.APP_URL, "content-type": "application/json" },
      body: JSON.stringify({
        name: "任务测试用户",
        email: `${crypto.randomUUID()}@example.test`,
        password: "test-password-123",
      }),
    }),
    env,
    createExecutionContext(),
  );
  expect(response.status).toBe(200);
  const { user } = await response.json<{ user: { id: string } }>();
  return {
    stub: env.ACCOUNTS.getByName(user.id),
    cookie: await verifiedFixtureCookie(user.id, "test-password-123"),
  };
}
beforeAll(async () => {
  await env.DB.exec(authMigration);
  await env.DB.exec(referralMigration);
  await env.DB.exec(authEmailMigration.replace(/^--.*$/gm, "").replace(/\n/g, " "));
  owner = await account();
  other = await account();
});
beforeEach(async () => {
  for (const { stub } of [owner, other])
    await runInDurableObject(stub, async (_, state) => {
      await useManualAlarms(state);
      state.storage.sql.exec("DELETE FROM cloud_tasks");
      state.storage.sql.exec("DELETE FROM sessions");
    });
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("Task API requests must not call upstream services"),
  );
});

afterEach(async () => {
  for (const { stub } of [owner, other])
    await runInDurableObject(stub, (_, state) => state.storage.deleteAlarm());
  vi.restoreAllMocks();
});
function task(change: Partial<CloudTask> = {}): CloudTask {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    sourceId: crypto.randomUUID(),
    origin: "https://agt.example.com",
    appId: "private-app",
    tenantId: "private-tenant",
    profileId: "private-profile",
    model: "private-model",
    workspaceName: "private-workspace",
    callbackVersion: "v1",
    callbackOrigin: env.APP_URL,
    invocation: null,
    request: "encrypted-private-request",
    submittedAt: now,
    outcome: null,
    reconcileCursor: "private-reconcile-cursor",
    reconcileCandidates: [],
    hidden: 0,
    deliveryStatus: "sent",
    pluginContext: "plugin-one",
    currentSessionId: "session-one",
    pluginId: "plugin-one",
    pluginName: "云端 Agent",
    sessionId: "session-one",
    connectionId: "private-link",
    generation: "private-generation",
    contextStart: now,
    resetAt: 0,
    conversationId: "private-conversation",
    prompt: "测试任务",
    idempotencyKey: "private-idempotency-key",
    state: "completed",
    upstreamStatus: "completed",
    jobId: `private-upstream-job-${crypto.randomUUID()}`,
    createdAt: now,
    updatedAt: now,
    deadline: now + 600_000,
    nextAt: 0,
    attempts: 0,
    stopRequested: 0,
    settled: 1,
    stale: 0,
    delivered: 1,
    result: "保留的任务结果",
    error: "",
    units: 1234,
    frozen: "private-metering-snapshot",
    unconfirmed: 0,
    ...change,
  };
}
async function save(values: CloudTask[], stub = owner.stub) {
  await runInDurableObject(stub, (_, state) => {
    const store = new CloudAgentStore(state.storage);
    for (const value of values) store.save(value);
  });
}
const detail = async (value: CloudTask) => (await request(`/${value.id}`)).json<CloudAgentTask>();
const list = async (query = "") => (await request(query)).json<CloudAgentTaskPage>();

describe("account cloud task history", () => {
  it("requires browser authentication for both list and detail", async () => {
    const value = task();
    await save([value]);
    for (const path of ["", `/${value.id}`]) expect((await request(path, "")).status).toBe(401);
  });

  it("returns only the public fields and the saved credits, including the original session title", async () => {
    const value = task();
    await save([value]);
    await runInDurableObject(owner.stub, (_, state) => {
      state.storage.sql.exec(
        "INSERT INTO sessions VALUES (?,?)",
        value.sessionId,
        JSON.stringify({ title: "我设置的标题" }),
      );
    });
    const expected: CloudAgentTask = {
      id: value.id,
      pluginInstanceId: value.pluginId,
      pluginName: value.pluginName,
      sessionId: value.sessionId,
      sessionTitle: "我设置的标题",
      prompt: value.prompt,
      status: "completed",
      upstreamStatus: "completed",
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      result: value.result,
      credits: 1.234,
      delivered: true,
      delivery: "sent",
    };
    const response = await request(`/${value.id}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(expected);
    expect(await list()).toEqual({ tasks: [expected], nextCursor: null });
  });

  it("isolates accounts even when the caller supplies another account or plugin id", async () => {
    const own = task();
    const foreign = task({ pluginId: "foreign-plugin", prompt: "其他账号的任务" });
    await save([own]);
    await save([foreign], other.stub);
    expect((await list(`?accountId=${other.stub.id}`)).tasks.map((value) => value.id)).toEqual([
      own.id,
    ]);
    expect((await list("?plugin=foreign-plugin")).tasks).toEqual([]);
    expect((await request(`/${foreign.id}`)).status).toBe(404);
    expect((await request(`/${own.id}`, other.cookie)).status).toBe(404);
  });

  it("keeps filtered pagination stable with tied timestamps and deleted cursor rows", async () => {
    const now = Date.now();
    const values = Array.from({ length: 35 }, () => task({ createdAt: now }));
    await save([
      ...values,
      task({ pluginId: "different-plugin" }),
      task({ hidden: 1, createdAt: now + 1 }),
    ]);
    const expected = values
      .map((value) => value.id)
      .sort()
      .reverse();
    const first = await list("?plugin=plugin-one");
    expect(first.tasks.map((value) => value.id)).toEqual(expected.slice(0, 30));
    expect(first.nextCursor).toBeTruthy();
    await runInDurableObject(owner.stub, (_, state) =>
      new CloudAgentStore(state.storage).remove(first.tasks.at(-1)!.id),
    );
    await save([task({ createdAt: now + 1000 })]);
    const next = await list(`?plugin=plugin-one&cursor=${encodeURIComponent(first.nextCursor!)}`);
    expect(next.tasks.map((value) => value.id)).toEqual(expected.slice(30));
    expect(next.nextCursor).toBeNull();
  });

  it.each([
    "",
    "not-a-cursor",
    Buffer.from(JSON.stringify([1, "not-a-uuid"])).toString("base64url"),
  ])("rejects invalid cursors rather than returning page one (%s)", async (cursor) => {
    const response = await request(`?cursor=${encodeURIComponent(cursor)}`);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "invalid_task_cursor",
      message: expect.stringContaining("返回最新任务"),
    });
  });

  it.each([
    [{ state: "submitting", unconfirmed: 1, stopRequested: 1 }, "submitting", true],
    [{ state: "accepted", upstreamStatus: "queued" }, "queued", false],
    [{ state: "accepted", upstreamStatus: "running" }, "running", false],
    [
      { state: "accepted", upstreamStatus: "awaiting_approval", stopRequested: 1 },
      "awaiting_approval",
      true,
    ],
    [{ state: "rejected", stopRequested: 0 }, "failed", false],
    [{ state: "rejected", stopRequested: 1 }, "cancelled", false],
    [{ state: "cancelled" }, "cancelled", false],
    [{ state: "failed" }, "failed", false],
  ] satisfies [Partial<CloudTask>, CloudAgentTask["status"], boolean][])(
    "reports local and upstream status separately (%j)",
    async (change, status, stopping) => {
      const value = task({
        settled: 0,
        result: "",
        units: 0,
        delivered: 0,
        deliveryStatus: "pending",
        ...change,
      });
      await save([value]);
      const publicTask = await detail(value);
      expect(publicTask.status).toBe(status);
      expect(Boolean(publicTask.stopping)).toBe(stopping);
      expect(Boolean(publicTask.unconfirmed)).toBe(Boolean(value.unconfirmed));
      expect(publicTask.credits).toBeUndefined();
      expect(publicTask.delivered).toBeUndefined();
    },
  );

  it("shows finalizing while an authoritative outcome awaits local settlement, without leaking its raw body", async () => {
    const value = task({
      state: "accepted",
      settled: 0,
      result: "",
      units: 0,
      stopRequested: 1,
      delivered: 0,
      deliveryStatus: "pending",
      outcome: {
        id: "private-job",
        workspaceId: "private-workspace",
        status: "completed",
        text: "private-unsettled-output",
      },
    });
    await save([value]);
    const publicTask = await detail(value);
    expect(publicTask).toMatchObject({
      status: "finalizing",
      upstreamStatus: "completed",
      delivery: "pending",
    });
    expect(publicTask.stopping).toBeUndefined();
    expect(publicTask.result).toBeUndefined();
    expect(publicTask.credits).toBeUndefined();
    expect(JSON.stringify(publicTask)).not.toContain("private-unsettled-output");
  });

  it("keeps history readable after Plus expiry and service shutdown, without changing tasks or billing", async () => {
    const value = task({ units: 0 });
    await save([value]);
    await runInDurableObject(owner.stub, (instance, state) => {
      Object.assign(Reflect.get(instance, "env"), {
        CLOUD_AGENT_ENABLED: "false",
        AGT_APP_KEY: "",
      });
      state.storage.sql.exec(
        "INSERT INTO settings VALUES ('planUntil',?)",
        JSON.stringify(Date.now() - 1000),
      );
    });
    expect((await list()).tasks).toHaveLength(1);
    expect((await detail(value)).credits).toBe(0);
    await runInDurableObject(owner.stub, (_, state) => {
      expect(new CloudAgentStore(state.storage).get(value.id)).toEqual(value);
      expect(
        state.storage.sql.exec("SELECT * FROM credit_ledger WHERE kind='usage'").toArray(),
      ).toEqual([]);
      expect(state.storage.sql.exec("SELECT * FROM inbox").toArray()).toEqual([]);
      expect(state.storage.setAlarm).not.toHaveBeenCalled();
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("omits cleared tasks from every page and returns the same 404 as a missing task", async () => {
    const value = task();
    await save([value]);
    await runInDurableObject(owner.stub, (_, state) =>
      new CloudAgentStore(state.storage).hideSession(value.sessionId),
    );
    expect(await list()).toEqual({ tasks: [], nextCursor: null });
    expect((await request(`/${value.id}`)).status).toBe(404);
    const missing = await request(`/${crypto.randomUUID()}`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "task_missing", message: "找不到这个云端任务" });
  });

  it("retains stale results but does not link to an invalid original session or claim delivery", async () => {
    const value = task({ stale: 1, deliveryStatus: "stale" });
    await save([value]);
    expect(await detail(value)).toMatchObject({
      sessionId: null,
      sessionTitle: "已删除会话",
      stale: true,
      delivery: "stale",
      result: value.result,
      credits: 1.234,
    });
    expect((await detail(value)).delivered).toBeUndefined();
  });
});

describe("account cloud task cancellation", () => {
  const cancel = (id: string, cookie = owner.cookie, origin = env.APP_URL) =>
    worker.fetch(
      new Request(`${env.APP_URL}/api/cloud/tasks/${id}/cancel`, {
        method: "POST",
        headers: { cookie, origin },
      }),
      env,
      createExecutionContext(),
    );
  const pending = (change: Partial<CloudTask> = {}) =>
    task({
      state: "accepted",
      upstreamStatus: "running",
      settled: 0,
      units: 0,
      result: "",
      delivered: 0,
      deliveryStatus: "pending",
      nextAt: Date.now() + 60_000,
      ...change,
    });

  it("requires authentication and a trusted Origin before changing a task", async () => {
    const value = pending();
    await save([value]);
    expect((await cancel(value.id, "")).status).toBe(401);
    for (const origin of ["", "https://foreign.example.com"])
      expect((await cancel(value.id, owner.cookie, origin)).status).toBe(403);
    await runInDurableObject(owner.stub, (_, state) => {
      expect(new CloudAgentStore(state.storage).get(value.id)).toEqual(value);
      expect(state.storage.setAlarm).not.toHaveBeenCalled();
    });
  });

  it("returns the same 404 for foreign, hidden and missing tasks", async () => {
    const foreign = pending();
    const hidden = pending({ hidden: 1 });
    await save([foreign], other.stub);
    await save([hidden]);
    for (const id of [foreign.id, hidden.id, crypto.randomUUID()]) {
      const response = await cancel(id);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: "task_missing",
        message: "找不到这个云端任务",
      });
    }
    await runInDurableObject(other.stub, (_, state) => {
      expect(new CloudAgentStore(state.storage).get(foreign.id)).toEqual(foreign);
    });
  });

  it.each([
    { state: "submitting", jobId: "", submittedAt: 0 },
    { state: "submitting", jobId: "", unconfirmed: 1 },
    { state: "accepted" },
  ] satisfies Partial<CloudTask>[])(
    "persists stop intent and schedules recovery without claiming cancellation (%j)",
    async (change) => {
      const value = pending(change);
      await save([value]);
      const before = Date.now();
      const response = await cancel(value.id);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toMatchObject({
        status: value.state === "accepted" ? "running" : "submitting",
        stopping: true,
        error: "已请求停止云端任务，等待确认。已发生的外部操作无法撤销。",
      });
      expect((await detail(value)).stopping).toBe(true);
      await runInDurableObject(owner.stub, (_, state) => {
        const store = new CloudAgentStore(state.storage);
        const stopped = store.get(value.id)!;
        expect(stopped).toMatchObject({
          ...value,
          stopRequested: 1,
          stopReason: "用户请求停止云端任务。",
          error: expect.stringContaining("等待确认"),
          updatedAt: expect.any(Number),
          nextAt: expect.any(Number),
        });
        expect(stopped.nextAt).toBeGreaterThanOrEqual(before);
        expect(stopped.nextAt).toBeLessThanOrEqual(Date.now());
        expect(store.countSince(0)).toBe(1);
        expect(state.storage.setAlarm).toHaveBeenCalledOnce();
        expect(state.storage.sql.exec("SELECT * FROM inbox").toArray()).toEqual([]);
        expect(state.storage.sql.exec("SELECT * FROM usage").toArray()).toEqual([]);
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("rearms repeated requests without changing the saved stop cause, backoff or attempt count", async () => {
    const value = pending({
      stopRequested: 1,
      stopReason: "任务已超时。",
      error: "等待上游确认停止。",
      attempts: 4,
    });
    await save([value]);
    for (let i = 0; i < 2; i++) expect((await cancel(value.id)).status).toBe(200);
    await runInDurableObject(owner.stub, (_, state) => {
      expect(new CloudAgentStore(state.storage).get(value.id)).toEqual(value);
      expect(state.storage.setAlarm).toHaveBeenCalledWith(value.nextAt);
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps an earlier shared alarm when stopping a task", async () => {
    const value = pending();
    await save([value]);
    await runInDurableObject(owner.stub, (_, state) => {
      vi.spyOn(state.storage, "getAlarm").mockResolvedValue(Date.now() - 1);
    });
    expect((await cancel(value.id)).status).toBe(200);
    await runInDurableObject(owner.stub, (_, state) => {
      expect(state.storage.setAlarm).not.toHaveBeenCalled();
    });
  });

  it.each(["completed", "failed", "cancelled", "rejected", "accepted"] as const)(
    "leaves a terminal or finalizing task unchanged (%s)",
    async (state) => {
      const value =
        state === "accepted"
          ? pending({
              outcome: { id: "private-job", workspaceId: "private-workspace", status: "completed" },
            })
          : task({ state, ...(state !== "completed" ? { settled: 0, units: 0 } : {}) });
      await save([value]);
      const before = await detail(value);
      const response = await cancel(value.id);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(before);
      await runInDurableObject(owner.stub, (_, context) => {
        expect(new CloudAgentStore(context.storage).get(value.id)).toEqual(value);
        expect(context.storage.setAlarm).not.toHaveBeenCalled();
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("does not return content cleared while alarm scheduling was pending", async () => {
    const value = pending();
    await save([value]);
    await runInDurableObject(owner.stub, (_, state) => {
      vi.mocked(state.storage.setAlarm).mockImplementationOnce(async () => {
        new CloudAgentStore(state.storage).hideSession(value.sessionId);
      });
    });
    expect((await cancel(value.id)).status).toBe(404);
    expect((await list()).tasks).toEqual([]);
  });

  it("allows cancellation after Plus expiry with no credits, plugin, connection or service config", async () => {
    const value = pending();
    await save([value]);
    await runInDurableObject(owner.stub, (instance, state) => {
      Object.assign(Reflect.get(instance, "env"), {
        CLOUD_AGENT_ENABLED: "false",
        AGT_APP_KEY: "",
      });
      state.storage.sql.exec("INSERT OR REPLACE INTO settings VALUES ('planUntil','0')");
      state.storage.sql.exec("UPDATE credit_buckets SET remaining=0");
      state.storage.sql.exec("UPDATE credit_debt SET amount=1 WHERE id=1");
    });
    expect((await cancel(value.id)).status).toBe(200);
    await runInDurableObject(owner.stub, (_, state) => {
      expect(new Wallet(state.storage).balance()).toBe(-1);
      expect(new CloudAgentStore(state.storage).get(value.id)!.stopRequested).toBe(1);
      expect(state.storage.setAlarm).toHaveBeenCalled();
      expect(
        state.storage.sql.exec("SELECT * FROM credit_ledger WHERE kind='usage'").toArray(),
      ).toEqual([]);
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
