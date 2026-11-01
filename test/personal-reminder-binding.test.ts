import {
  abortAllDurableObjects,
  env,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { PersonalRecordsStore } from "../src/server/personal-records";
import { beijingDate, beijingTime } from "../src/shared/personal-assistant";
import {
  api,
  connect,
  list,
  reminders,
  save,
  savePlugin,
  scheduler,
  setup,
  modelNetwork,
  response,
  send,
} from "./personal-assistant-helpers";

const day = 86400000;
const morning = Date.parse("2026-11-20T08:00:00+08:00");
async function prepare(state = "scheduled", repeat = "daily", scope = "shared") {
  const clock = vi.spyOn(Date, "now").mockReturnValue(morning - 60000);
  const { stub, model } = await setup();
  await connect(stub);
  const plugin = await savePlugin(stub, model.id, {
    reminderConnectionId: "default",
    recordScope: scope,
  });
  const created = await save(stub, plugin.id, {
    kind: "reminder",
    title: "重绑测试",
    date: beijingDate(morning),
    repeat,
    remindAt: new Date(morning).toISOString(),
  });
  expect(created.ok).toBe(true);
  if (state === "waiting_context") await connect(stub, { contextToken: "" });
  vi.mocked(fetch).mockImplementation(async () =>
    Response.json({ ret: state === "paused" ? -14 : state === "retry" ? -2 : 0 }),
  );
  clock.mockReturnValue(morning + 1000);
  await runDurableObjectAlarm(scheduler(stub));
  expect((await reminders(stub))[0].state).toBe(repeat === "none" ? "sent" : state);
  return { stub, plugin, record: created.data, clock };
}

describe("recurring reminder binding confirmation", () => {
  const cases = ["scheduled", "paused", "retry", "waiting_context"].flatMap((state) =>
    ["daily", "weekly"].map((repeat) => ({
      state,
      repeat,
      interval: repeat === "daily" ? day : 7 * day,
    })),
  );
  it.each(cases)(
    "recovers $state/$repeat immediately after re-scan and sends only the next occurrence",
    async ({ state, repeat, interval }) => {
      const { stub, plugin, record, clock } = await prepare(state, repeat);
      const before = (await reminders(stub))[0];
      await connect(stub, { generation: "g2" });
      expect((await reminders(stub))[0].generation).toBe("g1");
      const saved = await save(stub, plugin.id, { title: "重新扫码后保存" }, record);
      expect(saved).toMatchObject({
        ok: true,
        data: { remindAt: new Date(morning + interval).toISOString() },
      });
      const renewed = (await reminders(stub))[0];
      expect(renewed).toMatchObject({
        generation: "g2",
        state: "scheduled",
        dueAt: morning + interval,
        attempts: 0,
      });
      expect(renewed.id).not.toBe(before.id);
      expect((await scheduler(stub).status()).alarmAt).toBe(morning + interval);
      // Saving again after confirmation preserves delivery identity and cadence.
      expect((await save(stub, plugin.id, { content: "备注" }, saved.data)).ok).toBe(true);
      expect((await reminders(stub))[0].id).toBe(renewed.id);
      await abortAllDurableObjects();
      const fresh = env.ACCOUNTS.get(stub.id);
      vi.mocked(fetch)
        .mockClear()
        .mockImplementation(async () => Response.json({ ret: 0 }));
      await fresh.dispatchPersonalReminders();
      expect(fetch).not.toHaveBeenCalled();
      clock.mockReturnValue(morning + interval + 1000);
      await runDurableObjectAlarm(scheduler(fresh));
      await fresh.dispatchPersonalReminders();
      expect(fetch).toHaveBeenCalledOnce();
      expect((await reminders(fresh))[0].dueAt).toBe(morning + 2 * interval);
    },
  );

  it.each(["scheduled", "paused", "retry", "waiting_context"])(
    "preserves %s delivery progress for an ordinary edit without a binding change",
    async (state) => {
      const { stub, plugin, record } = await prepare(state);
      const before = (await reminders(stub))[0];
      expect((await save(stub, plugin.id, { title: "仅改标题" }, record)).ok).toBe(true);
      expect((await reminders(stub))[0]).toEqual({ ...before, revision: record.revision + 1 });
      expect((await list(stub, plugin.id)).data.records[0].remindAt).toBe(record.remindAt);
    },
  );

  it("confirms a changed receiving link even when both links have the same generation", async () => {
    const { stub, plugin, record, clock } = await prepare();
    const second = await api(stub, "wechat.create", { name: "微信 B" });
    expect(second.ok).toBe(true);
    const linkB = second.data.selectedConnectionId;
    await connect(stub, { contextToken: "B-context" }, linkB);
    expect((await api(stub, "plugin.save", { ...plugin, reminderConnectionId: linkB })).ok).toBe(
      true,
    );
    expect((await save(stub, plugin.id, { title: "改收件链接" }, record)).ok).toBe(true);
    expect((await reminders(stub))[0]).toMatchObject({
      connectionId: linkB,
      generation: "g1",
      dueAt: morning + day,
    });
    await stub.applyPayment({
      id: "extended-plus",
      kind: "subscription",
      units: 0,
      expires: morning + 30 * day,
    });
    const contexts: string[] = [];
    vi.mocked(fetch).mockImplementation(async (_, init) => {
      contexts.push(JSON.parse(String(init?.body)).msg.context_token);
      return Response.json({ ret: 0 });
    });
    clock.mockReturnValue(morning + day + 1000);
    await runDurableObjectAlarm(scheduler(stub));
    expect(contexts).toEqual(["B-context"]);
  });

  it("uses the trusted link for isolated records and ignores client-supplied binding metadata", async () => {
    const { stub, plugin, record } = await prepare("scheduled", "daily", "connection");
    await connect(stub, { generation: "g2" });
    const result = await save(
      stub,
      plugin.id,
      { title: "隔离记录", generation: "forged", connectionId: "foreign" },
      record,
    );
    expect(result.ok).toBe(true);
    expect((await reminders(stub))[0]).toMatchObject({
      recordConnectionId: "default",
      connectionId: "default",
      generation: "g2",
      dueAt: morning + day,
    });
  });

  it("returns the renewed date in the assistant's confirmation", async () => {
    const { stub, plugin, record } = await prepare("paused");
    await connect(stub, { generation: "g2" });
    modelNetwork("chat-completions", [
      response("chat-completions", "", [
        { id: "query", name: "personal_query", args: { kind: "reminder" } },
      ]),
      response("chat-completions", "", [
        {
          id: "update",
          name: "personal_update",
          args: { id: record.id, revision: record.revision, changes: { title: "恢复成功" } },
        },
      ]),
      response("chat-completions", "设置好了"),
    ]);
    const reply = await send(stub, "@助理 重新扫码了，恢复这条提醒");
    expect(reply).toContain("提醒已更新");
    expect(reply).toContain(beijingTime(morning + day));
    expect(reply).not.toContain("等待微信连接恢复");
    expect((await list(stub, plugin.id)).data.records[0]).toMatchObject({
      reminderState: "scheduled",
      nextReminderAt: morning + day,
    });
  });

  it("does not resurrect an elapsed one-off reminder after re-scan", async () => {
    const { stub, plugin, record } = await prepare("scheduled", "none");
    await connect(stub, { generation: "g2" });
    const before = await reminders(stub);
    expect(await save(stub, plugin.id, { title: "仅改标题" }, record)).toMatchObject({
      ok: false,
      error: "reminder_time",
    });
    expect(await reminders(stub)).toEqual(before);
  });
});

describe("block reasons belong to their occurrence", () => {
  it.each([false, true])(
    "does not carry an old block into another missed daily digest (send failure: %s)",
    async (withSendFailure) => {
      const at = Date.parse("2026-11-20T23:59:00+08:00");
      const clock = vi.spyOn(Date, "now").mockReturnValue(at - 60000);
      const { stub, model } = await setup();
      await connect(stub);
      const plugin = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
      expect(
        (
          await save(stub, plugin.id, {
            kind: "reminder",
            reminderType: "daily_tasks",
            title: "每日汇总",
            date: beijingDate(at),
            repeat: "daily",
            remindAt: new Date(at).toISOString(),
          })
        ).ok,
      ).toBe(true);
      expect(
        (await save(stub, plugin.id, { kind: "task", title: "原始任务", date: beijingDate(at) }))
          .ok,
      ).toBe(true);
      clock.mockReturnValue(at + 1000);
      if (withSendFailure) {
        vi.mocked(fetch).mockImplementation(async () => Response.json({ ret: -2 }));
        await runDurableObjectAlarm(scheduler(stub));
        clock.mockReturnValue(at + 6000);
      }
      await connect(stub, { contextToken: "" });
      await runDurableObjectAlarm(scheduler(stub));
      const initial = (await list(stub, plugin.id, { kind: "reminder" })).data.records[0];
      expect(initial.reminderBlockReason).toMatchObject({
        code: "wechat_context_missing",
        dueAt: at,
      });
      await connect(stub);
      clock.mockReturnValue(at + day + 120000);
      await runDurableObjectAlarm(scheduler(stub));
      // The first skip still describes the occurrence that really was blocked.
      expect(
        (await list(stub, plugin.id, { kind: "reminder" })).data.records[0].reminderBlockReason,
      ).toEqual(initial.reminderBlockReason);
      await abortAllDurableObjects();
      const fresh = env.ACCOUNTS.get(stub.id);
      await runDurableObjectAlarm(scheduler(fresh));
      const missed = (await list(fresh, plugin.id, { kind: "reminder" })).data.records[0];
      expect(missed).toMatchObject({
        reminderState: "scheduled",
        reminderErrorDueAt: at + day,
        nextReminderAt: at + 2 * day,
        reminderError: "每日待办提醒已跨天，未再补发",
      });
      expect(missed.reminderBlockReason).toBeUndefined();
      expect(missed.reminderLastFailure).toEqual(initial.reminderLastFailure);
      expect(fetch).toHaveBeenCalledTimes(withSendFailure ? 1 : 0);
      // A real new block must get the new occurrence's identity.
      await connect(fresh, { contextToken: "" });
      clock.mockReturnValue(at + 2 * day + 1000);
      await runDurableObjectAlarm(scheduler(fresh));
      expect(
        (await list(fresh, plugin.id, { kind: "reminder" })).data.records[0].reminderBlockReason,
      ).toMatchObject({ code: "wechat_context_missing", dueAt: at + 2 * day });
    },
  );

  it("migrates only unambiguous legacy blocks without altering schedules or last send failures", async () => {
    const { stub } = await prepare("waiting_context");
    await runInDurableObject(stub, (_, state) => {
      const sql = state.storage.sql;
      const first = sql.exec<{ id: string }>("SELECT id FROM personal_reminders").one().id;
      const reason = JSON.stringify({
        code: "wechat_context_missing",
        message: "缺少微信会话凭据。",
      });
      sql.exec(
        "UPDATE personal_reminders SET blockReason=?,lastFailure=json_object('code','wechat_error','message','原始失败','ret',-2,'dueAt',dueAt,'at',dueAt+1)",
        reason,
      );
      for (const [id, status] of [
        ["legacy-skipped", "scheduled"],
        ["legacy-expired", "expired"],
        ["tagged-skipped", "scheduled"],
      ]) {
        sql.exec(
          "INSERT INTO personal_reminders (id,pluginId,recordId,revision,dueAt,repeatMs,connectionId,generation,state,retryAt,attempts,error,recordConnectionId,lastFailure,errorDueAt,blockReason) SELECT ?,pluginId,?,revision,dueAt,repeatMs,connectionId,generation,?,retryAt,attempts,error,recordConnectionId,lastFailure,errorDueAt,blockReason FROM personal_reminders WHERE id=?",
          id,
          id,
          status,
          first,
        );
      }
      sql.exec(
        "UPDATE personal_reminders SET dueAt=dueAt+86400000,retryAt=retryAt+86400000 WHERE id IN ('legacy-skipped','tagged-skipped')",
      );
      sql.exec(
        "UPDATE personal_reminders SET blockReason=json_set(blockReason,'$.dueAt',errorDueAt) WHERE id='tagged-skipped'",
      );
      sql.exec("DELETE FROM personal_record_migrations WHERE version=7");
      const before = sql.exec("SELECT * FROM personal_reminders ORDER BY id").toArray();
      const store = new PersonalRecordsStore(sql);
      const schedule = store.schedule();
      state.storage.transactionSync(() => store.init());
      state.storage.transactionSync(() => store.init());
      const after = sql.exec("SELECT * FROM personal_reminders ORDER BY id").toArray();
      for (const [index, row] of after.entries()) {
        expect({ ...row, blockReason: before[index].blockReason }).toEqual(before[index]);
        if (row.id === "legacy-skipped") expect(row.blockReason).toBeNull();
        else
          expect(JSON.parse(String(row.blockReason))).toMatchObject({
            code: "wechat_context_missing",
            dueAt: morning,
          });
      }
      expect(store.schedule()).toEqual(schedule);
    });
  });
});
