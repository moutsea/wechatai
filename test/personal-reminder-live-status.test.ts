import { runInDurableObject } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import { PersonalRecordsStore } from "../src/server/personal-records";
import { personalContext } from "../src/server/plugins/personal-context";
import { personalReceipt } from "../src/server/plugins/personal-receipt";
import { beijingDate, beijingTime } from "../src/shared/personal-assistant";
import { connect, contextData, save, savePlugin, setup } from "./personal-assistant-helpers";

const at = Date.parse("2026-11-20T08:00:00+08:00");
const day = 86400000;
const target = { connectionId: "default", generation: "g1" };
async function reminder(repeat = "none") {
  const clock = vi.spyOn(Date, "now").mockReturnValue(at - 60000);
  const { stub, model } = await setup("chat-completions", false);
  await connect(stub);
  const plugin = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
  const created = await save(stub, plugin.id, {
    kind: "reminder",
    title: "拿牛奶",
    date: beijingDate(at),
    remindAt: new Date(at).toISOString(),
    repeat,
  });
  expect(created.ok).toBe(true);
  clock.mockReturnValue(at + 1000);
  return { stub, plugin, record: created.data, clock };
}

it.each(["sent", "expired", "scheduled", "waiting_context"])(
  "refreshes %s delivery state in restored drafts, context and receipts without resetting delivery",
  async (expectedState) => {
    const { stub, plugin, record, clock } = await reminder(
      expectedState === "scheduled" ? "daily" : "none",
    );
    await runInDurableObject(stub, (_, state) => {
      const store = new PersonalRecordsStore(state.storage.sql);
      const draft = store.draft(plugin.id, target);
      draft.save(
        { content: "新增备注", remindAt: "2026-11-20T08:00:00+08:00" },
        record.id,
        record.revision,
      );
      const saved = draft.snapshot();
      const delivery = store.due()[0];
      if (expectedState === "expired") {
        clock.mockReturnValue(at + day + 1);
        store.expire(delivery);
      } else if (expectedState === "waiting_context") {
        store.block(delivery, "waiting_context", {
          code: "wechat_context_missing",
          message: "缺少微信会话凭据。",
        });
      } else store.finish(delivery);
      const latest = state.storage.sql.exec("SELECT * FROM personal_reminders").one();
      const restored = store.draft(plugin.id, target);
      restored.restore(saved);
      const context = contextData(personalContext(restored));
      expect(context.reminders.items).toContainEqual(
        expect.objectContaining({
          id: record.id,
          staged: true,
          reminderState: expectedState,
          nextReminderAt: expectedState === "scheduled" ? at + day : at,
        }),
      );
      const receipt = personalReceipt(restored)!;
      if (expectedState === "sent") expect(receipt).toContain("提醒：已发送");
      else if (expectedState === "expired") expect(receipt).toContain("提醒：已过期，未再补发");
      else if (expectedState === "waiting_context")
        expect(receipt).toContain("等待微信连接恢复或重试");
      else {
        expect(receipt).toContain(beijingTime(at + day));
        expect(receipt).not.toContain(beijingTime(at));
      }
      expect(receipt).not.toContain("提醒已更新");
      state.storage.transactionSync(() => store.commit(plugin.id, restored.changes, target));
      expect(store.get(plugin.id, record.id)).toMatchObject({
        content: "新增备注",
        reminderState: expectedState,
      });
      expect(state.storage.sql.exec("SELECT * FROM personal_reminders").one()).toEqual({
        ...latest,
        revision: record.revision + 1,
      });
    });
  },
);

it.each(["reschedule", "cancel", "delete"])(
  "preserves an explicit staged %s when the previous delivery completes",
  async (action) => {
    const { stub, plugin, record } = await reminder();
    await runInDurableObject(stub, (_, state) => {
      const store = new PersonalRecordsStore(state.storage.sql);
      const draft = store.draft(plugin.id, target);
      if (action === "delete") draft.remove(record.id, record.revision);
      else
        draft.save(
          action === "cancel"
            ? { reminderEnabled: false }
            : { remindAt: new Date(at + day).toISOString() },
          record.id,
          record.revision,
        );
      const saved = draft.snapshot();
      store.finish(store.due()[0]);
      const restored = store.draft(plugin.id, target);
      restored.restore(saved);
      const context = contextData(personalContext(restored));
      const receipt = personalReceipt(restored)!;
      if (action === "delete") {
        expect(context.reminders.total).toBe(0);
        expect(receipt).toContain("已删除提醒");
      } else {
        expect(context.reminders.items).toContainEqual(
          expect.objectContaining({
            id: record.id,
            reminderState: action === "cancel" ? "none" : "staged",
            nextReminderAt: action === "cancel" ? null : new Date(at + day).toISOString(),
          }),
        );
        expect(receipt).toContain(action === "cancel" ? "提醒已取消" : "提醒已更新");
      }
      expect(receipt).not.toContain("提醒：已发送");
      state.storage.transactionSync(() => store.commit(plugin.id, restored.changes, target));
      if (action === "reschedule")
        expect(store.get(plugin.id, record.id)).toMatchObject({
          reminderState: "scheduled",
          nextReminderAt: at + day,
        });
      else expect(state.storage.sql.exec("SELECT * FROM personal_reminders").toArray()).toEqual([]);
    });
  },
);
