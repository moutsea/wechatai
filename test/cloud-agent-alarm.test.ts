import { abortAllDurableObjects, env, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudAgentStore, type CloudTask } from "../src/server/cloud-agent-store";
import { cloudAgentScope } from "../src/server/cloud-agent-provision";
import { Wallet } from "../src/server/wallet";
import { encrypt } from "../src/server/security";
import { PLUGIN_PROTOCOL_VERSION } from "../src/shared/plugins";
import type { PersonalAccount } from "../src/server/personal-account";
import { connectForManualDelivery, useManualAlarms } from "./helpers/wechat-delivery";

type Account = ReturnType<typeof env.ACCOUNTS.getByName>;
const accounts: Account[] = [];
const config = {
  CLOUD_AGENT_ENABLED: "true",
  AGT_ORIGIN: "https://agt.example.com",
  AGT_APP_ID: "app-one",
  AGT_TENANT_ID: "tenant-one",
  AGT_APP_KEY: "test-only-app-key",
};
async function setup(change: Partial<CloudTask> = {}) {
  const stub = env.ACCOUNTS.getByName(crypto.randomUUID());
  accounts.push(stub);
  await runInDurableObject(stub, (_, state) => useManualAlarms(state));
  await stub.applyPayment({
    id: "plus",
    kind: "subscription",
    units: 0,
    expires: Date.now() + 86_400_000,
  });
  await stub.api("wechat.create", { name: "测试微信" });
  await connectForManualDelivery(stub);
  // Reuse an existing plugin until the separate AGT user entry point is introduced.
  const saved = JSON.parse(
    await stub.api("plugin.save", {
      pluginId: "wechatai/openclaw",
      name: "测试助手",
      shortcut: "work",
    }),
  );
  expect(saved.ok, JSON.stringify(saved)).toBe(true);
  const plugin = saved.data;
  expect(JSON.parse(await stub.api("plugin.activate", { id: plugin.id })).ok).toBe(true);
  const sessionId = (await stub.snapshot()).currentSession!.id;
  const task = await runInDurableObject(stub, async (_, state) => {
    const session = JSON.parse(
      state.storage.sql
        .exec<{ data: string }>("SELECT data FROM sessions WHERE id=?", sessionId)
        .one().data,
    );
    const id = crypto.randomUUID();
    const now = Date.now();
    const task: CloudTask = {
      id,
      sourceId: id,
      origin: config.AGT_ORIGIN,
      appId: config.AGT_APP_ID,
      tenantId: config.AGT_TENANT_ID,
      profileId: "profile-v1",
      model: "test-model",
      modelConnection: {
        id: "user-model",
        model: "test-model",
        protocol: "responses",
        baseUrl: "https://llm.example.com/v1",
        encryptedKey: await encrypt(env, "test-user-key", `${stub.id}:channel:test`),
        keyContext: "channel:test",
        systemPrompt: "",
        contextTokens: 32000,
        maxOutputTokens: 8192,
      },
      workspaceName: "workspace-one",
      callbackVersion: "v1",
      callbackOrigin: "https://wechatai.example.com",
      invocation: {
        protocolVersion: PLUGIN_PROTOCOL_VERSION,
        runId: id,
        instanceId: plugin.id,
        pluginId: "wechatai/cloud-agent",
        pluginVersion: "1.0.0",
        sessionId,
        messages: [{ role: "user", content: [{ type: "text", text: "执行任务" }] }],
        limits: { inputTokens: 1000, outputTokens: 16_000, outputImages: 0, creditUnits: null },
      },
      request: "",
      submittedAt: 0,
      outcome: null,
      reconcileCursor: "",
      reconcileCandidates: [],
      hidden: 0,
      deliveryStatus: "pending",
      pluginContext: plugin.id,
      currentSessionId: sessionId,
      pluginId: plugin.id,
      pluginName: plugin.name,
      sessionId,
      connectionId: "default",
      generation: "g1",
      contextStart: session.contextStart,
      resetAt: session.resetAt,
      conversationId: "conversation-one",
      prompt: "执行任务",
      idempotencyKey: id,
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
    return task;
  });
  return { stub, task };
}
async function inspect(stub: Account, id: string) {
  return runInDurableObject(stub, (_, state) => ({
    task: new CloudAgentStore(state.storage).get(id)!,
    ledger: state.storage.sql
      .exec("SELECT * FROM credit_ledger WHERE id=?", `usage:${id}`)
      .toArray(),
    messages: state.storage.sql
      .exec(
        "SELECT * FROM messages WHERE sessionId=(SELECT sessionId FROM cloud_tasks WHERE id=?)",
        id,
      )
      .toArray(),
    reply: state.storage.sql.exec("SELECT * FROM inbox WHERE id=?", `cloud:${id}`).toArray()[0],
  }));
}
const outcome = (status = "completed") => ({
  id: "job-one",
  workspaceId: "workspace-one",
  tenantId: "tenant-one",
  conversationId: "conversation-one",
  status,
  result: { text: "最终答案" },
});
async function pass(
  stub: Account,
  status = "completed",
  options: {
    fail?: boolean;
    sendFail?: boolean;
    enabled?: boolean;
    wake?: string;
  } = {},
) {
  const paths: string[] = [];
  const sent: string[] = [];
  const wakeups: number[] = [];
  const unexpected: string[] = [];
  await runInDurableObject(stub, async (instance, state) => {
    await useManualAlarms(state);
    Object.assign(Reflect.get(instance, "env"), config, {
      CLOUD_AGENT_ENABLED: options.enabled === false ? "false" : "true",
    });
    if (options.wake) {
      const store = new CloudAgentStore(state.storage);
      store.patch(store.get(options.wake)!, { nextAt: Date.now() });
    }
    const alarm = vi.spyOn(state.storage, "setAlarm").mockImplementation(async (time) => {
      wakeups.push(Number(time));
    });
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      paths.push(path);
      if (path.includes("/model-channels"))
        return Response.json(
          request.method === "GET"
            ? { channels: [] }
            : { channel: { id: `mch_${"a".repeat(32)}` } },
        );
      if (path.startsWith("/api/agent/")) {
        if (options.fail) return Response.json({ error: "unavailable" }, { status: 503 });
        return Response.json(outcome(path.endsWith("/cancel") ? "running" : status), {
          status: path === "/api/agent/jobs" ? 202 : 200,
        });
      }
      if (path.endsWith("/getupdates")) return Response.json({ ret: 0, msgs: [] });
      if (path.endsWith("/sendmessage")) {
        const body = await request.json<{
          msg: { item_list: { text_item: { text: string } }[] };
        }>();
        sent.push(body.msg.item_list[0].text_item.text);
        return options.sendFail
          ? Response.json({ ret: 1 }, { status: 503 })
          : Response.json({ ret: 0 });
      }
      unexpected.push(path);
      throw new Error(`Unexpected endpoint: ${path}`);
    });
    try {
      await instance.alarm();
    } finally {
      fetch.mockRestore();
      alarm.mockRestore();
    }
  });
  expect(unexpected).toEqual([]);
  return { paths, sent, wakeups };
}
// Keep the request pending until its actual abort signal fires, rather than
// returning immediately and hiding scheduling delays in the shared alarm.
async function blockedPoll(
  stub: Account,
  kind: "getupdates" | "get_qrcode_status",
  check: (context: {
    instance: PersonalAccount;
    storage: DurableObjectStorage;
    paths: string[];
    signal: AbortSignal;
    timeout: { milliseconds: number; controller: AbortController };
    finished: Promise<void>;
  }) => Promise<void>,
) {
  await runInDurableObject(stub, async (instance, state) => {
    await useManualAlarms(state);
    Object.assign(Reflect.get(instance, "env"), config);
    if (kind === "get_qrcode_status")
      state.storage.sql.exec(
        "UPDATE settings SET value=json_set(value,'$.status','waiting','$.qrCode','test-code','$.qrExpires',?) WHERE key='connection'",
        Date.now() + 86_400_000,
      );
    const paths: string[] = [];
    const timeouts: { milliseconds: number; controller: AbortController }[] = [];
    const timer = vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
      const controller = new AbortController();
      timeouts.push({ milliseconds, controller });
      return controller.signal;
    });
    let started!: (signal: AbortSignal) => void;
    const pollStarted = new Promise<AbortSignal>((resolve) => {
      started = resolve;
    });
    let release = () => {};
    let blocked = false;
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      paths.push(path);
      if (path.startsWith("/api/agent/")) return Response.json(outcome("running"));
      if (path.endsWith("/get_bot_qrcode"))
        return Response.json({ error: "unavailable" }, { status: 503 });
      if (path.endsWith(`/${kind}`) && !blocked) {
        blocked = true;
        return new Promise<Response>((resolve, reject) => {
          release = () => resolve(Response.json({ ret: 0, msgs: [], status: "waiting" }));
          request.signal.addEventListener("abort", () => reject(request.signal.reason), {
            once: true,
          });
          started(request.signal);
        });
      }
      if (path.endsWith("/getupdates") || path.endsWith("/get_qrcode_status"))
        return Response.json({ ret: 0, msgs: [], status: "waiting" });
      throw new Error(`Unexpected endpoint: ${path}`);
    });
    const finished = instance.alarm();
    try {
      const signal = await pollStarted;
      await check({
        instance,
        storage: state.storage,
        paths,
        signal,
        timeout: timeouts.at(-1)!,
        finished,
      });
    } finally {
      release();
      await finished;
      fetch.mockRestore();
      timer.mockRestore();
    }
  });
}
afterEach(async () => {
  for (const stub of accounts.splice(0))
    await runInDurableObject(env.ACCOUNTS.get(stub.id), (_, state) => state.storage.deleteAlarm());
  vi.restoreAllMocks();
});

