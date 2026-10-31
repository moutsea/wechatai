import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { PersonalRecordsStore } from "../src/server/personal-records";
import { PersonalRunStore } from "../src/server/personal-runs";
import type { PersonalAssistantProgress } from "../src/server/plugins/personal-assistant";
import { beijingDate } from "../src/shared/personal-assistant";
import {
  api,
  connect,
  deliver,
  due,
  entry,
  future,
  interruptPersonal,
  modelNetwork,
  note,
  response,
  reminders,
  save,
  savePlugin,
  send,
  setup,
  systemText,
} from "./personal-assistant-helpers";

async function isolated() {
  const { stub, model } = await setup();
  const personal = await savePlugin(stub, model.id, { recordScope: "connection" });
  const b = await api(stub, "wechat.create", { name: "微信 B" });
  expect(b.ok).toBe(true);
  const linkB = b.data.selectedConnectionId as string;
  await connect(stub, { contextToken: "context-a" });
  await connect(stub, { contextToken: "context-b" }, linkB);
  const saveAt = (connectionId: string, record: unknown, extra = {}) =>
    api(stub, "personal.save", { pluginId: personal.id, connectionId, record, ...extra });
  const listAt = (connectionId: string, query = {}) =>
    api(stub, "personal.list", { pluginId: personal.id, connectionId, query });
  return { stub, model, personal, linkB, saveAt, listAt };
}

