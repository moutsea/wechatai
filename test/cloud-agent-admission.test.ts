import { abortAllDurableObjects, env, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  admitCloudAgentTask,
  type CloudAgentAdmissionContext,
} from "../src/server/cloud-agent-admission";
import { prepareCloudAgentRequest } from "../src/server/cloud-agent-request";
import { cloudAgentScope } from "../src/server/cloud-agent-provision";
import { settleCloudAgentTask } from "../src/server/cloud-agent-settlement";
import { CloudAgentStore, type CloudTask } from "../src/server/cloud-agent-store";
import { Wallet, dayWindow } from "../src/server/wallet";
import { assistantSchema } from "../src/server/llm";
import { encrypt } from "../src/server/security";
import { useManualAlarms } from "./helpers/wechat-delivery";

type Account = ReturnType<typeof env.ACCOUNTS.getByName>;
type Context = CloudAgentAdmissionContext;
const settings = {
  CLOUD_AGENT_ENABLED: "true",
  AGT_ORIGIN: "https://agt.example.com",
  AGT_APP_ID: "app-one",
  AGT_APP_KEY: "test-only-agt-app-key",
  AGT_TENANT_ID: "tenant-one",
  AGT_MODEL: "managed-model",
  AGT_AGENT_ID: "wechatai",
  AGT_WORKSPACE_PREFIX: "test",
  CLOUD_AGENT_DAILY_LIMIT: "30",
  CLOUD_AGENT_DEADLINE_MINUTES: "10",
  PUBLIC_SITE_URL: "https://wechatai.example.com",
  AGT_CALLBACK_KEY_VERSION: "v1",
  AGT_CALLBACK_KEYS: "",
};
const configuredEnv = (overrides: Partial<typeof settings> = {}) =>
  new Proxy(env, {
    get(target, name) {
      const values = { ...settings, ...overrides };
      return Reflect.has(values, name) ? Reflect.get(values, name) : Reflect.get(target, name);
    },
  });
const prompt = "  请解释这个问题。\n保留换行和原始输入。 ";
const row = <T>(storage: DurableObjectStorage, table: string, id: string): T | null => {
  const result = storage.sql
    .exec<{ data: string }>(`SELECT data FROM ${table} WHERE id=?`, id)
    .toArray()[0];
  return result ? (JSON.parse(result.data) as T) : null;
};
function readContext(storage: DurableObjectStorage): Context {
  return {
    model: JSON.parse(
      storage.sql.exec<{ value: string }>("SELECT value FROM settings WHERE key='testModel'").one()
        .value,
    ),
    planUntil: JSON.parse(
      storage.sql.exec<{ value: string }>("SELECT value FROM settings WHERE key='planUntil'").one()
        .value,
    ),
    plugin: row<Context["plugin"]>(storage, "plugins", "plugin-one"),
    session: row<Context["session"]>(storage, "sessions", "session-one"),
    connection: {
      id: "link-one",
      generation: "generation-one",
      currentSessionId: "session-one",
      enabled: true,
    },
  };
}
function recordSource(storage: DurableObjectStorage, task: Readonly<CloudTask>): undefined {
  const sql = storage.sql;
  sql.exec(
    "INSERT INTO runs VALUES (?,NULL,'complete',?,?)",
    task.sourceId,
    JSON.stringify({ text: "任务已接收", cost: 0 }),
    task.createdAt,
  );
  sql.exec(
    "INSERT INTO messages (sessionId,role,content,displayContent,createdAt,model) VALUES (?,'user',?,?,?,?)",
    task.sessionId,
    task.prompt,
    task.displayPrompt ?? task.prompt,
    task.createdAt,
    task.pluginName,
  );
  sql.exec(
    "INSERT INTO inbox (id,payload,state,reply,createdAt,sessionId,connectionId) VALUES (?,'{}','done','',?,?,?)",
    task.sourceId,
    task.createdAt,
    task.sessionId,
    task.connectionId,
  );
  const session = row<NonNullable<Context["session"]>>(storage, "sessions", task.sessionId)!;
  sql.exec(
    "UPDATE sessions SET data=? WHERE id=?",
    JSON.stringify({ ...session, messageCount: session.messageCount + 1 }),
    session.id,
  );
}
function accept(
  storage: DurableObjectStorage,
  accountId: string,
  sourceId = "source-one",
  options: {
    env?: Env;
    context?: () => Context;
    commit?: (task: Readonly<CloudTask>) => undefined;
    prompt?: string;
    displayPrompt?: string;
    images?: { mime: string; data: string }[];
  } = {},
) {
  return admitCloudAgentTask(
    options.env ?? configuredEnv(),
    storage,
    accountId,
    {
      sourceId,
      prompt: options.prompt ?? prompt,
      displayPrompt: options.displayPrompt,
      images: options.images,
    },
    options.context ?? (() => readContext(storage)),
    options.commit ?? ((task) => recordSource(storage, task)),
  );
}
const inAccount = <T>(stub: Account, run: (storage: DurableObjectStorage) => T) =>
  runInDurableObject(stub, async (_, state) => {
    await useManualAlarms(state);
    return run(state.storage);
  });
