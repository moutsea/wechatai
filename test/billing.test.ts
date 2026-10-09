import { env } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import authMigration from "../migrations/0001_auth.sql?raw";
import billingMigration from "../migrations/0002_billing.sql?raw";
import {
  webhook,
  catalog,
  checkout,
  checkoutStatus,
  portal,
  subscriptionInfo,
} from "../src/server/billing";
import { BILLING_OFFERS, type BillingOfferId } from "../src/shared/billing";
const testEnv = {
  ...env,
  STRIPE_SECRET_KEY: "sk_test_fake_not_live",
  STRIPE_WEBHOOK_SECRET: "whsec_test_only",
  STRIPE_PORTAL_CONFIG_ID: "bpc_test",
  ...Object.fromEntries(BILLING_OFFERS.map((o) => [o.priceEnv, `price_${o.id}`])),
};
beforeAll(async () => {
  await env.DB.exec(authMigration);
  await env.DB.batch(
    billingMigration
      .split(";")
      .filter((s) => s.trim())
      .map((s) => env.DB.prepare(s)),
  );
});
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("Unexpected external request"))),
  ),
);
afterEach(() => vi.unstubAllGlobals());
const metadata = (order: Awaited<ReturnType<typeof seed>>) => ({
  service: "wechatai",
  app: "wechatai",
  environment: "test",
  orderId: order.id,
  userId: order.userId,
  kind: order.offer.kind,
  offerId: order.offer.id,
});
async function seed(offerId: BillingOfferId = "credits_5000") {
  const userId: string = crypto.randomUUID();
  const id: string = crypto.randomUUID();
  const offer = BILLING_OFFERS.find((o) => o.id === offerId)!;
  const customer = `cus_${id}`;
  const session = `cs_${id}`;
  await env.DB.prepare(
    "INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES (?, 'Tester', ?, ?, ?)",
  )
    .bind(userId, `${userId}@example.test`, Date.now(), Date.now())
    .run();
  await env.DB.prepare("INSERT INTO billing_customer VALUES (?, 'test', ?)")
    .bind(userId, customer)
    .run();
  await env.DB.prepare(
    "INSERT INTO billing_order (id, user_id, mode, offer_id, kind, price_id, amount, currency, credits, customer_id, session_id, status, created_at) VALUES (?, ?, 'test', ?, ?, ?, ?, 'cny', ?, ?, ?, 'open', ?)",
  )
    .bind(
      id,
      userId,
      offerId,
      offer.kind,
      `price_${offer.id}`,
      offer.amount,
      offer.credits,
      customer,
      session,
      Date.now(),
    )
    .run();
  return { userId, id, offer, customer, session };
}
type Order = Awaited<ReturnType<typeof seed>>;
function paidSession(o: Order) {
  return {
    id: o.session,
    object: "checkout.session",
    livemode: false,
    status: "complete",
    mode: o.offer.kind === "plus" ? "subscription" : "payment",
    payment_status: "paid",
    currency: "cny",
    amount_total: Number(o.offer.amount),
    customer: o.customer,
    client_reference_id: o.id,
    payment_intent: `pi_${o.id}`,
    metadata: metadata(o),
  };
}
function subscription(o: Order, end: number) {
  return {
    id: `sub_${o.id}`,
    object: "subscription",
    livemode: false,
    metadata: metadata(o),
    customer: o.customer,
    status: "active",
    cancel_at_period_end: false,
    items: {
      data: [
        {
          quantity: 1,
          current_period_end: end,
          price: { id: `price_${o.offer.id}`, recurring: { interval: o.offer.interval } },
        },
      ],
    },
  };
}
function invoice(o: Order, end: number, id = `in_${o.id}`) {
  return {
    id,
    object: "invoice",
    livemode: false,
    status: "paid",
    customer: o.customer,
    currency: "cny",
    amount_paid: o.offer.amount,
    billing_reason: "subscription_cycle",
    parent: { subscription_details: { subscription: `sub_${o.id}`, metadata: metadata(o) } },
    lines: {
      has_more: false,
      data: [
        {
          quantity: 1,
          amount: o.offer.amount,
          pricing: { price_details: { price: `price_${o.offer.id}` } },
          period: { start: end - 1000, end },
        },
      ],
    },
  };
}
async function send(type: string, object: object, livemode = false) {
  const body = JSON.stringify({
    id: crypto.randomUUID(),
    object: "event",
    type,
    livemode,
    data: { object },
  });
  const time = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(testEnv.STRIPE_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${time}.${body}`),
  );
  return webhook(testEnv, body, `t=${time},v1=${Buffer.from(signature).toString("hex")}`);
}
function items(o: Order, price = `price_${o.offer.id}`) {
  return {
    object: "list",
    has_more: false,
    data: [{ price: { id: price }, quantity: 1, amount_total: o.offer.amount }],
  };
}

describe("isolated Stripe fulfillment", () => {
  it("shows the agreed catalog but disables unconfigured billing", async () => {
    const disabledEnv = { ...env, STRIPE_SECRET_KEY: "" };
    const result = await catalog(disabledEnv);
    expect(result.offers.every((o) => !o.enabled)).toBe(true);
    expect(result.offers.map((o) => o.price)).toEqual([9.9, 88, 9.9, 29, 59]);
    expect(result.offers.filter((o) => o.kind === "credits").map((o) => o.credits)).toEqual([
      5000, 20000, 50000,
    ]);
  });
  it.each([false, true])(
    "replaces an unpaid old-price checkout after repricing (no session: %s)",
    async (noSession) => {
      const o = await seed("plus_monthly");
      await env.DB.prepare(
        "UPDATE billing_order SET price_id = 'price_old', amount = 1900, session_id = ?, status = ?, pending_key = ? WHERE id = ?",
      )
        .bind(
          noSession ? null : o.session,
          noSession ? "created" : "open",
          `test:${o.userId}:plus`,
          o.id,
        )
        .run();
      let expired = 0;
      let newPrice = "";
      vi.mocked(fetch).mockImplementation(async (url, init) => {
        const path = new URL(String(url)).pathname;
        if (path.includes("/prices/"))
          return Response.json({
            id: "price_plus_monthly",
            active: true,
            livemode: false,
            currency: "cny",
            unit_amount: 990,
            type: "recurring",
            recurring: { interval: "month", interval_count: 1 },
            metadata: { service: "wechatai", environment: "test", offerId: "plus_monthly" },
            product: {
              id: "prod_plus",
              active: true,
              metadata: { service: "wechatai", environment: "test" },
            },
          });
        if (path.includes("/customers/"))
          return Response.json({
            id: o.customer,
            metadata: { service: "wechatai", environment: "test", userId: o.userId },
          });
        if (path === "/v1/subscriptions") return Response.json({ data: [], has_more: false });
        if (path.endsWith("/expire")) {
          expired++;
          return Response.json({ id: o.session, status: "expired" });
        }
        if (path.endsWith(o.session))
          return Response.json({
            id: o.session,
            status: "open",
            url: "https://checkout.stripe.com/old-price",
          });
        if (init?.method === "POST") {
          newPrice = new URLSearchParams(String(init.body)).get("line_items[0][price]") ?? "";
          return Response.json({
            id: `cs_new_${o.id}`,
            status: "open",
            url: "https://checkout.stripe.com/new-price",
          });
        }
        throw new Error("Unexpected mock endpoint");
      });
      const result = await checkout(
        testEnv,
        { id: o.userId, email: "test@example.test" },
        "plus_monthly",
      );
      expect(result.url).toContain("new-price");
      expect(newPrice).toBe("price_plus_monthly");
      expect(expired).toBe(noSession ? 0 : 1);
      expect(
        await env.DB.prepare("SELECT status, pending_key FROM billing_order WHERE id = ?")
          .bind(o.id)
          .first(),
      ).toMatchObject({ status: "expired", pending_key: null });
      expect(
        await env.DB.prepare(
          "SELECT amount, price_id FROM billing_order WHERE user_id = ? AND pending_key IS NOT NULL",
        )
          .bind(o.userId)
          .first(),
      ).toMatchObject({ amount: 990, price_id: "price_plus_monthly" });
    },
  );
  it("fulfills a historical paid invoice using its original order price", async () => {
    const o = await seed("plus_monthly");
    await env.DB.prepare(
      "UPDATE billing_order SET price_id = 'price_old', amount = 1900 WHERE id = ?",
    )
      .bind(o.id)
      .run();
    const end = Math.floor(Date.now() / 1000) + 86400;
    const oldSub = subscription(o, end);
    oldSub.items.data[0].price.id = "price_old";
    vi.mocked(fetch).mockImplementation(async () => Response.json(oldSub));
    const oldInvoice = invoice(o, end);
    await send("invoice.paid", {
      ...oldInvoice,
      amount_paid: 1900,
      lines: {
        has_more: false,
        data: [
          {
            ...oldInvoice.lines.data[0],
            amount: 1900,
            pricing: { price_details: { price: "price_old" } },
          },
        ],
      },
    });
    expect((await env.ACCOUNTS.getByName(o.userId).snapshot()).plan).toBe("plus");
  });
  it("rejects forged signatures", async () => {
    await expect(webhook(testEnv, "{}", "forged")).rejects.toThrow("签名无效");
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["kimiseek", "koinote", ""])(
    "ignores %s events before contacting Stripe or the database",
    async (service) => {
      await send("checkout.session.completed", {
        metadata: { service, type: "recharge" },
        payment_status: "paid",
      });
      await send("invoice.paid", {
        status: "paid",
        parent: { subscription_details: { metadata: { service } } },
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("ignores foreign Stripe modes and app environments", async () => {
    const o = await seed();
    await send("checkout.session.completed", paidSession(o), true);
    await send("checkout.session.completed", {
      ...paidSession(o),
      metadata: { ...metadata(o), environment: "live" },
    });
    expect(fetch).not.toHaveBeenCalled();
    expect((await env.ACCOUNTS.getByName(o.userId).snapshot()).wallet.purchased).toBe(0);
  });
  it("fulfills a recharge exactly once across different event types and ignores client-supplied credit amounts", async () => {
    const o = await seed();
    vi.mocked(fetch).mockResolvedValue(Response.json(items(o)));
    const session = { ...paidSession(o), metadata: { ...metadata(o), credits: "99999999" } };
    await send("checkout.session.completed", session);
    vi.mocked(fetch).mockResolvedValue(Response.json(items(o)));
    await send("checkout.session.async_payment_succeeded", session);
    const snap = await env.ACCOUNTS.getByName(o.userId).snapshot();
    expect(snap.wallet.purchased).toBe(5000);
    expect(snap.ledger.filter((l) => l.kind === "purchase")).toHaveLength(1);
  });
  it.each(["amount", "currency", "customer", "user", "order", "price"])(
    "rejects mismatched %s without granting credits",
    async (field) => {
      const o = await seed();
      const session = paidSession(o);
      if (field === "amount") session.amount_total = 1;
      if (field === "currency") session.currency = "usd";
      if (field === "customer") session.customer = "cus_other";
      if (field === "user") session.metadata.userId = "other-user";
      if (field === "order") session.metadata.orderId = "other-order";
      vi.mocked(fetch).mockImplementation(async () =>
        Response.json(items(o, field === "price" ? "price_kimiseek" : undefined)),
      );
      await expect(send("checkout.session.completed", session)).rejects.toThrow("校验未通过");
      expect((await env.ACCOUNTS.getByName(o.userId).snapshot()).wallet.purchased).toBe(0);
    },
  );
  it("does not grant unpaid, failed or expired payments", async () => {
    const o = await seed();
    await send("checkout.session.completed", { ...paidSession(o), payment_status: "unpaid" });
    await send("checkout.session.async_payment_failed", paidSession(o));
    await send("checkout.session.expired", paidSession(o));
    expect(fetch).not.toHaveBeenCalled();
    expect((await env.ACCOUNTS.getByName(o.userId).snapshot()).wallet.purchased).toBe(0);
  });
  it.each(["plus_monthly", "plus_yearly"] as const)(
    "activates %s once, extends on renewal, and never grants a whole month of credits",
    async (offerId) => {
      const o = await seed(offerId);
      const end = Math.floor(Date.now() / 1000) + (offerId === "plus_yearly" ? 365 : 30) * 86400;
      vi.mocked(fetch).mockImplementation(async () => Response.json(subscription(o, end)));
      const paid = invoice(o, end);
      await send("invoice.paid", paid);
      await send("invoice.paid", paid);
      let snap = await env.ACCOUNTS.getByName(o.userId).snapshot();
      expect(snap.plan).toBe("plus");
      expect(snap.planUntil).toBe(end * 1000);
      expect(snap.wallet.subscription).toBe(0);
      expect(snap.wallet.daily).toBe(1000);
      await send("invoice.paid", invoice(o, end + 86400, `in_renewal_${o.id}`));
      await send("invoice.paid", paid);
      snap = await env.ACCOUNTS.getByName(o.userId).snapshot();
      expect(snap.planUntil).toBe((end + 86400) * 1000);
      expect(snap.ledger.filter((l) => l.kind === "daily")).toHaveLength(1);
    },
  );
  it("ignores failed renewals and prorations", async () => {
    const o = await seed("plus_monthly");
    const end = Math.floor(Date.now() / 1000) + 86400;
    await send("invoice.payment_failed", invoice(o, end));
    await send("invoice.paid", { ...invoice(o, end), billing_reason: "subscription_update" });
    expect(fetch).not.toHaveBeenCalled();
    expect((await env.ACCOUNTS.getByName(o.userId).snapshot()).plan).toBe("free");
  });
  it.each(["period_end", "cancel_at"])(
    "keeps paid membership when renewal is cancelled with %s",
    async (mode) => {
      const o = await seed("plus_yearly");
      const end = Math.floor(Date.now() / 1000) + 86400;
      vi.mocked(fetch).mockImplementation(async () => Response.json(subscription(o, end)));
      await send("invoice.paid", invoice(o, end));
      vi.mocked(fetch).mockImplementation(async () =>
        Response.json({
          ...subscription(o, end),
          cancel_at_period_end: mode === "period_end",
          cancel_at: mode === "cancel_at" ? end : null,
        }),
      );
      await send("customer.subscription.updated", subscription(o, end));
      expect((await subscriptionInfo(testEnv, o.userId))?.cancelAtPeriodEnd).toBe(true);
      expect((await env.ACCOUNTS.getByName(o.userId).snapshot()).plan).toBe("plus");
      expect(
        await env.DB.prepare("SELECT cancel_at_period_end FROM billing_subscription WHERE id = ?")
          .bind(`sub_${o.id}`)
          .first("cancel_at_period_end"),
      ).toBe(1);
    },
  );
  it("does not reveal another user's checkout status", async () => {
    const o = await seed();
    await expect(checkoutStatus(testEnv, "other-user", o.session)).rejects.toThrow("没有找到");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("recovers fulfillment from a verified Stripe session if the webhook is delayed", async () => {
    const o = await seed();
    vi.mocked(fetch).mockImplementation(async (url) =>
      Response.json(String(url).includes("line_items") ? items(o) : paidSession(o)),
    );
    expect(await checkoutStatus(testEnv, o.userId, o.session)).toEqual({
      status: "paid",
      kind: "credits",
      credits: 5000,
    });
    expect((await env.ACCOUNTS.getByName(o.userId).snapshot()).wallet.purchased).toBe(5000);
  });
  it("rejects a customer owned by another service before opening the portal", async () => {
    const o = await seed();
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        id: o.customer,
        metadata: { service: "kimiseek", environment: "test", userId: o.userId },
      }),
    );
    await expect(portal(testEnv, { id: o.userId, email: "tester@example.test" })).rejects.toThrow(
      "校验未通过",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([false, true])(
    "creates scoped checkout and reuses pending orders (abandoned creation: %s)",
    async (abandoned) => {
      const o = await seed();
      if (abandoned) {
        await env.DB.prepare(
          "UPDATE billing_order SET session_id = NULL, status = 'created', pending_key = ?, created_at = ? WHERE id = ?",
        )
          .bind(`test:${o.userId}:credits_5000`, Date.now() - 25 * 60 * 60 * 1000, o.id)
          .run();
      }
      let body: URLSearchParams | undefined;
      let created = 0;
      vi.mocked(fetch).mockImplementation(async (url, init) => {
        const target = String(url);
        if (target.includes("/prices/"))
          return Response.json({
            id: `price_${o.offer.id}`,
            active: true,
            livemode: false,
            currency: "cny",
            unit_amount: 990,
            type: "one_time",
            metadata: { service: "wechatai", environment: "test", offerId: o.offer.id },
            product: {
              id: "prod_credits",
              active: true,
              metadata: { service: "wechatai", environment: "test" },
            },
          });
        if (target.includes("/customers/"))
          return Response.json({
            id: o.customer,
            metadata: { service: "wechatai", environment: "test", userId: o.userId },
          });
        if (init?.method === "POST") {
          body = new URLSearchParams(String(init.body));
          created++;
        }
        return Response.json({
          id: `cs_new_${o.id}`,
          status: "open",
          url: "https://checkout.stripe.com/test-session",
        });
      });
      const user = { id: o.userId, email: "tester@example.test" };
      await checkout(testEnv, user, "credits_5000");
      await checkout(testEnv, user, "credits_5000");
      expect(created).toBe(1);
      expect(body!.get("metadata[service]")).toBe("wechatai");
      expect(body!.get("payment_intent_data[metadata][service]")).toBe("wechatai");
      expect(body!.get("metadata[environment]")).toBe("test");
      expect(body!.get("success_url")).toContain("session_id={CHECKOUT_SESSION_ID}");
      expect(body!.get("branding_settings[display_name]")).toBe("微伴 Wechatai");
      if (abandoned) {
        const old = await env.DB.prepare(
          "SELECT status, pending_key FROM billing_order WHERE id = ?",
        )
          .bind(o.id)
          .first();
        expect(old).toMatchObject({ status: "expired", pending_key: null });
      }
    },
  );
});
