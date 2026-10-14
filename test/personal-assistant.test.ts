import {
  env,
  runInDurableObject,
  runDurableObjectAlarm,
  abortAllDurableObjects,
} from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { PersonalRecordsStore } from "../src/server/personal-records";
import { PersonalRunStore } from "../src/server/personal-runs";
import type { PersonalAssistantProgress } from "../src/server/plugins/personal-assistant";
import { personalContext, PERSONAL_CONTEXT_TOKENS } from "../src/server/plugins/personal-context";
import { countTextTokens } from "../src/server/tokenizer";
import { personalReceipt } from "../src/server/plugins/personal-receipt";
import { personalRecordInputSchema, type PersonalRecord } from "../src/shared/personal-assistant";
import type { Protocol } from "../src/shared/types";
import type { WxMessage } from "../src/server/wechat";

import {
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
} from "./personal-assistant-helpers";

describe("personal assistant records", () => {
  it("keeps ordinary notes, todo notes and reminders separate through updates and cancellation", async () => {
    const { stub, model } = await setup();
    await connect(stub);
    const p = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    await save(stub, p.id, note);
    const task = (await save(stub, p.id, { ...note, kind: "task", title: "买牛奶" })).data;
    const reminder = (
      await save(stub, p.id, {
        ...note,
        kind: "reminder",
        title: "喝水",
        remindAt: future(),
      })
    ).data;
    expect((await list(stub, p.id, { kind: "note" })).data.total).toBe(1);
    expect(
      (await list(stub, p.id, { kind: "task" })).data.records.map((r: PersonalRecord) => r.title),
    ).toEqual(["买牛奶"]);
    expect(
      (await list(stub, p.id, { kind: "reminder" })).data.records.map(
        (r: PersonalRecord) => r.title,
      ),
    ).toEqual(["喝水"]);
    const scheduled = await reminders(stub);
    expect((await save(stub, p.id, { completed: true }, task)).ok).toBe(true);
    expect(await reminders(stub)).toEqual(scheduled);
    expect((await save(stub, p.id, { reminderEnabled: false }, reminder)).ok).toBe(true);
    expect(await reminders(stub)).toEqual([]);
    expect((await scheduler(stub).status()).alarmAt).toBeNull();
    const cancelled = (await list(stub, p.id, { kind: "reminder" })).data.records[0];
    expect(cancelled).toMatchObject({ reminderEnabled: false, completed: false });
    expect((await list(stub, p.id, { kind: "task", completed: true })).data.total).toBe(1);
    expect(
      (
        await save(
          stub,
          p.id,
          { reminderEnabled: true, remindAt: "2020-01-01T00:00:00Z" },
          cancelled,
        )
      ).error,
    ).toBe("reminder_time");
    expect(
      (await save(stub, p.id, { reminderEnabled: true, remindAt: future() }, cancelled)).ok,
    ).toBe(true);
    expect(await reminders(stub)).toHaveLength(1);
  });
  it("migrates legacy reminder tasks once without resetting delivery IDs, times or states", async () => {
    const { stub } = await setup();
    await runInDurableObject(stub, (_, state) => {
      const sql = state.storage.sql;
      const store = new PersonalRecordsStore(sql);
      const initial = store.draft("legacy", true);
      const ids = [
        "scheduled",
        "sent",
        "expired",
        "retry",
        "waiting_context",
        "paused",
        "blocked",
      ].map((status) => {
        const r = initial.save({
          ...note,
          kind: "reminder",
          title: status,
          remindAt: future(),
          repeat: "daily",
        });
        return { id: r.id, status };
      });
      const cancelled = initial.save({
        ...note,
        kind: "reminder",
        title: "取消的旧提醒",
        remindAt: future(),
        reminderEnabled: false,
      });
      const task = initial.save({ ...note, kind: "task", title: "原有待办", completed: true });
      const ordinary = initial.save(note);
      state.storage.transactionSync(() =>
        store.commit("legacy", initial.changes, { connectionId: "default", generation: "g1" }),
      );
      for (const { id, status } of ids)
        sql.exec(
          "UPDATE personal_reminders SET state=?,attempts=2,error='keep' WHERE recordId=?",
          status,
          id,
        );
      // Recreate the pre-upgrade storage shape, including completed reminder tasks.
      sql.exec(
        "UPDATE personal_records SET kind='task',data=json_remove(json_set(data,'$.kind','task','$.completed',json(CASE WHEN json_extract(data,'$.reminderEnabled')=0 THEN 'true' ELSE 'false' END)),'$.reminderEnabled') WHERE kind='reminder'",
      );
      sql.exec("DELETE FROM personal_record_migrations WHERE version=2");
      const before = sql.exec("SELECT * FROM personal_reminders ORDER BY id").toArray();
      const schedule = store.schedule();
      const oldDraft = store.draft("legacy", true);
      state.storage.transactionSync(() => store.init());
      expect(() => oldDraft.assertCurrent()).toThrow("记录已修改或删除");
      expect(store.query("legacy", { kind: "reminder" }).total).toBe(8);
      expect(store.query("legacy", { kind: "task" }).records).toMatchObject([
        { id: task.id, completed: true, revision: 1 },
      ]);
      expect(store.get("legacy", ordinary.id).kind).toBe("note");
      expect(store.get("legacy", cancelled.id)).toMatchObject({
        kind: "reminder",
        completed: false,
        reminderEnabled: false,
        revision: 2,
      });
      expect(sql.exec("SELECT * FROM personal_reminders ORDER BY id").toArray()).toEqual(
        before.map((r) => ({ ...r, revision: 2 })),
      );
      expect(store.schedule()).toEqual(schedule);
      expect(() => store.draft("legacy", true).save({ title: "stale edit" }, ids[0].id, 1)).toThrow(
        "记录已变更",
      );
      const migrated = store.query("legacy", {});
      const revision = store.recordState("legacy").revision;
      state.storage.transactionSync(() => store.init());
      expect(store.query("legacy", {})).toEqual(migrated);
      expect(store.recordState("legacy").revision).toBe(revision);
    });
  });
  it("rejects a pre-upgrade draft instead of committing obsolete reminder tasks", async () => {
    const { stub } = await setup();
    await runInDurableObject(stub, (_, state) => {
      const store = new PersonalRecordsStore(state.storage.sql);
      const draft = store.draft("legacy-run", true);
      const old = draft.snapshot();
      delete old.recordModelVersion;
      expect(() => draft.restore(old)).toThrow("记录分类已更新");
      expect(store.query("legacy-run", {}).total).toBe(0);
    });
  });
  it("rejects cross-account reads, writes and deletes even when IDs and owner fields are supplied", async () => {
    const owner = await setup();
    const outsider = await setup();
    const ownedPlugin = await savePlugin(owner.stub, owner.model.id);
    const ownPlugin = await savePlugin(outsider.stub, outsider.model.id);
    const record = (await save(owner.stub, ownedPlugin.id, note)).data;
    const forgedOwner = { userId: owner.stub.id.toString(), accountId: owner.stub.id.toString() };
    for (const pluginId of [ownedPlugin.id, ownPlugin.id]) {
      expect(
        (
          await api(outsider.stub, "personal.save", {
            ...forgedOwner,
            pluginId,
            recordId: record.id,
            revision: record.revision,
            record: { title: "unauthorized change" },
          })
        ).ok,
      ).toBe(false);
      expect(
        (
          await api(outsider.stub, "personal.delete", {
            ...forgedOwner,
            pluginId,
            recordId: record.id,
            revision: record.revision,
          })
        ).ok,
      ).toBe(false);
    }
    expect(
      (
        await api(outsider.stub, "personal.list", {
          ...forgedOwner,
          pluginId: ownedPlugin.id,
          query: {},
        })
      ).ok,
    ).toBe(false);
    const ownView = await api(outsider.stub, "personal.list", {
      ...forgedOwner,
      pluginId: ownPlugin.id,
      query: { query: record.id },
    });
    expect(ownView.data).toMatchObject({ records: [], total: 0, totals: [] });
    const ownerView = await list(owner.stub, ownedPlugin.id);
    expect(ownerView.data.total).toBe(1);
    expect(ownerView.data.records[0]).toMatchObject({
      id: record.id,
      title: note.title,
      revision: 1,
    });
  });
  it("validates real dates, positive decimal amounts and separate reminders and todo completion", () => {
    for (const record of [
      { ...note, kind: "task", remindAt: future() },
      { ...note, kind: "reminder" },
      { ...note, kind: "reminder", remindAt: future(), completed: true },
      { ...note, completed: true },
      { ...note, kind: "task", reminderEnabled: false },
    ])
      expect(personalRecordInputSchema.safeParse(record).success).toBe(false);
    expect(personalRecordInputSchema.safeParse({ ...entry, date: "2026-02-30" }).success).toBe(
      false,
    );
    for (const amount of ["0", "-1", "1.234", "1e3", "100000000"])
      expect(personalRecordInputSchema.safeParse({ ...entry, amount }).success).toBe(false);
    expect(personalRecordInputSchema.safeParse({ ...note, remindAt: future() }).success).toBe(
      false,
    );
    expect(
      personalRecordInputSchema.safeParse({ ...note, kind: "task", repeat: "daily" }).success,
    ).toBe(false);
  });
  it("separates configuration/account records, keeps exact multi-currency totals and handles revisions", async () => {
    const { stub, model } = await setup();
    const plugin = await savePlugin(stub, model.id);
    const second = await savePlugin(stub, model.id, { shortcut: "另一个" });
    for (const item of [
      entry,
      { ...entry, amount: "0.10" },
      { ...entry, amount: "0.20" },
      { ...entry, amount: "40.00", direction: "income" },
      { ...entry, amount: "9.99", currency: "USD" },
      note,
    ])
      expect((await save(stub, plugin.id, item)).ok).toBe(true);
    expect((await list(stub, second.id)).data.total).toBe(0);
    const result = (await list(stub, plugin.id, { kind: "entry", query: "餐饮", limit: 1 })).data;
    expect(result.total).toBe(5);
    expect(result.records).toHaveLength(1);
    expect(result.totals).toEqual(
      expect.arrayContaining([
        { currency: "CNY", expense: "35.50", income: "40.00", net: "4.50" },
        { currency: "USD", income: "0.00", expense: "9.99", net: "-9.99" },
      ]),
    );
    const record = (await list(stub, plugin.id, { kind: "note" })).data.records[0];
    expect((await save(stub, second.id, { title: "cross-scope" }, record)).ok).toBe(false);
    expect((await save(stub, plugin.id, { title: "改成周日" }, record)).ok).toBe(true);
    expect((await save(stub, plugin.id, { title: "stale" }, record)).error).toBe("record_changed");
    const other = await setup();
    expect((await list(other.stub, plugin.id)).ok).toBe(false);
    await abortAllDurableObjects();
    expect(
      (await list(env.ACCOUNTS.get(stub.id), plugin.id, { kind: "note" })).data.records[0].title,
    ).toBe("改成周日");
  });
  it("excludes guessed IDs, overlays staged writes and rolls back a conflicting transaction", async () => {
    const { stub } = await setup();
    await runInDurableObject(stub, (_, state) => {
      const store = new PersonalRecordsStore(state.storage.sql);
      const initial = store.draft("a");
      const saved = initial.save(entry);
      state.storage.transactionSync(() => store.commit("a", initial.changes, null));
      const d = store.draft("a");
      expect(() => d.save({ amount: "10" }, saved.id, saved.revision, true)).toThrow("查询");
      d.query({});
      d.save({ amount: "10" }, saved.id, saved.revision, true);
      const added = d.save({ ...entry, amount: "2.50" });
      expect(d.query({}).totals[0].expense).toBe("12.50");
      d.save({ amount: "3.50" }, added.id, 1, true);
      expect(d.query({}).totals[0].expense).toBe("13.50");
      d.remove(added.id, 2, true);
      expect(d.query({}).total).toBe(1);
      const concurrent = store.draft("a");
      concurrent.save({ title: "changed" }, saved.id, 1);
      store.commit("a", concurrent.changes, null);
      const receipt = store.recordState("a");
      expect(() => state.storage.transactionSync(() => store.commit("a", d.changes, null))).toThrow(
        "修改",
      );
      expect(store.query("a", {}).totals[0].expense).toBe("35.20");
      expect(store.recordState("a")).toEqual(receipt);
    });
  });
  it("preserves records and configuration after deleting the answer model", async () => {
    const { stub, model } = await setup();
    const p = await savePlugin(stub, model.id);
    await save(stub, p.id, note);
    expect((await api(stub, "assistant.delete", { id: model.id })).ok).toBe(true);
    expect((await stub.snapshot()).plugins?.find((v) => v.id === p.id)?.hasKey).toBe(false);
    expect((await list(stub, p.id)).data.total).toBe(1);
    expect((await save(stub, p.id, entry)).ok).toBe(true);
  });
  it("retains excess plugin records after downgrade while blocking its writes and calls", async () => {
    const { stub, model } = await setup();
    expect(
      (
        await api(stub, "plugin.save", {
          pluginId: "wechatai/openclaw",
          name: "首个插件",
          shortcut: "first",
        })
      ).ok,
    ).toBe(true);
    const p = await savePlugin(stub, model.id);
    const r = (await save(stub, p.id, note)).data;
    await runInDurableObject(stub, (_, state) =>
      state.storage.sql.exec("UPDATE settings SET value='0' WHERE key='planUntil'"),
    );
    expect((await list(stub, p.id)).data.total).toBe(1);
    expect((await save(stub, p.id, entry)).ok).toBe(false);
    expect((await api(stub, "plugin.test", { id: p.id, query: "记录午餐" })).ok).toBe(false);
    expect(
      (await api(stub, "personal.delete", { pluginId: p.id, recordId: r.id, revision: 1 })).ok,
    ).toBe(true);
    expect((await list(stub, p.id)).data.total).toBe(0);
  });
});

