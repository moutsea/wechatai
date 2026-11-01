import { abortAllDurableObjects, env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { PersonalRecordsStore } from "../src/server/personal-records";
import { encrypt } from "../src/server/security";
import { beijingDate } from "../src/shared/personal-assistant";
import { wechatLinkKey } from "../src/shared/wechat-links";
import {
  api,
  connect,
  deliver,
  list,
  reminders,
  save,
  savePlugin,
  setup,
} from "./personal-assistant-helpers";

async function reminder() {
  const { stub, model } = await setup("chat-completions", false);
  await connect(stub);
  const plugin = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
  const at = Date.now() + 60000;
  const result = await save(stub, plugin.id, {
    kind: "reminder",
    title: "拿牛奶",
    date: beijingDate(at),
    remindAt: new Date(at).toISOString(),
  });
  expect(result.ok).toBe(true);
  const clock = vi.spyOn(Date, "now").mockReturnValue(at + 1000);
  return { stub, plugin, record: result.data, at, clock };
}

describe("reminder blocks and delivery failures", () => {
  it("retains the original login failure through receiver expiry, restart and the final expiry", async () => {
    const { stub, plugin, at, clock } = await reminder();
    vi.mocked(fetch).mockImplementation(async () => Response.json({ ret: -14 }));
    await deliver(stub);
    const failure = (await list(stub, plugin.id)).data.records[0].reminderLastFailure;
    expect(failure).toMatchObject({ code: "wechat_expired", ret: -14, at: at + 1000, dueAt: at });
    // Receiver and pollWechat mark the login expired without rebinding its generation.
    await connect(stub, { status: "expired" });
    clock.mockReturnValue(at + 6000);
    await deliver(stub);
    const blocked = (await list(stub, plugin.id)).data.records[0];
    expect(blocked).toMatchObject({
      reminderState: "paused",
      reminderLastFailure: failure,
      reminderBlockReason: { code: "wechat_expired" },
    });
    expect(blocked.reminderBlockReason.message).toContain("重新扫码");
    await abortAllDurableObjects();
    const fresh = env.ACCOUNTS.get(stub.id);
    clock.mockReturnValue(at + 66000);
    await deliver(fresh);
    expect((await list(fresh, plugin.id)).data.records[0].reminderLastFailure).toEqual(failure);
    clock.mockReturnValue(at + 86400001);
    await deliver(fresh);
    expect((await list(fresh, plugin.id)).data.records[0]).toMatchObject({
      reminderState: "expired",
      reminderLastFailure: failure,
      reminderBlockReason: { code: "wechat_expired" },
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("updates current prerequisites without replacing send diagnostics, and clears the block on recovery", async () => {
    const { stub, plugin, at, clock } = await reminder();
    vi.mocked(fetch).mockImplementation(async () => new Response("denied", { status: 403 }));
    await deliver(stub);
    const failure = (await list(stub, plugin.id)).data.records[0].reminderLastFailure;
    await connect(stub, { contextToken: "" });
    clock.mockReturnValue(at + 6000);
    await deliver(stub);
    expect((await list(stub, plugin.id)).data.records[0]).toMatchObject({
      reminderBlockReason: { code: "wechat_context_missing" },
      reminderLastFailure: failure,
    });
    expect((await api(stub, "plugin.save", { ...plugin, enabled: false })).ok).toBe(true);
    clock.mockReturnValue(at + 66000);
    await deliver(stub);
    expect((await list(stub, plugin.id)).data.records[0]).toMatchObject({
      reminderBlockReason: { code: "reminder_plugin_paused" },
      reminderLastFailure: failure,
    });
    expect((await reminders(stub))[0].attempts).toBe(1);
    expect((await api(stub, "plugin.save", plugin)).ok).toBe(true);
    await connect(stub);
    clock.mockReturnValue(at + 126000);
    vi.mocked(fetch).mockImplementation(async () => new Response("unavailable", { status: 503 }));
    await deliver(stub);
    const latest = (await list(stub, plugin.id)).data.records[0];
    expect(latest.reminderBlockReason).toBeUndefined();
    expect(latest.reminderLastFailure).toMatchObject({ upstreamStatus: 503, at: at + 126000 });
    clock.mockReturnValue(at + 136000);
    vi.mocked(fetch).mockImplementation(async () => Response.json({ ret: 0 }));
    await deliver(stub);
    const sent = (await list(stub, plugin.id)).data.records[0];
    expect(sent.reminderState).toBe("sent");
    expect(sent.reminderBlockReason).toBeUndefined();
    expect(sent.reminderLastFailure).toEqual(latest.reminderLastFailure);
    expect((await reminders(stub))[0].attempts).toBe(3);
  });

  it("migrates separate block storage once without rewriting existing failures or delivery schedules", async () => {
    const { stub } = await reminder();
    vi.mocked(fetch).mockImplementation(async () => Response.json({ ret: -14 }));
    await deliver(stub);
    await runInDurableObject(stub, (_, state) => {
      const sql = state.storage.sql;
      sql.exec("ALTER TABLE personal_reminders DROP COLUMN blockReason");
      sql.exec("DELETE FROM personal_record_migrations WHERE version=6");
      const before = sql.exec("SELECT * FROM personal_reminders").one();
      const store = new PersonalRecordsStore(sql);
      const schedule = store.schedule();
      state.storage.transactionSync(() => store.init());
      state.storage.transactionSync(() => store.init());
      const after = sql.exec("SELECT * FROM personal_reminders").one();
      expect(after).toMatchObject(before);
      expect(after.blockReason).toBeNull();
      expect(store.schedule()).toEqual(schedule);
    });
  });
});

describe("last-moment recipient validation", () => {
  it.each([
    { change: "plan", state: "paused", code: "reminder_link_paused" },
    { change: "login", state: "paused", code: "wechat_expired" },
    { change: "credentials", state: "paused", code: "reminder_link_paused" },
    { change: "context", state: "waiting_context", code: "wechat_context_missing" },
    { change: "plugin", state: "paused", code: "reminder_plugin_paused" },
    { change: "binding", state: "blocked", code: "reminder_binding_changed" },
  ])(
    "does not send or count an attempt when $change changes during decryption",
    async ({ change, state: expectedState, code }) => {
      const { stub, model } = await setup();
      const second = await api(stub, "wechat.create", { name: "微信 B" });
      expect(second.ok).toBe(true);
      const linkB = second.data.selectedConnectionId as string;
      await connect(stub, {}, linkB);
      const plugin = await savePlugin(stub, model.id, { reminderConnectionId: linkB });
      const at = Date.now() + 60000;
      expect(
        (
          await save(stub, plugin.id, {
            kind: "reminder",
            title: "微信 B 的提醒",
            date: beijingDate(at),
            remindAt: new Date(at).toISOString(),
          })
        ).ok,
      ).toBe(true);
      const clock = vi.spyOn(Date, "now").mockReturnValue(at + 1);
      vi.mocked(fetch).mockImplementation(async () => Response.json({ ret: 0 }));
      await runInDurableObject(stub, async (instance, state) => {
        const sql = state.storage.sql;
        if (change === "plan")
          sql.exec("UPDATE settings SET value=? WHERE key='planUntil'", JSON.stringify(at + 2));
        const decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
        const hook = vi.spyOn(crypto.subtle, "decrypt").mockImplementation(async (...args) => {
          const result = await decrypt(...args);
          if (change === "plan") clock.mockReturnValue(at + 3);
          else if (change === "plugin")
            sql.exec(
              "UPDATE plugins SET data=json_set(data,'$.enabled',json('false')) WHERE id=?",
              plugin.id,
            );
          else {
            const [path, value] =
              change === "login"
                ? ["$.status", "expired"]
                : change === "credentials"
                  ? ["$.encryptedCredentials", ""]
                  : change === "context"
                    ? ["$.contextToken", ""]
                    : ["$.generation", "new-binding"];
            sql.exec(
              "UPDATE settings SET value=json_set(value,?,?) WHERE key=?",
              path,
              value,
              wechatLinkKey(linkB, "connection"),
            );
          }
          return result;
        });
        try {
          await instance.dispatchPersonalReminders();
        } finally {
          hook.mockRestore();
        }
      });
      if (change === "plan") expect((await stub.snapshot()).plan).toBe("free");
      expect(fetch).not.toHaveBeenCalled();
      const record = (await list(stub, plugin.id)).data.records[0];
      expect(record).toMatchObject({ reminderState: expectedState, reminderBlockReason: { code } });
      expect(record.reminderLastFailure).toBeUndefined();
      expect((await reminders(stub))[0].attempts).toBe(0);
    },
  );

  it("sends with a fresh context token received during decryption", async () => {
    const { stub } = await reminder();
    const tokens: string[] = [];
    vi.mocked(fetch).mockImplementation(async (_, init) => {
      tokens.push(JSON.parse(String(init?.body)).msg.context_token);
      return Response.json({ ret: 0 });
    });
    await runInDurableObject(stub, async (instance, state) => {
      const decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
      const hook = vi.spyOn(crypto.subtle, "decrypt").mockImplementation(async (...args) => {
        const result = await decrypt(...args);
        state.storage.sql.exec(
          "UPDATE settings SET value=json_set(value,'$.contextToken','fresh-context') WHERE key=?",
          wechatLinkKey("default", "connection"),
        );
        return result;
      });
      try {
        await instance.dispatchPersonalReminders();
      } finally {
        hook.mockRestore();
      }
    });
    expect(tokens).toEqual(["fresh-context"]);
    expect((await reminders(stub))[0]).toMatchObject({ state: "sent", attempts: 1 });
  });

  it("retries preparation with rotated credentials instead of sending with stale credentials", async () => {
    const { stub } = await reminder();
    const authorizations: string[] = [];
    vi.mocked(fetch).mockImplementation(async (_, init) => {
      authorizations.push(new Headers(init?.headers).get("Authorization")!);
      return Response.json({ ret: 0 });
    });
    await runInDurableObject(stub, async (instance, state) => {
      const rotated = await encrypt(
        env,
        JSON.stringify({
          token: "rotated",
          baseUrl: "https://ilinkai.weixin.qq.com",
          userId: "owner",
          botId: "bot",
        }),
        `${state.id}:wechat`,
      );
      const decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
      const hook = vi.spyOn(crypto.subtle, "decrypt").mockImplementation(async (...args) => {
        const result = await decrypt(...args);
        state.storage.sql.exec(
          "UPDATE settings SET value=json_set(value,'$.encryptedCredentials',?) WHERE key=?",
          rotated,
          wechatLinkKey("default", "connection"),
        );
        return result;
      });
      try {
        await instance.dispatchPersonalReminders();
      } finally {
        hook.mockRestore();
      }
    });
    expect(authorizations).toEqual([]);
    expect((await reminders(stub))[0]).toMatchObject({ state: "scheduled", attempts: 0 });
    await deliver(stub);
    expect(authorizations).toEqual(["Bearer rotated"]);
    expect((await reminders(stub))[0]).toMatchObject({ state: "sent", attempts: 1 });
  });
});

async function batch() {
  const context = await reminder();
  const { stub, plugin, at, clock } = context;
  clock.mockReturnValue(at - 1000);
  const records = [];
  for (const [index, title] of ["待修改", "同批次第三条"].entries()) {
    const result = await save(stub, plugin.id, {
      kind: "reminder",
      title,
      date: beijingDate(at),
      remindAt: new Date(at + index + 1).toISOString(),
    });
    expect(result.ok).toBe(true);
    records.push(result.data);
  }
  clock.mockReturnValue(at + 1000);
  return { ...context, second: records[0], third: records[1] };
}

describe("per-reminder delivery isolation", () => {
  it.each(["delete", "cancel", "reschedule"])(
    "continues the batch when a later reminder is changed by %s during the first send",
    async (action) => {
      const { stub, plugin, at, second, third } = await batch();
      const texts: string[] = [];
      await runInDurableObject(stub, async (instance) => {
        let editResult: unknown;
        let editError: unknown;
        vi.mocked(fetch).mockImplementation(async (_, init) => {
          texts.push(JSON.parse(String(init?.body)).msg.item_list[0].text_item.text);
          if (texts.length === 1) {
            try {
              editResult = JSON.parse(
                await instance.api(action === "delete" ? "personal.delete" : "personal.save", {
                  pluginId: plugin.id,
                  recordId: second.id,
                  revision: second.revision,
                  ...(action === "delete"
                    ? {}
                    : {
                        record:
                          action === "cancel"
                            ? { reminderEnabled: false }
                            : { remindAt: new Date(at + 3600000).toISOString() },
                      }),
                }),
              );
            } catch (error) {
              editError = error;
            }
          }
          return Response.json({ ret: 0 });
        });
        await expect(instance.dispatchPersonalReminders()).resolves.toBeDefined();
        expect(editError).toBeUndefined();
        expect(editResult).toMatchObject({ ok: true });
      });
      expect(texts).toHaveLength(2);
      expect(texts[1]).toContain("同批次第三条");
      const rows = await reminders(stub);
      expect(rows.find((r) => r.recordId === third.id)?.state).toBe("sent");
      if (action === "reschedule")
        expect(rows.find((r) => r.recordId === second.id)).toMatchObject({
          state: "scheduled",
          dueAt: at + 3600000,
          attempts: 0,
        });
      else expect(rows.some((r) => r.recordId === second.id)).toBe(false);
    },
  );

  it.each(["missing", "malformed"])(
    "isolates a %s record without stopping other reminders",
    async (damage) => {
      const { stub, second, third } = await batch();
      await runInDurableObject(stub, (_, state) => {
        if (damage === "missing")
          state.storage.sql.exec("DELETE FROM personal_records WHERE id=?", second.id);
        else
          state.storage.sql.exec(
            "UPDATE personal_records SET data=json_set(data,'$.title',json_object('private','private invalid value')) WHERE id=?",
            second.id,
          );
      });
      vi.mocked(fetch).mockImplementation(async () => Response.json({ ret: 0 }));
      await expect(stub.dispatchPersonalReminders()).resolves.toBeDefined();
      const rows = await reminders(stub);
      expect(rows.find((r) => r.recordId === third.id)?.state).toBe("sent");
      const bad = rows.find((r) => r.recordId === second.id)!;
      expect(bad).toMatchObject({ state: damage === "missing" ? "blocked" : "retry", attempts: 0 });
      expect(JSON.stringify(bad)).not.toContain("private invalid value");
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );
});
