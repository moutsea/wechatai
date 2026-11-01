import {
  abortAllDurableObjects,
  env,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { PersonalRecordsStore } from "../src/server/personal-records";
import { beijingDate } from "../src/shared/personal-assistant";
import {
  connect,
  deliver,
  list,
  reminders,
  save,
  savePlugin,
  scheduler,
  setup,
} from "./personal-assistant-helpers";

const day = 86400000;
const morning = Date.parse("2026-11-20T08:00:00+08:00");

async function recurring(at = morning, dailyTasks = false, repeat = "daily") {
  const clock = vi.spyOn(Date, "now").mockReturnValue(at - 60000);
  const { stub, model } = await setup("chat-completions", false);
  await connect(stub);
  const plugin = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
  const result = await save(stub, plugin.id, {
    kind: "reminder",
    title: "拿牛奶",
    date: beijingDate(at),
    remindAt: new Date(at).toISOString(),
    repeat,
    ...(dailyTasks ? { reminderType: "daily_tasks" } : {}),
  });
  expect(result.ok).toBe(true);
  return { stub, plugin, clock, record: result.data };
}

describe("reminder occurrence recovery", () => {
  it.each([0, 1000])(
    "delivers today's occurrence %i ms after its deadline through the scheduler after yesterday's failure and a restart",
    async (lateness) => {
      const { stub, plugin, clock } = await recurring();
      const sent: { client_id: string; item_list: { text_item: { text: string } }[] }[] = [];
      vi.mocked(fetch).mockImplementation(async (_, init) => {
        sent.push(JSON.parse(String(init?.body)).msg);
        return sent.length === 1
          ? new Response("denied", { status: 403 })
          : Response.json({ ret: 0 });
      });
      clock.mockReturnValue(morning + 1000);
      await runDurableObjectAlarm(scheduler(stub));
      await abortAllDurableObjects();
      clock.mockReturnValue(morning + day + lateness);
      const fresh = env.ACCOUNTS.get(stub.id);
      await runDurableObjectAlarm(scheduler(fresh));
      expect((await scheduler(fresh).status()).alarmAt).toBe(Date.now());
      const skipped = (await list(fresh, plugin.id)).data.records[0];
      expect(skipped).toMatchObject({
        nextReminderAt: morning + day,
        reminderErrorDueAt: morning,
        reminderLastFailure: { dueAt: morning, upstreamStatus: 403 },
      });
      await runDurableObjectAlarm(scheduler(fresh));
      await fresh.dispatchPersonalReminders();
      expect(sent).toHaveLength(2);
      expect(sent[1].client_id).not.toBe(sent[0].client_id);
      expect(sent[1].item_list[0].text_item.text).toContain("2026年11月21日 08:00");
      expect((await list(fresh, plugin.id)).data.records[0]).toMatchObject({
        nextReminderAt: morning + 2 * day,
        reminderError: "",
        reminderErrorDueAt: null,
        reminderLastFailure: { dueAt: morning, upstreamStatus: 403 },
      });
    },
  );

  it("retains a newly due occurrence when the previous occurrence's successful request crosses its deadline", async () => {
    const { stub, clock } = await recurring();
    const ids: string[] = [];
    vi.mocked(fetch).mockImplementation(async (_, init) => {
      ids.push(JSON.parse(String(init?.body)).msg.client_id);
      clock.mockReturnValue(morning + day + 1000);
      return Response.json({ ret: 0 });
    });
    clock.mockReturnValue(morning + day - 1000);
    await deliver(stub);
    expect((await reminders(stub))[0].dueAt).toBe(morning + day);
    await deliver(stub);
    await deliver(stub);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect((await reminders(stub))[0].dueAt).toBe(morning + 2 * day);
  });

  it.each([
    { repeat: "daily", elapsed: 3 * day, next: 3 * day, sends: 1 },
    { repeat: "weekly", elapsed: day + 1, next: 7 * day, sends: 0 },
    { repeat: "weekly", elapsed: 7 * day + 1000, next: 7 * day, sends: 1 },
    { repeat: "weekly", elapsed: 8 * day + 1, next: 14 * day, sends: 0 },
  ])(
    "recovers only the latest valid $repeat occurrence after $elapsed ms",
    async ({ repeat, elapsed, next, sends }) => {
      const { stub, clock } = await recurring(morning, false, repeat);
      vi.mocked(fetch).mockImplementation(async () => Response.json({ ret: 0 }));
      clock.mockReturnValue(morning + elapsed);
      await deliver(stub);
      expect((await reminders(stub))[0].dueAt).toBe(morning + next);
      expect(fetch).not.toHaveBeenCalled();
      await deliver(stub);
      await deliver(stub);
      expect(fetch).toHaveBeenCalledTimes(sends);
      expect((await reminders(stub))[0].dueAt).toBeGreaterThan(Date.now());
    },
  );

  it("preserves a failed digest as missed when its retry crosses Beijing midnight", async () => {
    const at = Date.parse("2026-11-20T23:59:00+08:00");
    const { stub, plugin, clock } = await recurring(at, true);
    expect(
      (
        await save(stub, plugin.id, {
          kind: "task",
          title: "未完成事项",
          date: beijingDate(at),
        })
      ).ok,
    ).toBe(true);
    vi.mocked(fetch).mockImplementation(async () => new Response("denied", { status: 403 }));
    clock.mockReturnValue(at + 1000);
    await deliver(stub);
    const failure = (await list(stub, plugin.id, { kind: "reminder" })).data.records[0]
      .reminderLastFailure;
    await abortAllDurableObjects();
    clock.mockReturnValue(at + 61000);
    const fresh = env.ACCOUNTS.get(stub.id);
    await deliver(fresh);
    expect(fetch).toHaveBeenCalledOnce();
    expect((await list(fresh, plugin.id, { kind: "reminder" })).data.records[0]).toMatchObject({
      reminderState: "scheduled",
      reminderError: "每日待办提醒已跨天，未再补发",
      reminderErrorDueAt: at,
      reminderLastFailure: failure,
      nextReminderAt: at + day,
    });
  });

  it.each(["context", "http"])(
    "does not resend a daily digest when %s recovers just after Beijing midnight",
    async (failure) => {
      const at = Date.parse("2026-11-20T23:59:00+08:00");
      const { stub, plugin, clock } = await recurring(at, true);
      expect(
        (
          await save(stub, plugin.id, {
            kind: "task",
            title: "还没做的事",
            date: beijingDate(at),
          })
        ).ok,
      ).toBe(true);
      if (failure === "context") await connect(stub, { contextToken: "" });
      vi.mocked(fetch).mockImplementation(async () => new Response("denied", { status: 403 }));
      clock.mockReturnValue(at + 1000);
      await runDurableObjectAlarm(scheduler(stub));
      expect(
        (await list(stub, plugin.id, { kind: "reminder" })).data.records[0].reminderState,
      ).toBe(failure === "context" ? "waiting_context" : "retry");
      await connect(stub);
      vi.mocked(fetch)
        .mockClear()
        .mockImplementation(async () => Response.json({ ret: 0 }));
      clock.mockReturnValue(at + 61000);
      await runDurableObjectAlarm(scheduler(stub));
      expect(fetch).not.toHaveBeenCalled();
      expect((await list(stub, plugin.id, { kind: "reminder" })).data.records[0]).toMatchObject({
        reminderState: "scheduled",
        reminderError: "每日待办提醒已跨天，未再补发",
        nextReminderAt: at + day,
      });
      expect((await scheduler(stub).status()).alarmAt).toBe(at + day);
    },
  );

  it("sends today's fresh digest after skipping an expired occurrence, without replaying yesterday's tasks", async () => {
    const { stub, plugin, clock } = await recurring(morning, true);
    for (const [title, date] of [
      ["昨天的事", beijingDate(morning)],
      ["今天的事", beijingDate(morning + day)],
    ])
      expect((await save(stub, plugin.id, { kind: "task", title, date })).ok).toBe(true);
    const texts: string[] = [];
    vi.mocked(fetch).mockImplementation(async (_, init) => {
      texts.push(JSON.parse(String(init?.body)).msg.item_list[0].text_item.text);
      return Response.json({ ret: 0 });
    });
    clock.mockReturnValue(morning + day + 1000);
    await deliver(stub);
    await deliver(stub);
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain("今天的事");
    expect(texts[0]).not.toContain("昨天的事");
  });

  it("treats an empty current-day digest as an intentional skip without counting an outbound attempt", async () => {
    const { stub, plugin, clock } = await recurring(morning, true);
    clock.mockReturnValue(morning + 1000);
    await deliver(stub);
    expect(fetch).not.toHaveBeenCalled();
    expect((await reminders(stub))[0]).toMatchObject({ attempts: 0, error: "", errorDueAt: null });
    expect((await list(stub, plugin.id)).data.records[0]).toMatchObject({
      reminderState: "scheduled",
      nextReminderAt: morning + day,
      reminderError: "",
    });
  });

  it("counts each failed send once, keeps the retry ID across restart and uses 5s/10s backoff", async () => {
    const { stub, clock } = await recurring(morning, false, "none");
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const ids: string[] = [];
    vi.mocked(fetch).mockImplementation(async (_, init) => {
      ids.push(JSON.parse(String(init?.body)).msg.client_id);
      return ids.length < 3 ? new Response("denied", { status: 403 }) : Response.json({ ret: 0 });
    });
    clock.mockReturnValue(morning + 1000);
    await deliver(stub);
    expect((await reminders(stub))[0]).toMatchObject({ attempts: 1, retryAt: morning + 6000 });
    clock.mockReturnValue(morning + 5999);
    await deliver(stub);
    expect(fetch).toHaveBeenCalledOnce();
    await abortAllDurableObjects();
    const fresh = env.ACCOUNTS.get(stub.id);
    clock.mockReturnValue(morning + 6000);
    await deliver(fresh);
    expect((await reminders(fresh))[0]).toMatchObject({ attempts: 2, retryAt: morning + 16000 });
    clock.mockReturnValue(morning + 16000);
    await deliver(fresh);
    expect((await reminders(fresh))[0]).toMatchObject({ state: "sent", attempts: 3 });
    expect(new Set(ids).size).toBe(1);
    expect(
      warning.mock.calls
        .map(([line]) => JSON.parse(line))
        .filter((e) => e.event === "personal.reminder_delivery_failed")
        .map((e) => e.attempts),
    ).toEqual([1, 2]);
    expect(info.mock.calls.map(([line]) => JSON.parse(line))).toContainEqual(
      expect.objectContaining({ event: "personal.reminder_delivered", attempts: 3 }),
    );
  });

  it("does not count missing-context pauses as outbound attempts or inflate the first retry delay", async () => {
    const { stub, clock } = await recurring();
    await connect(stub, { contextToken: "" });
    for (const offset of [1000, 61000, 121000]) {
      clock.mockReturnValue(morning + offset);
      await deliver(stub);
    }
    expect((await reminders(stub))[0].attempts).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    await connect(stub);
    clock.mockReturnValue(morning + 181000);
    vi.mocked(fetch).mockImplementation(async () => new Response("denied", { status: 403 }));
    await deliver(stub);
    expect((await reminders(stub))[0]).toMatchObject({ attempts: 1, retryAt: morning + 186000 });
  });

  it("migrates error occurrence dates without guessing legacy skipped dates or changing schedules", async () => {
    const { stub } = await recurring();
    await runInDurableObject(stub, (_, state) => {
      const sql = state.storage.sql;
      const store = new PersonalRecordsStore(sql);
      sql.exec("ALTER TABLE personal_reminders DROP COLUMN errorDueAt");
      sql.exec("DELETE FROM personal_record_migrations WHERE version=5");
      sql.exec("UPDATE personal_reminders SET state='retry',error='之前的错误',attempts=8");
      sql.exec(
        "INSERT INTO personal_reminders (id,pluginId,recordId,revision,dueAt,repeatMs,connectionId,generation,state,retryAt,attempts,error,recordConnectionId,lastFailure) SELECT 'legacy-skipped',pluginId,'legacy-record',revision,dueAt+86400000,repeatMs,connectionId,generation,'scheduled',retryAt+86400000,0,'已跳过过期提醒，保留下一次提醒',recordConnectionId,lastFailure FROM personal_reminders LIMIT 1",
      );
      const before = sql.exec("SELECT * FROM personal_reminders ORDER BY id").toArray();
      const schedule = store.schedule();
      state.storage.transactionSync(() => store.init());
      state.storage.transactionSync(() => store.init());
      const after = sql.exec("SELECT * FROM personal_reminders ORDER BY id").toArray();
      expect(after).toMatchObject(before);
      expect(after.find((r) => r.state === "retry")?.errorDueAt).toBe(morning);
      expect(after.find((r) => r.state === "scheduled")?.errorDueAt).toBeNull();
      expect(store.schedule()).toEqual(schedule);
    });
  });
});
