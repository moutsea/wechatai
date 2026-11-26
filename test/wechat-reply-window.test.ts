import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import type { WxMessage } from "../src/server/wechat";
import { WECHAT_REPLY_WINDOW_MS, WECHAT_WINDOW_NUDGE_MS } from "../src/shared/wechat-readiness";
import {
  api,
  connect,
  deliver,
  due,
  reminders,
  save,
  savePlugin,
  setup,
} from "./personal-assistant-helpers";

type Account = Awaited<ReturnType<typeof setup>>["stub"];
const hour = 3600_000;

function wechat(reply: () => Response = () => Response.json({ ret: 0 })) {
  const sent: { clientId: string; text: string }[] = [];
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    const request = new Request(url, init);
    if (!request.url.endsWith("sendmessage")) throw new Error(`Unexpected ${request.url}`);
    const { msg } = await request.json<{
      msg: { client_id: string; item_list: { text_item: { text: string } }[] };
    }>();
    sent.push({ clientId: msg.client_id, text: msg.item_list[0].text_item.text });
    return reply();
  });
  return sent;
}
async function remind(stub: Account, pluginId: string, at: number, title = "交房租") {
  const saved = await save(stub, pluginId, {
    kind: "reminder",
    title,
    date: new Date(at + 8 * hour).toISOString().slice(0, 10),
    remindAt: new Date(at).toISOString(),
  });
  expect(saved.ok).toBe(true);
}
async function withReminder(lastSeenAgo: number, remindIn = 2 * 86400000, plus = false) {
  const { stub, model } = await setup("chat-completions", plus);
  await connect(stub, { lastSeen: Date.now() - lastSeenAgo });
  const plugin = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
  const at = Date.now() + remindIn;
  await remind(stub, plugin.id, at);
  return { stub, plugin, model, at };
}
async function notifier(stub: Account) {
  const saved = await api(stub, "plugin.save", {
    pluginId: "wechatai/notification",
    name: "告警",
    connectionId: "default",
  });
  expect(saved.ok).toBe(true);
  const token = String((await api(stub, "notification.token", { id: saved.data.id })).data.token);
  return {
    id: saved.data.id as string,
    send: async (text: string) =>
      expect(
        JSON.parse(
          await stub.notificationRequest(
            saved.data.id,
            token.split(".")[3],
            "send",
            { text },
            crypto.randomUUID(),
          ),
        ).ok,
      ).toBe(true),
  };
}
const downgrade = (stub: Account) =>
  runInDurableObject(stub, (_, state) => {
    state.storage.sql.exec(
      "UPDATE settings SET value=? WHERE key='planUntil'",
      JSON.stringify(Date.now() - 1000),
    );
  });
const held = (stub: Account) =>
  runInDurableObject(stub, (_, state) => ({
    reminders: state.storage.sql
      .exec(
        "SELECT 1 FROM personal_reminders WHERE state='waiting_context' AND retryAt>?",
        Date.now(),
      )
      .toArray().length,
    notifications: state.storage.sql
      .exec("SELECT 1 FROM notification_jobs WHERE state='pending' AND nextAt>?", Date.now())
      .toArray().length,
  }));
let messageId = 1;
const nudge = (stub: Account) =>
  runInDurableObject(stub, (instance) =>
    (instance as unknown as { deliverWindowNudges(): Promise<void> }).deliverWindowNudges(),
  );
// The user's next message, as the receive loop hands it over.
const userWrites = (stub: Account) =>
  runInDurableObject(stub, (instance) => {
    const message: WxMessage = {
      message_id: messageId++,
      message_type: 1,
      from_user_id: "owner",
      context_token: "fresh-context",
      item_list: [{ type: 1, text_item: { text: "/wx help" } }],
    };
    (
      instance as unknown as {
        ingestWechat(
          id: string,
          generation: string,
          cursor: string,
          result: { msgs: WxMessage[] },
          credentials: { userId: string },
        ): unknown;
      }
    ).ingestWechat("default", "g1", "", { msgs: [message] }, { userId: "owner" });
  });