describe("account AGT recovery alarm", () => {
  describe.each(["getupdates", "get_qrcode_status"] as const)("while %s is pending", (kind) => {
    it.each(["session", "plugin", "plugin-full", "connection", "bind", "task"])(
      "aborts idle polling after stopping the %s and cancels on the next alarm",
      async (target) => {
        const { stub, task } = await setup({
          state: "accepted",
          jobId: "job-one",
          submittedAt: Date.now(),
        });
        if (target === "bind")
          expect(
            JSON.parse(
              await stub.api("assistant.save", {
                name: "测试模型",
                model: "test-model",
                protocol: "chat-completions",
                baseUrl: "https://llm.example.com",
                apiKey: "test-key",
              }),
            ).ok,
          ).toBe(true);
        await blockedPoll(stub, kind, async ({ instance, storage, signal, paths, finished }) => {
          const action =
            target === "task"
              ? "cloud.cancel"
              : target === "session"
                ? "session.action"
                : target.startsWith("plugin")
                  ? "plugin.save"
                  : target === "bind"
                    ? "wechat.bind"
                    : "wechat.disconnect";
          const body =
            target === "task"
              ? { id: task.id }
              : target === "session"
                ? { id: task.sessionId, action: "reset" }
                : target.startsWith("plugin")
                  ? {
                      id: task.pluginId,
                      enabled: false,
                      ...(target === "plugin-full" ? { name: "新的助手名称" } : {}),
                    }
                  : { id: task.connectionId };
          expect(JSON.parse(await instance.api(action, body)).ok).toBe(target !== "bind");
          expect(signal.aborted).toBe(true);
          await finished;
          expect(new CloudAgentStore(storage).get(task.id)!.stopRequested).toBe(1);
          await instance.alarm();
          expect(paths).toContain("/api/agent/workspace-one/jobs/job-one/cancel");
          expect(
            storage.sql
              .exec("SELECT * FROM credit_ledger WHERE id=?", `usage:${task.id}`)
              .toArray(),
          ).toEqual([]);
          const error = (await instance.snapshot()).connection.error;
          if (target === "bind") expect(error).toBe("二维码获取失败，请重新绑定");
          else expect(error).toBeUndefined();
        });
      },
    );

    it.each(["retry", "deadline", "membership"])(
      "yields for the next cloud %s instead of the default poll timeout",
      async (target) => {
        const due = Date.now() + 2000;
        const { stub, task } = await setup({
          state: "accepted",
          jobId: "job-one",
          submittedAt: Date.now(),
          nextAt: target === "retry" ? due : due + 60_000,
          ...(target === "deadline" ? { deadline: due } : {}),
        });
        if (target === "membership")
          await runInDurableObject(stub, (_, state) =>
            state.storage.sql
              .exec("UPDATE settings SET value=? WHERE key='planUntil'", JSON.stringify(due))
              .toArray(),
          );
        await blockedPoll(stub, kind, async ({ instance, storage, timeout, paths, finished }) => {
          expect(timeout.milliseconds).toBeGreaterThan(0);
          expect(timeout.milliseconds).toBeLessThanOrEqual(2000);
          // Simulate the bounded request timing out at its requested deadline.
          const now = vi.spyOn(Date, "now").mockReturnValue(due + 1);
          try {
            timeout.controller.abort(new DOMException("Timed out", "TimeoutError"));
            await finished;
            await instance.alarm();
            expect(paths).toContain("/api/agent/workspace-one/jobs/job-one");
            expect(paths.some((path) => path.endsWith("/cancel"))).toBe(target !== "retry");
            expect(new CloudAgentStore(storage).get(task.id)!.stopRequested).toBe(
              target === "retry" ? 0 : 1,
            );
            expect((await instance.snapshot()).connection.error).toBeUndefined();
          } finally {
            now.mockRestore();
          }
        });
      },
    );
  });

  it("keeps an associated task running when submissions close and honors an explicit stop", async () => {
    const { stub, task } = await setup({
      state: "accepted",
      jobId: "job-one",
      submittedAt: Date.now(),
    });
    const running = await pass(stub, "running", { enabled: false });
    expect(running.paths.some((path) => path.endsWith("/cancel"))).toBe(false);
    expect(await inspect(stub, task.id)).toMatchObject({
      task: { state: "accepted", stopRequested: 0 },
      ledger: [],
    });
    const stopped = JSON.parse(await stub.api("cloud.cancel", { id: task.id }));
    expect(stopped).toMatchObject({ ok: true, data: { stopping: true } });
    const stopping = await pass(stub, "running", { enabled: false, wake: task.id });
    expect(stopping.paths.some((path) => path.endsWith("/cancel"))).toBe(true);
    await pass(stub, "cancelled", { enabled: false, wake: task.id });
    expect(await inspect(stub, task.id)).toMatchObject({
      task: { state: "cancelled", stopRequested: 1, settled: 0 },
      ledger: [],
    });
    await runInDurableObject(stub, (_, state) => {
      expect(new CloudAgentStore(state.storage).countSince(0)).toBe(1);
    });
  });

  it.each(["completed", "cancelled"] as const)(
    "honors the confirmed %s outcome after an API stop request without rebilling",
    async (status) => {
      const { stub, task } = await setup({
        state: "accepted",
        jobId: "job-one",
        submittedAt: Date.now(),
      });
      const stopped = JSON.parse(await stub.api("cloud.cancel", { id: task.id }));
      expect(stopped).toMatchObject({ ok: true, data: { status: "running", stopping: true } });
      const result = await pass(stub, status, { enabled: false });
      expect(result.paths.some((path) => path.endsWith("/cancel"))).toBe(false);
      const terminal = await inspect(stub, task.id);
      expect(terminal.task).toMatchObject({
        state: status,
        settled: status === "completed" ? 1 : 0,
        delivered: 1,
        deliveryStatus: "sent",
      });
      expect(terminal.ledger).toHaveLength(status === "completed" ? 1 : 0);
      const repeated = JSON.parse(await stub.api("cloud.cancel", { id: task.id }));
      expect(repeated.data).toMatchObject({ status, delivery: "sent" });
      expect(repeated.data.stopping).toBeUndefined();
      expect((await pass(stub, status)).sent).toEqual([]);
      expect((await inspect(stub, task.id)).ledger).toEqual(terminal.ledger);
    },
  );

  it("submits, resumes after restart and atomically settles/delivers once", async () => {
    const { stub, task } = await setup();
    const first = await pass(stub, "running");
    expect(first.paths).toContain("/api/agent/jobs");
    expect(first.wakeups[0]).toBeGreaterThan(Date.now());
    expect((await inspect(stub, task.id)).task).toMatchObject({
      state: "accepted",
      jobId: "job-one",
    });
    await abortAllDurableObjects();
    const restored = env.ACCOUNTS.get(stub.id);
    await runInDurableObject(restored, (_, state) => useManualAlarms(state));
    const second = await pass(restored, "completed", { enabled: false, wake: task.id });
    expect(second.paths[0]).toBe("/api/agent/workspace-one/jobs/job-one");
    expect(second.sent).toEqual(["最终答案"]);
    const completed = await inspect(restored, task.id);
    expect(completed.task).toMatchObject({
      state: "completed",
      settled: 1,
      delivered: 1,
      deliveryStatus: "sent",
    });
    expect(completed.ledger).toHaveLength(1);
    expect(completed.messages).toHaveLength(1);
    expect((await pass(restored)).sent).toEqual([]);
    expect((await inspect(restored, task.id)).ledger).toEqual(completed.ledger);
  });

  it("recovers a persisted result without AGT access and retries delivery without rebilling", async () => {
    const { stub, task } = await setup({
      state: "accepted",
      jobId: "job-one",
      outcome: {
        id: "job-one",
        workspaceId: "workspace-one",
        status: "completed",
        text: "最终答案",
      },
    });
    const first = await pass(stub, "completed", { enabled: false, sendFail: true });
    expect(first.paths.some((path) => path.startsWith("/api/agent/"))).toBe(false);
    const saved = await inspect(stub, task.id);
    expect(saved.task).toMatchObject({ settled: 1, delivered: 0 });
    expect(saved.ledger).toHaveLength(1);
    expect((await pass(stub, "completed", { wake: task.id })).sent).toEqual(["最终答案"]);
    const delivered = await inspect(stub, task.id);
    expect(delivered.task.deliveryStatus).toBe("sent");
    expect(delivered.ledger).toEqual(saved.ledger);
    expect(delivered.messages).toEqual(saved.messages);
  });

  it("rearms persisted work on construction without delaying an earlier alarm", async () => {
    const { stub, task } = await setup({ nextAt: Date.now() + 60_000 });
    await abortAllDurableObjects();
    const restored = env.ACCOUNTS.get(stub.id);
    const earlier = Date.now() + 30_000;
    await runInDurableObject(restored, async (_, state) => {
      const armed = await state.storage.getAlarm();
      expect(armed).toBe(task.nextAt);
      await state.storage.setAlarm(earlier);
    });
    await abortAllDurableObjects();
    await runInDurableObject(env.ACCOUNTS.get(stub.id), async (_, state) => {
      expect(await state.storage.getAlarm()).toBe(earlier);
      await useManualAlarms(state);
    });
  });

  it("keeps retrying cancellation with no WeChat link and persists upstream failure backoff", async () => {
    const { stub, task } = await setup({
      state: "accepted",
      jobId: "job-one",
      submittedAt: Date.now(),
    });
    expect(JSON.parse(await stub.api("wechat.disconnect", { connectionId: "default" })).ok).toBe(
      true,
    );
    const failed = await pass(stub, "running", { fail: true });
    const saved = (await inspect(stub, task.id)).task;
    expect(saved).toMatchObject({ state: "accepted", stopRequested: 1, attempts: 1 });
    expect(saved.nextAt).toBeGreaterThan(Date.now());
    expect(failed.wakeups.at(-1)).toBe(saved.nextAt);
    const retried = await pass(stub, "running", { wake: task.id });
    expect(retried.paths).toEqual([
      "/api/agent/workspace-one/jobs/job-one",
      "/api/agent/workspace-one/jobs/job-one/cancel",
    ]);
    expect((await pass(stub, "cancelled", { wake: task.id })).sent).toEqual([]);
    expect((await inspect(stub, task.id)).task).toMatchObject({
      state: "cancelled",
      delivered: 1,
      stale: 1,
      units: 0,
    });
  });

  it.each(["session.action", "privacy.clear"])(
    "advances the alarm after %s instead of waiting for old backoff",
    async (action) => {
      const { stub, task } = await setup({
        state: "accepted",
        jobId: "job-one",
        submittedAt: Date.now(),
        nextAt: Date.now() + 300_000,
      });
      await runInDurableObject(stub, async (instance, state) => {
        const alarm = vi.spyOn(state.storage, "setAlarm");
        expect(
          JSON.parse(await instance.api(action, { id: task.sessionId, action: "reset" })).ok,
        ).toBe(true);
        const wake = Number(alarm.mock.calls.at(-1)![0]);
        expect(wake).toBeLessThanOrEqual(Date.now() + 100);
        expect(wake).toBeLessThan(task.nextAt);
      });
      expect((await pass(stub, "running")).paths).toContain(
        "/api/agent/workspace-one/jobs/job-one/cancel",
      );
    },
  );

  it("restores the Plus expiry wakeup without a receiving connection, then preserves cancellation backoff", async () => {
    const { stub, task } = await setup({
      state: "accepted",
      jobId: "job-one",
      submittedAt: Date.now(),
      nextAt: Date.now() + 180_000,
    });
    const until = Date.now() + 60_000;
    await runInDurableObject(stub, (_, state) => {
      state.storage.sql.exec(
        "UPDATE settings SET value=json_set(value,'$.status','expired') WHERE key='connection'",
      );
      state.storage.sql.exec(
        "UPDATE settings SET value=? WHERE key='planUntil'",
        JSON.stringify(until),
      );
    });
    await abortAllDurableObjects();
    const restored = env.ACCOUNTS.get(stub.id);
    await runInDurableObject(restored, async (_, state) => {
      expect(await state.storage.getAlarm()).toBe(until);
      await useManualAlarms(state);
    });
    expect((await pass(restored)).wakeups.at(-1)).toBe(until);
    await runInDurableObject(restored, (_, state) => {
      state.storage.sql.exec("UPDATE settings SET value='1' WHERE key='planUntil'");
    });
    const expired = await pass(restored, "running");
    expect(expired.paths).toContain("/api/agent/workspace-one/jobs/job-one/cancel");
    const stopping = (await inspect(restored, task.id)).task;
    expect(stopping.stopReason).toContain("Plus");
    expect(expired.wakeups.at(-1)).toBe(stopping.nextAt);
    expect((await pass(restored)).paths).toEqual([]);
  });

  it.each([false, true])(
    "checks credits only before an unsubmitted task (possibly accepted: %s)",
    async (accepted) => {
      const { stub, task } = await setup(
        accepted ? { state: "accepted", jobId: "job-one", unconfirmed: 1 } : {},
      );
      await runInDurableObject(stub, (_, state) => {
        const wallet = new Wallet(state.storage);
        wallet.charge("empty-wallet", wallet.balance(), Number.MAX_SAFE_INTEGER);
      });
      const result = await pass(stub, "running");
      const saved = (await inspect(stub, task.id)).task;
      if (accepted) {
        expect(result.paths[0]).toBe("/api/agent/workspace-one/jobs/job-one");
        expect(saved.stopRequested).toBe(0);
      } else {
        expect(result.paths.some((path) => path.startsWith("/api/agent/"))).toBe(false);
        expect(saved).toMatchObject({ state: "rejected", settled: 0, units: 0 });
        expect(result.sent[0]).toContain("任务未提交，未扣 credits");
      }
    },
  );
});
