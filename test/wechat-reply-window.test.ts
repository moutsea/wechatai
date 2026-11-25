import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import type { WxMessage } from "../src/server/wechat";
import { WECHAT_REPLY_WINDOW_MS, WECHAT_WINDOW_NUDGE_MS } from "../src/shared/wechat-readiness";
import {
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
async function withReminder(lastSeenAgo: number, remindIn = 2 * 86400000) {
  const { stub, model } = await setup("chat-completions", false);
  await connect(stub, { lastSeen: Date.now() - lastSeenAgo });
  const plugin = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
  const at = Date.now() + remindIn;
  expect(
    (
      await save(stub, plugin.id, {
        kind: "reminder",
        title: "交房租",
        date: new Date(at + 8 * hour).toISOString().slice(0, 10),
        remindAt: new Date(at).toISOString(),
      })
    ).ok,
  ).toBe(true);
  return { stub, plugin, at };
}
const nudge = (stub: Account) =>
  runInDurableObject(stub, (instance) =>
    (instance as unknown as { deliverWindowNudges(): Promise<void> }).deliverWindowNudges(),
  );
// The user's next message, as the receive loop hands it over.
const userWrites = (stub: Account) =>
  runInDurableObject(stub, (instance) => {
    const message: WxMessage = {
      message_id: Date.now(),
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
});
