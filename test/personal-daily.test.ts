import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import type { Protocol } from "../src/shared/types";
import { PersonalRecordsStore } from "../src/server/personal-records";
import { dailyTasksMessage } from "../src/server/plugins/personal-daily";
import { useManualAlarms } from "./helpers/wechat-delivery";
import {
  personalRecordInputSchema,
  dailyTasksReminderSchema,
  nextDailyReminderAt,
  beijingDate,
} from "../src/shared/personal-assistant";
import {
  api,
  note,
  future,
  setup,
  savePlugin,
  list,
  save,
  send,
  response,
  modelNetwork,
  connect,
  interruptPersonal,
  due,
  deliver,
  reminders,
} from "./personal-assistant-helpers";

describe("daily todo tools", () => {
  it.each<Protocol>(["chat-completions", "responses", "anthropic"])(
    "configures, updates and cancels one daily todo digest via %s tools",
    async (protocol) => {
      const { stub, model } = await setup(protocol);
      await connect(stub);
      const p = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
      modelNetwork(protocol, [
        response(protocol, "", [
          { id: "daily1", name: "personal_daily_tasks", args: { enabled: true, time: "09:00" } },
        ]),
        response(protocol, "设置好了"),
        response(protocol, "", [
          { id: "daily2", name: "personal_daily_tasks", args: { enabled: true, time: "10:30" } },
        ]),
        response(protocol, "已修改"),
        response(protocol, "", [
          { id: "daily3", name: "personal_daily_tasks", args: { enabled: false } },
        ]),
        response(protocol, "已关闭"),
      ]);
      expect(await send(stub, "@助理 每天早上九点提醒我今日待办")).toContain(
        "当天最新的未完成待办",
      );
      const first = (await list(stub, p.id, { reminderType: "daily_tasks" })).data.records[0];
      expect(first).toMatchObject({ kind: "reminder", repeat: "daily", reminderEnabled: true });
      expect(first.remindAt).toBe(nextDailyReminderAt("09:00"));
      expect((await list(stub, p.id, { kind: "task" })).data.total).toBe(0);
      await send(stub, "@助理 改成每天十点半");
      const changed = (await list(stub, p.id, { reminderType: "daily_tasks" })).data;
      expect(changed.total).toBe(1);
      expect(changed.records[0]).toMatchObject({
        id: first.id,
        remindAt: nextDailyReminderAt("10:30"),
      });
      expect(await reminders(stub)).toHaveLength(1);
      expect(await send(stub, "@助理 关闭每日待办提醒")).toContain("提醒已取消");
      expect(
        (await list(stub, p.id, { reminderType: "daily_tasks" })).data.records[0].reminderEnabled,
      ).toBe(false);
      expect(await reminders(stub)).toHaveLength(0);
    },
  );
});

