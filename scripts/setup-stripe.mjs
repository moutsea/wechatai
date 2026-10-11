import { readFile, writeFile, chmod } from "node:fs/promises";
import Stripe from "stripe";
import { productionOrigin } from "./site-origin.mjs";
// Explicitly scoped: never edit another service's products, prices, portal or webhooks.
const keys = JSON.parse(await readFile(".stripe.local", "utf8"));
const offers = [
  ["plus_monthly", "Plus 月付", 990, "month", 0, "STRIPE_PLUS_MONTHLY_PRICE_ID"],
  ["plus_yearly", "Plus 年付", 8800, "year", 0, "STRIPE_PLUS_YEARLY_PRICE_ID"],
  ["credits_5000", "Credits 5,000", 990, null, 5000, "STRIPE_CREDITS_5000_PRICE_ID"],
  ["credits_20000", "Credits 20,000", 2900, null, 20000, "STRIPE_CREDITS_20000_PRICE_ID"],
  ["credits_50000", "Credits 50,000", 5900, null, 50000, "STRIPE_CREDITS_50000_PRICE_ID"],
];
const at = process.argv.indexOf("--mode");
const mode = at < 0 ? "test" : process.argv[at + 1];
if (!["test", "live"].includes(mode)) throw new Error("Use --mode test or --mode live");
if (typeof keys[mode] !== "string" || !keys[mode].startsWith(`sk_${mode}_`))
  throw new Error("Missing Stripe key for the selected environment");
const origin = mode === "live" ? productionOrigin() : "http://localhost:5173";
{
  const stripe = new Stripe(keys[mode], { timeout: 15000, maxNetworkRetries: 2 });
  const metadata = { service: "wechatai", environment: mode };
  const products = await stripe.products.list({ limit: 100 });
  const groups = {};
  for (const kind of ["plus", "credits"]) {
    groups[kind] =
      products.data.find(
        (p) =>
          p.metadata.service === "wechatai" &&
          p.metadata.environment === mode &&
          p.metadata.kind === kind &&
          p.active,
      ) ||
      (await stripe.products.create(
        {
          name: kind === "plus" ? "Wechatai 微伴 Plus" : "Wechatai 微伴 Credits",
          description:
            kind === "plus"
              ? "个人微信 AI 会员：每日 1,000 credits、网页历史记录与会话管理。模型 API 费用另付。"
              : "微伴平台服务额度，不随每日刷新清零；不包含模型供应商 API 费用，不附带 Plus 会员权益。",
          metadata: { ...metadata, kind },
        },
        { idempotencyKey: `wechatai:product:v1:${mode}:${kind}` },
      ));
  }
  let previous = {};
  try {
    previous = JSON.parse(await readFile(`.stripe-${mode}.local`, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  // Re-running product setup must not discard this service's webhook secret.
  const config = { ...previous, STRIPE_SECRET_KEY: keys[mode] };
  const summary = [];
  for (const [id, name, amount, interval, credits, envName] of offers) {
    const key = `wechatai_${id}${interval ? "_prepaid" : ""}_cny_${amount}_v1`;
    const prices = await stripe.prices.list({ lookup_keys: [key], active: true, limit: 10 });
    const price =
      prices.data[0] ||
      (await stripe.prices.create(
        {
          product: groups[interval ? "plus" : "credits"].id,
          currency: "cny",
          unit_amount: amount,
          nickname: `Wechatai ${name}`,
          lookup_key: key,
          metadata: {
            ...metadata,
            offerId: id,
            credits: String(credits),
            ...(interval ? { membershipMonths: interval === "year" ? "12" : "1" } : {}),
          },
        },
        { idempotencyKey: `wechatai:price:${mode}:${key}` },
      ));
    if (
      price.metadata.service !== "wechatai" ||
      price.metadata.environment !== mode ||
      price.unit_amount !== amount ||
      price.currency !== "cny" ||
      price.type !== "one_time" ||
      price.metadata.offerId !== id ||
      price.product !== groups[interval ? "plus" : "credits"].id
    )
      throw new Error("Existing price conflicts with Wechatai catalog");
    config[envName] = price.id;
    summary.push({ offer: id, priceId: price.id, amount: amount / 100, credits });
  }
  const portals = await stripe.billingPortal.configurations.list({ limit: 100, active: true });
  const portal =
    portals.data.find(
      (p) => p.metadata?.service === "wechatai" && p.metadata.environment === mode,
    ) ||
    (await stripe.billingPortal.configurations.create(
      {
        business_profile: { headline: "管理你的微伴 Wechatai 订阅" },
        default_return_url: `${origin}/app/billing`,
        features: {
          invoice_history: { enabled: true },
          payment_method_update: { enabled: true },
          subscription_cancel: { enabled: true, mode: "at_period_end", proration_behavior: "none" },
          subscription_update: { enabled: false },
        },
        metadata,
      },
      { idempotencyKey: `wechatai:portal:v1:${mode}` },
    ));
  config.STRIPE_PORTAL_CONFIG_ID = portal.id;
  // Save keys privately; summaries deliberately contain no credentials.
  await writeFile(`.stripe-${mode}.local`, JSON.stringify(config, null, 2), { mode: 0o600 });
  await chmod(`.stripe-${mode}.local`, 0o600);
  await writeFile(
    `.stripe-${mode}-resources.local`,
    JSON.stringify(
      {
        products: Object.fromEntries(Object.entries(groups).map(([key, p]) => [key, p.id])),
        prices: summary,
        portal: portal.id,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(JSON.stringify({ mode, prices: summary, portal: portal.id }));
}