describe("WeChat reply window", () => {
  it("asks once for a reply before the window closes when a reminder falls after it", async () => {
    const sent = wechat();
    const lastSeen = Date.now() - WECHAT_WINDOW_NUDGE_MS - 10 * 60_000;
    const { stub } = await withReminder(Date.now() - lastSeen);
    const { connection } = await stub.snapshot();
    expect(connection.pushWindow?.until).toBeGreaterThan(Date.now());
    await nudge(stub);
    // Past the retry lease, a delivered reminder is still not repeated.
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 10 * 60_000);
    await nudge(stub);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("/wx help");
    expect(sent[0].text).toContain("下一条提醒");
    expect(sent[0].clientId).toMatch(/^window:default:\d+$/);
  });

  it.each([
    ["before 22 hours", 21 * hour],
    ["after the window closed", WECHAT_REPLY_WINDOW_MS + hour],
  ])("does not ask %s", async (_, ago) => {
    const sent = wechat();
    const { stub } = await withReminder(ago);
    await nudge(stub);
    expect(sent).toEqual([]);
  });

  it("stays quiet without scheduled pushes, or when the next reminder falls inside the window", async () => {
    const sent = wechat();
    const { stub, model } = await setup("chat-completions", false);
    await connect(stub, { lastSeen: Date.now() - 23 * hour });
    await savePlugin(stub, model.id, { reminderConnectionId: "default" });
    expect((await stub.snapshot()).connection.pushWindow).toBeUndefined();
    await nudge(stub);
    const soon = await withReminder(23 * hour, 10 * 60_000);
    await nudge(soon.stub);
    expect(sent).toEqual([]);
  });

  it("holds a refused reminder without hammering WeChat and sends it once the user writes", async () => {
    let refuse = true;
    const sent = wechat(() => Response.json(refuse ? { ret: -2 } : { ret: 0 }));
    const { stub } = await withReminder(30 * hour);
    await due(stub);
    await deliver(stub);
    const [held] = await reminders(stub);
    expect(held).toMatchObject({ state: "waiting_context" });
    expect(held.retryAt as number).toBeGreaterThan(Date.now() + 25 * 60_000);
    expect((await stub.snapshot()).connection.pushWindow?.blockedAt).toBeGreaterThan(0);
    // No more attempts until the slow retry or the user's next message.
    await deliver(stub);
    expect(sent).toHaveLength(1);
    refuse = false;
    await userWrites(stub);
    expect(((await reminders(stub))[0].retryAt as number) <= Date.now()).toBe(true);
    expect((await stub.snapshot()).connection.pushWindow?.blockedAt).toBeUndefined();
    await deliver(stub);
    expect(sent).toHaveLength(2);
    expect((await reminders(stub))[0].state).toBe("sent");
  });

  it("does not send the window reminder while WeChat refuses pushes", async () => {
    const sent = wechat(() => Response.json({ ret: -2 }));
    const { stub } = await withReminder(WECHAT_WINDOW_NUDGE_MS + 10 * 60_000);
    await nudge(stub);
    expect(sent).toHaveLength(1);
    expect((await stub.snapshot()).connection.pushWindow?.blockedAt).toBeGreaterThan(0);
    await nudge(stub);
    expect(sent).toHaveLength(1);
  });

  it("ignores pushes a disabled or over-plan plugin would not send", async () => {
    const sent = wechat();
    const ago = WECHAT_WINDOW_NUDGE_MS + 10 * 60_000;
    const disabled = await withReminder(ago);
    const off = await api(disabled.stub, "plugin.save", { ...disabled.plugin, enabled: false });
    expect(off.ok).toBe(true);
    // On the free plan only the first plugin runs; the assistant and notifier are held.
    const { stub, model } = await setup("chat-completions", true);
    await connect(stub, { lastSeen: Date.now() - ago });
    await savePlugin(stub, model.id, { name: "第一个", shortcut: "a1" });
    const assistant = await savePlugin(stub, model.id, {
      reminderConnectionId: "default",
      name: "第二个",
      shortcut: "b2",
    });
    await remind(stub, assistant.id, Date.now() + 2 * 86400000);
    await notifier(stub);
    expect((await stub.snapshot()).connection.pushWindow).toBeDefined();
    await downgrade(stub);
    for (const account of [disabled.stub, stub]) {
      expect((await account.snapshot()).connection.pushWindow).toBeUndefined();
      await nudge(account);
    }
    expect(sent).toEqual([]);
  });

  it("clears a refusal once WeChat accepts a later push, so the window reminder still goes out", async () => {
    let refuse = true;
    const sent = wechat(() => Response.json(refuse ? { ret: -2 } : { ret: 0 }));
    const lastSeen = Date.now() - 2 * hour;
    const { stub, plugin } = await withReminder(Date.now() - lastSeen);
    await remind(stub, plugin.id, Date.now() + 60_000, "喝水");
    const t0 = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(t0 + 2 * 60_000);
    await deliver(stub);
    const blockedAt = (await stub.snapshot()).connection.pushWindow?.blockedAt as number;
    expect(blockedAt).toBeGreaterThan(0);
    // A send that started before the refusal proves nothing about it.
    await runInDurableObject(stub, (instance) =>
      (
        instance as unknown as { markPushDelivered(id: string, g: string, at: number): void }
      ).markPushDelivered("default", "g1", blockedAt - 1),
    );
    expect((await stub.snapshot()).connection.pushWindow?.blockedAt).toBe(blockedAt);
    refuse = false;
    clock.mockReturnValue(t0 + 33 * 60_000);
    await deliver(stub);
    expect(sent).toHaveLength(2);
    expect((await stub.snapshot()).connection.pushWindow?.blockedAt).toBeUndefined();
    // The two-day reminder still needs the next window.
    clock.mockReturnValue(lastSeen + WECHAT_WINDOW_NUDGE_MS + 10 * 60_000);
    await nudge(stub);
    expect(sent).toHaveLength(3);
    expect(sent[2].clientId).toMatch(/^window:/);
  });

  it("sends only a few held pushes per user message, reminders first", async () => {
    let refuse = true;
    const sent = wechat(() => Response.json(refuse ? { ret: -2 } : { ret: 0 }));
    const { stub, plugin } = await withReminder(30 * hour, 2 * 86400000, true);
    for (const title of ["倒垃圾", "浇花", "取快递"])
      await remind(stub, plugin.id, Date.now() + 2 * 86400000, title);
    await due(stub);
    await deliver(stub);
    const alerts = await notifier(stub);
    for (let i = 0; i < 3; i++) await alerts.send(`告警 ${i}`);
    await stub.dispatchNotifications();
    expect(sent).toHaveLength(7);
    expect(await held(stub)).toEqual({ reminders: 4, notifications: 3 });
    refuse = false;
    const kinds = async () => {
      const start = sent.length;
      await userWrites(stub);
      await deliver(stub);
      await stub.dispatchNotifications();
      return sent.slice(start).map((m) => m.clientId.split(":")[0]);
    };
    // The rest keep their slow retry, leaving WeChat's per-message quota for the reply.
    expect(await kinds()).toEqual(["personal", "personal", "personal"]);
    expect(await held(stub)).toEqual({ reminders: 1, notifications: 3 });
    expect(await kinds()).toEqual(["personal", "notify", "notify"]);
    expect(await held(stub)).toEqual({ reminders: 0, notifications: 1 });
  });

  it.each([
    ["after the window closed", 30 * hour, "超过 24 小时没有发消息"],
    ["inside the window", 2 * hour, "推送条数已到上限"],
  ])("explains a notification refused %s", async (_, ago, text) => {
    wechat(() => Response.json({ ret: -2 }));
    const warn = vi.spyOn(console, "warn");
    const { stub } = await setup("chat-completions", false);
    await connect(stub, { lastSeen: Date.now() - ago });
    const alerts = await notifier(stub);
    await alerts.send("告警");
    await alerts.send("告警 2");
    await stub.dispatchNotifications();
    const errors = await runInDurableObject(stub, (_, state) =>
      state.storage.sql
        .exec<{ error: string }>("SELECT error FROM notification_jobs")
        .toArray()
        .map((job) => job.error),
    );
    expect(errors).toHaveLength(2);
    for (const error of errors) {
      expect(error).toContain(text);
      expect(error).toContain("/wx help");
    }
    // Logged without identifiers, with the time since the user's last message.
    const refused = warn.mock.calls
      .map(([line]) => String(line))
      .filter((line) => line.includes('"wechat.push_refused"'))
      .map((line) => JSON.parse(line));
    // Both sends are refused; only the first starts a refusal episode.
    expect(refused.map((entry) => entry.first)).toEqual([true, false]);
    for (const entry of refused)
      expect(entry).toEqual({
        event: "wechat.push_refused",
        kind: "notification",
        first: expect.any(Boolean),
        sinceLastSeenMs: expect.any(Number),
      });
    expect(Math.abs(refused[0].sinceLastSeenMs - ago)).toBeLessThan(60_000);
  });
});