describe("daily todo digests", () => {
  const dailyRecord = () => ({
    ...note,
    kind: "reminder",
    reminderType: "daily_tasks",
    title: "今日待办",
    repeat: "daily",
    remindAt: future(),
  });
  it("uses Beijing time across midnight and validates time and digest types", () => {
    const before = Date.parse("2026-10-10T08:59:00+08:00");
    expect(nextDailyReminderAt("09:00", before)).toBe("2026-10-10T01:00:00.000Z");
    expect(nextDailyReminderAt("09:00", before + 60000)).toBe("2026-10-11T01:00:00.000Z");
    expect(nextDailyReminderAt("00:00", Date.parse("2026-12-31T23:59:00+08:00"))).toBe(
      "2026-12-31T16:00:00.000Z",
    );
    for (const time of ["24:00", "9:00", "12:60", "", "09:00+08:00"])
      expect(dailyTasksReminderSchema.safeParse({ enabled: true, time }).success).toBe(false);
    expect(dailyTasksReminderSchema.safeParse({ enabled: true }).success).toBe(false);
    expect(dailyTasksReminderSchema.safeParse({ enabled: false }).success).toBe(true);
    expect(
      personalRecordInputSchema.safeParse({ ...dailyRecord(), repeat: "weekly" }).success,
    ).toBe(false);
    expect(
      personalRecordInputSchema.safeParse({ ...note, reminderType: "daily_tasks" }).success,
    ).toBe(false);
  });
  it("allows one digest per plugin, rejects duplicate web writes, and preserves ordinary reminders", async () => {
    const { stub, model } = await setup();
    await connect(stub);
    const p = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    const other = await savePlugin(stub, model.id, {
      shortcut: "另一份",
      reminderConnectionId: "default",
    });
    const record = (await save(stub, p.id, dailyRecord())).data;
    expect((await save(stub, p.id, dailyRecord())).error).toBe("daily_tasks_exists");
    expect((await save(stub, other.id, dailyRecord())).ok).toBe(true);
    expect((await save(stub, p.id, { ...note, kind: "reminder", remindAt: future() })).ok).toBe(
      true,
    );
    expect((await list(stub, p.id, { reminderType: "daily_tasks" })).data.total).toBe(1);
    expect((await list(stub, p.id, { reminderType: "message" })).data.total).toBe(1);
    expect((await save(stub, p.id, { reminderEnabled: false }, record)).ok).toBe(true);
    expect((await save(stub, p.id, dailyRecord())).error).toBe("daily_tasks_exists");
    const cancelled = (await list(stub, p.id, { reminderType: "daily_tasks" })).data.records[0];
    expect(
      (await save(stub, p.id, { reminderEnabled: true, remindAt: future() }, cancelled)).ok,
    ).toBe(true);
    await runInDurableObject(stub, (_, state) => {
      const store = new PersonalRecordsStore(state.storage.sql);
      const draft = store.draft("staged", true);
      draft.configureDailyTasks({ enabled: true, time: "09:00" });
      draft.configureDailyTasks({ enabled: true, time: "11:00" });
      expect(draft.query({ reminderType: "daily_tasks" }).total).toBe(1);
      expect(draft.changes.size).toBe(1);
    });
  });
  it("renders only this plugin's current unfinished tasks for today at delivery, without model calls or charges", async () => {
    const { stub, model } = await setup();
    await connect(stub);
    const p = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    const other = await savePlugin(stub, model.id, { shortcut: "另一份" });
    const today = beijingDate();
    const updated = (
      await save(stub, p.id, { ...note, kind: "task", date: today, title: "旧标题" })
    ).data;
    const done = (
      await save(stub, p.id, { ...note, kind: "task", date: today, title: "已完成事项" })
    ).data;
    const deleted = (
      await save(stub, p.id, { ...note, kind: "task", date: today, title: "已删除事项" })
    ).data;
    for (const [title, date] of [
      ["昨天的事", beijingDate(Date.now() - 86400000)],
      ["明天的事", beijingDate(Date.now() + 86400000)],
    ])
      await save(stub, p.id, { ...note, kind: "task", title, date });
    await save(stub, p.id, { ...note, title: "普通笔记", date: today });
    await save(stub, other.id, { ...note, kind: "task", title: "别的助理私有记录", date: today });
    await save(stub, p.id, { ...dailyRecord(), content: "不能发送保存时的旧清单" });
    await save(stub, p.id, { title: "发送前修改的新标题" }, updated);
    await save(stub, p.id, { completed: true }, done);
    await api(stub, "personal.delete", {
      pluginId: p.id,
      recordId: deleted.id,
      revision: deleted.revision,
    });
    const sent: string[] = [];
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      expect(String(url)).toContain("sendmessage");
      sent.push(JSON.parse(String(init?.body)).msg.item_list[0].text_item.text);
      return Response.json({ ret: 0 });
    });
    const balance = (await stub.snapshot()).wallet.balance;
    await due(stub);
    await deliver(stub);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain(`今日待办 · ${today}`);
    expect(sent[0]).toContain("还有 1 项待办未完成");
    expect(sent[0]).toContain("发送前修改的新标题");
    for (const hidden of [
      "旧标题",
      "已完成事项",
      "已删除事项",
      "昨天的事",
      "明天的事",
      "普通笔记",
      "别的助理私有记录",
      "不能发送保存时的旧清单",
    ])
      expect(sent[0]).not.toContain(hidden);
    expect(sent[0]).toContain("消息来自");
    expect((await stub.snapshot()).wallet.balance).toBe(balance);
    expect((await reminders(stub))[0]).toMatchObject({ state: "scheduled", repeatMs: 86400000 });
    await deliver(stub);
    expect(sent).toHaveLength(1);
  });
  it("skips empty days and yesterday's delayed digest while retaining tomorrow's schedule", async () => {
    const { stub, model } = await setup();
    await runInDurableObject(stub, (_, state) => useManualAlarms(state));
    await connect(stub);
    const p = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    await save(stub, p.id, dailyRecord());
    await due(stub);
    await deliver(stub);
    expect(fetch).not.toHaveBeenCalled();
    expect(Number((await reminders(stub))[0].dueAt)).toBeGreaterThan(Date.now());
    await save(stub, p.id, { ...note, kind: "task", date: beijingDate() });
    await runInDurableObject(stub, (_, state) => {
      state.storage.sql.exec(
        "UPDATE personal_reminders SET dueAt=?,retryAt=0",
        Date.parse(beijingDate() + "T00:00:00+08:00") - 1,
      );
    });
    await deliver(stub);
    expect(fetch).not.toHaveBeenCalled();
    expect(Number((await reminders(stub))[0].dueAt)).toBeGreaterThan(Date.now());
  });
  it("bounds long lists and ignores other dates and plugins without losing the total", async () => {
    const { stub } = await setup();
    await runInDurableObject(stub, (_, state) => {
      const store = new PersonalRecordsStore(state.storage.sql);
      const draft = store.draft("digest");
      for (let n = 0; n < 31; n++)
        draft.save({ ...note, kind: "task", title: `Task ${n} **特殊字符**`, date: beijingDate() });
      state.storage.transactionSync(() => store.commit("digest", draft.changes, null));
      const text = dailyTasksMessage(store, "digest", Date.now())!;
      expect(text).toContain("还有 31 项");
      expect(text).toContain("另有 11 项");
      expect(text.split("\n").filter((line) => line.startsWith("- "))).toHaveLength(20);
      expect(text).toContain("\\*\\*特殊字符\\*\\*");
      expect(dailyTasksMessage(store, "another", Date.now())).toBeNull();
    });
  });
  it("recovers a daily configuration without creating a second schedule", async () => {
    const { stub, model } = await setup();
    await connect(stub);
    const p = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    const bodies = modelNetwork("chat-completions", [
      response("chat-completions", "", [
        { id: "daily", name: "personal_daily_tasks", args: { enabled: true, time: "09:00" } },
      ]),
      response("chat-completions", "已设置"),
    ]);
    const fresh = await interruptPersonal(
      stub,
      "@助理 每天九点发今日待办",
      (progress) => progress.draft.changes.length === 1,
    );
    expect(await send(fresh, "重试", "restart-run")).toContain("当天最新的未完成待办");
    expect(bodies).toHaveLength(2);
    expect((await list(fresh, p.id, { reminderType: "daily_tasks" })).data.total).toBe(1);
    expect(await reminders(fresh)).toHaveLength(1);
  });
});
