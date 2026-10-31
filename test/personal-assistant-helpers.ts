import { env, runInDurableObject, abortAllDurableObjects } from "cloudflare:test";
import { beforeEach, afterEach, expect, vi } from "vitest";
import type { ReminderScheduler } from "../src/server/reminder-scheduler";
import { PersonalRunStore, type PersonalRun } from "../src/server/personal-runs";
import type { PersonalAssistantProgress } from "../src/server/plugins/personal-assistant";
import type { PersonalAssistantPlugin, PersonalRecord } from "../src/shared/personal-assistant";
import type { Protocol } from "../src/shared/types";
import type { WxMessage } from "../src/server/wechat";
import { encrypt } from "../src/server/security";
import { deferAutomaticAlarms } from "./helpers/wechat-delivery";
import { wechatLinkKey } from "../src/shared/wechat-links";
const accounts: DurableObjectStub<import("../src/server/personal-account").PersonalAccount>[] = [];
type Account = (typeof accounts)[number];
const scheduler = (stub: Account) =>
  (env.REMINDERS as DurableObjectNamespace<ReminderScheduler>).getByName(stub.id.toString());
const api = async (stub: Account, action: string, payload: unknown = {}) =>
  JSON.parse(await stub.api(action, payload));
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("Unexpected network"))),
  ),
);
afterEach(async () => {
  for (const stub of accounts.splice(0)) {
    await runInDurableObject(scheduler(stub), async (_, state) => {
      await state.storage.deleteAlarm();
    });
    await runInDurableObject(env.ACCOUNTS.get(stub.id), async (_, state) => {
      await state.storage.deleteAlarm();
    });
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const note = { kind: "note", title: "摄影展", content: "周末去看", date: "2026-10-09" };
const entry = {
  kind: "entry",
  title: "午餐",
  date: "2026-10-09",
  amount: "35.20",
  category: "餐饮",
  currency: "CNY",
};
const future = () => new Date(Date.now() + 3600000).toISOString();
async function setup(protocol: Protocol = "chat-completions", plus = true) {
  const stub = env.ACCOUNTS.getByName(crypto.randomUUID());
  accounts.push(stub);
  const model = await api(stub, "assistant.save", {
    name: "回答",
    model: "test-model",
    protocol,
    baseUrl: "https://llm.example.com",
    apiKey: "test-key",
    systemPrompt: "model-prompt-must-not-leak",
    maxInputTokens: 24000,
    maxOutputTokens: 512,
    contextTokens: 32000,
    maxCredits: 0,
  });
  expect(model.ok).toBe(true);
  await api(stub, "wechat.create", { name: "测试微信" });
  if (plus)
    await stub.applyPayment({
      id: "plus",
      kind: "subscription",
      units: 0,
      expires: Date.now() + 86400000,
    });
  return { stub, model: model.data };
}
async function savePlugin(stub: Account, modelId: string, extra = {}) {
  const result = await api(stub, "plugin.save", {
    pluginId: "wechatai/personal-assistant",
    modelId,
    ...extra,
  });
  expect(result.ok, JSON.stringify(result)).toBe(true);
  return result.data as PersonalAssistantPlugin;
}
const list = (stub: Account, pluginId: string, query = {}) =>
  api(stub, "personal.list", { pluginId, query });
const save = (stub: Account, pluginId: string, record: unknown, existing?: PersonalRecord) =>
  api(stub, "personal.save", {
    pluginId,
    record,
    recordId: existing?.id,
    revision: existing?.revision,
  });
const send = (
  stub: Account,
  text: string,
  id: string = crypto.randomUUID(),
  connectionId = "default",
) =>
  runInDurableObject(stub, (instance) =>
    (
      instance as unknown as {
        processWechat(id: string, message: WxMessage, connectionId: string): Promise<string>;
      }
    ).processWechat(id, { item_list: [{ type: 1, text_item: { text } }] }, connectionId),
  );
function response(
  protocol: Protocol,
  text: string,
  calls: { id: string; name: string; args: unknown }[] = [],
) {
  if (protocol === "responses")
    return {
      status: "completed",
      output: [
        ...calls.map((c) => ({
          type: "function_call",
          call_id: c.id,
          name: c.name,
          arguments: JSON.stringify(c.args),
        })),
        ...(text
          ? [{ type: "message", role: "assistant", content: [{ type: "output_text", text }] }]
          : []),
      ],
    };
  if (protocol === "anthropic")
    return {
      stop_reason: calls.length ? "tool_use" : "end_turn",
      content: [
        ...calls.map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: c.args })),
        ...(text ? [{ type: "text", text }] : []),
      ],
    };
  return {
    choices: [
      {
        finish_reason: calls.length ? "tool_calls" : "stop",
        message: {
          role: "assistant",
          content: text || null,
          ...(calls.length
            ? {
                tool_calls: calls.map((c) => ({
                  id: c.id,
                  type: "function",
                  function: { name: c.name, arguments: JSON.stringify(c.args) },
                })),
              }
            : {}),
        },
      },
    ],
  };
}
function modelNetwork(protocol: Protocol, replies: unknown[]) {
  const bodies: Record<string, unknown>[] = [];
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url).includes("cloudflare-dns.com"))
      return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
    if (!String(url).includes("llm.example.com")) throw new Error("Unexpected endpoint");
    bodies.push(JSON.parse(String(init?.body)));
    const next = replies.shift();
    if (next instanceof Error) throw next;
    return next instanceof Response ? next : Response.json(next ?? response(protocol, "好了"));
  });
  return bodies;
}
const systemText = (body: Record<string, unknown>) =>
  String(body.system ?? body.instructions ?? (body.messages as { content: string }[])[0].content);