describe("personal assistant execution", () => {
  it.each<Protocol>(["chat-completions", "responses", "anthropic"])(
    "renders only actual changes when %s repeats a deleted reminder in its final answer",
    async (protocol) => {
      const { stub, model } = await setup(protocol);
      await connect(stub);
      const p = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
      const bad =
        "到点会通过微信推送。之前那条时间对不上的「喝水 09:45」提醒还没处理，要我删掉吗？";
      const remindAt = future();
      const bodies = modelNetwork(protocol, [
        response(protocol, "喝水 09:45 还挂着。"),
        response(protocol, "", [
          {
            id: "lunch",
            name: "personal_create",
            args: { ...note, kind: "reminder", title: "吃饭", remindAt },
          },
        ]),
        response(protocol, "已设置提醒\n\n" + bad),
      ]);
      await send(stub, "/use 助理");
      await send(stub, "之前有提醒吗");
      const result = await send(stub, "一小时后提醒我吃饭", "verified-receipt");
      expect(JSON.stringify(bodies[1])).toContain("喝水 09:45 还挂着。");
      expect(result).toContain("提醒已设置");
      expect(result).toContain("提醒：吃饭");
      expect(result).not.toContain("待办");
      expect((await list(stub, p.id, { kind: "task" })).data.total).toBe(0);
      expect(result).toContain("北京时间");
      expect(result).not.toContain("09:45");
      expect(result).not.toContain("要我删掉");
      expect(bodies).toHaveLength(3);
      const tasks = (await list(stub, p.id)).data.records;
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toMatchObject({ title: "吃饭", remindAt });
      await runInDurableObject(stub, (_, state) => {
        const answer = state.storage.sql
          .exec<{ content: string }>(
            "SELECT content FROM messages WHERE role='assistant' ORDER BY id DESC LIMIT 1",
          )
          .one().content;
        expect(answer).toBe(result);
        const meter = JSON.parse(
          String(
            state.storage.sql
              .exec("SELECT data FROM platform_metering WHERE id='verified-receipt'")
              .one().data,
          ),
        );
        expect(meter.outputTokens).toBe(countTextTokens(result));
      });
      expect((await scheduler(stub).status()).alarmAt).toBe(Date.parse(remindAt));
    },
  );
  it("reports actual successes and unresolved tool errors without trusting a false all-done answer", async () => {
    const { stub, model } = await setup();
    const p = await savePlugin(stub, model.id);
    modelNetwork("chat-completions", [
      response("chat-completions", "", [
        { id: "note", name: "personal_create", args: note },
        {
          id: "reminder",
          name: "personal_create",
          args: { ...note, kind: "reminder", title: "喝水", remindAt: future() },
        },
      ]),
      response("chat-completions", "都已设置成功，喝水提醒还挂着。"),
    ]);
    const result = await send(stub, "@助理 记下看展，稍后提醒喝水");
    expect(result).toContain("已保存笔记");
    expect(result).toContain("另有操作未完成");
    expect(result).toContain("选择已连接的微信链接");
    expect(result).not.toContain("都已设置成功");
    expect((await list(stub, p.id)).data.records.map((r: PersonalRecord) => r.kind)).toEqual([
      "note",
    ]);
  });
  it("does not claim success when all tools fail", async () => {
    const { stub, model } = await setup();
    const p = await savePlugin(stub, model.id);
    modelNetwork("chat-completions", [
      response("chat-completions", "", [
        {
          id: "reminder",
          name: "personal_create",
          args: { ...note, kind: "reminder", remindAt: future() },
        },
      ]),
      response("chat-completions", "提醒已设置成功。"),
    ]);
    expect(await send(stub, "@助理 一小时后提醒我看展")).toContain("未保存记录");
    expect((await list(stub, p.id)).data.total).toBe(0);
  });
  it("regenerates a saved legacy final answer from the recovered draft", async () => {
    const { stub, model } = await setup();
    await connect(stub);
    const p = await savePlugin(stub, model.id);
    const bodies = modelNetwork("chat-completions", [
      response("chat-completions", "", [{ id: "write", name: "personal_create", args: entry }]),
      response("chat-completions", "已记录。"),
    ]);
    const fresh = await interruptPersonal(stub, "@助理 记午餐", (p) => p.finalText !== undefined);
    await runInDurableObject(fresh, (_, state) => {
      const journal = new PersonalRunStore(state.storage);
      const progress = journal.read<PersonalAssistantProgress>("restart-run", "progress")!;
      progress.finalText = "已记录午餐。喝水 09:45 还没处理，要删吗？";
      journal.write("restart-run", "progress", progress);
    });
    const result = await send(fresh, "重试", "restart-run");
    expect(result).toContain("午餐");
    expect(result).toContain("35.20 CNY");
    expect(result).not.toContain("09:45");
    expect(bodies).toHaveLength(2);
    expect((await list(fresh, p.id)).data.total).toBe(1);
  });
  it("uses final draft state for completed, deleted, cancelled and sent reminders", async () => {
    const { stub } = await setup();
    await runInDurableObject(stub, (_, state) => {
      const store = new PersonalRecordsStore(state.storage.sql);
      const initial = store.draft("receipts", true);
      const a = initial.save({ ...note, kind: "reminder", title: "完成的事", remindAt: future() });
      const b = initial.save({ ...note, kind: "reminder", title: "删除的事", remindAt: future() });
      const c = initial.save({ ...note, kind: "reminder", title: "已经提醒", remindAt: future() });
      store.commit("receipts", initial.changes, { connectionId: "default", generation: "g1" });
      store.finish(
        store.due(Date.now() + 7200000).find((r) => r.recordId === c.id)!,
        true,
      );
      const draft = store.draft("receipts", true);
      draft.save({ reminderEnabled: false }, a.id, 1);
      draft.remove(b.id, 1);
      draft.save({ title: "已发送过" }, c.id, 1);
      const temp = draft.save(note);
      draft.remove(temp.id, 1);
      const receipt = personalReceipt(draft)!;
      expect(receipt).toContain("提醒已取消");
      expect(receipt).toContain("已删除提醒");
      expect(receipt).toContain("对应提醒已取消");
      expect(receipt).toContain("提醒：已发送");
      expect(receipt).not.toContain("待办");
      expect(receipt).toContain("1 条新建记录已取消");
      expect(receipt).not.toContain("提醒时间");
    });
  });
  it.each<Protocol>(["chat-completions", "responses", "anthropic"])(
    "refreshes web edits/deletions before a direct %s reply without charging or persisting internal context",
    async (protocol) => {
      const { stub, model } = await setup(protocol);
      const p = await savePlugin(stub, model.id);
      const deleted = (await save(stub, p.id, { ...note, kind: "task", title: "喝水 09:45" })).data;
      const changed = (await save(stub, p.id, { ...note, kind: "task", title: "看展待办" })).data;
      const bodies = modelNetwork(protocol, [
        response(protocol, "喝水 09:45 还挂着。"),
        response(protocol, "好的。"),
      ]);
      await send(stub, "/use 助理");
      await send(stub, "之前的安排呢");
      expect(
        (
          await api(stub, "personal.delete", {
            pluginId: p.id,
            recordId: deleted.id,
            revision: deleted.revision,
          })
        ).ok,
      ).toBe(true);
      expect((await save(stub, p.id, { title: "看展已完成", completed: true }, changed)).ok).toBe(
        true,
      );
      await send(stub, "你好", "state-sync");
      expect(bodies).toHaveLength(2);
      // Old conversation remains intact, but current state explicitly supersedes it.
      expect(JSON.stringify(bodies[1])).toContain("喝水 09:45 还挂着。");
      const system = systemText(bodies[1]);
      const live = contextData(system);
      expect(live.tasks).toMatchObject({
        total: 1,
        complete: true,
        items: [{ id: changed.id, title: "看展已完成", completed: true }],
      });
      expect(live.recentChanges.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: deleted.id, action: "deleted", source: "web" }),
          expect.objectContaining({ id: changed.id, action: "updated", source: "web" }),
        ]),
      );
      await runInDurableObject(stub, (_, state) => {
        const meter = JSON.parse(
          String(
            state.storage.sql.exec("SELECT data FROM platform_metering WHERE id='state-sync'").one()
              .data,
          ),
        );
        const history = state.storage.sql
          .exec<{ content: string }>("SELECT content FROM messages ORDER BY id")
          .toArray();
        expect(history).toHaveLength(4);
        const expectedInput =
          countTextTokens(system.split("\n\n【当前记录状态】")[0]) +
          history.slice(0, -1).reduce((n, m) => n + countTextTokens(m.content), 0);
        expect(meter.inputTokens).toBe(expectedInput);
        expect(JSON.stringify(history)).not.toContain("【当前记录状态】");
      });
    },
  );
  it("isolates mandatory context between plugin instances and accounts", async () => {
    const owner = await setup();
    const p = await savePlugin(owner.stub, owner.model.id);
    await save(owner.stub, p.id, { ...note, title: "私有记录不得泄漏" });
    const otherPlugin = await savePlugin(owner.stub, owner.model.id, { shortcut: "另助理" });
    const outsider = await setup();
    const outsiderPlugin = await savePlugin(outsider.stub, outsider.model.id);
    const bodies = modelNetwork("chat-completions", []);
    for (const [stub, plugin] of [
      [owner.stub, otherPlugin],
      [outsider.stub, outsiderPlugin],
    ] as const) {
      expect((await api(stub, "plugin.test", { id: plugin.id, query: "有什么待办" })).ok).toBe(
        true,
      );
      const live = contextData(systemText(bodies.at(-1)!));
      expect(live.tasks.total).toBe(0);
      expect(live.recentRecords.total).toBe(0);
      expect(live.recentChanges.items).toEqual([]);
      expect(JSON.stringify(bodies.at(-1))).not.toContain("私有记录不得泄漏");
    }
  });
  it("provides authoritative empty task state for deletions that predate change receipts", async () => {
    const { stub, model } = await setup();
    const p = await savePlugin(stub, model.id);
    const record = (await save(stub, p.id, { ...note, kind: "task" })).data;
    const bodies = modelNetwork("chat-completions", [
      response("chat-completions", "摄影展还挂着。"),
    ]);
    await send(stub, "/use 助理");
    await send(stub, "查待办");
    await api(stub, "personal.delete", { pluginId: p.id, recordId: record.id, revision: 1 });
    await runInDurableObject(stub, (_, state) => {
      state.storage.sql.exec("DELETE FROM personal_record_state");
    });
    await send(stub, "你好");
    const text = systemText(bodies[1]);
    expect(contextData(text).tasks).toEqual({ items: [], total: 0, complete: true });
    expect(contextData(text).recentChanges.items).toEqual([]);
    expect(JSON.stringify(bodies[1])).toContain("摄影展还挂着。");
  });
  it("bounds snapshots, preserves partial flags and does not grant mutation permission", async () => {
    const { stub } = await setup();
    await runInDurableObject(stub, (_, state) => {
      const store = new PersonalRecordsStore(state.storage.sql);
      const initial = store.draft("bounded");
      const records = Array.from({ length: 35 }, (_, i) =>
        initial.save({
          ...note,
          kind: "task",
          title: `${i} 很长的任务名称`.repeat(12).slice(0, 160),
          content: "完整正文不应进入自动快照",
        }),
      );
      state.storage.transactionSync(() => store.commit("bounded", initial.changes, null, "web"));
      const draft = store.draft("bounded");
      const text = personalContext(draft);
      const live = contextData(text);
      expect(countTextTokens(text)).toBeLessThanOrEqual(PERSONAL_CONTEXT_TOKENS);
      expect(live.tasks).toMatchObject({ total: 35, complete: false });
      expect(live.recentRecords).toMatchObject({ total: 35, complete: false });
      expect(text).not.toContain("完整正文不应进入自动快照");
      expect(() => draft.remove(records[0].id, 1, true)).toThrow("查询");
      draft.query({ query: records[0].id });
      draft.remove(records[0].id, 1, true);
      expect(contextData(personalContext(draft)).stagedDeletedIds.items).toContain(records[0].id);
    });
  });
  it("distinguishes sent reminders, completed tasks and newly staged reminders", async () => {
    const { stub } = await setup();
    await runInDurableObject(stub, (_, state) => {
      const store = new PersonalRecordsStore(state.storage.sql);
      const initial = store.draft("states", true);
      const sent = initial.save({ ...note, kind: "reminder", remindAt: future() });
      const done = initial.save({ ...note, kind: "task", completed: true });
      state.storage.transactionSync(() =>
        store.commit("states", initial.changes, { connectionId: "default", generation: "g1" }),
      );
      store.finish(store.due(Date.now() + 7200000)[0], true);
      const draft = store.draft("states", true);
      const added = draft.save({ ...note, kind: "reminder", remindAt: future() });
      const live = contextData(personalContext(draft));
      expect(live.tasks).toMatchObject({ total: 1, items: [{ id: done.id, completed: true }] });
      expect(live.reminders.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: sent.id, reminderEnabled: true, reminderState: "sent" }),
          expect.objectContaining({ id: added.id, staged: true, reminderState: "staged" }),
        ]),
      );
    });
  });
  it.each(["first request", "queried", "final answer"])(
    "rejects a stale recovered %s after a web deletion before any additional call or charge",
    async (phase) => {
      const { stub, model } = await setup();
      await connect(stub);
      const p = await savePlugin(stub, model.id);
      const record = (await save(stub, p.id, { ...note, kind: "task" })).data;
      const bodies = modelNetwork("chat-completions", [
        response("chat-completions", "", [
          { id: "query", name: "personal_query", args: { kind: "task" } },
        ]),
        response("chat-completions", "旧待办仍然存在。"),
      ]);
      const fresh = await interruptPersonal(stub, "@助理 待办还在吗", (p) =>
        phase === "first request"
          ? !p.rounds.length && !p.pendingReply
          : phase === "queried"
            ? p.rounds.length === 1 && !p.pendingReply
            : p.finalText !== undefined,
      );
      expect(
        (
          await api(fresh, "personal.delete", {
            pluginId: p.id,
            recordId: record.id,
            revision: record.revision,
          })
        ).ok,
      ).toBe(true);
      const count = bodies.length;
      const balance = (await fresh.snapshot()).wallet.balance;
      await expect(send(fresh, "重试", "restart-run")).rejects.toThrow("记录已修改或删除");
      expect(bodies).toHaveLength(count);
      expect((await fresh.snapshot()).wallet.balance).toBe(balance);
      expect((await list(fresh, p.id)).data.total).toBe(0);
    },
  );
  it("clears change receipts with privacy cleanup and plugin deletion", async () => {
    const { stub, model } = await setup();
    const p = await savePlugin(stub, model.id);
    const record = (await save(stub, p.id, note)).data;
    await api(stub, "personal.delete", { pluginId: p.id, recordId: record.id, revision: 1 });
    await runInDurableObject(stub, (_, state) => {
      const store = new PersonalRecordsStore(state.storage.sql);
      expect(store.recordState(p.id).changes[0].action).toBe("deleted");
    });
    expect((await api(stub, "privacy.clear")).ok).toBe(true);
    await runInDurableObject(stub, (_, state) => {
      expect(new PersonalRecordsStore(state.storage.sql).recordState(p.id).changes).toEqual([]);
    });
    await save(stub, p.id, note);
    await api(stub, "plugin.delete", { id: p.id });
    await runInDurableObject(stub, (_, state) => {
      expect(
        state.storage.sql
          .exec("SELECT count(*) n FROM personal_record_state WHERE pluginId=?", p.id)
          .one().n,
      ).toBe(0);
    });
  });
  it.each<Protocol>(["chat-completions", "responses", "anthropic"])(
    "uses the configured default currency for %s while keeping explicit currencies and later edits",
    async (protocol) => {
      const { stub, model } = await setup(protocol);
      const plugin = await savePlugin(stub, model.id, { currency: "USD" });
      const bodies = modelNetwork(protocol, [
        response(protocol, "", [
          {
            id: "default",
            name: "personal_create",
            args: { kind: "entry", title: "Coffee", date: "2026-10-10", amount: "5.00" },
          },
          {
            id: "explicit",
            name: "personal_create",
            args: {
              kind: "entry",
              title: "Ticket",
              date: "2026-10-10",
              amount: "12.00",
              currency: "EUR",
            },
          },
        ]),
        response(protocol, "已保存咖啡 5 美元、门票 12 欧元。"),
      ]);
      await send(stub, "@助理 记下咖啡 5 元（默认币种）、门票 12 欧元");
      expect(JSON.stringify(bodies[0].tools)).toContain('"default":"USD"');
      const page = (await list(stub, plugin.id)).data;
      expect(page.totals).toEqual(
        expect.arrayContaining([
          { currency: "USD", expense: "5.00", income: "0.00", net: "-5.00" },
          { currency: "EUR", expense: "12.00", income: "0.00", net: "-12.00" },
        ]),
      );
      const euro = page.records.find((r: PersonalRecord) => r.title === "Ticket");
      expect((await save(stub, plugin.id, { title: "Updated ticket" }, euro)).data.currency).toBe(
        "EUR",
      );
      const direct = await save(stub, plugin.id, {
        kind: "entry",
        title: "Lunch",
        date: "2026-10-10",
        amount: "10.00",
      });
      expect(direct.data.currency).toBe("USD");
    },
  );
  it("shows the configured shortcut for failed mentions and enters with assistant-specific guidance", async () => {
    const { stub, model } = await setup();
    const plugin = await savePlugin(stub, model.id);
    for (const input of [
      "@个人助理 一分钟后提醒我喝水",
      "@助理一分钟后提醒我喝水",
      "@",
      "@，你好",
    ]) {
      const reply = await send(stub, input);
      expect(reply).toContain("名称后可用空格、逗号或冒号分隔");
      expect(reply).toContain("@助理：个人助理");
      expect(reply).toContain("例如：@助理 你好");
    }
    const entered = await send(stub, "/use 助理");
    expect(entered).toContain("已进入「个人助理」");
    expect(entered).toContain("收支或待办");
    expect(entered).not.toContain("联网");
    expect((await stub.snapshot()).currentSession?.pluginInstanceId).toBe(plugin.id);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
  it.each(["@助理，5 分钟之后提醒我 ", "@助理：5 分钟之后提醒我", "＠助理，5 分钟之后提醒我"])(
    "routes %s to the assistant without changing the request or default session",
    async (input) => {
      const { stub, model } = await setup();
      const plugin = await savePlugin(stub, model.id);
      const before = (await stub.snapshot()).currentSession;
      const bodies = modelNetwork("chat-completions", [
        response("chat-completions", "你希望我提醒你做什么？"),
      ]);
      expect(await send(stub, input)).toBe("你希望我提醒你做什么？");
      expect(bodies).toHaveLength(1);
      expect(bodies[0].messages).toEqual(
        expect.arrayContaining([{ role: "user", content: "5 分钟之后提醒我" }]),
      );
      expect((await stub.snapshot()).currentSession?.id).toBe(before?.id);
      expect((await stub.snapshot()).currentSession?.pluginInstanceId).toBeFalsy();
      expect((await list(stub, plugin.id)).data.total).toBe(0);
    },
  );
  it.each<Protocol>(["chat-completions", "responses", "anthropic"])(
    "uses native tools via %s and persists/charges once without affecting default mode",
    async (protocol) => {
      const { stub, model } = await setup(protocol);
      const p = await savePlugin(stub, model.id);
      const before = (await stub.snapshot()).wallet.balance;
      const timingLogs = vi.spyOn(console, "info").mockImplementation(() => {});
      const bodies = modelNetwork(protocol, [
        response(protocol, "", [
          { id: "c1", name: "personal_create", args: entry },
          { id: "c2", name: "personal_create", args: entry },
        ]),
        response(protocol, "已记午餐 35.20 元。"),
      ]);
      const reply = await send(stub, "@助理 记午餐35.20元", "once");
      expect(reply).toContain("35.20");
      expect(await send(stub, "@助理 记午餐35.20元", "once")).toBe(reply);
      expect(bodies).toHaveLength(2);
      const events = timingLogs.mock.calls.map(([value]) => JSON.parse(String(value)));
      expect(
        events.filter((e) => e.event === "personal.model_round").map((e) => e.toolCalls),
      ).toEqual([2, 0]);
      expect(events.find((e) => e.event === "chat.completed")).toMatchObject({
        plugin: "wechatai/personal-assistant",
        summaryCalls: 0,
      });
      const logged = JSON.stringify(events);
      for (const privateValue of [
        "test-key",
        "llm.example.com",
        "午餐",
        "35.20",
        "model-prompt-must-not-leak",
      ])
        expect(logged).not.toContain(privateValue);
      expect(JSON.stringify(bodies[0])).toContain("personal_create");
      expect(JSON.stringify(bodies[0])).not.toContain("model-prompt-must-not-leak");
      expect((await list(stub, p.id)).data.total).toBe(1);
      expect((await stub.snapshot()).wallet.balance).toBeLessThan(before);
      expect((await stub.snapshot()).currentSession?.pluginInstanceId).toBeFalsy();
      await send(stub, "/use 助理");
      await send(stub, "/wx new");
      await send(stub, "/wx reset");
      expect((await list(stub, p.id)).data.total).toBe(1);
      await runInDurableObject(stub, (_, state) => {
        expect(
          state.storage.sql.exec("SELECT pluginId FROM platform_metering WHERE id='once'").one()
            .pluginId,
        ).toBe("wechatai/personal-assistant");
      });
    },
  );
  it.each<Protocol>(["chat-completions", "responses", "anthropic"])(
    "resumes a staged reminder through %s without replaying tools or billing twice",
    async (protocol) => {
      const { stub, model } = await setup(protocol);
      await connect(stub);
      const p = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
      const originalSession = (await stub.snapshot()).currentSession?.id;
      const remindAt = future();
      const bodies = modelNetwork(protocol, [
        response(protocol, "", [
          { id: "task-1", name: "personal_create", args: { ...note, kind: "reminder", remindAt } },
        ]),
        response(protocol, "已记下提醒。"),
      ]);
      const fresh = await interruptPersonal(
        stub,
        "@助理 一小时后提醒我看展",
        (p) => p.rounds.length === 1 && !p.pendingReply,
      );
      await runInDurableObject(fresh, async (_, state) => {
        expect(
          state.storage.sql.exec("SELECT status FROM runs WHERE id='restart-run'").one().status,
        ).toBe("interrupted");
        expect(
          state.storage.sql.exec("SELECT value FROM settings WHERE key='busy'").one().value,
        ).toBe("null");
        expect(await state.storage.getAlarm()).toBeLessThanOrEqual(Date.now() + 1000);
      });
      expect((await list(fresh, p.id)).data.total).toBe(0);
      const upstream = vi.mocked(fetch).getMockImplementation()!;
      const sent: string[] = [];
      vi.mocked(fetch).mockImplementation(async (url, init) => {
        if (String(url).includes("sendmessage")) {
          sent.push(JSON.parse(String(init?.body)).msg.item_list[0].text_item.text);
          return Response.json({ ret: 0 });
        }
        return upstream(url, init);
      });
      await runDurableObjectAlarm(fresh);
      expect(sent).toHaveLength(1);
      const text = sent[0];
      expect(text).toContain("提醒已设置");
      expect(bodies).toHaveLength(2);
      expect(JSON.stringify(bodies[1])).toContain("task-1");
      expect(JSON.stringify(bodies[1])).toContain(remindAt);
      expect((await fresh.snapshot()).currentSession?.id).toBe(originalSession);
      expect((await list(fresh, p.id)).data.total).toBe(1);
      expect(await reminders(fresh)).toHaveLength(1);
      expect((await scheduler(fresh).status()).alarmAt).toBe(Date.parse(remindAt));
      const balance = (await fresh.snapshot()).wallet.balance;
      await abortAllDurableObjects();
      expect(await send(env.ACCOUNTS.get(stub.id), "同一条消息", "restart-run")).toBe(text);
      expect(bodies).toHaveLength(2);
      expect((await env.ACCOUNTS.get(stub.id).snapshot()).wallet.balance).toBe(balance);
      await runInDurableObject(env.ACCOUNTS.get(stub.id), (_, state) => {
        expect(
          state.storage.sql.exec("SELECT count(*) n FROM usage WHERE id='restart-run'").one().n,
        ).toBe(1);
        expect(state.storage.sql.exec("SELECT count(*) n FROM personal_runs").one().n).toBe(0);
        expect(state.storage.sql.exec("SELECT count(*) n FROM personal_run_data").one().n).toBe(0);
      });
    },
  );
  it("resumes a saved tool response and a final answer without requesting either twice", async () => {
    for (const phase of ["response", "final"] as const) {
      const { stub, model } = await setup();
      await connect(stub);
      const p = await savePlugin(stub, model.id);
      const bodies = modelNetwork("chat-completions", [
        response("chat-completions", "", [{ id: "write", name: "personal_create", args: entry }]),
        response("chat-completions", "已记录午餐。"),
      ]);
      const fresh = await interruptPersonal(stub, "@助理 记午餐", (progress) =>
        phase === "response"
          ? !!progress.pendingReply?.calls.length
          : progress.finalText !== undefined,
      );
      expect(await send(fresh, "重试", "restart-run")).toContain("账目：午餐");
      expect(bodies).toHaveLength(2);
      expect((await list(fresh, p.id)).data.total).toBe(1);
    }
  });
  it("restores queried record IDs and rejects conflicting edits before committing", async () => {
    for (const conflict of [false, true]) {
      const { stub, model } = await setup();
      await connect(stub);
      const p = await savePlugin(stub, model.id);
      const record = (await save(stub, p.id, { ...note, kind: "task" })).data;
      modelNetwork("chat-completions", [
        response("chat-completions", "", [
          { id: "query", name: "personal_query", args: { kind: "task" } },
        ]),
        response("chat-completions", "", [
          {
            id: "update",
            name: "personal_update",
            args: { id: record.id, revision: record.revision, changes: { completed: true } },
          },
        ]),
        response("chat-completions", "待办已完成。"),
      ]);
      const fresh = await interruptPersonal(
        stub,
        "@助理 完成看展待办",
        (progress) => progress.rounds.length === (conflict ? 2 : 1) && !progress.pendingReply,
      );
      if (conflict) {
        expect((await save(fresh, p.id, { content: "用户新修改" }, record)).ok).toBe(true);
        const balance = (await fresh.snapshot()).wallet.balance;
        await expect(send(fresh, "重试", "restart-run")).rejects.toThrow("记录已修改");
        expect((await fresh.snapshot()).wallet.balance).toBe(balance);
        expect((await list(fresh, p.id)).data.records[0]).toMatchObject({
          completed: false,
          content: "用户新修改",
        });
      } else {
        expect(await send(fresh, "重试", "restart-run")).toContain("已完成");
        expect((await list(fresh, p.id)).data.records[0].completed).toBe(true);
      }
    }
  });
  it.each(["config", "session", "expired", "attempts"])(
    "stops recovery when %s changes without model calls or side effects",
    async (change) => {
      const { stub, model } = await setup();
      await connect(stub);
      const p = await savePlugin(stub, model.id);
      const bodies = modelNetwork("chat-completions", [
        response("chat-completions", "", [{ id: "c", name: "personal_create", args: note }]),
      ]);
      const fresh = await interruptPersonal(
        stub,
        "@助理 记看展",
        (progress) => progress.rounds.length === 1,
      );
      if (change === "config") await api(fresh, "plugin.save", { ...p, shortcut: "新助理" });
      else if (change === "session") await send(fresh, "/wx reset");
      else
        await runInDurableObject(fresh, (_, state) => {
          const store = new PersonalRunStore(state.storage);
          const saved = store.get("restart-run")!;
          store.save("restart-run", {
            ...saved,
            ...(change === "expired" ? { deadline: Date.now() - 1 } : { resumes: 3 }),
          });
        });
      const balance = (await fresh.snapshot()).wallet.balance;
      await expect(send(fresh, "重试", "restart-run")).rejects.toThrow();
      expect(bodies).toHaveLength(1);
      expect((await list(fresh, p.id)).data.total).toBe(0);
      expect((await fresh.snapshot()).wallet.balance).toBe(balance);
    },
  );
  it("reports a legacy interrupted request immediately instead of waiting for its live-looking lease", async () => {
    const { stub } = await setup();
    await connect(stub);
    await runInDurableObject(stub, (_, state) => {
      state.storage.sql.exec(
        "INSERT INTO runs (id,status,createdAt) VALUES ('old','running',?)",
        Date.now(),
      );
      state.storage.sql.exec(
        "INSERT INTO settings VALUES ('busy',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        JSON.stringify({ id: "old", time: Date.now() }),
      );
    });
    await abortAllDurableObjects();
    await expect(send(env.ACCOUNTS.get(stub.id), "原始消息", "old")).rejects.toThrow(
      "本次未扣 credits",
    );
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
  it("erases a cancelled plugin's draft and original input before another alarm runs", async () => {
    const { stub, model } = await setup();
    await connect(stub);
    const p = await savePlugin(stub, model.id);
    modelNetwork("chat-completions", [
      response("chat-completions", "", [{ id: "write", name: "personal_create", args: note }]),
    ]);
    const fresh = await interruptPersonal(
      stub,
      "@助理 记看展",
      (progress) => progress.rounds.length === 1,
    );
    expect((await api(fresh, "plugin.delete", { id: p.id })).ok).toBe(true);
    await runInDurableObject(fresh, (_, state) => {
      expect(state.storage.sql.exec("SELECT count(*) n FROM personal_run_data").one().n).toBe(0);
      expect(state.storage.sql.exec("SELECT count(*) n FROM personal_runs").one().n).toBe(0);
      expect(
        state.storage.sql.exec("SELECT state,payload FROM inbox WHERE id='restart-run'").one(),
      ).toMatchObject({ state: "done", payload: "{}" });
    });
  });
  it("registers committed reminders and replays the saved answer after restart without invoking the model", async () => {
    const { stub, model } = await setup();
    await connect(stub);
    const p = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    const remindAt = future();
    const bodies = modelNetwork("chat-completions", [
      response("chat-completions", "", [
        { id: "task", name: "personal_create", args: { ...note, kind: "reminder", remindAt } },
      ]),
      response("chat-completions", "提醒已设置。"),
    ]);
    await runInDurableObject(stub, async (instance, state) => {
      const target = instance as unknown as {
        flushReminderSchedule(): Promise<boolean>;
        processWechat(id: string, message: WxMessage, connectionId: string): Promise<string>;
      };
      const hook = vi.spyOn(target, "flushReminderSchedule").mockResolvedValue(false);
      try {
        await expect(
          target.processWechat(
            "committed",
            { item_list: [{ type: 1, text_item: { text: "@助理 一小时后提醒我看展" } }] },
            "default",
          ),
        ).rejects.toThrow("记录已保存");
      } finally {
        hook.mockRestore();
      }
      expect(
        state.storage.sql.exec("SELECT status FROM runs WHERE id='committed'").one().status,
      ).toBe("complete");
      expect(new PersonalRecordsStore(state.storage.sql).schedulePending()).toBe(true);
    });
    const balance = (await stub.snapshot()).wallet.balance;
    await abortAllDurableObjects();
    const fresh = env.ACCOUNTS.get(stub.id);
    expect(await send(fresh, "重复消息", "committed")).toContain("提醒已设置");
    expect(bodies).toHaveLength(2);
    expect((await list(fresh, p.id)).data.total).toBe(1);
    expect((await fresh.snapshot()).wallet.balance).toBe(balance);
    expect((await scheduler(fresh).status()).alarmAt).toBe(Date.parse(remindAt));
  });
  it("does not save staged changes or charge when final generation fails", async () => {
    const { stub, model } = await setup();
    const p = await savePlugin(stub, model.id);
    const before = (await stub.snapshot()).wallet.balance;
    modelNetwork("chat-completions", [
      response("chat-completions", "", [{ id: "c", name: "personal_create", args: note }]),
      new Response("upstream failed", { status: 500 }),
    ]);
    await expect(send(stub, "@助理 记一下摄影展")).rejects.toThrow();
    expect((await list(stub, p.id)).data.total).toBe(0);
    expect((await stub.snapshot()).wallet.balance).toBe(before);
  });
  it("does not save records in the web test; reports that it is a preview", async () => {
    const { stub, model } = await setup();
    const p = await savePlugin(stub, model.id);
    modelNetwork("chat-completions", [
      response("chat-completions", "", [{ id: "c", name: "personal_create", args: note }]),
      response("chat-completions", "已演示记事。"),
    ]);
    const r = await api(stub, "plugin.test", { id: p.id, query: "记一下摄影展" });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.data.text).toContain("未保存");
    expect((await list(stub, p.id)).data.total).toBe(0);
    await runInDurableObject(stub, (_, state) => {
      expect(new PersonalRecordsStore(state.storage.sql).recordState(p.id)).toEqual({
        revision: 0,
        changes: [],
      });
    });
  });
  it("uses query IDs to complete/delete records, and errors can be corrected before final reply", async () => {
    const { stub, model } = await setup();
    const p = await savePlugin(stub, model.id);
    const r = (await save(stub, p.id, { ...note, kind: "task" })).data;
    const bodies = modelNetwork("chat-completions", [
      response("chat-completions", "", [
        {
          id: "bad",
          name: "personal_update",
          args: { id: r.id, revision: 1, changes: { completed: true } },
        },
      ]),
      response("chat-completions", "", [
        { id: "query", name: "personal_query", args: { kind: "task" } },
      ]),
      response("chat-completions", "", [
        {
          id: "done",
          name: "personal_update",
          args: { id: r.id, revision: 1, changes: { completed: true } },
        },
      ]),
      response("chat-completions", "已完成。"),
    ]);
    const completed = await send(stub, "@助理 摄影展完成了");
    expect(completed).toContain("已完成");
    expect(completed).not.toContain("操作未完成");
    expect(JSON.stringify(bodies[1])).toContain("修改前请先查询");
    expect((await list(stub, p.id)).data.records[0].completed).toBe(true);
    modelNetwork("chat-completions", [
      response("chat-completions", "", [{ id: "q", name: "personal_query", args: {} }]),
      response("chat-completions", "", [
        { id: "d", name: "personal_delete", args: { id: r.id, revision: 2 } },
      ]),
      response("chat-completions", "已删除。"),
    ]);
    await send(stub, "@助理 删除摄影展待办");
    expect((await list(stub, p.id)).data.total).toBe(0);
  });
});

describe("personal reminders", () => {
  it("keeps an independent deadline while chat polling and recovery alarms change", async () => {
    const { stub, model } = await setup();
    await connect(stub, { error: "temporary error" });
    const p = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    const dueAt = Date.now() + 300000;
    expect(
      (
        await save(stub, p.id, {
          ...note,
          kind: "reminder",
          remindAt: new Date(dueAt).toISOString(),
        })
      ).ok,
    ).toBe(true);
    vi.mocked(fetch).mockImplementation(async () => Response.json({ ret: 0, msgs: [] }));
    await runInDurableObject(stub, async (instance, state) => {
      await instance.alarm();
      await state.storage.setAlarm(Date.now() + 365000);
    });
    await runInDurableObject(scheduler(stub), async (_, state) => {
      expect(await state.storage.getAlarm()).toBe(dueAt);
    });
    await abortAllDurableObjects();
    await runInDurableObject(scheduler(stub), async (_, state) => {
      expect(await state.storage.getAlarm()).toBe(dueAt);
    });
    await due(env.ACCOUNTS.get(stub.id));
    await runDurableObjectAlarm(scheduler(stub));
    expect((await reminders(env.ACCOUNTS.get(stub.id)))[0].state).toBe("sent");
  });
  it("reconciles a persisted outbox after a lost scheduler acknowledgement", async () => {
    const { stub, model } = await setup();
    await connect(stub);
    const p = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    const dueAt = Date.now() + 300000;
    await save(stub, p.id, { ...note, kind: "reminder", remindAt: new Date(dueAt).toISOString() });
    await runInDurableObject(stub, (_, state) => {
      state.storage.sql.exec("UPDATE personal_reminder_schedule SET acknowledged=0");
    });
    await abortAllDurableObjects();
    await env.ACCOUNTS.get(stub.id).registerPersonalReminders();
    await runInDurableObject(scheduler(stub), async (_, state) => {
      expect(await state.storage.getAlarm()).toBe(dueAt);
    });
    await runInDurableObject(env.ACCOUNTS.get(stub.id), (_, state) => {
      const store = new PersonalRecordsStore(state.storage.sql);
      expect(store.schedulePending()).toBe(false);
    });
  });
  it("requires a connected destination and future time before staging reminders", async () => {
    const { stub, model } = await setup();
    const p = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    const task = { ...note, kind: "reminder", remindAt: future(), repeat: "daily" };
    expect((await save(stub, p.id, task)).error).toBe("reminder_link");
    await connect(stub);
    expect((await save(stub, p.id, { ...task, remindAt: "2020-01-01T00:00:00+08:00" })).error).toBe(
      "reminder_time",
    );
    expect((await save(stub, p.id, task)).ok).toBe(true);
    expect(await reminders(stub)).toHaveLength(1);
  });
  it("repairs a missing scheduler alarm even when the account already acknowledged its schedule", async () => {
    const { stub, model } = await setup();
    await connect(stub);
    const p = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    const remindAt = future();
    await save(stub, p.id, { ...note, kind: "reminder", remindAt });
    await runInDurableObject(scheduler(stub), async (_, state) => {
      await state.storage.deleteAlarm();
    });
    await stub.registerPersonalReminders();
    expect((await scheduler(stub).status()).alarmAt).toBe(Date.parse(remindAt));
  });
  it("retains an unsynchronized reminder across restart without reporting a false success", async () => {
    const { stub, model } = await setup();
    await connect(stub);
    const p = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    const remindAt = future();
    await runInDurableObject(stub, async (instance, state) => {
      const flush = vi
        .spyOn(
          instance as unknown as { flushReminderSchedule(): Promise<boolean> },
          "flushReminderSchedule",
        )
        .mockResolvedValue(false);
      try {
        const result = JSON.parse(
          await instance.api("personal.save", {
            pluginId: p.id,
            record: { ...note, kind: "reminder", remindAt },
          }),
        );
        expect(result.ok).toBe(false);
        expect(result.error).toBe("reminder_sync_pending");
        expect(new PersonalRecordsStore(state.storage.sql).schedulePending()).toBe(true);
        expect(state.storage.sql.exec("SELECT count(*) n FROM personal_reminders").one().n).toBe(1);
      } finally {
        flush.mockRestore();
      }
    });
    await abortAllDurableObjects();
    await env.ACCOUNTS.get(stub.id).registerPersonalReminders();
    expect((await scheduler(stub).status()).alarmAt).toBe(Date.parse(remindAt));
    expect(await reminders(env.ACCOUNTS.get(stub.id))).toHaveLength(1);
  });
  it("imports legacy schedules without changing their deadline or receipt", async () => {
    const { stub, model } = await setup();
    await connect(stub);
    const p = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    const remindAt = future();
    await save(stub, p.id, { ...note, kind: "reminder", remindAt });
    await runInDurableObject(stub, (_, state) => {
      state.storage.sql.exec("DROP TABLE personal_reminder_schedule");
    });
    await runInDurableObject(scheduler(stub), async (_, state) => {
      await state.storage.deleteAll();
    });
    await abortAllDurableObjects();
    const fresh = env.ACCOUNTS.get(stub.id);
    await fresh.registerPersonalReminders();
    expect((await scheduler(stub).status()).alarmAt).toBe(Date.parse(remindAt));
    expect((await reminders(fresh))[0].attempts).toBe(0);
  });
  it("delivers a sourced reminder once; retry IDs survive restart, and retries never bill credits", async () => {
    const { stub, model } = await setup();
    await connect(stub);
    const p = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    await save(stub, p.id, { ...note, kind: "reminder", remindAt: future() });
    await due(stub);
    const sent: { client_id: string; item_list: { text_item: { text: string } }[] }[] = [];
    let fail = true;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      expect(String(url)).toContain("sendmessage");
      sent.push(JSON.parse(String(init?.body)).msg);
      return Response.json(fail ? { ret: 1 } : { ret: 0 });
    });
    const balance = (await stub.snapshot()).wallet.balance;
    await deliver(stub);
    expect((await reminders(stub))[0].state).toBe("retry");
    await abortAllDurableObjects();
    const fresh = env.ACCOUNTS.get(stub.id);
    await runInDurableObject(fresh, (_, state) =>
      state.storage.sql.exec("UPDATE personal_reminders SET retryAt=0"),
    );
    fail = false;
    await deliver(fresh);
    await deliver(fresh);
    expect(sent).toHaveLength(2);
    expect(sent[0].client_id).toBe(sent[1].client_id);
    expect(sent[1].item_list[0].text_item.text).toMatch(/消息来自.*个人助理/);
    expect(sent[1].item_list[0].text_item.text).toContain("/use 助理");
    expect(sent[1].item_list[0].text_item.text).toContain("──────────");
    expect((await reminders(fresh))[0].state).toBe("sent");
    expect((await fresh.snapshot()).wallet.balance).toBe(balance);
  });
  it("pauses offline/disabled reminders, blocks changed bindings, and cancellation/deletion removes schedules", async () => {
    const { stub, model } = await setup();
    await connect(stub);
    const p = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    const r = (await save(stub, p.id, { ...note, kind: "reminder", remindAt: future() })).data;
    await due(stub);
    await connect(stub, { contextToken: "" });
    await deliver(stub);
    expect((await reminders(stub))[0].state).toBe("waiting_context");
    await due(stub);
    await connect(stub, { status: "disconnected" });
    await deliver(stub);
    expect((await reminders(stub))[0].state).toBe("paused");
    await due(stub);
    await connect(stub, { generation: "g2" });
    await deliver(stub);
    expect((await reminders(stub))[0].state).toBe("blocked");
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect((await save(stub, p.id, { reminderEnabled: false }, r)).ok).toBe(true);
    expect(await reminders(stub)).toHaveLength(0);
    await save(stub, p.id, { ...note, kind: "reminder", remindAt: future() });
    expect((await api(stub, "plugin.delete", { id: p.id })).ok).toBe(true);
    expect(await reminders(stub)).toHaveLength(0);
    await runInDurableObject(stub, (_, state) =>
      expect(state.storage.sql.exec("SELECT count(*) n FROM personal_records").one().n).toBe(0),
    );
  });
  it("keeps the first personal assistant writable and delivers reminders on Free", async () => {
    const { stub, model } = await setup();
    await connect(stub);
    await runInDurableObject(stub, (_, state) => {
      state.storage.sql.exec("UPDATE settings SET value='0' WHERE key='planUntil'");
    });
    const p = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    expect((await save(stub, p.id, note)).ok).toBe(true);
    expect((await save(stub, p.id, { ...note, kind: "reminder", remindAt: future() })).ok).toBe(
      true,
    );
    vi.mocked(fetch).mockImplementation(async () => Response.json({ ret: 0 }));
    await due(stub);
    await deliver(stub);
    expect(vi.mocked(fetch)).toHaveBeenCalled();
    expect((await reminders(stub))[0].state).toBe("sent");
  });
  it("pauses reminders for disabled and expired Plus, resumes after recovery", async () => {
    const { stub, model } = await setup();
    await connect(stub);
    expect(
      (
        await api(stub, "plugin.save", {
          pluginId: "wechatai/openclaw",
          name: "首个插件",
          shortcut: "first",
        })
      ).ok,
    ).toBe(true);
    const p = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    await save(stub, p.id, { ...note, kind: "reminder", remindAt: future(), repeat: "weekly" });
    await due(stub);
    await api(stub, "plugin.save", { ...p, enabled: false });
    await deliver(stub);
    expect((await reminders(stub))[0].state).toBe("paused");
    await api(stub, "plugin.save", { ...p, enabled: true });
    await runInDurableObject(stub, (_, state) => {
      state.storage.sql.exec("UPDATE settings SET value='0' WHERE key='planUntil'");
    });
    await due(stub);
    await deliver(stub);
    expect((await reminders(stub))[0].state).toBe("paused");
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    await stub.applyPayment({
      id: "renewal",
      kind: "subscription",
      units: 0,
      expires: Date.now() + 86400000,
    });
    vi.mocked(fetch).mockImplementation(async () => Response.json({ ret: 0 }));
    await due(stub);
    await deliver(stub);
    const reminder = (await reminders(stub))[0];
    expect(reminder.state).toBe("scheduled");
    expect(reminder.repeatMs).toBe(7 * 86400000);
    expect(reminder.dueAt).toBeGreaterThan(Date.now());
  });
  it("advances daily/weekly reminders without replaying missed occurrences", async () => {
    const { stub, model } = await setup();
    await connect(stub);
    const p = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    await save(stub, p.id, { ...note, kind: "reminder", remindAt: future(), repeat: "daily" });
    await due(stub, 3 * 86400000);
    await deliver(stub);
    const r = (await reminders(stub))[0];
    expect(r.state).toBe("scheduled");
    expect(r.dueAt).toBeGreaterThan(Date.now());
    expect(r.dueAt).toBeLessThanOrEqual(Date.now() + 86400000);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
  it("dispatches through the scheduler while the chat alarm is still waiting", async () => {
    const { stub, model } = await setup();
    await connect(stub);
    const p = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    await save(stub, p.id, { ...note, kind: "reminder", remindAt: future() });
    await due(stub);
    let entered!: () => void;
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).includes("getupdates")) {
        entered();
        await hold;
      }
      return Response.json({ ret: 0, msgs: [] });
    });
    let chatFinished = false;
    const chat = runDurableObjectAlarm(stub).then(() => {
      chatFinished = true;
    });
    try {
      await waiting;
      await runDurableObjectAlarm(scheduler(stub));
      expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("sendmessage"))).toBe(
        true,
      );
      expect(chatFinished).toBe(false);
    } finally {
      release();
      await chat;
    }
    expect((await reminders(env.ACCOUNTS.get(stub.id)))[0].state).toBe("sent");
  });
});
