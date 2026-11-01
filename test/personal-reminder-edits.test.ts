import { abortAllDurableObjects, env, runInDurableObject } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import { beijingDate } from "../src/shared/personal-assistant";
import type { WxMessage } from "../src/server/wechat";
import {
  connect,
  list,
  reminders,
  response,
  save,
  savePlugin,
  setup,
} from "./personal-assistant-helpers";

const at = Date.parse("2026-11-20T08:00:00+08:00");
const day = 86400000;

it.each(
  ["same-binding", "rebound-scheduled", "rebound-blocked"].flatMap((scenario) =>
    ["daily", "weekly"].map((repeat) => ({
      scenario,
      repeat,
      interval: repeat === "daily" ? day : 7 * day,
    })),
  ),
)(
  "accepts an equivalent timestamp representation for $scenario/$repeat",
  async ({ scenario, repeat, interval }) => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(at - 60000);
    const { stub, model } = await setup("chat-completions", false);
    await connect(stub);
    const plugin = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    const created = await save(stub, plugin.id, {
      kind: "reminder",
      title: "每天拿牛奶",
      date: beijingDate(at),
      remindAt: new Date(at).toISOString(),
      repeat,
    });
    expect(created.ok).toBe(true);
    vi.mocked(fetch).mockImplementation(async () => Response.json({ ret: 0 }));
    clock.mockReturnValue(at + 1000);
    await stub.dispatchPersonalReminders();
    if (scenario !== "same-binding") await connect(stub, { generation: "g2" });
    if (scenario === "rebound-blocked") {
      clock.mockReturnValue(at + interval + 1000);
      await stub.dispatchPersonalReminders();
      expect((await reminders(stub))[0].state).toBe("blocked");
    }
    const before = (await reminders(stub))[0];
    const result = await save(
      stub,
      plugin.id,
      {
        title: "每天拿两瓶牛奶",
        remindAt: "2026-11-20T08:00:00+08:00",
      },
      created.data,
    );
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
    const after = (await reminders(stub))[0];
    expect(after.dueAt).toBe(scenario === "rebound-blocked" ? at + 2 * interval : at + interval);
    if (scenario === "same-binding") expect(after.id).toBe(before.id);
    else expect(after.generation).toBe("g2");
  },
);

it.each([false, true])(
  "reports sent status when delivery completes while the assistant is editing the reminder (retry: %s)",
  async (retry) => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(at - 10000);
    const { stub, model } = await setup("chat-completions", false);
    await connect(stub);
    const plugin = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    const created = await save(stub, plugin.id, {
      kind: "reminder",
      title: "拿牛奶",
      date: beijingDate(at),
      remindAt: new Date(at).toISOString(),
    });
    expect(created.ok).toBe(true);
    if (retry) {
      vi.mocked(fetch).mockImplementation(async () => new Response("denied", { status: 403 }));
      clock.mockReturnValue(at + 1000);
      await stub.dispatchPersonalReminders();
      expect((await reminders(stub))[0].state).toBe("retry");
    }
    const replies = [
      response("chat-completions", "", [
        { id: "query", name: "personal_query", args: { kind: "reminder" } },
      ]),
      response("chat-completions", "", [
        {
          id: "update",
          name: "personal_update",
          args: {
            id: created.data.id,
            revision: created.data.revision,
            changes: { content: "顺便拿袋子" },
          },
        },
      ]),
      response("chat-completions", "已改好"),
    ];
    let sends = 0;
    const reply = await runInDurableObject(stub, async (instance) => {
      vi.mocked(fetch).mockImplementation(async (url) => {
        if (String(url).includes("cloudflare-dns.com"))
          return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
        if (String(url).includes("sendmessage")) {
          sends++;
          return Response.json({ ret: 0 });
        }
        expect(String(url)).toContain("llm.example.com");
        if (replies.length === 1) {
          clock.mockReturnValue(at + 6000);
          await instance.dispatchPersonalReminders();
        }
        return Response.json(replies.shift());
      });
      return (
        instance as unknown as {
          processWechat(id: string, message: WxMessage, connectionId: string): Promise<string>;
        }
      ).processWechat(
        "concurrent-reminder-edit",
        { item_list: [{ type: 1, text_item: { text: "@助理 给拿牛奶提醒加上备注，顺便拿袋子" } }] },
        "default",
      );
    });
    expect(sends).toBe(1);
    expect((await list(stub, plugin.id)).data.records[0]).toMatchObject({
      reminderState: "sent",
      content: "顺便拿袋子",
    });
    expect(reply).not.toContain("等待微信连接恢复或重试");
    expect(reply).toContain("提醒：已发送");
  },
);