describe("personal records across WeChat links", () => {
  it.each(["shared", "connection"] as const)(
    "can save isolation after deleting the old recipient from a %s configuration",
    async (recordScope) => {
      const { stub, model } = await setup();
      const second = await api(stub, "wechat.create", { name: "微信 B" });
      expect(second.ok).toBe(true);
      const linkB = second.data.selectedConnectionId as string;
      const personal = await savePlugin(stub, model.id, {
        recordScope,
        reminderConnectionId: "default",
      });
      expect((await api(stub, "wechat.delete", { id: "default" })).ok).toBe(true);
      const changed = await api(stub, "plugin.save", {
        ...personal,
        name: "改名后的助理",
        recordScope: "connection",
      });
      expect(changed).toMatchObject({
        ok: true,
        data: { name: "改名后的助理", recordScope: "connection" },
      });
      expect(
        await api(stub, "plugin.save", { ...changed.data, recordScope: "shared" }),
      ).toMatchObject({ ok: false, error: "connection_missing" });
      expect(
        await api(stub, "plugin.save", {
          ...changed.data,
          recordScope: "shared",
          reminderConnectionId: linkB,
        }),
      ).toMatchObject({ ok: true, data: { recordScope: "shared", reminderConnectionId: linkB } });
    },
  );

  it.each(["legacy", "explicit_shared", "changed_scope", "changed_currency"] as const)(
    "validates legacy recovery against %s configuration without dropping real changes",
    async (configuration) => {
      const { stub, model } = await setup();
      await connect(stub);
      const personal = await savePlugin(stub, model.id);
      const bodies = modelNetwork("chat-completions", [
        response("chat-completions", "", [{ id: "write", name: "personal_create", args: note }]),
        response("chat-completions", "已记下"),
      ]);
      const fresh = await interruptPersonal(
        stub,
        "@助理 记看展",
        (progress) => progress.rounds.length === 1,
      );
      await runInDurableObject(fresh, (_, state) => {
        const store = new PersonalRunStore(state.storage);
        const saved = store.get("restart-run")!;
        const oldConfig = JSON.parse(saved.pluginConfig);
        delete oldConfig.recordScope;
        // Previous releases omitted the default from both configuration and draft.
        store.save("restart-run", { ...saved, pluginConfig: JSON.stringify(oldConfig) });
        const progress = store.read<PersonalAssistantProgress>("restart-run", "progress")!;
        delete progress.draft.connectionId;
        store.write("restart-run", "progress", progress);
        const current =
          configuration === "legacy"
            ? oldConfig
            : configuration === "changed_currency"
              ? { ...oldConfig, currency: "USD" }
              : {
                  recordScope: configuration === "changed_scope" ? "connection" : "shared",
                  ...oldConfig,
                };
        state.storage.sql.exec(
          "UPDATE plugins SET data=? WHERE id=?",
          JSON.stringify(current),
          personal.id,
        );
      });
      const balance = (await fresh.snapshot()).wallet.balance;
      if (configuration.startsWith("changed_")) {
        await expect(send(fresh, "重试", "restart-run")).rejects.toMatchObject({
          code: "personal_recovery_changed",
        });
        expect(bodies).toHaveLength(1);
        expect((await fresh.snapshot()).wallet.balance).toBe(balance);
      } else {
        const reply = await send(fresh, "重试", "restart-run");
        expect(reply).toContain("摄影展");
        const after = (await fresh.snapshot()).wallet.balance;
        expect(await send(fresh, "重试", "restart-run")).toBe(reply);
        expect((await fresh.snapshot()).wallet.balance).toBe(after);
        expect(bodies).toHaveLength(2);
      }
      expect(
        (await api(fresh, "personal.list", { pluginId: personal.id, connectionId: "" })).data.total,
      ).toBe(configuration.startsWith("changed_") ? 0 : 1);
      expect(
        (await api(fresh, "personal.list", { pluginId: personal.id, connectionId: "default" })).data
          .total,
      ).toBe(0);
    },
  );

  it("keeps an emptied historical scope readable without accepting unknown scopes", async () => {
    const { stub, model, personal, linkB, saveAt, listAt } = await isolated();
    const created = await saveAt("default", note);
    expect(created.ok).toBe(true);
    expect((await saveAt(linkB, { ...note, title: "B 的记录" })).ok).toBe(true);
    expect((await api(stub, "wechat.delete", { id: "default" })).ok).toBe(true);
    expect(
      await api(stub, "personal.delete", {
        pluginId: personal.id,
        connectionId: "default",
        recordId: created.data.id,
        revision: created.data.revision,
      }),
    ).toMatchObject({ ok: true });
    expect(await listAt("default")).toMatchObject({
      ok: true,
      data: { records: [], total: 0, totals: [] },
    });
    expect((await api(stub, "personal.scopes", { pluginId: personal.id })).data).toContain(
      "default",
    );
    expect((await listAt(linkB)).data.records[0].title).toBe("B 的记录");
    const other = await savePlugin(stub, model.id, { shortcut: "另一个助理" });
    for (const [pluginId, connectionId] of [
      [personal.id, crypto.randomUUID()],
      [other.id, "default"],
    ]) {
      for (const action of ["personal.list", "personal.save"])
        expect(await api(stub, action, { pluginId, connectionId, record: note })).toMatchObject({
          ok: false,
          error: "connection_missing",
        });
    }
  });

  it("does not restore a different link's staged operations or state revision", async () => {
    const { stub, personal, linkB } = await isolated();
    await runInDurableObject(stub, (_, state) => {
      const store = new PersonalRecordsStore(state.storage.sql);
      const a = store.draft(personal.id, true, "CNY", "default");
      const b = store.draft(personal.id, true, "CNY", linkB);
      a.save({ ...note, title: "staged-only-in-a" });
      expect(() => b.restore(a.snapshot())).toThrow("记录分类已更新");
      state.storage.transactionSync(() =>
        store.commit(personal.id, a.changes, null, "assistant", "default"),
      );
      expect(() => b.assertCurrent()).not.toThrow();
      expect(b.currentContext().records.total).toBe(0);
    });
  });

  it("blocks the rebound link's reminders while continuing delivery to another link", async () => {
    const { stub, linkB, saveAt } = await isolated();
    for (const connectionId of ["default", linkB])
      expect(
        (await saveAt(connectionId, { ...note, kind: "reminder", remindAt: future() })).ok,
      ).toBe(true);
    await connect(stub, { generation: "g2", contextToken: "new-owner" });
    const contexts: string[] = [];
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      contexts.push(JSON.parse(String(init?.body)).msg.context_token);
      return Response.json({ ret: 0 });
    });
    await due(stub);
    await deliver(stub);
    expect(contexts).toEqual(["context-b"]);
    expect((await reminders(stub)).find((r) => r.connectionId === "default")!.state).toBe(
      "blocked",
    );
  });

  it("isolates queries, accounting totals, state receipts, updates and deletes", async () => {
    const { stub, personal, linkB, saveAt, listAt } = await isolated();
    const record = (await saveAt("default", { ...note, title: "a-private-title" })).data;
    expect((await saveAt("default", { ...entry, amount: "80.00" })).ok).toBe(true);
    expect((await saveAt(linkB, { ...entry, amount: "12.00" })).ok).toBe(true);
    expect((await listAt("default")).data.totals[0].expense).toBe("80.00");
    expect((await listAt(linkB)).data.totals[0].expense).toBe("12.00");
    expect((await listAt(linkB, { query: record.id })).data.total).toBe(0);
    expect(
      await saveAt(
        linkB,
        { title: "cross-link-update" },
        { recordId: record.id, revision: record.revision },
      ),
    ).toMatchObject({ ok: false, error: "record_missing" });
    expect(
      await api(stub, "personal.delete", {
        pluginId: personal.id,
        connectionId: linkB,
        recordId: record.id,
        revision: record.revision,
      }),
    ).toMatchObject({ ok: false, error: "record_missing" });
    const bodies = modelNetwork("chat-completions", [
      response("chat-completions", "", [
        { id: "query-a", name: "personal_query", args: { query: record.id } },
      ]),
      response("chat-completions", "", [
        {
          id: "delete-a",
          name: "personal_delete",
          args: { id: record.id, revision: record.revision },
        },
      ]),
      response("chat-completions", "已删除"),
    ]);
    await send(stub, "/use 助理", undefined, linkB);
    expect(await send(stub, "查找并删除另一条链接的记录", undefined, linkB)).toContain(
      "未保存记录",
    );
    for (const body of bodies) expect(systemText(body)).not.toContain("a-private-title");
    expect((await listAt("default", { query: record.id })).data.records[0].title).toBe(
      "a-private-title",
    );
  });

  it("delivers each link's reminder and daily summary only with its own records", async () => {
    const { stub, personal, linkB, saveAt } = await isolated();
    for (const [connectionId, label] of [
      ["default", "a"],
      [linkB, "b"],
    ]) {
      for (const record of [
        { ...note, kind: "task", title: `${label}-private-task`, date: beijingDate() },
        { ...note, kind: "reminder", title: `${label}-private-reminder`, remindAt: future() },
        {
          ...note,
          kind: "reminder",
          reminderType: "daily_tasks",
          title: "今日待办",
          remindAt: future(),
          repeat: "daily",
        },
      ])
        expect((await saveAt(connectionId, record)).ok).toBe(true);
    }
    // Mode changes preserve existing reminders and their original source scope.
    expect((await api(stub, "plugin.save", { ...personal, recordScope: "shared" })).ok).toBe(true);
    const pending = await reminders(stub);
    expect(pending).toHaveLength(4);
    expect(pending.every((r) => r.connectionId === r.recordConnectionId)).toBe(true);
    const sent: { context: string; text: string }[] = [];
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      const { msg } = JSON.parse(String(init?.body));
      sent.push({ context: msg.context_token, text: msg.item_list[0].text_item.text });
      return Response.json({ ret: 0 });
    });
    await due(stub);
    await deliver(stub);
    expect(sent).toHaveLength(4);
    for (const label of ["a", "b"]) {
      const texts = sent
        .filter((m) => m.context === `context-${label}`)
        .map((m) => m.text)
        .join("\n");
      expect(texts).toContain(`${label}-private-task`);
      expect(texts).toContain(`${label}-private-reminder`);
      expect(texts).not.toContain(`${label === "a" ? "b" : "a"}-private-`);
    }
  });

  it("resets one-off assistant history and summaries on mode changes while preserving all libraries", async () => {
    const { stub, model, personal, linkB, saveAt, listAt } = await isolated();
    const shared = await api(stub, "plugin.save", { ...personal, recordScope: "shared" });
    expect(shared.ok).toBe(true);
    await save(stub, personal.id, { ...note, title: "old-shared-marker" });
    const ds = await api(stub, "plugin.save", {
      pluginId: "wechatai/web-research",
      name: "DS Chat",
      shortcut: "ds",
      modelId: model.id,
      searchProvider: "tavily",
      searchEndpoint: "https://search.example.com",
      apiKey: "test-search-key",
    });
    expect(ds.ok).toBe(true);
    const bodies = modelNetwork("chat-completions", [
      response("chat-completions", "old-shared-marker"),
    ]);
    await send(stub, "/use ds", undefined, linkB);
    await send(stub, "@助理 查看记录", undefined, linkB);
    const sessionId = (await stub.snapshot()).currentSession!.id;
    await runInDurableObject(stub, (_, state) => {
      const through = state.storage.sql
        .exec<{ id: number }>("SELECT MAX(id) id FROM messages WHERE sessionId=?", sessionId)
        .one().id;
      state.storage.sql.exec(
        "INSERT INTO context_summaries VALUES (?,?,?,?)",
        sessionId,
        "old-shared-marker",
        through,
        Date.now(),
      );
    });
    expect((await api(stub, "plugin.save", personal)).ok).toBe(true);
    await send(stub, "你好", undefined, linkB);
    expect(JSON.stringify(bodies.at(-1))).not.toContain("old-shared-marker");
    expect(
      (await api(stub, "session.messages", { id: sessionId })).data.some(
        (m: { content: string }) => m.content === "old-shared-marker",
      ),
    ).toBe(true);
    expect((await listAt("")).data.total).toBe(1);
    expect((await listAt(linkB)).data.total).toBe(0);
    expect((await saveAt("default", { ...note, title: "isolated-marker" })).ok).toBe(true);
    expect((await api(stub, "plugin.save", shared.data)).ok).toBe(true);
    expect((await listAt("")).data.records[0].title).toBe("old-shared-marker");
    expect((await listAt("default")).data.records[0].title).toBe("isolated-marker");
  });

  it("preserves legacy records and reminder recipients through an idempotent schema migration", async () => {
    const { stub, model } = await setup();
    await connect(stub);
    const personal = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    await save(stub, personal.id, note);
    await save(stub, personal.id, { ...note, kind: "reminder", remindAt: future() });
    const recordsBefore = await api(stub, "personal.list", { pluginId: personal.id });
    const remindersBefore = await reminders(stub);
    await runInDurableObject(stub, (_, state) => {
      state.storage.transactionSync(() => {
        state.storage.sql.exec(`
          DROP INDEX personal_daily_tasks_unique;
          DROP INDEX personal_records_scope;
          ALTER TABLE personal_records DROP COLUMN connectionId;
          ALTER TABLE personal_reminders DROP COLUMN recordConnectionId;
          ALTER TABLE personal_record_state RENAME TO scoped_state;
          CREATE TABLE personal_record_state (pluginId TEXT PRIMARY KEY, revision INTEGER NOT NULL, changes TEXT NOT NULL);
          INSERT INTO personal_record_state SELECT pluginId,revision,changes FROM scoped_state;
          DROP TABLE scoped_state;
          CREATE UNIQUE INDEX personal_daily_tasks_unique ON personal_records(pluginId) WHERE kind='reminder' AND json_extract(data,'$.reminderType')='daily_tasks';
          DELETE FROM personal_record_migrations WHERE version=3;
        `);
        const store = new PersonalRecordsStore(state.storage.sql);
        store.init();
        store.init();
        expect(store.query(personal.id, {}).total).toBe(2);
        expect(store.query(personal.id, {}, undefined, "default").total).toBe(0);
      });
    });
    expect(await api(stub, "personal.list", { pluginId: personal.id })).toEqual(recordsBefore);
    expect(await reminders(stub)).toEqual(remindersBefore);
  });
  it.each(["shared", "connection"] as const)(
    "uses %s record scope with independent link histories",
    async (recordScope) => {
      const { stub, model } = await setup();
      const personal = await savePlugin(stub, model.id, { recordScope });
      const second = await api(stub, "wechat.create", { name: "微信 B" });
      expect(second.ok).toBe(true);
      const linkB = second.data.selectedConnectionId as string;
      const privateNote = { ...note, title: "link-a-only-note-marker" };
      const bodies = modelNetwork("chat-completions", [
        response("chat-completions", "", [
          { id: "create-on-a", name: "personal_create", args: privateNote },
        ]),
        response("chat-completions", "已保存"),
        response("chat-completions", "你好"),
      ]);
      await send(stub, "/use 助理");
      await send(stub, "link-a-conversation-marker：记下这件事");
      const a = (await stub.snapshot()).connections.find((link) => link.id === "default")!;
      await send(stub, "/use 助理", undefined, linkB);
      await send(stub, "你好", undefined, linkB);
      const b = (await stub.snapshot()).connections.find((link) => link.id === linkB)!;
      expect(a.currentSessionId).not.toBe(b.currentSessionId);
      expect(bodies).toHaveLength(3);
      expect(JSON.stringify(bodies[2])).not.toContain("link-a-conversation-marker");
      expect(systemText(bodies[2]).includes(privateNote.title)).toBe(recordScope === "shared");
      expect((await api(stub, "personal.list", { pluginId: personal.id })).data.total).toBe(
        recordScope === "shared" ? 1 : 0,
      );
      expect(
        (
          await api(stub, "personal.list", {
            pluginId: personal.id,
            connectionId: recordScope === "connection" ? "default" : "",
          })
        ).data.total,
      ).toBe(1);
    },
  );
});
