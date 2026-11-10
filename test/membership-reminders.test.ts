import { env, runInDurableObject, abortAllDurableObjects } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MembershipReminders, MEMBERSHIP_DAY_MS as DAY } from "../src/server/membership-reminders";
import type { PersonalAccount } from "../src/server/personal-account";
import { ReminderScheduler } from "../src/server/reminder-scheduler";
import { encrypt } from "../src/server/security";
import { useManualAlarms } from "./helpers/wechat-delivery";
import { wechatLinkKey } from "../src/shared/wechat-links";

const accounts: DurableObjectStub<PersonalAccount>[] = [];
const schedulers = env.REMINDERS as DurableObjectNamespace<ReminderScheduler>;
const scheduler = (stub: DurableObjectStub<PersonalAccount>) =>
  schedulers.getByName(`${stub.id}:membership`);
let now: number;
beforeEach(() => {
  now = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Unexpected network request");
    }),
  );
});
afterEach(async () => {
  for (const stub of accounts.splice(0)) {
    for (const object of [env.ACCOUNTS.get(stub.id), scheduler(stub)])
      await runInDurableObject(object, async (_, state) => state.storage.deleteAlarm());
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function account() {
  const stub = env.ACCOUNTS.getByName(crypto.randomUUID());
  accounts.push(stub);
  await runInDurableObject(stub, (_, state) => useManualAlarms(state));
  await runInDurableObject(scheduler(stub), (_, state) => useManualAlarms(state));
  return stub;
}
async function membership(stub: DurableObjectStub<PersonalAccount>, days = 10) {
  const until = now + days * DAY;
  await stub.applyPayment({
    id: crypto.randomUUID(),
    kind: "subscription",
    units: 0,
    expires: until,
  });
  return until;
}
async function link(stub: DurableObjectStub<PersonalAccount>, id = "default", context = true) {
  await runInDurableObject(stub, async (_, state) => {
    state.storage.sql.exec(
      "INSERT OR IGNORE INTO wechat_links VALUES (?,?,?)",
      id,
      "提醒微信",
      id === "default" ? 0 : 1,
    );
    const encryptedCredentials = await encrypt(
      env,
      JSON.stringify({
        token: `private-token-${id}`,
        baseUrl: "https://ilinkai.weixin.qq.com",
        userId: `owner-${id}`,
        botId: `bot-${id}`,
      }),
      `${state.id}:wechat`,
    );
    state.storage.sql.exec(
      "INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      wechatLinkKey(id, "connection"),
      JSON.stringify({
        status: "connected",
        generation: "g1",
        encryptedCredentials,
        ...(context ? { contextToken: `private-context-${id}` } : {}),
      }),
    );
  });
}
function network(failures = 0) {
  const sent: { id: string; text: string; token: string; to: string }[] = [];
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    const request = new Request(url, init);
    if (!request.url.endsWith("sendmessage")) throw new Error("Only reminder delivery is allowed");
    const body = await request.json<{
      msg: { client_id: string; to_user_id: string; item_list: { text_item: { text: string } }[] };
    }>();
    sent.push({
      id: body.msg.client_id,
      text: body.msg.item_list[0].text_item.text,
      token: request.headers.get("Authorization")!,
      to: body.msg.to_user_id,
    });
    return failures-- > 0
      ? new Response("temporary failure", { status: 503 })
      : Response.json({ ret: 0 });
  });
  return sent;
}

describe("membership expiry notifications", () => {
  it("schedules seven and three days ahead and delivers each once per account without credits", async () => {
    const stub = await account();
    const until = await membership(stub);
    await link(stub);
    await link(stub, "another");
    const sent = network();
    expect((await scheduler(stub).status()).schedule).toMatchObject({
      kind: "membership",
      nextAt: until - 7 * DAY,
    });
    await stub.dispatchMembershipReminders();
    expect(sent).toEqual([]);
    now = until - 7 * DAY;
    await runInDurableObject(scheduler(stub), async (object) =>
      (object as ReminderScheduler).alarm(),
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("提前提醒一下");
    expect(sent[0].text).toContain("北京时间");
    expect(sent[0].text).toContain("https://wechatai.app/app/billing");
    expect(sent[0].to).toBe("owner-default");
    expect((await scheduler(stub).status()).schedule?.nextAt).toBe(until - 3 * DAY);
    await Promise.all([stub.dispatchMembershipReminders(), stub.dispatchMembershipReminders()]);
    expect(sent).toHaveLength(1);
    now = until - 3 * DAY;
    await stub.dispatchMembershipReminders();
    await stub.dispatchMembershipReminders();
    expect(sent).toHaveLength(2);
    expect(sent[1].text).toContain("就快到期了");
    expect(sent[1].text).toContain("免费版可以用 1 个微信连接和 1 个插件");
    expect(sent[0].id).not.toBe(sent[1].id);
    expect((await stub.membershipReminderStatus()).nextAt).toBeNull();
    await runInDurableObject(stub, (_, state) => {
      expect(state.storage.sql.exec("SELECT id FROM usage").toArray()).toEqual([]);
      expect(state.storage.sql.exec("SELECT id FROM messages").toArray()).toEqual([]);
      expect(state.storage.sql.exec("SELECT id FROM claw_jobs").toArray()).toEqual([]);
      expect(
        state.storage.sql.exec("SELECT id FROM credit_ledger WHERE amount < 0").toArray(),
      ).toEqual([]);
    });
  });
  it("retries with the same client ID, target and text across a restart", async () => {
    const stub = await account();
    const until = await membership(stub);
    await link(stub);
    const sent = network(1);
    now = until - 7 * DAY;
    await stub.dispatchMembershipReminders();
    expect(sent).toHaveLength(1);
    expect((await stub.membershipReminderStatus()).stages[0].state).toBe("retry");
    await abortAllDurableObjects();
    const restored = env.ACCOUNTS.get(stub.id);
    await runInDurableObject(restored, (_, state) => useManualAlarms(state));
    now += 11000;
    await restored.dispatchMembershipReminders();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    expect((await restored.membershipReminderStatus()).stages[0].state).toBe("sent");
  });
  it("reschedules after renewal and cancels the old three-day reminder", async () => {
    const stub = await account();
    const until = await membership(stub);
    await link(stub);
    const sent = network();
    now = until - 7 * DAY;
    await stub.dispatchMembershipReminders();
    await stub.applyPayment({ id: "renew", kind: "membership", months: 1 });
    const renewed = (await stub.membershipReminderStatus()).planUntil;
    expect(renewed).toBeGreaterThan(until);
    expect((await scheduler(stub).status()).schedule?.nextAt).toBe(renewed - 7 * DAY);
    now = until - 3 * DAY;
    await stub.dispatchMembershipReminders();
    expect(sent).toHaveLength(1);
    now = renewed - 7 * DAY;
    await stub.dispatchMembershipReminders();
    expect(sent).toHaveLength(2);
    expect(sent[0].id).not.toBe(sent[1].id);
  });
  it("does not let an old in-flight send overwrite a renewed term", async () => {
    const stub = await account();
    const until = await membership(stub);
    await link(stub);
    const sent = network();
    now = until - 7 * DAY;
    await runInDurableObject(stub, async (instance) => {
      const original = vi.mocked(fetch).getMockImplementation()!;
      vi.mocked(fetch).mockImplementation(async (...args) => {
        await instance.applyPayment({ id: "renew-during-send", kind: "membership", months: 1 });
        return original(...args);
      });
      await instance.dispatchMembershipReminders();
    });
    const status = await stub.membershipReminderStatus();
    expect(sent).toHaveLength(1);
    expect(status.planUntil).toBeGreaterThan(until);
    expect(status.stages.map((stage) => stage.state)).toEqual(["pending", "pending"]);
  });
  it("deduplicates paid renewals and reschedules an administrator gift", async () => {
    const stub = await account();
    const payment = { id: "one-payment", kind: "membership" as const, months: 1 as const };
    await stub.applyPayment(payment);
    const paid = await stub.membershipReminderStatus();
    await stub.applyPayment(payment);
    expect(await stub.membershipReminderStatus()).toEqual(paid);
    const gift = { id: crypto.randomUUID(), reason: "Support credit" };
    await stub.adminGiftPlus("admin", gift);
    const gifted = await stub.membershipReminderStatus();
    expect(gifted.planUntil).toBeGreaterThan(paid.planUntil);
    expect((await scheduler(stub).status()).schedule?.nextAt).toBe(gifted.planUntil - 7 * DAY);
    await stub.adminGiftPlus("admin", gift);
    expect(await stub.membershipReminderStatus()).toEqual(gifted);
  });
  it.each([5, 2])(
    "backfills only the current stage for an existing member with %s days left",
    async (days) => {
      const stub = await account();
      await membership(stub, days);
      await link(stub);
      const sent = network();
      const registered = await stub.registerMembershipReminders();
      expect(registered.nextAt).toBe(now);
      await stub.dispatchMembershipReminders();
      await stub.registerMembershipReminders();
      await stub.dispatchMembershipReminders();
      expect(sent).toHaveLength(1);
      expect(sent[0].text).toContain(days === 5 ? "提前提醒一下" : "就快到期了");
    },
  );
  it("waits for a usable WeChat context and wakes on the next inbound message", async () => {
    const stub = await account();
    const until = await membership(stub);
    await link(stub, "default", false);
    const sent = network();
    now = until - 7 * DAY;
    await stub.dispatchMembershipReminders();
    expect(sent).toEqual([]);
    expect((await stub.membershipReminderStatus()).stages[0].state).toBe("waiting");
    await runInDurableObject(stub, (instance) => {
      const ingest = Reflect.get(instance, "ingestWechat").bind(instance);
      ingest(
        "default",
        "g1",
        "",
        {
          msgs: [
            {
              message_type: 1,
              message_id: 1,
              from_user_id: "owner-default",
              context_token: "new-context",
              item_list: [{ type: 1, text_item: { text: "你好" } }],
            },
          ],
        },
        { userId: "owner-default", botId: "bot-default" },
      );
    });
    await stub.dispatchMembershipReminders();
    expect(sent).toHaveLength(1);
  });
  it("skips stale seven-day notices and never sends after membership expiry", async () => {
    const stub = await account();
    const until = await membership(stub);
    await link(stub);
    const sent = network();
    now = until - 2 * DAY;
    await stub.dispatchMembershipReminders();
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("就快到期了");
    now = until;
    await stub.dispatchMembershipReminders();
    expect(sent).toHaveLength(1);
    expect((await stub.membershipReminderStatus()).nextAt).toBeNull();
  });
  it("does not redirect an ambiguous send to a new WeChat binding", async () => {
    const stub = await account();
    const until = await membership(stub);
    await link(stub);
    await link(stub, "another");
    const sent = network(1);
    now = until - 7 * DAY;
    await stub.dispatchMembershipReminders();
    await runInDurableObject(stub, (_, state) =>
      state.storage.sql.exec(
        "UPDATE settings SET value=json_set(value,'$.generation','g2') WHERE key='connection'",
      ),
    );
    now += 11000;
    await stub.dispatchMembershipReminders();
    expect(sent).toHaveLength(1);
    expect((await stub.membershipReminderStatus()).stages[0].state).toBe("cancelled");
  });
  it("recovers pending scheduler registration after an RPC outage", async () => {
    const stub = await account();
    const until = now + 10 * DAY;
    const failure = vi
      .spyOn(ReminderScheduler.prototype, "synchronizeMembership")
      .mockRejectedValue(new Error("deployment"));
    await stub.applyPayment({ id: "paid", kind: "subscription", units: 0, expires: until });
    await runInDurableObject(stub, async (instance) => {
      await expect(instance.registerMembershipReminders()).rejects.toThrow("pending");
    });
    failure.mockRestore();
    await stub.registerMembershipReminders();
    expect((await scheduler(stub).status()).schedule?.nextAt).toBe(until - 7 * DAY);
    expect((await stub.snapshot()).planUntil).toBe(until);
  });
  it("isolates membership schedules from personal and notification schedules", async () => {
    const stub = await account();
    const owner = stub.id.toString();
    await membership(stub);
    const original = await scheduler(stub).status();
    await runInDurableObject(scheduler(stub), async (instance) => {
      await expect(
        (instance as ReminderScheduler).synchronizeNotifications(owner, {
          revision: 999,
          nextAt: null,
        }),
      ).rejects.toThrow("scope mismatch");
    });
    await runInDurableObject(schedulers.getByName(owner), async (instance) => {
      await expect(
        (instance as ReminderScheduler).synchronizeMembership(owner, {
          revision: 999,
          nextAt: null,
        }),
      ).rejects.toThrow("scope mismatch");
    });
    expect(await scheduler(stub).status()).toEqual(original);
  });
  it("retains an unacknowledged send lease and ignores stale acknowledgements", async () => {
    const stub = await account();
    await runInDurableObject(stub, (_, state) => {
      const store = new MembershipReminders(state.storage.sql);
      const until = now + 7 * DAY;
      store.sync(until, now);
      const due = store.due(now)[0];
      const claimed = store.claim(
        due,
        { connectionId: "default", generation: "g1" },
        "notice",
        now,
      )!;
      expect(store.schedule().nextAt).toBe(now + 30000);
      expect(
        store.claim(due, { connectionId: "default", generation: "g1" }, "notice", now),
      ).toBeNull();
      store.sync(until + 30 * DAY, now);
      store.settle(claimed, "sent", now);
      expect(store.status().stages.map((stage) => stage.state)).toEqual(["pending", "pending"]);
      store.acknowledge(0);
      expect(store.pendingSync()).toBe(true);
    });
  });
});
