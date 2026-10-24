import { authEmailMigration, verifiedFixtureCookie } from "./auth-fixtures";
import {
  env,
  runInDurableObject,
  createExecutionContext,
  createScheduledController,
  abortAllDurableObjects,
} from "cloudflare:test";
import { beforeAll, beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import authMigration from "../migrations/0001_auth.sql?raw";
import referralMigration from "../migrations/0003_referrals.sql?raw";
import billingMigration from "../migrations/0002_billing.sql?raw";
import paymentNoticeMigration from "../migrations/0006_billing_notifications.sql?raw";
import worker from "../src/server/index";
import { encrypt } from "../src/server/security";
import { parseNotificationToken, createNotificationToken } from "../src/server/notification-token";
import type { PersonalAccount } from "../src/server/personal-account";
import { ReminderScheduler } from "../src/server/reminder-scheduler";
import { notificationGuide } from "../src/shared/notification-docs";

const accounts: DurableObjectStub<PersonalAccount>[] = [];
const schedulers = env.REMINDERS as DurableObjectNamespace<ReminderScheduler>;
const scheduler = (stub: DurableObjectStub<PersonalAccount>) =>
  schedulers.getByName(`${stub.id}:notifications`);
const api = async (
  stub: DurableObjectStub<PersonalAccount>,
  action: string,
  payload: unknown = {},
) => JSON.parse(await env.ACCOUNTS.get(stub.id).api(action, payload));
const request = (path: string, init?: RequestInit) =>
  worker.fetch(new Request(`${env.APP_URL}${path}`, init), env, createExecutionContext());
const send = (
  token: string,
  body: unknown = { title: "订单通知", text: "支付成功" },
  key: string = crypto.randomUUID(),
) =>
  request("/api/notify", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "idempotency-key": key,
    },
    body: JSON.stringify(body),
  });
