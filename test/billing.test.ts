import { env } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import authMigration from "../migrations/0001_auth.sql?raw";
import billingMigration from "../migrations/0002_billing.sql?raw";
import prepaidMigration from "../migrations/0004_prepaid_membership.sql?raw";
import notificationMigration from "../migrations/0006_billing_notifications.sql?raw";
import { dispatchPaymentNotices } from "../src/server/billing-notifications";
import {
  webhook,
  catalog,
  checkout,
  checkoutStatus,
  portal,
  subscriptionInfo,
} from "../src/server/billing";
import { BILLING_OFFERS, extendMembership, type BillingOfferId } from "../src/shared/billing";
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
    (billingMigration + "\n" + prepaidMigration + "\n" + notificationMigration)
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
async function send(type: string, object: object, livemode = false, bindings: Env = testEnv) {
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
  return webhook(bindings, body, `t=${time},v1=${Buffer.from(signature).toString("hex")}`);
}
function items(o: Order, price = `price_${o.offer.id}`) {
  return {
    object: "list",
    has_more: false,
    data: [{ price: { id: price }, quantity: 1, amount_total: o.offer.amount }],
  };
}

describe("isolated Stripe fulfillment", () => {
  it.each([
    ["2027-01-31T10:00:00+08:00", 1, "2027-02-28T10:00:00+08:00"],
    ["2028-01-31T00:30:00+08:00", 1, "2028-02-29T00:30:00+08:00"],
    ["2028-02-29T23:00:00+08:00", 12, "2029-02-28T23:00:00+08:00"],
  ] as const)("extends calendar months with month-end clamping: %s", (from, months, to) => {
    expect(extendMembership(Date.parse(from), months)).toBe(Date.parse(to));
  });
  it.each(["plus_monthly", "plus_yearly"] as const)(
    "fulfills prepaid %s once and extends existing membership",
    async (offerId) => {
      const o = await seed(offerId);
      const months = offerId === "plus_yearly" ? 12 : 1;
      await env.DB.prepare(
        "UPDATE billing_order SET checkout_mode = 'payment', membership_months = ? WHERE id = ?",
      )
        .bind(months, o.id)
        .run();
      const account = env.ACCOUNTS.getByName(o.userId);
      const until = Date.now() + 10 * 86400000;
      await account.applyPayment({
        id: "existing",
        kind: "subscription",
        units: 0,
        expires: until,
      });
      const session = {
        ...paidSession(o),
        mode: "payment",
        metadata: { ...metadata(o), membershipMonths: "999" },
      };
      vi.mocked(fetch).mockImplementation(async (url) =>
        Response.json(String(url).includes("line_items") ? items(o) : session),
      );
      // Wallets can complete asynchronously; unpaid completion must not grant time.
      await send("checkout.session.completed", { ...session, payment_status: "unpaid" });
      expect((await account.snapshot()).planUntil).toBe(until);
      await send("checkout.session.async_payment_succeeded", session);
      await send("checkout.session.completed", session);
      expect((await checkoutStatus(testEnv, o.userId, o.session)).status).toBe("paid");
      const snap = await account.snapshot();
      expect(snap.planUntil).toBe(extendMembership(until, months));
      expect(snap.wallet.daily).toBe(1000);
      expect(snap.wallet.subscription).toBe(0);
      expect(snap.wallet.purchased).toBe(0);
      expect(snap.ledger.filter((l) => l.kind === "daily")).toHaveLength(1);
    },
  );
  it("activates a new prepaid member and serializes simultaneous renewals", async () => {
    const account = env.ACCOUNTS.getByName(crypto.randomUUID());
    const before = Date.now();
    await account.applyPayment({ id: "first", kind: "membership", months: 1 });
    const first = await account.snapshot();
    expect(first.plan).toBe("plus");
    expect(first.planUntil).toBeGreaterThanOrEqual(extendMembership(before, 1));
    expect(first.planUntil).toBeLessThanOrEqual(extendMembership(Date.now(), 1));
    await Promise.all(
      [1, 2, 1].map((id) =>
        account.applyPayment({ id: `renewal-${id}`, kind: "membership", months: 1 }),
      ),
    );
    expect((await account.snapshot()).planUntil).toBe(
      extendMembership(extendMembership(first.planUntil, 1), 1),
    );
  });
  it.each(["mode", "months", "amount", "intent"])(
    "rejects mismatched prepaid %s",
    async (field) => {
      const o = await seed("plus_monthly");
      await env.DB.prepare(
        "UPDATE billing_order SET checkout_mode = 'payment', membership_months = ? WHERE id = ?",
      )
        .bind(field === "months" ? 12 : 1, o.id)
        .run();
      const session = { ...paidSession(o), mode: field === "mode" ? "subscription" : "payment" };
      if (field === "amount") session.amount_total = 1;
      if (field === "intent") session.payment_intent = "";
      vi.mocked(fetch).mockImplementation(async () => Response.json(items(o)));
      await expect(send("checkout.session.completed", session)).rejects.toThrow("校验未通过");
      expect((await env.ACCOUNTS.getByName(o.userId).snapshot()).plan).toBe("free");
    },
  );
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
            type: "one_time",
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
  it.each([false, true])(
    "requires canceling legacy automatic renewal before prepaid checkout (cancelled: %s)",
    async (cancelled) => {
      const o = await seed("plus_monthly");
      let created = 0;
      vi.mocked(fetch).mockImplementation(async (url, init) => {
        const path = new URL(String(url)).pathname;
        if (path.includes("/prices/"))
          return Response.json({
            id: `price_${o.offer.id}`,
            active: true,
            livemode: false,
            currency: "cny",
            unit_amount: 990,
            type: "one_time",
            metadata: { service: "wechatai", environment: "test", offerId: o.offer.id },
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
        if (path === "/v1/subscriptions")
          return Response.json({
            data: [
              {
                ...subscription(o, Math.floor(Date.now() / 1000) + 86400),
                cancel_at_period_end: cancelled,
              },
            ],
            has_more: false,
          });
        if (init?.method === "POST" && path === "/v1/checkout/sessions") {
          created++;
          return Response.json({
            id: `cs_new_${o.id}`,
            url: "https://checkout.stripe.com/new-session",
          });
        }
        throw new Error("Unexpected request");
      });
      const result = checkout(
        testEnv,
        { id: o.userId, email: "test@example.test" },
        "plus_monthly",
      );
      if (cancelled) {
        await expect(result).resolves.toHaveProperty("url");
        expect(created).toBe(1);
      } else {
        await expect(result).rejects.toThrow("先通过「管理订阅」取消自动续费");
        expect(created).toBe(0);
      }
    },
  );
  it("replaces a card-only pending credits checkout when wallets are enabled", async () => {
    const o = await seed();
    await env.DB.prepare("UPDATE billing_order SET pending_key = ? WHERE id = ?")
      .bind(`test:${o.userId}:credits_5000`, o.id)
      .run();
    let expired = false;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path.includes("/prices/"))
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
      if (path.includes("/customers/"))
        return Response.json({
          id: o.customer,
          metadata: { service: "wechatai", environment: "test", userId: o.userId },
        });
      if (path.endsWith("/expire")) {
        expired = true;
        return Response.json({ id: o.session, status: "expired" });
      }
      if (path.endsWith(o.session))
        return Response.json({
          id: o.session,
          mode: "payment",
          payment_method_types: ["card"],
          status: "open",
          url: "https://checkout.stripe.com/old",
        });
      if (init?.method === "POST")
        return Response.json({ id: `cs_new_${o.id}`, url: "https://checkout.stripe.com/new" });
      throw new Error("Unexpected request");
    });
    expect(
      (await checkout(testEnv, { id: o.userId, email: "test@example.test" }, "credits_5000")).url,
    ).toBe("https://checkout.stripe.com/new");
    expect(expired).toBe(true);
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
  it.each([
    [false, "credits_5000"],
    [true, "credits_5000"],
    [false, "plus_monthly"],
    [false, "plus_yearly"],
  ] as const)(
    "creates wallet checkout and reuses pending orders (abandoned: %s, offer: %s)",
    async (abandoned, offerId) => {
      const o = await seed(offerId);
      if (o.offer.kind === "plus")
        await env.ACCOUNTS.getByName(o.userId).applyPayment({
          id: "prepaid-existing",
          kind: "membership",
          months: 1,
        });
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
            unit_amount: o.offer.amount,
            type: "one_time",
            metadata: { service: "wechatai", environment: "test", offerId: o.offer.id },
            product: {
              id: "prod_credits",
              active: true,
              metadata: { service: "wechatai", environment: "test" },
            },
          });
        if (target.includes("/subscriptions")) return Response.json({ data: [], has_more: false });
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
          mode: "payment",
          payment_method_types: ["card", "alipay", "wechat_pay"],
          status: "open",
          url: "https://checkout.stripe.com/test-session",
        });
      });
      const user = { id: o.userId, email: "tester@example.test" };
      await checkout(testEnv, user, offerId);
      await checkout(testEnv, user, offerId);
      expect(created).toBe(1);
      expect(body!.get("mode")).toBe("payment");
      expect([0, 1, 2].map((i) => body!.get(`payment_method_types[${i}]`))).toEqual([
        "card",
        "alipay",
        "wechat_pay",
      ]);
      expect(body!.get("payment_method_options[wechat_pay][client]")).toBe("web");
      expect(body!.has("subscription_data[metadata][service]")).toBe(false);
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

