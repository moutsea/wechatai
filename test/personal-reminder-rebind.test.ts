import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { beijingDate, nextDailyReminderAt } from "../src/shared/personal-assistant";
import { wechatLinkKey } from "../src/shared/wechat-links";
import { PersonalRecordsStore } from "../src/server/personal-records";
import {
  api,
  connect,
  deliver,
  due,
  future,
  list,
  modelNetwork,
  note,
  reminders,
  response,
  save,
  savePlugin,
  send,
  setup,
} from "./personal-assistant-helpers";

const nextHour = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(11, 16);
const dailyRecord = (time: string) => ({
  kind: "reminder",
  reminderType: "daily_tasks",
  title: "今日待办",
  date: beijingDate(),
  repeat: "daily",
  reminderEnabled: true,
  remindAt: nextDailyReminderAt(time),
});
function deliveries() {
  const sent: { text: string; context: string }[] = [];
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    expect(String(url)).toContain("sendmessage");
    const { msg } = JSON.parse(String(init?.body));
    sent.push({ text: msg.item_list[0].text_item.text, context: msg.context_token });
    return Response.json({ ret: 0 });
  });
  return sent;
}

describe("explicit reminder saves after changing WeChat binding", () => {
  it.each(["no selected link", "rebind still waiting"])(
    "rejects the same daily time with %s, then recovers after an explicit connected save",
    async (scenario) => {
      const { stub, model } = await setup();
      await connect(stub);
      const plugin = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
      const fields = dailyRecord(nextHour());
      const first = (await save(stub, plugin.id, fields)).data;
      await save(stub, plugin.id, { ...note, kind: "task", date: beijingDate() });
      const previous = await reminders(stub);
      if (scenario === "no selected link")
        expect((await api(stub, "plugin.save", { ...plugin, reminderConnectionId: "" })).ok).toBe(
          true,
        );
      else await connect(stub, { status: "waiting", generation: "g2" });
      expect(await save(stub, plugin.id, fields, first)).toMatchObject({
        ok: false,
        error: "reminder_link",
      });
      expect(await reminders(stub)).toEqual(previous);
      expect(
        (await list(stub, plugin.id, { reminderType: "daily_tasks" })).data.records[0].revision,
      ).toBe(first.revision);

      await connect(stub, { generation: "g2" });
      expect((await api(stub, "plugin.save", plugin)).ok).toBe(true);
      // Reconnection by itself must not confirm an old recipient's reminder.
      await due(stub);
      await deliver(stub);
      expect((await reminders(stub))[0].state).toBe("blocked");
      expect(fetch).not.toHaveBeenCalled();
      expect((await save(stub, plugin.id, fields, first)).ok).toBe(true);
      expect((await reminders(stub))[0]).toMatchObject({ generation: "g2", state: "scheduled" });
      const sent = deliveries();
      await due(stub);
      await deliver(stub);
      await deliver(stub);
      expect(sent).toHaveLength(1);
    },
  );

  it("reports a tool failure instead of confirming a daily setting with no receiving link", async () => {
    const { stub, model } = await setup();
    await connect(stub);
    const plugin = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    const time = nextHour();
    const record = (await save(stub, plugin.id, dailyRecord(time))).data;
    const previous = await reminders(stub);
    expect((await api(stub, "plugin.save", { ...plugin, reminderConnectionId: "" })).ok).toBe(true);
    modelNetwork("chat-completions", [
      response("chat-completions", "", [
        { id: "daily", name: "personal_daily_tasks", args: { enabled: true, time } },
      ]),
      response("chat-completions", "已设置成功"),
    ]);
    const reply = await send(stub, `@助理 每天 ${time} 提醒我今日待办`);
    expect(reply).toContain("未保存记录");
    expect(reply).toContain("选择已连接的微信链接");
    expect(reply).not.toContain("已设置成功");
    expect(await reminders(stub)).toEqual(previous);
    expect((await list(stub, plugin.id)).data.records[0].revision).toBe(record.revision);
  });

  it("rejects re-saving an ordinary reminder unchanged while its receiver is disconnected", async () => {
    const { stub, model } = await setup();
    await connect(stub);
    const plugin = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    const fields = { ...note, kind: "reminder", remindAt: future() };
    const record = (await save(stub, plugin.id, fields)).data;
    const previous = await reminders(stub);
    await connect(stub, { status: "disconnected" });
    expect(await save(stub, plugin.id, fields, record)).toMatchObject({
      ok: false,
      error: "reminder_link",
    });
    expect(await reminders(stub)).toEqual(previous);
    expect((await list(stub, plugin.id)).data.records[0].revision).toBe(record.revision);
  });

  it("rechecks the receiver at commit and rolls back a restored unchanged draft", async () => {
    const { stub } = await setup();
    await runInDurableObject(stub, (_, state) => {
      const store = new PersonalRecordsStore(state.storage.sql);
      const initial = store.draft("receiver-check", true);
      const fields = { ...note, kind: "reminder", remindAt: future() };
      const record = initial.save(fields);
      state.storage.transactionSync(() =>
        store.commit("receiver-check", initial.changes, {
          connectionId: "default",
          generation: "g1",
        }),
      );
      const schedule = store.schedule();
      const before = store.get("receiver-check", record.id);
      const beforeRevision = store.recordState("receiver-check");
      const draft = store.draft("receiver-check", true);
      draft.save(fields, record.id, record.revision);
      const restored = store.draft("receiver-check", false);
      restored.restore(draft.snapshot());
      expect(() =>
        state.storage.transactionSync(() => store.commit("receiver-check", restored.changes, null)),
      ).toThrow("选择已连接的微信链接");
      expect(store.get("receiver-check", record.id)).toEqual(before);
      expect(store.schedule()).toEqual(schedule);
      expect(store.recordState("receiver-check")).toEqual(beforeRevision);
    });
  });

  it("allows offline cancellation/deletion and non-reminder records but rejects re-enabling", async () => {
    const { stub, model } = await setup();
    await connect(stub);
    const plugin = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    const daily = (await save(stub, plugin.id, dailyRecord(nextHour()))).data;
    const ordinary = (
      await save(stub, plugin.id, { ...note, kind: "reminder", remindAt: future() })
    ).data;
    expect((await api(stub, "plugin.save", { ...plugin, reminderConnectionId: "" })).ok).toBe(true);
    const cancelled = await save(stub, plugin.id, { reminderEnabled: false }, daily);
    expect(cancelled.ok).toBe(true);
    expect((await save(stub, plugin.id, { reminderEnabled: true }, cancelled.data)).error).toBe(
      "reminder_link",
    );
    expect(
      (
        await api(stub, "personal.delete", {
          pluginId: plugin.id,
          recordId: ordinary.id,
          revision: ordinary.revision,
        })
      ).ok,
    ).toBe(true);
    expect(await reminders(stub)).toHaveLength(0);
    for (const fields of [
      note,
      { ...note, kind: "task" },
      { ...note, kind: "entry", amount: "10.00" },
    ])
      expect((await save(stub, plugin.id, fields)).ok).toBe(true);
  });

  it.each([false, true])(
    "re-saves the same daily time and delivers once after rebind (already blocked: %s)",
    async (blocked) => {
      const { stub, model } = await setup();
      await connect(stub);
      const plugin = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
      const fields = dailyRecord(nextHour());
      const record = (await save(stub, plugin.id, fields)).data;
      const original = (await reminders(stub))[0];
      await save(stub, plugin.id, { ...note, kind: "task", date: beijingDate() });
      await connect(stub, { generation: "g2" });
      if (blocked) {
        await due(stub);
        await deliver(stub);
        expect((await reminders(stub))[0].state).toBe("blocked");
        expect(fetch).not.toHaveBeenCalled();
      }
      const saved = await save(stub, plugin.id, fields, record);
      expect(saved.ok).toBe(true);
      const renewed = (await reminders(stub))[0];
      expect(renewed).toMatchObject({
        generation: "g2",
        state: "scheduled",
        attempts: 0,
        error: "",
        dueAt: Date.parse(fields.remindAt),
        retryAt: Date.parse(fields.remindAt),
      });
      expect(renewed.id).not.toBe(original.id);
      expect(await reminders(stub)).toHaveLength(1);
      // Another save must preserve this occurrence, including its delivery ID.
      expect((await save(stub, plugin.id, fields, saved.data)).ok).toBe(true);
      expect((await reminders(stub))[0].id).toBe(renewed.id);
      const sent = deliveries();
      const balance = (await stub.snapshot()).wallet.balance;
      await due(stub);
      await deliver(stub);
      await deliver(stub);
      expect(sent).toHaveLength(1);
      expect(sent[0].text).toContain("今日待办");
      expect((await reminders(stub))[0].state).toBe("scheduled");
      expect((await stub.snapshot()).wallet.balance).toBe(balance);
    },
  );

  it("renews the binding when the assistant configures the same daily time", async () => {
    const { stub, model } = await setup();
    await connect(stub);
    const plugin = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    const time = nextHour();
    const record = (await save(stub, plugin.id, dailyRecord(time))).data;
    await save(stub, plugin.id, { ...note, kind: "task", date: beijingDate() });
    await connect(stub, { generation: "g2" });
    modelNetwork("chat-completions", [
      response("chat-completions", "", [
        { id: "daily", name: "personal_daily_tasks", args: { enabled: true, time } },
      ]),
      response("chat-completions", "已重新设置"),
    ]);
    expect(await send(stub, `@助理 重新设置每天 ${time} 提醒今日待办`)).toContain(
      "当天最新的未完成待办",
    );
    expect((await reminders(stub))[0]).toMatchObject({
      recordId: record.id,
      generation: "g2",
      state: "scheduled",
    });
    expect((await list(stub, plugin.id, { reminderType: "daily_tasks" })).data.total).toBe(1);
    const sent = deliveries();
    await due(stub);
    await deliver(stub);
    expect(sent).toHaveLength(1);
  });

  it("updates a saved reminder's selected link without migrating other reminders", async () => {
    const { stub, model } = await setup();
    await connect(stub);
    const plugin = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    const fields = { ...note, kind: "reminder", remindAt: future() };
    const record = (await save(stub, plugin.id, fields)).data;
    const untouched = (await save(stub, plugin.id, { ...fields, title: "未重新设置的提醒" })).data;
    const link = await api(stub, "wechat.create", { name: "另一个微信" });
    expect(link.ok).toBe(true);
    const connectionId = link.data.selectedConnectionId as string;
    await runInDurableObject(stub, (_, state) => {
      const connection = JSON.parse(
        state.storage.sql
          .exec<{ value: string }>("SELECT value FROM settings WHERE key='connection'")
          .one().value,
      );
      state.storage.sql.exec(
        "UPDATE settings SET value=? WHERE key=?",
        JSON.stringify({ ...connection, contextToken: "new-link-context" }),
        wechatLinkKey(connectionId, "connection"),
      );
    });
    expect(
      (await api(stub, "plugin.save", { ...plugin, reminderConnectionId: connectionId })).ok,
    ).toBe(true);
    expect((await save(stub, plugin.id, fields, record)).ok).toBe(true);
    const rows = await reminders(stub);
    expect(rows.find((r) => r.recordId === record.id)).toMatchObject({
      connectionId,
      generation: "g1",
    });
    expect(rows.find((r) => r.recordId === untouched.id)?.connectionId).toBe("default");
    const sent = deliveries();
    await due(stub);
    await deliver(stub);
    expect(sent).toHaveLength(1);
    expect(sent[0].context).toBe("new-link-context");
    expect((await reminders(stub)).find((r) => r.recordId === untouched.id)?.state).toBe("blocked");
  });

  it("does not replay a sent reminder when saving with the same binding", async () => {
    const { stub, model } = await setup();
    await connect(stub);
    const plugin = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    const fields = { ...note, kind: "reminder", remindAt: future() };
    const record = (await save(stub, plugin.id, fields)).data;
    const sent = deliveries();
    await due(stub);
    await deliver(stub);
    const delivered = (await reminders(stub))[0];
    expect(delivered.state).toBe("sent");
    expect((await save(stub, plugin.id, fields, record)).ok).toBe(true);
    expect((await reminders(stub))[0]).toMatchObject({
      id: delivered.id,
      state: "sent",
      dueAt: delivered.dueAt,
    });
    await deliver(stub);
    expect(sent).toHaveLength(1);
  });

  it("rejects an expired time on rebind without partially saving the record", async () => {
    const { stub, model } = await setup();
    await connect(stub);
    const plugin = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    const fields = { ...note, kind: "reminder", remindAt: future() };
    const record = (await save(stub, plugin.id, fields)).data;
    await connect(stub, { generation: "g2" });
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(fields.remindAt) + 60000);
    const result = await save(
      stub,
      plugin.id,
      {
        ...fields,
        title: "不应保存",
      },
      record,
    );
    expect(result.error).toBe("reminder_time");
    expect((await list(stub, plugin.id)).data.records[0]).toMatchObject({
      title: note.title,
      revision: record.revision,
    });
    expect((await reminders(stub))[0].generation).toBe("g1");
  });
});