async function setup() {
  const stub = env.ACCOUNTS.getByName(crypto.randomUUID());
  await inAccount(stub, async (storage) => {
    const model = {
      ...assistantSchema.parse({
        name: "用户模型",
        model: "user-model",
        protocol: "responses",
        baseUrl: "https://llm.example.com/v1",
        contextTokens: 200_000,
      }),
      id: "user-model-config",
      channelId: "test",
      channelName: "用户渠道",
      createdAt: 1,
      hasKey: true,
      keyContext: "channel:test",
      encryptedKey: await encrypt(env, "test-user-api-key", `${stub.id}:channel:test`),
    };
    storage.sql.exec("INSERT INTO settings VALUES ('testModel', ?)", JSON.stringify(model));
    storage.sql.exec(
      "INSERT INTO settings VALUES ('planUntil', ?)",
      JSON.stringify(Date.now() + 30 * 86_400_000),
    );
    storage.sql.exec(
      "INSERT INTO plugins VALUES ('plugin-one', ?)",
      JSON.stringify({
        id: "plugin-one",
        pluginId: "wechatai/cloud-agent",
        name: "云端助手",
        enabled: true,
      }),
    );
    storage.sql.exec(
      "INSERT INTO sessions VALUES ('session-one', ?)",
      JSON.stringify({
        id: "session-one",
        pluginInstanceId: "plugin-one",
        connectionId: "link-one",
        assistantId: null,
        title: "我的会话",
        archived: false,
        messageCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        resetAt: 0,
        contextStart: 0,
      }),
    );
    new Wallet(storage).grant("test-grant", "purchase", 10_000, Number.MAX_SAFE_INTEGER, "test");
  });
  return stub;
}
const noTasks = (storage: DurableObjectStorage) => {
  const store = new CloudAgentStore(storage);
  expect(store.page().tasks).toEqual([]);
  expect(store.countSince(dayWindow().start)).toBe(0);
  for (const table of [
    "messages",
    "runs",
    "inbox",
    "usage",
    "platform_metering",
    "cloud_task_images",
  ])
    expect(storage.sql.exec(`SELECT * FROM ${table}`).toArray()).toEqual([]);
};
beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("Admission must not call external services"),
  );
});
afterEach(() => vi.restoreAllMocks());

