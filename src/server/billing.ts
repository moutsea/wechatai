import Stripe from "stripe";
import { AppError, secret } from "./config";
import {
  BILLING_OFFERS,
  BILLING_SERVICE,
  type BillingCatalog,
  type BillingOfferId,
  type CheckoutStatus,
  type SubscriptionInfo,
} from "../shared/billing";

type Offer = (typeof BILLING_OFFERS)[number];
type Order = {
  id: string;
  user_id: string;
  mode: string;
  offer_id: BillingOfferId;
  kind: "plus" | "credits";
  price_id: string;
  amount: number;
  currency: string;
  credits: number;
  customer_id: string;
  session_id: string | null;
  subscription_id: string | null;
  status: string;
  created_at: number;
};
const objectId = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id;
export function billingMode(env: Env): "test" | "live" {
  return secret(env, "STRIPE_SECRET_KEY", false).startsWith("sk_live_") ? "live" : "test";
}
function stripeClient(env: Env) {
  const key = secret(env, "STRIPE_SECRET_KEY", false);
  if (!key) throw new AppError("billing_unavailable", "支付尚未开放，请稍后再来", 503);
  // Never permit a live key in a local development checkout.
  if (billingMode(env) === "live" && new URL(env.APP_URL).protocol !== "https:")
    throw new AppError("billing_configuration", "正式支付需要 HTTPS 站点", 503);
  return new Stripe(key, {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
    timeout: 15000,
  });
}
export function billingEnabled(env: Env) {
  return Boolean(
    secret(env, "STRIPE_SECRET_KEY", false) &&
    secret(env, "STRIPE_WEBHOOK_SECRET", false) &&
    secret(env, "STRIPE_PORTAL_CONFIG_ID", false),
  );
}
function offerFor(id: string): Offer {
  const offer = BILLING_OFFERS.find((item) => item.id === id);
  if (!offer) throw new AppError("invalid_plan", "无效的购买方案");
  return offer;
}
function belongs(env: Env, metadata: Stripe.Metadata | null | undefined) {
  return metadata?.service === BILLING_SERVICE && metadata.environment === billingMode(env);
}
function mismatch(): never {
  throw new AppError("payment_mismatch", "支付订单校验未通过", 400);
}
async function verifiedPrice(env: Env, offer: Offer) {
  const id = secret(env, offer.priceEnv, false);
  if (!id || !billingEnabled(env))
    throw new AppError("billing_unavailable", "该方案尚未开放购买", 503);
  const price = await stripeClient(env).prices.retrieve(id, { expand: ["product"] });
  const product = price.product;
  if (
    !price.active ||
    price.livemode !== (billingMode(env) === "live") ||
    price.currency !== "cny" ||
    price.unit_amount !== offer.amount ||
    !belongs(env, price.metadata) ||
    price.metadata.offerId !== offer.id ||
    typeof product === "string" ||
    product.deleted ||
    !product.active ||
    !belongs(env, product.metadata) ||
    (offer.interval
      ? price.type !== "recurring" ||
        price.recurring?.interval !== offer.interval ||
        price.recurring.interval_count !== 1
      : price.type !== "one_time")
  )
    throw new AppError("billing_configuration", "支付方案配置不匹配，请联系支持", 503);
  return price;
}
export async function catalog(env: Env): Promise<BillingCatalog> {
  const offers = await Promise.all(
    BILLING_OFFERS.map(async (offer) => {
      let enabled = false;
      if (billingEnabled(env) && secret(env, offer.priceEnv, false)) {
        await verifiedPrice(env, offer);
        enabled = true;
      }
      return {
        id: offer.id,
        kind: offer.kind,
        name: offer.name,
        price: offer.amount / 100,
        currency: "cny" as const,
        credits: offer.credits,
        interval: offer.interval,
        enabled,
      };
    }),
  );
  return { mode: billingMode(env), offers };
}
async function ownedCustomer(env: Env, user: { id: string; email: string }) {
  const stripe = stripeClient(env);
  const mode = billingMode(env);
  const existing = await env.DB.prepare(
    "SELECT customer_id FROM billing_customer WHERE user_id = ? AND mode = ?",
  )
    .bind(user.id, mode)
    .first<{ customer_id: string }>();
  const customer = existing
    ? await stripe.customers.retrieve(existing.customer_id)
    : await stripe.customers.create(
        {
          email: user.email,
          metadata: { service: BILLING_SERVICE, environment: mode, userId: user.id },
        },
        { idempotencyKey: `wechatai:customer:${mode}:${user.id}` },
      );
  if (customer.deleted || !belongs(env, customer.metadata) || customer.metadata.userId !== user.id)
    mismatch();
  await env.DB.prepare(
    "INSERT INTO billing_customer (user_id, mode, customer_id) VALUES (?, ?, ?) ON CONFLICT(user_id, mode) DO NOTHING",
  )
    .bind(user.id, mode, customer.id)
    .run();
  return customer.id;
}
export async function checkout(env: Env, user: { id: string; email: string }, offerId: string) {
  const offer = offerFor(offerId);
  const price = await verifiedPrice(env, offer);
  const stripe = stripeClient(env);
  const mode = billingMode(env);
  const customer = await ownedCustomer(env, user);
  if (offer.kind === "plus") {
    const snapshot = await env.ACCOUNTS.getByName(user.id).snapshot();
    const subscriptions = await stripe.subscriptions.list({ customer, status: "all", limit: 100 });
    if (
      snapshot.plan === "plus" ||
      subscriptions.data.some(
        (sub) =>
          belongs(env, sub.metadata) &&
          ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"].includes(sub.status),
      )
    )
      throw new AppError(
        "already_subscribed",
        "已有会员或待处理订阅，请通过「管理订阅」处理续费",
        409,
      );
  }
  const pendingKey = `${mode}:${user.id}:${offer.kind === "plus" ? "plus" : offer.id}`;
  let order = await env.DB.prepare("SELECT * FROM billing_order WHERE pending_key = ?")
    .bind(pendingKey)
    .first<Order>();
  // Stripe's default Checkout lifetime is 24 hours. Recover abandoned creation
  // attempts after that window without reusing an expired idempotency key.
  if (
    order &&
    !order.session_id &&
    (Date.now() - order.created_at >= 24 * 60 * 60 * 1000 ||
      (order.offer_id === offer.id &&
        (order.price_id !== price.id || order.amount !== offer.amount)))
  ) {
    await env.DB.prepare(
      "UPDATE billing_order SET status = 'expired', pending_key = NULL WHERE id = ? AND status = 'created' AND session_id IS NULL",
    )
      .bind(order.id)
      .run();
    order = null;
  }
  if (order?.session_id) {
    const previous = await stripe.checkout.sessions.retrieve(order.session_id);
    if (previous.status === "complete") {
      await fulfillSession(env, previous);
      if (offer.kind === "plus" || previous.payment_status !== "paid")
        throw new AppError("payment_processing", "支付正在确认，请稍后刷新", 409);
      order = null;
    } else if (
      previous.status === "open" &&
      order.offer_id === offer.id &&
      order.price_id === price.id &&
      order.amount === offer.amount &&
      previous.url
    )
      return { url: previous.url };
    else {
      if (previous.status === "open") await stripe.checkout.sessions.expire(previous.id);
      await env.DB.prepare(
        "UPDATE billing_order SET status = 'expired', pending_key = NULL WHERE id = ? AND status != 'paid'",
      )
        .bind(order.id)
        .run();
      order = null;
    }
  }
  if (order && order.offer_id !== offer.id)
    throw new AppError("checkout_in_progress", "订单正在创建，请稍后重试", 409);
  if (!order) {
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT OR IGNORE INTO billing_order (id, user_id, mode, offer_id, kind, price_id, amount, currency, credits, customer_id, pending_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'cny', ?, ?, ?, ?)",
    )
      .bind(
        id,
        user.id,
        mode,
        offer.id,
        offer.kind,
        price.id,
        offer.amount,
        offer.credits,
        customer,
        pendingKey,
        Date.now(),
      )
      .run();
    order = await env.DB.prepare("SELECT * FROM billing_order WHERE pending_key = ?")
      .bind(pendingKey)
      .first<Order>();
  }
  if (!order || order.offer_id !== offer.id)
    throw new AppError("checkout_in_progress", "已有订单正在创建，请稍后重试", 409);
  const metadata = {
    service: BILLING_SERVICE,
    app: BILLING_SERVICE,
    environment: mode,
    orderId: order.id,
    userId: user.id,
    kind: offer.kind,
    offerId: offer.id,
  };
  const session = await stripe.checkout.sessions.create(
    {
      mode: offer.kind === "plus" ? "subscription" : "payment",
      customer,
      client_reference_id: order.id,
      line_items: [{ price: order.price_id, quantity: 1 }],
      payment_method_types: ["card"],
      branding_settings: { display_name: "微伴 Wechatai", button_color: "#59f294" },
      custom_text: {
        submit: {
          message:
            offer.kind === "credits"
              ? `到账 ${offer.credits.toLocaleString("en-US")} credits，不随每日刷新清零。模型 API 费用另付。`
              : `${offer.interval === "year" ? "年付" : "月付"} Plus，每日 1,000 credits。可在会员页管理或取消续费。模型 API 费用另付。`,
        },
      },
      locale: "zh",
      allow_promotion_codes: false,
      success_url: `${env.APP_URL}/app/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.APP_URL}/app/billing?checkout=cancelled`,
      metadata,
      ...(offer.kind === "plus"
        ? { subscription_data: { metadata } }
        : { payment_intent_data: { metadata } }),
    },
    { idempotencyKey: `wechatai:checkout:${mode}:${order.id}` },
  );
  await env.DB.prepare(
    "UPDATE billing_order SET session_id = ?, status = CASE WHEN status = 'created' THEN 'open' ELSE status END WHERE id = ?",
  )
    .bind(session.id, order.id)
    .run();
  if (!session.url) throw new AppError("checkout_failed", "未能创建支付页面", 502);
  return { url: session.url };
}
async function orderForMetadata(env: Env, metadata: Stripe.Metadata | null | undefined) {
  if (!belongs(env, metadata)) return null;
  const order = await env.DB.prepare("SELECT * FROM billing_order WHERE id = ? AND mode = ?")
    .bind(metadata!.orderId || "", billingMode(env))
    .first<Order>();
  if (
    !order ||
    order.user_id !== metadata!.userId ||
    order.offer_id !== metadata!.offerId ||
    order.kind !== metadata!.kind
  )
    mismatch();
  return order;
}
async function syncSubscription(env: Env, sub: Stripe.Subscription) {
  const order = await orderForMetadata(env, sub.metadata);
  if (!order) return;
  const offer = offerFor(order.offer_id);
  const item = sub.items.data[0];
  if (
    order.kind !== "plus" ||
    sub.livemode !== (billingMode(env) === "live") ||
    objectId(sub.customer) !== order.customer_id ||
    sub.items.data.length !== 1 ||
    item.price.id !== order.price_id ||
    item.quantity !== 1 ||
    item.price.recurring?.interval !== offer.interval
  )
    mismatch();
  await env.DB.prepare(
    "INSERT INTO billing_subscription (id, user_id, mode, customer_id, offer_id, status, cancel_at_period_end, period_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, cancel_at_period_end = excluded.cancel_at_period_end, period_end = excluded.period_end",
  )
    .bind(
      sub.id,
      order.user_id,
      billingMode(env),
      order.customer_id,
      order.offer_id,
      sub.status,
      sub.cancel_at_period_end || sub.cancel_at ? 1 : 0,
      item.current_period_end * 1000,
    )
    .run();
}
async function fulfillInvoice(
  env: Env,
  invoice: Stripe.Invoice,
  suppliedSub?: Stripe.Subscription,
) {
  const metadata = invoice.parent?.subscription_details?.metadata;
  if (
    !belongs(env, metadata) ||
    invoice.status !== "paid" ||
    !["subscription_create", "subscription_cycle"].includes(invoice.billing_reason || "")
  )
    return;
  const order = await orderForMetadata(env, metadata);
  if (!order) return;
  const subId = objectId(invoice.parent?.subscription_details?.subscription);
  if (
    !subId ||
    order.kind !== "plus" ||
    invoice.livemode !== (billingMode(env) === "live") ||
    objectId(invoice.customer) !== order.customer_id ||
    invoice.currency !== order.currency ||
    invoice.amount_paid !== order.amount
  )
    mismatch();
  const lines = invoice.lines.data.filter(
    (line) =>
      line.pricing?.price_details?.price === order.price_id &&
      !line.parent?.subscription_item_details?.proration,
  );
  if (
    invoice.lines.has_more ||
    lines.length !== 1 ||
    lines[0].quantity !== 1 ||
    lines[0].amount !== order.amount ||
    !Number.isSafeInteger(lines[0].period.end) ||
    lines[0].period.end <= lines[0].period.start
  )
    mismatch();
  const stripe = stripeClient(env);
  const sub = suppliedSub || (await stripe.subscriptions.retrieve(subId));
  if (sub.id !== subId || sub.metadata.orderId !== order.id || !belongs(env, sub.metadata))
    mismatch();
  await syncSubscription(env, sub);
  await env.ACCOUNTS.getByName(order.user_id).applyPayment({
    id: invoice.id,
    kind: "subscription",
    units: 0,
    expires: lines[0].period.end * 1000,
    subscriptionId: subId,
  });
  await env.DB.prepare(
    "UPDATE billing_order SET status = 'paid', pending_key = NULL, subscription_id = ?, paid_at = COALESCE(paid_at, ?) WHERE id = ?",
  )
    .bind(subId, Date.now(), order.id)
    .run();
}
async function fulfillSession(env: Env, session: Stripe.Checkout.Session) {
  const order = await orderForMetadata(env, session.metadata);
  if (!order || session.payment_status !== "paid" || session.status !== "complete") return;
  if (
    session.livemode !== (billingMode(env) === "live") ||
    session.client_reference_id !== order.id ||
    objectId(session.customer) !== order.customer_id ||
    (order.session_id && order.session_id !== session.id) ||
    session.mode !== (order.kind === "plus" ? "subscription" : "payment") ||
    session.amount_total !== order.amount ||
    session.currency !== order.currency
  )
    mismatch();
  const stripe = stripeClient(env);
  const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 2 });
  if (
    items.has_more ||
    items.data.length !== 1 ||
    items.data[0].price?.id !== order.price_id ||
    items.data[0].quantity !== 1 ||
    items.data[0].amount_total !== order.amount
  )
    mismatch();
  if (order.kind === "credits") {
    if (!objectId(session.payment_intent)) mismatch();
    await env.ACCOUNTS.getByName(order.user_id).applyPayment({
      id: session.id,
      kind: "purchase",
      units: order.credits * 1000,
      expires: Number.MAX_SAFE_INTEGER,
    });
    await env.DB.prepare(
      "UPDATE billing_order SET status = 'paid', pending_key = NULL, session_id = ?, paid_at = COALESCE(paid_at, ?) WHERE id = ?",
    )
      .bind(session.id, Date.now(), order.id)
      .run();
  } else {
    const subId = objectId(session.subscription);
    if (!subId) mismatch();
    const sub = await stripe.subscriptions.retrieve(subId);
    const invoiceId = objectId(sub.latest_invoice);
    if (invoiceId) await fulfillInvoice(env, await stripe.invoices.retrieve(invoiceId), sub);
  }
}
export async function checkoutStatus(
  env: Env,
  userId: string,
  sessionId: string,
): Promise<CheckoutStatus> {
  const order = await env.DB.prepare(
    "SELECT * FROM billing_order WHERE session_id = ? AND user_id = ? AND mode = ?",
  )
    .bind(sessionId, userId, billingMode(env))
    .first<Order>();
  if (!order) throw new AppError("not_found", "没有找到这个支付订单", 404);
  if (order.status === "paid") return { status: "paid", kind: order.kind, credits: order.credits };
  const session = await stripeClient(env).checkout.sessions.retrieve(sessionId);
  await fulfillSession(env, session);
  const updated = await env.DB.prepare("SELECT status FROM billing_order WHERE id = ?")
    .bind(order.id)
    .first<{ status: string }>();
  return {
    status:
      updated?.status === "paid"
        ? "paid"
        : session.status === "expired"
          ? "expired"
          : updated?.status === "failed"
            ? "failed"
            : "pending",
    kind: order.kind,
    credits: order.credits,
  };
}
export async function subscriptionInfo(env: Env, userId: string): Promise<SubscriptionInfo> {
  if (!billingEnabled(env)) return null;
  const row = await env.DB.prepare(
    "SELECT * FROM billing_subscription WHERE user_id = ? AND mode = ? ORDER BY period_end DESC LIMIT 1",
  )
    .bind(userId, billingMode(env))
    .first<{
      id: string;
      offer_id: BillingOfferId;
      status: string;
      cancel_at_period_end: number;
      period_end: number;
    }>();
  return row
    ? {
        id: row.id,
        offerId: row.offer_id,
        status: row.status,
        cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
        periodEnd: row.period_end,
      }
    : null;
}
export async function portal(env: Env, user: { id: string; email: string }) {
  const existing = await env.DB.prepare(
    "SELECT customer_id FROM billing_customer WHERE user_id = ? AND mode = ?",
  )
    .bind(user.id, billingMode(env))
    .first<{ customer_id: string }>();
  if (!existing) throw new AppError("no_subscription", "尚无可管理的支付账户");
  const customer = await ownedCustomer(env, user);
  const configuration = secret(env, "STRIPE_PORTAL_CONFIG_ID");
  const stripe = stripeClient(env);
  const config = await stripe.billingPortal.configurations.retrieve(configuration);
  if (!config.active || !belongs(env, config.metadata)) mismatch();
  return {
    url: (
      await stripe.billingPortal.sessions.create({
        customer,
        configuration,
        return_url: `${env.APP_URL}/app/billing`,
      })
    ).url,
  };
}
export async function webhook(env: Env, body: string, signature: string) {
  const stripe = stripeClient(env);
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      secret(env, "STRIPE_WEBHOOK_SECRET"),
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    throw new AppError("invalid_signature", "Webhook 签名无效", 400);
  }
  if (event.livemode !== (billingMode(env) === "live")) return;
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  )
    await fulfillSession(env, event.data.object);
  else if (
    event.type === "checkout.session.expired" ||
    event.type === "checkout.session.async_payment_failed"
  ) {
    const order = await orderForMetadata(env, event.data.object.metadata);
    if (order && (!order.session_id || order.session_id === event.data.object.id))
      await env.DB.prepare(
        "UPDATE billing_order SET status = ?, pending_key = NULL WHERE id = ? AND status != 'paid'",
      )
        .bind(event.type.endsWith("expired") ? "expired" : "failed", order.id)
        .run();
  } else if (event.type === "invoice.paid") await fulfillInvoice(env, event.data.object);
  else if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    if (belongs(env, event.data.object.metadata))
      await syncSubscription(env, await stripe.subscriptions.retrieve(event.data.object.id));
  }
}