describe("durable administrator payment notices", () => {
  const liveEnv = {
    ...testEnv,
    APP_URL: "https://wechatai.app" as const,
    STRIPE_SECRET_KEY: "sk_live_fixture_not_real",
    BILLING_NOTIFY_TOKEN: "fixture-notification-token",
  };
  async function liveOrder(offerId: BillingOfferId = "credits_5000") {
    const o = await seed(offerId);
    await env.DB.prepare(
      "UPDATE billing_order SET mode='live',checkout_mode='payment',membership_months=? WHERE id=?",
    )
      .bind(o.offer.kind === "plus" ? (o.offer.interval === "year" ? 12 : 1) : 0, o.id)
      .run();
    return o;
  }
  function session(o: Order) {
    return {
      ...paidSession(o),
      livemode: true,
      mode: "payment",
      metadata: { ...metadata(o), environment: "live" },
    };
  }
  async function notice(id: string) {
    return env.DB.prepare("SELECT * FROM billing_notification WHERE payment_id=?").bind(id).first<{
      state: string;
      data: string;
      attempts: number;
      next_at: number;
      error: string;
      delivery_id: string;
    }>();
  }
  function upstream(
    o: Order,
    receive: (init: RequestInit) => Response | Promise<Response> = () =>
      Response.json({ id: crypto.randomUUID(), status: "pending" }, { status: 202 }),
  ) {
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/api/notify") return receive(init!);
      if (path.endsWith("/line_items")) return Response.json(items(o));
      if (path.endsWith(o.session)) return Response.json(session(o));
      throw new Error(`Unexpected fixture path: ${path}`);
    });
  }
  const posts = () =>
    vi.mocked(fetch).mock.calls.filter(([url]) => new URL(String(url)).pathname === "/api/notify");

  it.each(["plus_monthly", "plus_yearly", "credits_5000"] as const)(
    "queues %s only after verified fulfillment, and deduplicates callbacks",
    async (offerId) => {
      const o = await liveOrder(offerId);
      upstream(o);
      await send("checkout.session.completed", session(o), true, liveEnv);
      expect(await notice(o.session)).toMatchObject({ state: "pending", attempts: 0 });
      expect(posts()).toHaveLength(0);
      await dispatchPaymentNotices(liveEnv);
      expect(await notice(o.session)).toMatchObject({ state: "accepted", data: "", attempts: 1 });
      const request = posts()[0][1]!;
      expect(new Headers(request.headers).get("authorization")).toBe(
        "Bearer fixture-notification-token",
      );
      expect(new Headers(request.headers).get("idempotency-key")).toBe(
        `wechatai:payment:${o.session}`,
      );
      const body = JSON.parse(String(request.body));
      expect(body.title).toBe("微伴收款成功");
      expect(body.text).toContain(`实付：¥${(o.offer.amount / 100).toFixed(2)}`);
      expect(body.text).toContain("首次付款");
      expect(body.text).toContain(o.id);
      await send("checkout.session.async_payment_succeeded", session(o), true, liveEnv);
      expect((await checkoutStatus(liveEnv, o.userId, o.session)).status).toBe("paid");
      await dispatchPaymentNotices(liveEnv);
      expect(posts()).toHaveLength(1);
    },
  );
  it("ignores unpaid, failed, foreign-business and test events; rejects mismatches", async () => {
    const o = await liveOrder();
    upstream(o);
    await send(
      "checkout.session.completed",
      { ...session(o), payment_status: "unpaid" },
      true,
      liveEnv,
    );
    await send("checkout.session.async_payment_failed", session(o), true, liveEnv);
    await send(
      "checkout.session.completed",
      { ...session(o), metadata: { ...session(o).metadata, service: "kimiseek", app: "kimiseek" } },
      true,
      liveEnv,
    );
    await send("checkout.session.completed", session(o), false, liveEnv);
    await expect(
      send("checkout.session.completed", { ...session(o), amount_total: 1 }, true, liveEnv),
    ).rejects.toThrow();
    await expect(webhook(liveEnv, "{}", "invalid")).rejects.toThrow("签名无效");
    expect(await notice(o.session)).toBeNull();
    expect(posts()).toHaveLength(0);
    const test = await seed();
    upstream(test);
    await send("checkout.session.completed", paidSession(test), false, {
      ...testEnv,
      BILLING_NOTIFY_TOKEN: "fixture",
    } as Env);
    expect(await notice(test.session)).toBeNull();
  });
  it("recovers through checkout status and retries with the same frozen content and key", async () => {
    const o = await liveOrder();
    upstream(o, () => new Response("unavailable", { status: 503 }));
    expect((await checkoutStatus(liveEnv, o.userId, o.session)).status).toBe("paid");
    await dispatchPaymentNotices(liveEnv);
    expect(await notice(o.session)).toMatchObject({
      state: "pending",
      attempts: 1,
      error: "http_503",
    });
    const original = posts()[0][1]!;
    await env.DB.prepare("UPDATE user SET name='Changed' WHERE id=?").bind(o.userId).run();
    await send("checkout.session.completed", session(o), true, liveEnv);
    await dispatchPaymentNotices(liveEnv);
    expect(posts()).toHaveLength(1); // Backoff is respected.
    await env.DB.prepare("UPDATE billing_notification SET next_at=0 WHERE payment_id=?")
      .bind(o.session)
      .run();
    upstream(o);
    await dispatchPaymentNotices(liveEnv);
    expect(await notice(o.session)).toMatchObject({ state: "accepted", attempts: 2 });
    const retried = posts()[1][1]!;
    expect(retried.body).toBe(original.body);
    expect(retried.headers).toEqual(original.headers);
    expect((await env.ACCOUNTS.getByName(o.userId).snapshot()).wallet.purchased).toBe(
      o.offer.credits,
    );
  });
  it("leases jobs across concurrent dispatchers and recovers an interrupted delivery", async () => {
    const o = await liveOrder();
    upstream(o);
    await send("checkout.session.completed", session(o), true, liveEnv);
    await env.DB.prepare(
      "UPDATE billing_notification SET state='sending',attempts=1,next_at=? WHERE payment_id=?",
    )
      .bind(Date.now() + 60_000, o.session)
      .run();
    await dispatchPaymentNotices(liveEnv);
    expect(posts()).toHaveLength(0);
    await env.DB.prepare("UPDATE billing_notification SET next_at=0 WHERE payment_id=?")
      .bind(o.session)
      .run();
    await Promise.all([dispatchPaymentNotices(liveEnv), dispatchPaymentNotices(liveEnv)]);
    expect(posts()).toHaveLength(1);
    expect(await notice(o.session)).toMatchObject({ state: "accepted", attempts: 2 });
  });
  it("expires unavailable notices after 24 hours while retaining their deduplication ids", async () => {
    const o = await liveOrder();
    upstream(o);
    await send("checkout.session.completed", session(o), true, liveEnv);
    await env.DB.prepare("UPDATE billing_notification SET created_at=? WHERE payment_id=?")
      .bind(Date.now() - 25 * 3600000, o.session)
      .run();
    await dispatchPaymentNotices(liveEnv);
    await send("checkout.session.completed", session(o), true, liveEnv);
    expect(await notice(o.session)).toMatchObject({
      state: "failed",
      data: "",
      error: "delivery_expired",
    });
    expect(posts()).toHaveLength(0);
  });
  it("supports first-payment-only scope without sending repeat purchases", async () => {
    const first = await liveOrder();
    const scoped = { ...liveEnv, BILLING_NOTIFY_SCOPE: "first_payment" };
    upstream(first);
    await send("checkout.session.completed", session(first), true, scoped);
    const next = await liveOrder();
    await env.DB.prepare("UPDATE billing_order SET user_id=? WHERE id=?")
      .bind(first.userId, next.id)
      .run();
    next.userId = first.userId;
    upstream(next);
    await send("checkout.session.completed", session(next), true, scoped);
    expect(await notice(first.session)).toMatchObject({ state: "pending" });
    expect(await notice(next.session)).toBeNull();
    expect((await checkoutStatus(scoped, next.userId, next.session)).status).toBe("paid");
  });
  it("queues each legacy subscription invoice exactly once", async () => {
    const o = await liveOrder("plus_monthly");
    await env.DB.prepare("UPDATE billing_order SET checkout_mode=NULL WHERE id=?").bind(o.id).run();
    const end = Math.floor(Date.now() / 1000) + 30 * 86400;
    const sub = { ...subscription(o, end), livemode: true, metadata: session(o).metadata };
    vi.mocked(fetch).mockImplementation(async () => Response.json(sub));
    for (const n of [1, 2, 2]) {
      const paid = invoice(o, end + n * 30 * 86400, `in_${o.id}_${n}`);
      await send(
        "invoice.paid",
        {
          ...paid,
          livemode: true,
          parent: { subscription_details: { subscription: sub.id, metadata: sub.metadata } },
        },
        true,
        liveEnv,
      );
    }
    expect(JSON.parse((await notice(`in_${o.id}_1`))!.data).firstPayment).toBe(1);
    expect(JSON.parse((await notice(`in_${o.id}_2`))!.data)).toMatchObject({
      firstPayment: 0,
      renewal: 1,
    });
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM billing_notification WHERE order_id=?",
    )
      .bind(o.id)
      .first<{ n: number }>();
    expect(count!.n).toBe(2);
  });
  it("commits notice and paid status together and safely resumes after a database failure", async () => {
    const o = await liveOrder();
    upstream(o);
    await env.DB.exec(
      "CREATE TRIGGER reject_notice BEFORE INSERT ON billing_notification BEGIN SELECT RAISE(ABORT, 'fixture_failure'); END;",
    );
    try {
      await expect(send("checkout.session.completed", session(o), true, liveEnv)).rejects.toThrow(
        "fixture_failure",
      );
      expect(await notice(o.session)).toBeNull();
      expect(
        await env.DB.prepare("SELECT status FROM billing_order WHERE id=?").bind(o.id).first(),
      ).toMatchObject({ status: "open" });
    } finally {
      await env.DB.exec("DROP TRIGGER reject_notice");
    }
    await send("checkout.session.completed", session(o), true, liveEnv);
    expect(await notice(o.session)).toMatchObject({ state: "pending" });
    expect((await env.ACCOUNTS.getByName(o.userId).snapshot()).wallet.purchased).toBe(
      o.offer.credits,
    );
  });
});