it.each(["2026-11-20T08:00:00+08:00", "2026-11-20T00:00:00Z"])(
  "preserves a pending delivery and its retry progress when rewriting %s as canonical UTC",
  async (storedTime) => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(at - 60000);
    const { stub, model } = await setup("chat-completions", false);
    await connect(stub);
    const plugin = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    const created = await save(stub, plugin.id, {
      kind: "reminder",
      title: "拿牛奶",
      date: beijingDate(at),
      remindAt: storedTime,
    });
    expect(created.ok).toBe(true);
    const original = (await reminders(stub))[0];
    const updated = await save(
      stub,
      plugin.id,
      { remindAt: new Date(at).toISOString() },
      created.data,
    );
    expect(updated.ok).toBe(true);
    expect((await reminders(stub))[0]).toEqual({ ...original, revision: updated.data.revision });
    const ids: string[] = [];
    vi.mocked(fetch).mockImplementation(async (_, init) => {
      ids.push(JSON.parse(String(init?.body)).msg.client_id);
      return Response.json({ ret: ids.length === 1 ? -2 : 0 });
    });
    clock.mockReturnValue(at + 1000);
    await stub.dispatchPersonalReminders();
    const failed = (await reminders(stub))[0];
    const edited = await save(
      stub,
      plugin.id,
      { title: "拿两瓶牛奶", remindAt: storedTime },
      updated.data,
    );
    expect(edited.ok).toBe(true);
    expect((await reminders(stub))[0]).toEqual({ ...failed, revision: edited.data.revision });
    await abortAllDurableObjects();
    const fresh = env.ACCOUNTS.get(stub.id);
    clock.mockReturnValue(at + 6000);
    await fresh.dispatchPersonalReminders();
    await fresh.dispatchPersonalReminders();
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(1);
    expect((await reminders(fresh))[0]).toMatchObject({ state: "sent", attempts: 2 });
  },
);

it("still rejects an actual past time change and replaces the schedule for a future change", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(at - 60000);
  const { stub, model } = await setup("chat-completions", false);
  await connect(stub);
  const plugin = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
  const created = await save(stub, plugin.id, {
    kind: "reminder",
    title: "拿牛奶",
    date: beijingDate(at),
    remindAt: new Date(at).toISOString(),
    repeat: "daily",
  });
  expect(created.ok).toBe(true);
  clock.mockReturnValue(at + 1000);
  vi.mocked(fetch).mockImplementation(async () => Response.json({ ret: -2 }));
  await stub.dispatchPersonalReminders();
  const before = (await reminders(stub))[0];
  expect(
    await save(stub, plugin.id, { remindAt: new Date(at + 1).toISOString() }, created.data),
  ).toMatchObject({ ok: false, error: "reminder_time" });
  expect((await reminders(stub))[0]).toEqual(before);
  expect(
    (await save(stub, plugin.id, { remindAt: new Date(at + 3600000).toISOString() }, created.data))
      .ok,
  ).toBe(true);
  const renewed = (await reminders(stub))[0];
  expect(renewed).toMatchObject({
    state: "scheduled",
    dueAt: at + 3600000,
    attempts: 0,
    lastFailure: null,
  });
  expect(renewed.id).not.toBe(before.id);
});

it("does not replay an elapsed one-off after rebind even if its timestamp representation changes", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(at - 60000);
  const { stub, model } = await setup("chat-completions", false);
  await connect(stub);
  const plugin = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
  const created = await save(stub, plugin.id, {
    kind: "reminder",
    title: "拿牛奶",
    date: beijingDate(at),
    remindAt: new Date(at).toISOString(),
  });
  expect(created.ok).toBe(true);
  clock.mockReturnValue(at + 1000);
  vi.mocked(fetch).mockImplementation(async () => Response.json({ ret: 0 }));
  await stub.dispatchPersonalReminders();
  const before = await reminders(stub);
  await connect(stub, { generation: "g2" });
  expect(
    await save(stub, plugin.id, { remindAt: "2026-11-20T08:00:00+08:00" }, created.data),
  ).toMatchObject({ ok: false, error: "reminder_time" });
  expect(await reminders(stub)).toEqual(before);
});
