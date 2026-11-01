import {
  abortAllDurableObjects,
  env,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { PersonalRecordsStore } from "../src/server/personal-records";
import { AppError } from "../src/server/config";
import type { ReminderScheduler } from "../src/server/reminder-scheduler";
import {
  connect,
  deliver,
  list,
  reminders,
  save,
  savePlugin,
  setup,
} from "./personal-assistant-helpers";

async function reminder(repeat = "none") {
  const { stub, model } = await setup("chat-completions", false);
  await connect(stub);
  const plugin = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
  const at = Date.now() + 2 * 86400000;
  const record = (
    await save(stub, plugin.id, {
      kind: "reminder",
      title: "拿牛奶",
      date: "2026-10-27",
      remindAt: new Date(at).toISOString(),
      repeat,
    })
  ).data;
  return { stub, plugin, at, record };
}

describe("reminder failure diagnostics", () => {
  it("retains HTTP failure details through a retry lease, restart and expiry, without exposing response bodies", async () => {
    const { stub, plugin, at } = await reminder();
    const clock = vi.spyOn(Date, "now").mockReturnValue(at + 1000);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(fetch).mockImplementation(async (url) => {
      expect(String(url)).toContain("sendmessage");
      return new Response("secret-context-token upstream body", { status: 403 });
    });
    await deliver(stub);
    const first = (await list(stub, plugin.id)).data.records[0];
    expect(first).toMatchObject({
      reminderState: "retry",
      reminderLastFailure: {
        code: "wechat_unavailable",
        upstreamStatus: 403,
        at: at + 1000,
        dueAt: at,
      },
    });
    expect(first.reminderLastFailure.message).toContain("HTTP 403");
    expect(JSON.stringify(first)).not.toContain("secret-context-token");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret-context-token");
    expect(warn.mock.calls.map(([line]) => JSON.parse(line))).toContainEqual(
      expect.objectContaining({
        event: "personal.reminder_delivery_failed",
        code: "wechat_unavailable",
        upstreamStatus: 403,
      }),
    );
    await runInDurableObject(stub, (_, state) => {
      const store = new PersonalRecordsStore(state.storage.sql);
      store.defer(store.due(at + 60000)[0], "retry", "正在发送提醒", 30000);
    });
    expect((await list(stub, plugin.id)).data.records[0].reminderLastFailure).toEqual(
      first.reminderLastFailure,
    );
    await abortAllDurableObjects();
    clock.mockReturnValue(at + 86400001);
    const fresh = env.ACCOUNTS.get(stub.id);
    await deliver(fresh);
    const expired = (await list(fresh, plugin.id)).data.records[0];
    expect(expired).toMatchObject({
      reminderState: "expired",
      reminderError: "提醒已超过 24 小时，未再补发",
    });
    expect(expired.reminderLastFailure).toEqual(first.reminderLastFailure);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    { body: { ret: -2, errmsg: "private raw response" }, code: "wechat_error", state: "retry" },
    {
      body: { ret: 0, errcode: -14, errmsg: "private raw response" },
      code: "wechat_expired",
      state: "paused",
    },
  ])(
    "keeps WeChat business codes and classifies $code without copying errmsg",
    async ({ body, code, state }) => {
      const { stub, plugin, at } = await reminder();
      vi.spyOn(Date, "now").mockReturnValue(at + 1000);
      vi.mocked(fetch).mockImplementation(async () => Response.json(body));
      await deliver(stub);
      const record = (await list(stub, plugin.id)).data.records[0];
      expect(record).toMatchObject({
        reminderState: state,
        reminderLastFailure: {
          code,
          upstreamStatus: 200,
          ret: body.ret,
          ...("errcode" in body ? { errcode: body.errcode } : {}),
        },
      });
      expect(JSON.stringify(record)).not.toContain(body.errmsg);
      expect(JSON.stringify(await reminders(stub))).not.toContain(body.errmsg);
    },
  );

  it.each([
    { error: new DOMException("secret URL", "TimeoutError"), code: "wechat_timeout" },
    { error: new Error("secret token"), code: "reminder_delivery_error" },
    {
      error: new AppError("upstream_format", "secret response body", 502),
      code: "upstream_format",
    },
  ])(
    "keeps $code retryable after many attempts without misreporting missing conversation context",
    async ({ error, code }) => {
      const { stub, plugin, at } = await reminder();
      await runInDurableObject(stub, (_, state) =>
        state.storage.sql.exec("UPDATE personal_reminders SET attempts=8"),
      );
      vi.spyOn(Date, "now").mockReturnValue(at + 1000);
      vi.mocked(fetch).mockImplementation(async () => {
        throw error;
      });
      await deliver(stub);
      const record = (await list(stub, plugin.id)).data.records[0];
      expect(record).toMatchObject({ reminderState: "retry", reminderLastFailure: { code } });
      expect(JSON.stringify(record)).not.toContain("secret");
    },
  );

  it("preserves the failed occurrence of a repeating reminder after skipping it and after a later successful send", async () => {
    const { stub, plugin, at } = await reminder("daily");
    const clock = vi.spyOn(Date, "now").mockReturnValue(at + 1000);
    vi.mocked(fetch).mockImplementation(async () => Response.json({ ret: -2 }));
    await deliver(stub);
    const failure = (await list(stub, plugin.id)).data.records[0].reminderLastFailure;
    clock.mockReturnValue(at + 86400001);
    await deliver(stub);
    const skipped = (await list(stub, plugin.id)).data.records[0];
    expect(skipped).toMatchObject({ reminderState: "scheduled", reminderLastFailure: failure });
    expect(skipped.reminderError).toContain("已跳过过期提醒");
    expect(skipped.nextReminderAt).toBe(at + 86400000);
    expect(skipped.reminderErrorDueAt).toBe(at);
    clock.mockReturnValue(skipped.nextReminderAt + 1000);
    vi.mocked(fetch).mockImplementation(async () => Response.json({ ret: 0 }));
    await deliver(stub);
    expect((await list(stub, plugin.id)).data.records[0]).toMatchObject({
      reminderState: "scheduled",
      reminderError: "",
      reminderLastFailure: failure,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("persists missing-context failures but does not carry them into an explicitly rescheduled reminder", async () => {
    const { stub, plugin, at, record } = await reminder();
    vi.spyOn(Date, "now").mockReturnValue(at + 1000);
    await connect(stub, { contextToken: "" });
    await deliver(stub);
    const failed = (await list(stub, plugin.id)).data.records[0];
    expect(failed).toMatchObject({
      reminderState: "waiting_context",
      reminderBlockReason: { code: "wechat_context_missing" },
      reminderErrorDueAt: at,
    });
    expect(failed.reminderLastFailure).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
    expect(
      (await save(stub, plugin.id, { remindAt: new Date(at + 3600000).toISOString() }, record)).ok,
    ).toBe(true);
    const updated = (await list(stub, plugin.id)).data.records[0];
    expect(updated.reminderState).toBe("scheduled");
    expect(updated.reminderLastFailure).toBeUndefined();
    expect(updated.reminderBlockReason).toBeUndefined();
  });

  it("migrates legacy errors once without inventing failure times or modifying delivery identity and schedules", async () => {
    const { stub, at } = await reminder();
    await runInDurableObject(stub, (_, state) => {
      const sql = state.storage.sql;
      sql.exec("ALTER TABLE personal_reminders DROP COLUMN lastFailure");
      sql.exec("DELETE FROM personal_record_migrations WHERE version=4");
      sql.exec(
        "UPDATE personal_reminders SET state='waiting_context',error='旧版发送失败',attempts=12",
      );
      const before = sql.exec("SELECT * FROM personal_reminders").one();
      const store = new PersonalRecordsStore(sql);
      const schedule = store.schedule();
      state.storage.transactionSync(() => store.init());
      state.storage.transactionSync(() => store.init());
      expect(sql.exec("SELECT * FROM personal_reminders").one()).toMatchObject(before);
      const failure = JSON.parse(
        String(sql.exec("SELECT lastFailure FROM personal_reminders").one().lastFailure),
      );
      expect(failure).toEqual({ code: "legacy", message: "旧版发送失败", at: null, dueAt: at });
      expect(store.schedule()).toEqual(schedule);
    });
  });

  it.each([1, 2])(
    "still sends reminders %i days later after restart using only the WeChat API",
    async (days) => {
      const { stub, plugin, record } = await reminder();
      const at = Date.now() + days * 86400000;
      expect(
        (await save(stub, plugin.id, { remindAt: new Date(at).toISOString() }, record)).ok,
      ).toBe(true);
      const namespace = env.REMINDERS as DurableObjectNamespace<ReminderScheduler>;
      const scheduler = namespace.getByName(stub.id.toString());
      expect((await scheduler.status()).alarmAt).toBe(at);
      await abortAllDurableObjects();
      vi.spyOn(Date, "now").mockReturnValue(at + 1000);
      vi.mocked(fetch).mockImplementation(async (url) => {
        expect(String(url)).toContain("ilinkai.weixin.qq.com/ilink/bot/sendmessage");
        return Response.json({ ret: 0 });
      });
      await runDurableObjectAlarm(namespace.get(scheduler.id));
      expect((await reminders(env.ACCOUNTS.get(stub.id)))[0].state).toBe("sent");
      expect(fetch).toHaveBeenCalledOnce();
    },
  );
});