describe("atomic cloud task admission", () => {
  it("preserves separate display and execution input across restart and duplicate delivery", async () => {
    const stub = await setup();
    const displayPrompt = "把这张图片裁成正方形\n\n[图片 × 1]";
    const executionPrompt = `${displayPrompt}\n附件工作区和执行说明`;
    const first = await inAccount(stub, (storage) => {
      const { task } = accept(storage, stub.id.toString(), "source-one", {
        prompt: executionPrompt,
        displayPrompt,
      });
      expect(task).toMatchObject({ prompt: executionPrompt, displayPrompt });
      expect(task.invocation?.messages[0].content).toEqual([
        { type: "text", text: executionPrompt },
      ]);
      expect(storage.sql.exec("SELECT content,displayContent FROM messages").one()).toEqual({
        content: executionPrompt,
        displayContent: displayPrompt,
      });
      return task;
    });
    await abortAllDurableObjects();
    await inAccount(env.ACCOUNTS.get(stub.id), (storage) => {
      expect(new CloudAgentStore(storage).get(first.id)).toEqual(first);
      expect(
        accept(storage, stub.id.toString(), "source-one", {
          prompt: "changed execution input",
          displayPrompt: "changed display input",
          context: () => {
            throw new Error("Duplicates must not be readmitted");
          },
        }),
      ).toEqual({ task: first, created: false });
      expect(storage.sql.exec("SELECT content,displayContent FROM messages").toArray()).toEqual([
        { content: executionPrompt, displayContent: displayPrompt },
      ]);
      expect(new Wallet(storage).balance()).toBe(10_000);
    });
  });

  it("freezes the effective full-input budget independently of subsequent model edits", async () => {
    const stub = await setup();
    await inAccount(stub, (storage) => {
      const context = readContext(storage);
      context.model!.maxInputTokens = 1024;
      const { task } = accept(storage, stub.id.toString(), crypto.randomUUID(), {
        context: () => context,
      });
      expect(task.modelConnection?.maxInputTokens).toBe(1024);
      expect(task.invocation?.limits.inputTokens).toBe(1024);
      context.model!.maxInputTokens = 9000;
      expect(new CloudAgentStore(storage).get(task.id)?.modelConnection?.maxInputTokens).toBe(1024);
    });
  });

  it("commits the task and host records together with frozen metering/context, without charging", async () => {
    const stub = await setup();
    await inAccount(stub, (storage) => {
      const { task, created } = accept(storage, stub.id.toString());
      expect(created).toBe(true);
      expect(new CloudAgentStore(storage).get(task.id)).toEqual(task);
      expect(task).toMatchObject({
        origin: settings.AGT_ORIGIN,
        appId: "app-one",
        tenantId: "tenant-one",
        profileId: "wechatai-v2",
        model: "user-model",
        workspaceName: `test-${stub.id.toString().slice(0, 32)}`,
        callbackVersion: "v1",
        callbackOrigin: settings.PUBLIC_SITE_URL,
        pluginId: "plugin-one",
        pluginContext: "plugin-one",
        currentSessionId: "session-one",
        connectionId: "link-one",
        generation: "generation-one",
        contextStart: 0,
        resetAt: 0,
        prompt,
        state: "submitting",
        submittedAt: 0,
        request: "",
        settled: 0,
        units: 0,
        invocation: {
          runId: task.id,
          instanceId: "plugin-one",
          sessionId: "session-one",
          pluginId: "wechatai/cloud-agent",
          pluginVersion: "1.0.0",
          messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
          limits: {
            inputTokens: 128_000,
            outputTokens: 8_192,
            outputImages: 4,
            creditUnits: null,
          },
        },
      });
      expect(task.nextAt).toBe(task.createdAt);
      expect(task.deadline).toBe(task.createdAt + 600_000);
      expect(new CloudAgentStore(storage).countSince(dayWindow().start)).toBe(1);
      expect(readContext(storage).session?.messageCount).toBe(1);
      expect(storage.sql.exec("SELECT content FROM messages").one()).toEqual({ content: prompt });
      expect(new Wallet(storage).balance()).toBe(10_000);
      expect(storage.sql.exec("SELECT * FROM reservations").toArray()).toEqual([]);
      expect(storage.sql.exec("SELECT * FROM credit_ledger").toArray()).toHaveLength(1);
      expect(JSON.stringify(task)).not.toContain(settings.AGT_APP_KEY);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  it("coalesces simultaneous deliveries of the same source into one admission", async () => {
    const stub = await setup();
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        inAccount(stub, (storage) => accept(storage, stub.id.toString())),
      ),
    );
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.task.id)).size).toBe(1);
    await inAccount(stub, (storage) => {
      expect(new CloudAgentStore(storage).countSince(dayWindow().start)).toBe(1);
      for (const table of ["messages", "runs", "inbox"])
        expect(storage.sql.exec(`SELECT * FROM ${table}`).toArray()).toHaveLength(1);
    });
  });

  it("admits only one of two different sources competing for the final active slot", async () => {
    const stub = await setup();
    const results = await Promise.allSettled(
      ["first", "second"].map((source) =>
        inAccount(stub, (storage) => accept(storage, stub.id.toString(), source)),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.reason).toMatchObject({ code: "cloud_agent_busy", status: 429 });
    await inAccount(stub, (storage) => {
      expect(new CloudAgentStore(storage).active()).toHaveLength(1);
      expect(readContext(storage).session?.messageCount).toBe(1);
    });
  });

  it("rolls back task and source writes but preserves daily grants when a late host write fails", async () => {
    const stub = await setup();
    await inAccount(stub, (storage) => {
      expect(() =>
        accept(storage, stub.id.toString(), "source-one", {
          images: [{ mime: "image/png", data: Buffer.from("image-data").toString("base64") }],
          context: () => {
            new Wallet(storage).daily(100);
            return readContext(storage);
          },
          commit: (task) => {
            recordSource(storage, task);
            throw new Error("history write failed");
          },
        }),
      ).toThrow("history write failed");
      noTasks(storage);
      expect(new Wallet(storage).balance()).toBe(110_000);
      expect(readContext(storage).session?.messageCount).toBe(0);
      expect(storage.sql.exec("SELECT * FROM credit_ledger").toArray()).toHaveLength(2);
      expect(
        accept(storage, stub.id.toString(), "source-one", {
          context: () => {
            new Wallet(storage).daily(100);
            return readContext(storage);
          },
        }).created,
      ).toBe(true);
      expect(new Wallet(storage).balance()).toBe(110_000);
      expect(storage.sql.exec("SELECT * FROM credit_ledger").toArray()).toHaveLength(2);
    });
  });

  it("preserves daily debt repayment after refusal, deduplicates retries and recovers the next day after eviction", async () => {
    const stub = await setup();
    const context = (storage: DurableObjectStorage) => {
      const wallet = new Wallet(storage);
      wallet.reap();
      wallet.daily(5);
      return readContext(storage);
    };
    await inAccount(stub, (storage) => {
      vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-11T04:00:00Z"));
      const wallet = new Wallet(storage);
      wallet.charge("previous-task", 16_000, Number.MAX_SAFE_INTEGER);
      expect(wallet.balance()).toBe(-6000);
      for (let attempt = 0; attempt < 2; attempt++) {
        expect(() =>
          accept(storage, stub.id.toString(), "new-source", {
            context: () => context(storage),
          }),
        ).toThrow(expect.objectContaining({ code: "insufficient_credits", status: 402 }));
        expect(wallet.balance()).toBe(-1000);
        expect(wallet.debt()).toBe(1000);
        noTasks(storage);
      }
      expect(
        storage.sql.exec("SELECT * FROM credit_ledger WHERE kind='daily'").toArray(),
      ).toHaveLength(1);
    });
    await abortAllDurableObjects();
    await inAccount(env.ACCOUNTS.get(stub.id), (storage) => {
      vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-12T04:00:00Z"));
      const result = accept(storage, stub.id.toString(), "new-source", {
        context: () => context(storage),
      });
      expect(result.created).toBe(true);
      expect(new Wallet(storage).balance()).toBe(4000);
      expect(new Wallet(storage).debt()).toBe(0);
      expect(
        storage.sql.exec("SELECT * FROM credit_ledger WHERE kind='daily'").toArray(),
      ).toHaveLength(2);
      expect(
        storage.sql.exec("SELECT * FROM credit_ledger WHERE kind='usage'").toArray(),
      ).toHaveLength(1);
    });
  });

  it("preserves wallet refresh when preparation itself rejects the source context", async () => {
    const stub = await setup();
    await inAccount(stub, (storage) => {
      expect(() =>
        accept(storage, stub.id.toString(), "source-one", {
          context: () => {
            new Wallet(storage).daily(5);
            throw new Error("session disappeared");
          },
        }),
      ).toThrow("session disappeared");
      noTasks(storage);
      expect(new Wallet(storage).balance()).toBe(15_000);
    });
  });

  it("preserves a duplicate after restart, content deletion, membership expiry and gate/config changes", async () => {
    const stub = await setup();
    const first = await inAccount(stub, (storage) => {
      const task = accept(storage, stub.id.toString()).task;
      const store = new CloudAgentStore(storage);
      store.hideSession(task.sessionId);
      store.patch(task, { state: "cancelled", delivered: 1, nextAt: 0 });
      storage.sql.exec("UPDATE settings SET value='0' WHERE key='planUntil'");
      new Wallet(storage).charge("previous", 10_000, Number.MAX_SAFE_INTEGER);
      return store.get(task.id)!;
    });
    await abortAllDurableObjects();
    await inAccount(env.ACCOUNTS.get(stub.id), (storage) => {
      const context = vi.fn(() => {
        throw new Error("Duplicates must not be readmitted");
      });
      const commit = vi.fn(() => undefined);
      expect(
        accept(storage, stub.id.toString(), "source-one", {
          env: configuredEnv({ CLOUD_AGENT_ENABLED: "false", AGT_MODEL: "" }),
          context,
          commit,
          prompt: "a changed retry must not recreate the deleted request",
        }),
      ).toEqual({ task: first, created: false });
      expect(context).not.toHaveBeenCalled();
      expect(commit).not.toHaveBeenCalled();
      expect(new CloudAgentStore(storage).get(first.id)?.prompt).toBe("");
    });
  });

  it.each([
    [
      "missing user model",
      "cloud_model_required",
      (c: Context) => {
        c.model = undefined;
      },
    ],
    [
      "free",
      "cloud_plus_required",
      (c: Context) => {
        c.planUntil = 0;
      },
    ],
    [
      "expired",
      "cloud_plus_required",
      (c: Context) => {
        c.planUntil = Date.now() - 1;
      },
    ],
    [
      "deleted plugin",
      "plugin_missing",
      (c: Context) => {
        c.plugin = null;
      },
    ],
    [
      "different plugin",
      "plugin_type",
      (c: Context) => {
        c.plugin!.pluginId = "wechatai/openclaw";
      },
    ],
    [
      "disabled plugin",
      "plugin_disabled",
      (c: Context) => {
        c.plugin!.enabled = false;
      },
    ],
    [
      "disabled connection",
      "connection_disabled",
      (c: Context) => {
        c.connection.enabled = false;
      },
    ],
    [
      "missing session",
      "cloud_session_unavailable",
      (c: Context) => {
        c.session = null;
      },
    ],
    [
      "archived session",
      "cloud_session_unavailable",
      (c: Context) => {
        c.session!.archived = true;
      },
    ],
    [
      "foreign connection",
      "cloud_session_unavailable",
      (c: Context) => {
        c.connection.id = "other";
      },
    ],
  ] as const)("rejects %s without creating records", async (_, code, change) => {
    const stub = await setup();
    await inAccount(stub, (storage) => {
      expect(() =>
        accept(storage, stub.id.toString(), "source-one", {
          context: () => {
            const c = readContext(storage);
            change(c);
            return c;
          },
        }),
      ).toThrow(expect.objectContaining({ code }));
      noTasks(storage);
    });
  });

  it.each([0, -1])("requires a strictly positive wallet balance (%s)", async (balance) => {
    const stub = await setup();
    await inAccount(stub, (storage) => {
      new Wallet(storage).charge("previous", 10_000 - balance, Number.MAX_SAFE_INTEGER);
      expect(() => accept(storage, stub.id.toString())).toThrow(
        expect.objectContaining({
          code: "insufficient_credits",
          status: 402,
        }),
      );
      noTasks(storage);
      expect(new Wallet(storage).balance()).toBe(balance);
    });
  });

  it.each<Partial<typeof settings>>([
    { CLOUD_AGENT_ENABLED: "false" },
    { AGT_APP_KEY: "" },
    { PUBLIC_SITE_URL: "https://wechatai.example.com/path" },
    { AGT_CALLBACK_KEY_VERSION: "v2", AGT_CALLBACK_KEYS: "{}" },
  ])("rejects unavailable server configuration before reserving a task: %j", async (change) => {
    const stub = await setup();
    await inAccount(stub, (storage) => {
      expect(() =>
        accept(storage, stub.id.toString(), "source-one", {
          env: configuredEnv(change),
        }),
      ).toThrow(expect.objectContaining({ code: "cloud_agent_unavailable", status: 503 }));
      noTasks(storage);
    });
  });

  it.each(["", "  \n  ", "x".repeat(50_001), " token".repeat(128_001)])(
    "rejects empty or oversized text before consuming a slot (%#)",
    async (text) => {
      const stub = await setup();
      await inAccount(stub, (storage) => {
        expect(() => accept(storage, stub.id.toString(), "source-one", { prompt: text })).toThrow();
        noTasks(storage);
        expect(accept(storage, stub.id.toString()).created).toBe(true);
      });
    },
  );

  it.each<Partial<CloudTask>>([
    { stopRequested: 1 },
    { unconfirmed: 1, submittedAt: 1 },
    { deadline: 1 },
    { state: "accepted", upstreamStatus: "awaiting_approval" },
  ])("keeps uncertain or stopping work in the concurrency cap: %j", async (change) => {
    const stub = await setup();
    await inAccount(stub, (storage) => {
      const first = accept(storage, stub.id.toString()).task;
      new CloudAgentStore(storage).patch(first, change);
      expect(() => accept(storage, stub.id.toString(), "second")).toThrow(
        expect.objectContaining({
          code: "cloud_agent_busy",
        }),
      );
    });
  });

  it("counts daily work across plugins/connections and releases only definitive rejections", async () => {
    const stub = await setup();
    await inAccount(stub, (storage) => {
      const options = { env: configuredEnv({ CLOUD_AGENT_DAILY_LIMIT: "1" }) };
      const first = accept(storage, stub.id.toString(), "first", options).task;
      const store = new CloudAgentStore(storage);
      store.patch(first, { state: "cancelled", delivered: 1 });
      const context = () => {
        const c = readContext(storage);
        c.plugin!.id = "different-plugin";
        c.connection.id = "different-link";
        c.session!.connectionId = "different-link";
        return c;
      };
      expect(() => accept(storage, stub.id.toString(), "second", { ...options, context })).toThrow(
        expect.objectContaining({ code: "cloud_agent_daily_limit", status: 429 }),
      );
      store.patch(first, { state: "rejected" });
      expect(accept(storage, stub.id.toString(), "second", { ...options, context }).created).toBe(
        true,
      );
      expect(store.countSince(dayWindow().start)).toBe(1);
    });
  });

  it.each<Partial<CloudTask>>([
    {},
    { state: "accepted", jobId: "job-one" },
    { state: "accepted", jobId: "job-one", stopRequested: 1 },
  ])(
    "reports exhausted daily quota while the last allowed task remains active: %j",
    async (change) => {
      const stub = await setup();
      await inAccount(stub, (storage) => {
        const options = { env: configuredEnv({ CLOUD_AGENT_DAILY_LIMIT: "1" }) };
        const first = accept(storage, stub.id.toString(), "first", options).task;
        new CloudAgentStore(storage).patch(first, change);
        expect(() => accept(storage, stub.id.toString(), "second", options)).toThrow(
          expect.objectContaining({
            code: "cloud_agent_daily_limit",
            message: expect.stringContaining("北京时间次日 0 点重置"),
          }),
        );
        expect(new CloudAgentStore(storage).active()).toHaveLength(1);
        expect(new CloudAgentStore(storage).countSince(dayWindow().start)).toBe(1);
        expect(readContext(storage).session?.messageCount).toBe(1);
      });
    },
  );

  it("waits for confirmed stop, preserves the daily count after settlement and frees only the active slot", async () => {
    const stub = await setup();
    await inAccount(stub, async (storage) => {
      const options = { env: configuredEnv({ CLOUD_AGENT_DAILY_LIMIT: "2" }) };
      const first = accept(storage, stub.id.toString(), "first", options).task;
      const store = new CloudAgentStore(storage);
      store.patch(first, {
        state: "accepted",
        jobId: "job-one",
        submittedAt: Date.now(),
        stopRequested: 1,
      });
      expect(() => accept(storage, stub.id.toString(), "second", options)).toThrow(
        expect.objectContaining({
          code: "cloud_agent_busy",
          message: expect.stringContaining("等待结束后再提交"),
        }),
      );
      store.patch(first, {
        outcome: { id: "job-one", workspaceId: "workspace-one", status: "cancelled" },
      });
      expect(await settleCloudAgentTask(storage, first.id, () => false)).toMatchObject({
        state: "cancelled",
        units: 0,
        settled: 0,
      });
      expect(store.active()).toHaveLength(0);
      expect(store.countSince(dayWindow().start)).toBe(1);
      expect(accept(storage, stub.id.toString(), "second", options).created).toBe(true);
      expect(store.countSince(dayWindow().start)).toBe(2);
      expect(new Wallet(storage).balance()).toBe(10_000);
      expect(storage.sql.exec("SELECT * FROM credit_ledger WHERE kind='usage'").toArray()).toEqual(
        [],
      );
    });
  });

  it("resets the daily execution count at Beijing midnight", async () => {
    const stub = await setup();
    await inAccount(stub, (storage) => {
      const now = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-11T15:59:59Z"));
      const options = { env: configuredEnv({ CLOUD_AGENT_DAILY_LIMIT: "1" }) };
      const first = accept(storage, stub.id.toString(), "first", options).task;
      new CloudAgentStore(storage).patch(first, { state: "completed", delivered: 1 });
      expect(() => accept(storage, stub.id.toString(), "second", options)).toThrow(
        expect.objectContaining({ code: "cloud_agent_daily_limit" }),
      );
      now.mockReturnValue(Date.parse("2026-11-11T16:00:00Z"));
      expect(accept(storage, stub.id.toString(), "second", options).created).toBe(true);
    });
  });

  it("feeds the existing request and settlement pipeline using the admitted identity and one bill", async () => {
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      if (request.method === "GET") return Response.json({ channels: [] });
      expect(await request.json()).toMatchObject({
        apiKey: "test-user-api-key",
        defaultModel: "user-model",
      });
      return Response.json({ channel: { id: `mch_${"b".repeat(32)}` } });
    });
    const stub = await setup();
    await inAccount(stub, async (storage) => {
      const first = accept(storage, stub.id.toString()).task;
      const store = new CloudAgentStore(storage);
      store.saveProvision({
        scope: cloudAgentScope(first),
        profiles: [first.profileId],
        externalId: `wechatai:${stub.id}`,
        appUserId: "user-one",
        workspaceId: "workspace-one",
        configured: 1,
        updatedAt: Date.now(),
      });
      const body = JSON.parse(
        (await prepareCloudAgentRequest(
          configuredEnv(),
          store,
          stub.id.toString(),
          first.id,
          () => undefined,
        ))!,
      );
      expect(body).toMatchObject({
        message: prompt,
        conversationId: first.conversationId,
        model: `channel:mch_${"b".repeat(32)}:user-model`,
      });
      store.patch(first, {
        state: "accepted",
        jobId: "job-one",
        outcome: {
          id: "job-one",
          workspaceId: "workspace-one",
          status: "completed",
          text: "已完成任务。",
        },
      });
      const settled = (await settleCloudAgentTask(storage, first.id, () => false))!;
      expect(settled).toMatchObject({ state: "completed", settled: 1, result: "已完成任务。" });
      expect(settled.units).toBeGreaterThan(0);
      expect(accept(storage, stub.id.toString()).created).toBe(false);
      expect(await settleCloudAgentTask(storage, first.id, () => false)).toEqual(settled);
      expect(new Wallet(storage).balance()).toBe(10_000 - settled.units);
      expect(
        storage.sql.exec("SELECT * FROM credit_ledger WHERE kind='usage'").toArray(),
      ).toHaveLength(1);
      expect(storage.sql.exec("SELECT role FROM messages ORDER BY id").toArray()).toEqual([
        { role: "user" },
        { role: "assistant" },
      ]);
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  it("retains a conversation across turns and isolates plugin, link, generation and session resets", async () => {
    const stub = await setup();
    await inAccount(stub, (storage) => {
      const base = readContext(storage);
      const store = new CloudAgentStore(storage);
      let source = 0;
      const next = (context: Context) => {
        const task = accept(storage, stub.id.toString(), `source-${source++}`, {
          context: () => context,
          commit: () => undefined,
        }).task;
        store.patch(task, { state: "completed", delivered: 1 });
        return task;
      };
      const first = next(base);
      expect(next(base).conversationId).toBe(first.conversationId);
      const changes = [
        (c: Context) => {
          c.plugin!.id = "plugin-two";
        },
        (c: Context) => {
          c.connection.id = c.session!.connectionId = "link-two";
        },
        (c: Context) => {
          c.connection.generation = "generation-two";
        },
        (c: Context) => {
          c.session!.id = "session-two";
        },
        (c: Context) => {
          c.session!.resetAt = 123;
        },
        (c: Context) => {
          c.session!.contextStart = 456;
        },
      ];
      const conversations = changes.map((change) => {
        const c = structuredClone(base);
        change(c);
        return next(c).conversationId;
      });
      expect(new Set([first.conversationId, ...conversations]).size).toBe(changes.length + 1);
      const once = structuredClone(base);
      delete once.session!.pluginInstanceId;
      expect(next(once)).toMatchObject({ pluginContext: null, currentSessionId: "session-one" });
    });
  });

  it("keeps the same source independent in separate account workspaces", async () => {
    const accounts = await Promise.all([setup(), setup()]);
    const tasks = await Promise.all(
      accounts.map((stub) =>
        inAccount(stub, (storage) => accept(storage, stub.id.toString()).task),
      ),
    );
    expect(tasks[0].sourceId).toBe(tasks[1].sourceId);
    expect(tasks[0].id).not.toBe(tasks[1].id);
    expect(tasks[0].workspaceName).not.toBe(tasks[1].workspaceName);
  });
});