const contextData = (text: string) => JSON.parse(text.slice(text.indexOf('{"revision":')));
async function connect(stub: Account, overrides = {}, connectionId = "default") {
  await runInDurableObject(stub, async (_, state) => {
    const encryptedCredentials = await encrypt(
      env,
      JSON.stringify({
        token: "test",
        baseUrl: "https://ilinkai.weixin.qq.com",
        userId: "owner",
        botId: "bot",
      }),
      `${state.id}:wechat`,
    );
    state.storage.sql.exec(
      "INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      wechatLinkKey(connectionId, "connection"),
      JSON.stringify({
        status: "connected",
        generation: "g1",
        contextToken: "context",
        encryptedCredentials,
        ...overrides,
      }),
    );
  });
}

// Capture the durable state at a real journal or model-request boundary, then recreate the object
// from that state. The synthetic failure only unwinds the test's live promise;
// restoring the snapshot models a reset where catch/finally never took effect.
async function interruptPersonal(
  stub: Account,
  input: string,
  at:
    | ((progress: PersonalAssistantProgress) => boolean)
    | { modelRequest: number }
    | { runSaved: (run: PersonalRun) => boolean },
  id = "restart-run",
) {
  await runInDurableObject(stub, async (instance, state) => {
    await deferAutomaticAlarms(state);
    const target = instance as unknown as {
      personalRuns: PersonalRunStore;
      processWechat(id: string, message: WxMessage, connectionId: string): Promise<string>;
    };
    const message: WxMessage = {
      message_type: 1,
      from_user_id: "owner",
      context_token: "context",
      item_list: [{ type: 1, text_item: { text: input } }],
    };
    state.storage.sql.exec(
      "INSERT INTO inbox (id,payload,createdAt,connectionId) VALUES (?,?,?,'default')",
      id,
      JSON.stringify(message),
      Date.now(),
    );
    const store = target.personalRuns;
    const write = store.write.bind(store);
    let captured:
      | {
          meta: PersonalRun;
          parts: { kind: string; part: number; data: ArrayBuffer }[];
          busy: string;
        }
      | undefined;
    const capture = () => {
      captured = {
        meta: store.get(id)!,
        parts: state.storage.sql
          .exec<{ kind: string; part: number; data: ArrayBuffer }>(
            "SELECT kind,part,data FROM personal_run_data WHERE id=?",
            id,
          )
          .toArray(),
        busy: state.storage.sql
          .exec<{ value: string }>("SELECT value FROM settings WHERE key='busy'")
          .one().value,
      };
      throw new Error("simulated process reset");
    };
    let restore: () => void;
    if (typeof at === "function") {
      const hook = vi.spyOn(store, "write").mockImplementation((runId, kind, value) => {
        write(runId, kind, value);
        if (kind === "progress" && at(value as PersonalAssistantProgress)) capture();
      });
      restore = () => hook.mockRestore();
    } else if ("runSaved" in at) {
      const save = store.save.bind(store);
      const hook = vi.spyOn(store, "save").mockImplementation((runId, value) => {
        save(runId, value);
        if (at.runSaved(value)) capture();
      });
      restore = () => hook.mockRestore();
    } else {
      const upstream = vi.mocked(fetch).getMockImplementation()!;
      let requests = 0;
      vi.mocked(fetch).mockImplementation(async (url, init) => {
        const host = new URL(url instanceof Request ? url.url : String(url)).hostname;
        if (host === "llm.example.com" && ++requests === at.modelRequest) capture();
        return upstream(url, init);
      });
      restore = () => {
        vi.mocked(fetch).mockImplementation(upstream);
      };
    }
    try {
      await expect(target.processWechat(id, message, "default")).rejects.toThrow(
        "simulated process reset",
      );
    } finally {
      restore();
    }
    expect(captured).toBeDefined();
    const saved = captured!;
    state.storage.transactionSync(() => {
      state.storage.sql.exec("UPDATE runs SET status='running',response='' WHERE id=?", id);
      state.storage.sql.exec("UPDATE settings SET value=? WHERE key='busy'", saved.busy);
      store.save(id, saved.meta);
      for (const part of saved.parts)
        state.storage.sql.exec(
          "INSERT INTO personal_run_data VALUES (?,?,?,?)",
          id,
          part.kind,
          part.part,
          part.data,
        );
    });
    expect(state.storage.sql.exec("SELECT count(*) n FROM usage WHERE id=?", id).one().n).toBe(0);
  });
  await abortAllDurableObjects();
  const restored = env.ACCOUNTS.get(stub.id);
  await runInDurableObject(restored, async (_, state) => {
    // The constructor correctly schedules immediate recovery. Assert that before
    // deferring it, so the test's explicit resume cannot race a wall-clock alarm
    // under a busy full-suite run. runDurableObjectAlarm still fires it manually.
    const alarm = await state.storage.getAlarm();
    expect(alarm).not.toBeNull();
    expect(alarm).toBeLessThanOrEqual(Date.now() + 1000);
    await deferAutomaticAlarms(state);
  });
  return restored;
}
async function due(stub: Account, age = 1000) {
  await runInDurableObject(stub, (_, state) => {
    state.storage.sql.exec("UPDATE personal_reminders SET dueAt=?,retryAt=0", Date.now() - age);
  });
}
const deliver = (stub: Account) =>
  runInDurableObject(stub, (instance) =>
    (
      instance as unknown as { deliverPersonalReminders(): Promise<void> }
    ).deliverPersonalReminders(),
  );
const reminders = (stub: Account) =>
  runInDurableObject(stub, (_, state) =>
    state.storage.sql.exec("SELECT * FROM personal_reminders").toArray(),
  );

export {
  scheduler,
  api,
  note,
  entry,
  future,
  setup,
  savePlugin,
  list,
  save,
  send,
  response,
  modelNetwork,
  systemText,
  contextData,
  connect,
  interruptPersonal,
  due,
  deliver,
  reminders,
};
