import {
  abortAllDurableObjects,
  env,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { PersonalRecordsStore } from "../src/server/personal-records";
import { personalContext } from "../src/server/plugins/personal-context";
import { personalReceipt } from "../src/server/plugins/personal-receipt";
import { beijingDate, beijingTime } from "../src/shared/personal-assistant";
import { wechatLinkKey } from "../src/shared/wechat-links";
import {
  api,
  connect,
  contextData,
  list,
  reminders,
  save,
  savePlugin,
  scheduler,
  setup,
} from "./personal-assistant-helpers";

const day = 86400000;
const morning = Date.parse("2026-11-20T08:00:00+08:00");
async function prepare(at = morning, repeat = "daily", dailyTasks = false) {
  const clock = vi.spyOn(Date, "now").mockReturnValue(at - 60000);
  const { stub, model } = await setup();
  await connect(stub);
  const plugin = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
  const fields = {
    kind: "reminder",
    title: "恢复提醒",
    date: beijingDate(at),
    repeat,
    remindAt: new Date(at).toISOString(),
    ...(dailyTasks ? { reminderType: "daily_tasks" } : {}),
  };
  const created = await save(stub, plugin.id, fields);
  expect(created.ok).toBe(true);
  return { stub, plugin, clock, fields, record: created.data, at };
}

async function blocked(repeat = "daily") {
  const context = await prepare(morning, repeat);
  const { stub, plugin, clock, at } = context;
  const second = await api(stub, "wechat.create", { name: "微信 B" });
  expect(second.ok).toBe(true);
  await connect(stub, {}, second.data.selectedConnectionId);
  expect(
    (
      await api(stub, "plugin.save", {
        ...plugin,
        reminderConnectionId: second.data.selectedConnectionId,
      })
    ).ok,
  ).toBe(true);
  clock.mockReturnValue(at + 1000);
  await runDurableObjectAlarm(scheduler(stub));
  expect((await reminders(stub))[0].state).toBe("blocked");
  expect((await api(stub, "plugin.save", plugin)).ok).toBe(true);
  // Restoring the config alone never confirms a previously blocked delivery.
  expect((await scheduler(stub).status()).alarmAt).toBeNull();
  expect((await reminders(stub))[0].state).toBe("blocked");
  return context;
}

describe("explicit recovery of blocked reminders", () => {
  it.each([
    { repeat: "daily", elapsed: 1000, next: day },
    { repeat: "daily", elapsed: 3 * day + 1000, next: 4 * day },
    { repeat: "weekly", elapsed: 1000, next: 7 * day },
    { repeat: "weekly", elapsed: 7 * day, next: 14 * day },
    { repeat: "weekly", elapsed: 8 * day + 1000, next: 14 * day },
  ])(
    "restores the next future $repeat occurrence after $elapsed ms and sends once after restart",
    async ({ repeat, elapsed, next }) => {
      const { stub, plugin, clock, fields, record, at } = await blocked(repeat);
      clock.mockReturnValue(at + elapsed);
      const saved = await save(stub, plugin.id, fields, record);
      expect(saved.ok).toBe(true);
      expect(saved.data.remindAt).toBe(new Date(at + next).toISOString());
      const restored = (await reminders(stub))[0];
      expect(restored).toMatchObject({
        state: "scheduled",
        dueAt: at + next,
        attempts: 0,
        blockReason: null,
        error: "",
      });
      expect((await scheduler(stub).status()).alarmAt).toBe(at + next);
      expect(fetch).not.toHaveBeenCalled();
      // A later ordinary edit must not create another occurrence or shift the date.
      expect((await save(stub, plugin.id, { title: "恢复后的标题" }, saved.data)).ok).toBe(true);
      expect((await reminders(stub))[0].id).toBe(restored.id);
      await abortAllDurableObjects();
      const fresh = env.ACCOUNTS.get(stub.id);
      const texts: string[] = [];
      vi.mocked(fetch).mockImplementation(async (_, init) => {
        texts.push(JSON.parse(String(init?.body)).msg.item_list[0].text_item.text);
        return Response.json({ ret: 0 });
      });
      clock.mockReturnValue(at + next + 1000);
      await runDurableObjectAlarm(scheduler(fresh));
      await fresh.dispatchPersonalReminders();
      expect(texts).toHaveLength(1);
      expect(texts[0]).toContain(beijingTime(at + next));
      expect(texts[0]).toContain("恢复后的标题");
      expect((await reminders(fresh))[0].dueAt).toBe(
        at + next + (repeat === "daily" ? day : 7 * day),
      );
    },
  );

  it("rejects an elapsed one-off save without changing state, then accepts an explicit future time", async () => {
    const { stub, plugin, record, fields, at } = await blocked("none");
    const before = await reminders(stub);
    expect(await save(stub, plugin.id, fields, record)).toMatchObject({
      ok: false,
      error: "reminder_time",
    });
    expect(await reminders(stub)).toEqual(before);
    expect((await list(stub, plugin.id)).data.records[0].revision).toBe(record.revision);
    expect((await scheduler(stub).status()).alarmAt).toBeNull();
    expect(
      (await save(stub, plugin.id, { remindAt: new Date(at + 3600000).toISOString() }, record)).ok,
    ).toBe(true);
    expect((await scheduler(stub).status()).alarmAt).toBe(at + 3600000);
  });

  it("does not recover while disconnected, and binds a recovered recurrence to the newly confirmed generation", async () => {
    const { stub, plugin, record, fields, at } = await blocked();
    const before = await reminders(stub);
    await connect(stub, { status: "waiting", generation: "g2" });
    expect(await save(stub, plugin.id, fields, record)).toMatchObject({
      ok: false,
      error: "reminder_link",
    });
    expect(await reminders(stub)).toEqual(before);
    await connect(stub, { generation: "g2" });
    expect((await save(stub, plugin.id, fields, record)).ok).toBe(true);
    expect((await reminders(stub))[0]).toMatchObject({
      generation: "g2",
      state: "scheduled",
      dueAt: at + day,
    });
  });

  it("keeps restored assistant drafts, current context and receipts consistent with the renewed schedule", async () => {
    const { stub, plugin, record, at } = await blocked();
    await runInDurableObject(stub, (_, state) => {
      const store = new PersonalRecordsStore(state.storage.sql);
      const draft = store.draft(plugin.id, { connectionId: "default", generation: "g1" });
      draft.save({ title: "重新启用" }, record.id, record.revision);
      const restored = store.draft(plugin.id, { connectionId: "default", generation: "g1" });
      restored.restore(draft.snapshot());
      const context = contextData(personalContext(restored));
      expect(context.reminders.items.find((r: { id: string }) => r.id === record.id)).toMatchObject(
        {
          reminderState: "staged",
          nextReminderAt: new Date(at + day).toISOString(),
        },
      );
      const receipt = personalReceipt(restored)!;
      expect(receipt).toContain("提醒已更新");
      expect(receipt).toContain(beijingTime(at + day));
      expect(receipt).not.toContain("等待微信连接恢复");
      state.storage.transactionSync(() =>
        store.commit(plugin.id, restored.changes, { connectionId: "default", generation: "g1" }),
      );
      expect(store.get(plugin.id, record.id)).toMatchObject({
        reminderState: "scheduled",
        nextReminderAt: at + day,
      });
    });
  });
});

describe("daily digest expiry independent of delivery prerequisites", () => {
  it.each(["context", "login", "plugin"])(
    "settles midnight expiry with an unavailable %s and preserves the original send failure",
    async (condition) => {
      const at = Date.parse("2026-11-20T23:59:00+08:00");
      const { stub, plugin, clock } = await prepare(at, "daily", true);
      expect(
        (await save(stub, plugin.id, { kind: "task", title: "昨天的任务", date: beijingDate(at) }))
          .ok,
      ).toBe(true);
      vi.mocked(fetch).mockImplementation(async () => Response.json({ ret: -2 }));
      clock.mockReturnValue(at + 1000);
      await runDurableObjectAlarm(scheduler(stub));
      const failure = (await list(stub, plugin.id, { kind: "reminder" })).data.records[0]
        .reminderLastFailure;
      expect(failure).toMatchObject({ ret: -2, dueAt: at });
      if (condition === "plugin")
        expect((await api(stub, "plugin.save", { ...plugin, enabled: false })).ok).toBe(true);
      else
        await connect(stub, condition === "context" ? { contextToken: "" } : { status: "expired" });
      clock.mockReturnValue(at + 6000);
      await runDurableObjectAlarm(scheduler(stub));
      expect((await reminders(stub))[0].state).toBe(
        condition === "context" ? "waiting_context" : "paused",
      );
      await abortAllDurableObjects();
      const fresh = env.ACCOUNTS.get(stub.id);
      clock.mockReturnValue(at + 66000);
      await runDurableObjectAlarm(scheduler(fresh));
      expect((await list(fresh, plugin.id, { kind: "reminder" })).data.records[0]).toMatchObject({
        reminderState: "scheduled",
        nextReminderAt: at + day,
        reminderError: "每日待办提醒已跨天，未再补发",
        reminderErrorDueAt: at,
        reminderLastFailure: failure,
      });
      expect((await scheduler(fresh).status()).alarmAt).toBe(at + day);
      expect(fetch).toHaveBeenCalledOnce();
      await connect(fresh);
      if (condition === "plugin") expect((await api(fresh, "plugin.save", plugin)).ok).toBe(true);
      expect(
        (
          await save(fresh, plugin.id, {
            kind: "task",
            title: "今天的任务",
            date: beijingDate(at + day),
          })
        ).ok,
      ).toBe(true);
      const texts: string[] = [];
      vi.mocked(fetch).mockImplementation(async (_, init) => {
        texts.push(JSON.parse(String(init?.body)).msg.item_list[0].text_item.text);
        return Response.json({ ret: 0 });
      });
      clock.mockReturnValue(at + day + 1000);
      await runDurableObjectAlarm(scheduler(fresh));
      expect(texts).toHaveLength(1);
      expect(texts[0]).toContain("今天的任务");
      expect(texts[0]).not.toContain("昨天的任务");
      const sent = (await list(fresh, plugin.id, { kind: "reminder" })).data.records[0];
      expect(sent.reminderLastFailure).toEqual(failure);
      expect(sent.reminderBlockReason).toBeUndefined();
      expect(sent.reminderError).toBe("");
    },
  );

  it.each(["daily", "weekly"])(
    "keeps an ordinary %s reminder retryable after midnight within its 24-hour window",
    async (repeat) => {
      const at = Date.parse("2026-11-20T23:59:00+08:00");
      const { stub, clock } = await prepare(at, repeat);
      await connect(stub, { contextToken: "" });
      clock.mockReturnValue(at + 1000);
      await runDurableObjectAlarm(scheduler(stub));
      clock.mockReturnValue(at + 61000);
      await runDurableObjectAlarm(scheduler(stub));
      expect((await reminders(stub))[0]).toMatchObject({
        state: "waiting_context",
        dueAt: at,
        attempts: 0,
      });
      await connect(stub);
      vi.mocked(fetch).mockImplementation(async () => Response.json({ ret: 0 }));
      clock.mockReturnValue(at + 121000);
      await runDurableObjectAlarm(scheduler(stub));
      expect(fetch).toHaveBeenCalledOnce();
      expect((await reminders(stub))[0].dueAt).toBe(at + (repeat === "daily" ? day : 7 * day));
    },
  );

  it("rechecks midnight expiry before recording a connection change during decryption", async () => {
    const at = Date.parse("2026-11-20T23:59:00+08:00");
    const { stub, clock } = await prepare(at, "daily", true);
    clock.mockReturnValue(at + 59999);
    await runInDurableObject(stub, async (instance, state) => {
      const decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
      const hook = vi.spyOn(crypto.subtle, "decrypt").mockImplementation(async (...args) => {
        const result = await decrypt(...args);
        clock.mockReturnValue(at + 60001);
        state.storage.sql.exec(
          "UPDATE settings SET value=json_set(value,'$.contextToken','') WHERE key=?",
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
    expect(fetch).not.toHaveBeenCalled();
    expect((await reminders(stub))[0]).toMatchObject({
      state: "scheduled",
      dueAt: at + day,
      attempts: 0,
      error: "每日待办提醒已跨天，未再补发",
    });
  });
});