beforeAll(async () => {
  await env.DB.exec(authMigration);
  await env.DB.exec(referralMigration);
  await env.DB.exec(authEmailMigration.replace(/^--.*$/gm, "").replace(/\n/g, " "));
  await env.DB.batch(
    (billingMigration + "\n" + paymentNoticeMigration)
      .split(";")
      .filter((sql) => sql.trim())
      .map((sql) => env.DB.prepare(sql)),
  );
});
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ ret: 0 })),
  ),
);
afterEach(async () => {
  for (const stub of accounts.splice(0)) {
    for (const target of [
      env.ACCOUNTS.get(stub.id),
      scheduler(stub),
      schedulers.getByName(stub.id.toString()),
    ])
      await runInDurableObject(target, async (_, state) => {
        await state.storage.deleteAlarm();
      });
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function setupAccount(plus = true, userId: string = crypto.randomUUID()) {
  const stub = env.ACCOUNTS.getByName(userId);
  accounts.push(stub);
  // Drive delivery explicitly so mutation/rotation tests cannot race a real timer.
  await runInDurableObject(stub, (object) => {
    vi.spyOn(object as PersonalAccount, "alarm").mockResolvedValue(undefined);
  });
  await runInDurableObject(scheduler(stub), (object) => {
    vi.spyOn(object as ReminderScheduler, "alarm").mockResolvedValue(undefined);
  });
  if (plus)
    await stub.applyPayment({
      id: "plus",
      kind: "subscription",
      units: 0,
      expires: Date.now() + 86400000,
    });
  expect((await api(stub, "wechat.create", { name: "接收微信" })).ok).toBe(true);
  await runInDurableObject(stub, async (_, state) => {
    const encryptedCredentials = await encrypt(
      env,
      JSON.stringify({
        token: "test-wx",
        baseUrl: "https://ilinkai.weixin.qq.com",
        userId: state.id.toString(),
        botId: "bot",
      }),
      `${state.id}:wechat`,
    );
    state.storage.sql.exec(
      "UPDATE settings SET value=? WHERE key='connection'",
      JSON.stringify({
        status: "connected",
        generation: "g1",
        contextToken: "context",
        encryptedCredentials,
      }),
    );
  });
  return stub;
}
async function setup(plus = true) {
  const stub = await setupAccount(plus);
  const saved = await api(stub, "plugin.save", {
    pluginId: "wechatai/notification",
    name: "订单通知",
    connectionId: "default",
  });
  expect(saved.ok, JSON.stringify(saved)).toBe(true);
  const token = await api(stub, "notification.token", { id: saved.data.id });
  expect(token.ok).toBe(true);
  return { stub, plugin: saved.data, token: token.data.token as string };
}
async function setLink(stub: DurableObjectStub<PersonalAccount>, patch: Record<string, unknown>) {
  await runInDurableObject(stub, (_, state) => {
    const value = JSON.parse(
      state.storage.sql
        .exec<{ value: string }>("SELECT value FROM settings WHERE key='connection'")
        .one().value,
    );
    state.storage.sql.exec(
      "UPDATE settings SET value=? WHERE key='connection'",
      JSON.stringify({ ...value, ...patch }),
    );
  });
}
async function due(stub: DurableObjectStub<PersonalAccount>) {
  await runInDurableObject(stub, (_, state) =>
    state.storage.sql.exec(
      "UPDATE notification_jobs SET nextAt=0 WHERE state IN ('pending','sending')",
    ),
  );
}
const status = async (stub: DurableObjectStub<PersonalAccount>, id: string) =>
  (await api(stub, "notification.status", { id })).data;

describe("receive-only notification plugin", () => {
  it.each([false, true])(
    "dispatches payment notices internally, retaining token validation (revoked=%s)",
    async (revoked) => {
      const { stub, plugin, token } = await setup();
      if (revoked)
        expect((await api(stub, "notification.revoke", { id: plugin.id })).ok).toBe(true);
      const id = crypto.randomUUID(),
        buyer = crypto.randomUUID(),
        now = Date.now();
      await env.DB.prepare(
        "INSERT INTO user (id,name,email,createdAt,updatedAt) VALUES (?,'Buyer',?,?,?)",
      )
        .bind(buyer, `${buyer}@example.test`, now, now)
        .run();
      await env.DB.prepare(
        `INSERT INTO billing_order(id,user_id,mode,offer_id,kind,price_id,amount,currency,credits,customer_id,status,created_at,paid_at)
         VALUES (?,?,'live','plus_monthly','plus','price_fixture',990,'cny',0,'cus_fixture','paid',?,?)`,
      )
        .bind(id, buyer, now, now)
        .run();
      await env.DB.prepare(
        "INSERT INTO billing_notification(payment_id,order_id,data,created_at,next_at) VALUES (?,?,?,?,?)",
      )
        .bind(
          id,
          id,
          JSON.stringify({
            name: "Buyer",
            email: `${buyer}@example.test`,
            offerId: "plus_monthly",
            amount: 990,
            currency: "cny",
            credits: 0,
            firstPayment: 1,
            renewal: 0,
          }),
          now,
          now,
        )
        .run();
      const liveEnv = {
        ...env,
        APP_URL: "https://wechatai.app" as const,
        STRIPE_SECRET_KEY: "sk_live_fixture_not_real",
        BILLING_NOTIFY_TOKEN: token,
      };
      // Same-site network fetch is unavailable, as in the production failure.
      vi.mocked(fetch).mockImplementation(async (input) => {
        if (new URL(String(input)).hostname === "wechatai.app")
          throw new TypeError("Same-site fetch is unavailable");
        return Response.json({ ret: 0 });
      });
      await worker.scheduled(createScheduledController(), liveEnv, createExecutionContext());
      expect(fetch).not.toHaveBeenCalled();
      const notice = await env.DB.prepare(
        "SELECT state,attempts,error,delivery_id FROM billing_notification WHERE payment_id=?",
      )
        .bind(id)
        .first();
      if (revoked) {
        expect(notice).toMatchObject({
          state: "pending",
          attempts: 1,
          error: "http_401",
          delivery_id: null,
        });
        expect((await status(stub, plugin.id)).deliveries).toHaveLength(0);
      } else {
        expect(notice).toMatchObject({ state: "accepted", attempts: 1, error: "" });
        await stub.dispatchNotifications();
        expect((await status(stub, plugin.id)).deliveries).toEqual([
          expect.objectContaining({ id: notice!.delivery_id, state: "sent", attempts: 1 }),
        ]);
        await worker.scheduled(createScheduledController(), liveEnv, createExecutionContext());
        await stub.dispatchNotifications();
        expect(fetch).toHaveBeenCalledTimes(1);
      }
    },
  );
  it("saves and edits notification configuration through authenticated browser HTTP routes", async () => {
    const signup = await request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { origin: env.APP_URL, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Notification HTTP Test",
        email: `notification-${crypto.randomUUID()}@example.test`,
        password: "test-only-notification-password",
      }),
    });
    expect(signup.status).toBe(200);
    const { user } = await signup.json<{ user: { id: string } }>();
    const cookie = await verifiedFixtureCookie(user.id, "test-only-notification-password");
    await setupAccount(false, user.id);
    const headers = { cookie, origin: env.APP_URL, "content-type": "application/json" };
    const input = {
      pluginId: "wechatai/notification",
      name: "消息提醒",
      connectionId: "default",
      enabled: true,
    };
    const save = (body: unknown, path = "/api/plugins", method = "POST") =>
      request(path, { method, headers, body: JSON.stringify(body) });
    const created = await save(input);
    expect(created.status).toBe(200);
    expect((await save(input)).status).toBe(403);
    const plugin = await created.json<{ id: string; pluginId: string }>();
    expect(plugin).toMatchObject(input);
    const path = `/api/plugins/${plugin.id}`;
    const edited = await save({ ...plugin, name: "订单通知" }, path, "PATCH");
    expect(edited.status).toBe(200);
    expect(await edited.json()).toMatchObject({
      id: plugin.id,
      pluginId: input.pluginId,
      name: "订单通知",
    });
    // Editing a saved instance can also omit the discriminator.
    expect((await save({ name: "服务告警" }, path, "PATCH")).status).toBe(200);
    expect((await save({}, `${path}/notification/token`)).status).toBe(200);
    const access = await request(`${path}/notification`, { headers });
    expect(access.status).toBe(200);
    expect(await access.json()).toMatchObject({ hasToken: true, deliveries: [] });
    const listed = await request("/api/plugins", { headers });
    expect(await listed.json()).toEqual([
      expect.objectContaining({ id: plugin.id, pluginId: input.pluginId, name: "服务告警" }),
    ]);
    // Neither configuration nor token creation sends a WeChat message.
    expect(fetch).not.toHaveBeenCalled();
  });
  it("configures on Free without a model, delivers without credits and rejects foreign links", async () => {
    const free = await setup(false);
    expect(free.plugin).toMatchObject({ pluginId: "wechatai/notification" });
    const before = (await free.stub.snapshot()).wallet.balance;
    expect((await send(free.token)).status).toBe(202);
    await free.stub.dispatchNotifications();
    expect((await status(free.stub, free.plugin.id)).deliveries[0].state).toBe("sent");
    expect((await free.stub.snapshot()).wallet.balance).toBe(before);
    const { stub, plugin } = await setup();
    expect(plugin).toMatchObject({ pluginId: "wechatai/notification", hasKey: false });
    expect((await api(stub, "plugin.save", { id: plugin.id, connectionId: "foreign" })).ok).toBe(
      false,
    );
    expect((await api(stub, "plugin.activate", { id: plugin.id })).error).toBe("receive_only");
    expect((await api(stub, "session.create", { pluginInstanceId: plugin.id })).error).toBe(
      "receive_only",
    );
  });
  it("authenticates at the edge and rejects tampering, cross-purpose tokens and arbitrary IDs", async () => {
    const { stub, plugin, token } = await setup();
    expect(parseNotificationToken(env, `Bearer ${token}`)?.accountId).toBe(stub.id.toString());
    for (const bad of [
      "",
      token.slice(0, -2) + "!!",
      token.replace("notify1.", "pair1."),
      token.replace(plugin.id, crypto.randomUUID()),
    ]) {
      expect((await send(bad)).status).toBe(401);
    }
    expect(
      (
        await request("/api/notify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: '{"text":"hello"}',
        })
      ).status,
    ).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("saves first, dispatches without changing conversations or billing, and exposes a receipt", async () => {
    const { stub, plugin, token } = await setup();
    const before = await runInDurableObject(stub, (_, state) => ({
      ledger: state.storage.sql.exec("SELECT * FROM credit_ledger").toArray(),
      sessions: state.storage.sql.exec("SELECT * FROM sessions").toArray(),
    }));
    const response = await send(token);
    expect(response.status).toBe(202);
    const accepted = await response.json<{ id: string; status: string }>();
    expect(accepted.status).toBe("pending");
    expect((await scheduler(stub).status()).schedule).toMatchObject({
      kind: "notification",
      accountId: stub.id.toString(),
    });
    await stub.dispatchNotifications();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe("https://ilinkai.weixin.qq.com/ilink/bot/sendmessage");
    const sent = JSON.parse(init!.body as string).msg;
    expect(sent.to_user_id).toBe(stub.id.toString());
    expect(sent.item_list[0].text_item.text).toContain("消息来自 订单通知（消息提醒插件）");
    expect(sent.item_list[0].text_item.text).not.toContain("/use");
    const receipt = await request(`/api/notify/${accepted.id}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(receipt.status).toBe(200);
    expect(await receipt.json()).toMatchObject({ state: "sent", attempts: 1 });
    await runInDurableObject(stub, (_, state) => {
      expect(state.storage.sql.exec("SELECT * FROM credit_ledger").toArray()).toEqual(
        before.ledger,
      );
      expect(state.storage.sql.exec("SELECT * FROM sessions").toArray()).toEqual(before.sessions);
      expect(state.storage.sql.exec("SELECT * FROM usage").toArray()).toHaveLength(0);
      expect(
        state.storage.sql.exec<{ text: string }>("SELECT text FROM notification_jobs").one().text,
      ).toBe("");
    });
    expect((await status(stub, plugin.id)).deliveries[0].state).toBe("sent");
  });
  it("isolates users and plugin instances, including receipt queries", async () => {
    const a = await setup(),
      b = await setup();
    const receipt = await (await send(a.token)).json<{ id: string }>();
    expect(
      (
        await request(`/api/notify/${receipt.id}`, {
          headers: { authorization: `Bearer ${b.token}` },
        })
      ).status,
    ).toBe(404);
    const other = (
      await api(a.stub, "plugin.save", {
        pluginId: "wechatai/notification",
        name: "其他",
        connectionId: "default",
      })
    ).data;
    const otherToken = (await api(a.stub, "notification.token", { id: other.id })).data.token;
    expect(
      (
        await request(`/api/notify/${receipt.id}`, {
          headers: { authorization: `Bearer ${otherToken}` },
        })
      ).status,
    ).toBe(404);
    const forged = createNotificationToken(env, b.stub.id.toString(), a.plugin.id);
    expect((await send(forged.token)).status).toBe(401);
    expect((await api(b.stub, "notification.status", { id: a.plugin.id })).ok).toBe(false);
  });
  it("deduplicates simultaneous retries and rejects content changes for the same key", async () => {
    const { stub, token } = await setup();
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => send(token, { text: "test" }, "order-1")),
    );
    const receipts = await Promise.all(
      responses.map((r) => r.json<{ id: string; duplicate: boolean }>()),
    );
    expect(new Set(receipts.map((r) => r.id)).size).toBe(1);
    expect(receipts.filter((r) => !r.duplicate)).toHaveLength(1);
    expect((await send(token, { text: "changed" }, "order-1")).status).toBe(409);
    await stub.dispatchNotifications();
    const retry = await send(token, { text: "test" }, "order-1");
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ status: "sent", duplicate: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("keeps tokens out of snapshots, rotates immediately, and revokes queued work", async () => {
    const { stub, plugin, token } = await setup();
    const snapshot = JSON.stringify((await api(stub, "snapshot")).data);
    expect(snapshot).not.toContain(token);
    expect(snapshot).not.toContain(parseNotificationToken(env, `Bearer ${token}`)!.credential);
    const next = (await api(stub, "notification.token", { id: plugin.id })).data.token;
    expect((await send(token)).status).toBe(401);
    expect((await send(next)).status).toBe(202);
    await api(stub, "notification.revoke", { id: plugin.id });
    expect((await send(next)).status).toBe(401);
    await stub.dispatchNotifications();
    expect(fetch).not.toHaveBeenCalled();
    expect((await status(stub, plugin.id)).deliveries[0].state).toBe("cancelled");
  });
  it.each(["POST", "GET"])(
    "isolates rotated and revoked token traffic from the account quota for %s",
    async (method) => {
      const { stub, plugin, token } = await setup();
      const rotated = (await api(stub, "notification.token", { id: plugin.id })).data.token;
      await api(stub, "notification.revoke", { id: plugin.id });
      const current = (await api(stub, "notification.token", { id: plugin.id })).data.token;
      const buckets = new Map<string, number>();
      // A short deterministic window tests edge and account limits together.
      const limit = vi.fn(async ({ key }: { key: string }) => {
        const count = (buckets.get(key) ?? 0) + 1;
        buckets.set(key, count);
        return { success: count <= 3 };
      });
      const limitedRequest = (
        credential: string,
        verb = method,
        id: string = crypto.randomUUID(),
      ) =>
        worker.fetch(
          new Request(`${env.APP_URL}/api/notify${verb === "GET" ? `/${id}` : ""}`, {
            method: verb,
            headers: { authorization: `Bearer ${credential}`, "content-type": "application/json" },
            ...(verb === "POST" ? { body: JSON.stringify({ text: "hello" }) } : {}),
          }),
          { ...env, API_LIMIT: { limit } },
          createExecutionContext(),
        );
      for (const invalid of [token, rotated]) {
        for (let i = 0; i < 3; i++) expect((await limitedRequest(invalid)).status).toBe(401);
        expect((await limitedRequest(invalid)).status).toBe(429);
      }
      const accepted = await limitedRequest(current, "POST");
      expect(accepted.status).toBe(202);
      const { id } = await accepted.json<{ id: string }>();
      expect((await limitedRequest(current, "GET", id)).status).toBe(200);
      expect((await limitedRequest(current, "GET", id)).status).toBe(200);
      // Resetting the token must not bypass the authenticated account quota.
      const next = (await api(stub, "notification.token", { id: plugin.id })).data.token;
      expect((await limitedRequest(next, "POST")).status).toBe(429);
      expect((await status(stub, plugin.id)).deliveries).toHaveLength(1);
    },
  );
  it.each(["send", "status"] as const)(
    "rechecks revocation after an in-flight account limit check for %s",
    async (action) => {
      const { stub, plugin, token } = await setup();
      const { id } = await (await send(token)).json<{ id: string }>();
      let entered!: () => void;
      let release!: () => void;
      const checking = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      const limit = vi.fn(async ({ key }: { key: string }) => {
        if (key === `notify:${stub.id}`) {
          entered();
          await pending;
        }
        return { success: true };
      });
      const response = worker.fetch(
        new Request(`${env.APP_URL}/api/notify${action === "status" ? `/${id}` : ""}`, {
          method: action === "send" ? "POST" : "GET",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          ...(action === "send" ? { body: JSON.stringify({ text: "must not be accepted" }) } : {}),
        }),
        { ...env, API_LIMIT: { limit } },
        createExecutionContext(),
      );
      await checking;
      const revoked = await api(stub, "notification.revoke", { id: plugin.id });
      release();
      expect(revoked.ok).toBe(true);
      expect((await response).status).toBe(401);
      expect((await status(stub, plugin.id)).deliveries).toHaveLength(1);
    },
  );
  it("requires a connected WeChat with context and fails old work after rebinding", async () => {
    const { stub, plugin, token } = await setup();
    await setLink(stub, { contextToken: undefined });
    expect((await send(token)).status).toBe(409);
    await setLink(stub, { status: "disconnected" });
    expect((await send(token)).status).toBe(409);
    await setLink(stub, { status: "connected", contextToken: "new" });
    expect((await send(token)).status).toBe(202);
    await setLink(stub, { generation: "different-owner" });
    await stub.dispatchNotifications();
    expect(fetch).not.toHaveBeenCalled();
    expect((await status(stub, plugin.id)).deliveries[0].state).toBe("failed");
  });
  it.each(["disable", "delete"])("cancels queued messages on %s", async (operation) => {
    const { stub, plugin, token } = await setup();
    await send(token);
    if (operation === "delete") await api(stub, "plugin.delete", { id: plugin.id });
    else await api(stub, "plugin.save", { id: plugin.id, enabled: false });
    expect((await send(token)).status).toBe(operation === "delete" ? 401 : 403);
    await stub.dispatchNotifications();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("retries transient errors with the same client ID and survives durable-object restart", async () => {
    const { stub, plugin, token } = await setup();
    await send(token);
    vi.mocked(fetch).mockResolvedValueOnce(new Response("unavailable", { status: 502 }));
    await stub.dispatchNotifications();
    expect((await status(stub, plugin.id)).deliveries[0]).toMatchObject({
      state: "pending",
      attempts: 1,
    });
    const first = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).msg.client_id;
    await due(stub);
    await abortAllDurableObjects();
    await env.ACCOUNTS.get(stub.id).dispatchNotifications();
    const second = JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string).msg.client_id;
    expect(second).toBe(first);
    expect((await status(env.ACCOUNTS.get(stub.id), plugin.id)).deliveries[0].state).toBe("sent");
  });
  it("does not resurrect cancelled messages from a delivery batch after token revocation", async () => {
    const { stub, plugin, token } = await setup();
    await send(token, { text: "first" });
    await send(token, { text: "second" });
    let entered!: () => void;
    let release!: () => void;
    const sending = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const response = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(fetch).mockImplementationOnce(async () => {
      entered();
      await response;
      return Response.json({ ret: 0 });
    });
    const delivery = stub.dispatchNotifications();
    await sending;
    // A separate user request revokes the token while one send is in flight.
    const revoked = await api(stub, "notification.revoke", { id: plugin.id });
    release();
    await delivery;
    expect(revoked.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      (await status(stub, plugin.id)).deliveries.map((r: { state: string }) => r.state),
    ).toEqual(["cancelled", "cancelled"]);
  });
  it("persists a recovery alarm when scheduler registration fails and repairs on retry", async () => {
    const { stub, plugin, token } = await setup();
    const mocked = vi
      .spyOn(ReminderScheduler.prototype, "synchronizeNotifications")
      .mockRejectedValueOnce(new Error("deployment restart"));
    expect((await send(token, { text: "persisted" }, "recover-1")).status).toBe(202);
    await runInDurableObject(stub, async (_, state) => {
      expect(await state.storage.getAlarm()).not.toBeNull();
      const schedule = state.storage.sql
        .exec<{ revision: number; acknowledged: number }>("SELECT * FROM notification_schedule")
        .one();
      expect(schedule.revision).toBeGreaterThan(schedule.acknowledged);
    });
    mocked.mockRestore();
    const retry = await send(token, { text: "persisted" }, "recover-1");
    expect(await retry.json()).toMatchObject({ duplicate: true });
    expect((await scheduler(stub).status()).schedule?.kind).toBe("notification");
    await stub.dispatchNotifications();
    expect((await status(stub, plugin.id)).deliveries).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("keeps notification deadlines separate from personal reminders", async () => {
    const { stub, token } = await setup();
    const ordinary = schedulers.getByName(stub.id.toString());
    const future = Date.now() + 3600000;
    await ordinary.synchronize(stub.id.toString(), { revision: 999, nextAt: future });
    await send(token);
    expect((await ordinary.status()).alarmAt).toBe(future);
    await runInDurableObject(scheduler(stub), async (object) => {
      await ReminderScheduler.prototype.alarm.call(object as ReminderScheduler);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await ordinary.status()).alarmAt).toBe(future);
    expect((await scheduler(stub).status()).alarmAt).toBeNull();
  });
  it("pauses an excess plugin after downgrade and expires queued messages after 24 hours", async () => {
    const { stub } = await setup();
    const plugin = (
      await api(stub, "plugin.save", {
        pluginId: "wechatai/notification",
        name: "第二个",
        connectionId: "default",
      })
    ).data;
    const token = (await api(stub, "notification.token", { id: plugin.id })).data.token;
    await send(token);
    await runInDurableObject(stub, (_, state) =>
      state.storage.sql.exec("UPDATE settings SET value='0' WHERE key='planUntil'"),
    );
    expect((await send(token)).status).toBe(403);
    await stub.dispatchNotifications();
    expect(fetch).not.toHaveBeenCalled();
    expect((await status(stub, plugin.id)).deliveries[0].state).toBe("pending");
    await runInDurableObject(stub, (_, state) =>
      state.storage.sql.exec(
        "UPDATE notification_jobs SET createdAt=?,nextAt=0",
        Date.now() - 86400001,
      ),
    );
    await stub.dispatchNotifications();
    expect((await status(stub, plugin.id)).deliveries[0].state).toBe("failed");
  });
  it("validates request formats, supports Feishu text, and rejects oversize bodies", async () => {
    const { token } = await setup();
    for (const body of [
      { text: "" },
      { text: "x".repeat(4001) },
      { text: "hi", userId: "someone-else" },
      { msg_type: "image", content: { text: "hi" } },
    ])
      expect((await send(token, body)).status).toBe(400);
    expect(
      (await send(token, { msg_type: "text", content: { text: "hello\nworld" } })).status,
    ).toBe(202);
    const auth = { authorization: `Bearer ${token}` };
    expect(
      (await request("/api/notify", { method: "POST", headers: auth, body: "hello" })).status,
    ).toBe(415);
    expect(
      (
        await request("/api/notify", {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: "{",
        })
      ).status,
    ).toBe(400);
    expect((await send(token, { text: "x".repeat(33000) })).status).toBe(413);
  });
  it("limits bursts per account across plugin instances without blocking idempotent retries", async () => {
    const { stub, token } = await setup();
    for (let i = 0; i < 30; i++)
      expect((await send(token, { text: "hi" }, `limit-${i}`)).status).toBe(202);
    expect((await send(token, { text: "hi" }, "limit-new")).status).toBe(429);
    expect((await send(token, { text: "hi" }, "limit-0")).status).toBe(202);
    const other = (
      await api(stub, "plugin.save", { pluginId: "wechatai/notification", connectionId: "default" })
    ).data;
    const otherToken = (await api(stub, "notification.token", { id: other.id })).data.token;
    expect((await send(otherToken)).status).toBe(429);
  });
  it("publishes read-only documentation and valid JSON examples without authentication", async () => {
    const response = await request("/developers/notifications.md");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(notificationGuide);
    const protocol = await request("/api/plugins/notifications");
    expect(protocol.status).toBe(200);
    expect(await protocol.json()).toMatchObject({ billing: { requiresPlus: false, credits: 0 } });
    for (const block of notificationGuide.matchAll(/```json\n([\s\S]*?)\n```/g))
      expect(() => JSON.parse(block[1])).not.toThrow();
  });
});
