import { readFile, writeFile } from "node:fs/promises";
import Stripe from "stripe";

const file = ".stripe-live.local";
const config = JSON.parse(await readFile(file, "utf8"));
if (!config.STRIPE_SECRET_KEY.startsWith("sk_live_"))
  throw new Error("Live configuration required");
const stripe = new Stripe(config.STRIPE_SECRET_KEY, { timeout: 15000, maxNetworkRetries: 2 });
const url = "https://wechatai.app/api/billing/webhook";
const events = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "invoice.paid",
  "customer.subscription.updated",
  "customer.subscription.deleted",
];
try {
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  let endpoint = endpoints.data.find((e) => e.url === url);
  const creating = !endpoint;
  if (
    endpoint &&
    (endpoint.metadata.service !== "wechatai" || endpoint.metadata.environment !== "live")
  )
    throw new Error("Endpoint ownership mismatch");
  if (!endpoint) {
    endpoint = await stripe.webhookEndpoints.create(
      {
        url,
        api_version: "2026-08-26.dahlia",
        enabled_events: events,
        description: "Wechatai 微伴 production billing only",
        metadata: { service: "wechatai", environment: "live" },
      },
      { idempotencyKey: "wechatai:webhook:live:v1" },
    );
    config.STRIPE_WEBHOOK_SECRET = endpoint.secret;
    config.STRIPE_WEBHOOK_ENDPOINT_ID = endpoint.id;
    await writeFile(file, JSON.stringify(config, null, 2), { mode: 0o600 });
  }
  if (!config.STRIPE_WEBHOOK_SECRET)
    throw new Error("Existing signing secret missing; do not replace a shared endpoint");
  // Activation is a separate step, after production health checks pass.
  if (process.argv.includes("--enable")) {
    endpoint = await stripe.webhookEndpoints.update(endpoint.id, { disabled: false });
  } else if (creating) {
    endpoint = await stripe.webhookEndpoints.update(endpoint.id, { disabled: true });
  }
  console.log(
    JSON.stringify({
      id: endpoint.id,
      url: endpoint.url,
      status: endpoint.status,
      apiVersion: endpoint.api_version,
    }),
  );
} catch (error) {
  console.error(`Stripe webhook setup failed: ${error.type || error.name} ${error.code || ""}`);
  process.exitCode = 1;
}
