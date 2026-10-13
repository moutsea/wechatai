import { readFile, writeFile } from "node:fs/promises";
import Stripe from "stripe";
import { productionOrigin } from "./site-origin.mjs";
import { verifyHttpsRedirects } from "./verify-https.mjs";

const origin = productionOrigin();
const secrets = JSON.parse(await readFile(".production-secrets.local", "utf8"));
const stripe = new Stripe(secrets.STRIPE_SECRET_KEY, { timeout: 15000, maxNetworkRetries: 2 });
if (!secrets.STRIPE_SECRET_KEY.startsWith("sk_live_"))
  throw new Error("Expected live configuration");
try {
  // Catch HTTP entry points before submitting any authentication credentials.
  await verifyHttpsRedirects(origin);
  let account;
  try {
    account = JSON.parse(await readFile(".production-smoke.local", "utf8"));
  } catch {
    throw new Error(
      "Create a dedicated Free test account and verify its real mailbox first, then save email and password in .production-smoke.local (chmod 600). This script does not create accounts or send email.",
    );
  }
  if (
    typeof account.email !== "string" ||
    !account.email ||
    typeof account.password !== "string" ||
    !account.password
  )
    throw new Error(
      ".production-smoke.local must contain the verified test account's email and password.",
    );
  const login = await fetch(`${origin}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  const loginResult = await login.json();
  if (!login.ok) {
    if (loginResult.code === "EMAIL_NOT_VERIFIED")
      throw new Error(
        "The smoke-test account must complete email verification before running this script.",
      );
    throw new Error(`Production sign-in HTTP ${login.status}`);
  }
  if (!loginResult.user?.id) throw new Error("Production sign-in did not return an account.");
  account.userId = loginResult.user.id;
  account.cookie = login.headers
    .getSetCookie()
    .map((s) => s.split(";")[0])
    .join("; ");
  await writeFile(".production-smoke.local", JSON.stringify(account), { mode: 0o600 });
  const request = async (path, body) => {
    const r = await fetch(`${origin}/api${path}`, {
      method: body ? "POST" : "GET",
      headers: { origin, cookie: account.cookie, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r.json();
  };
  const catalog = await request("/billing/catalog");
  if (
    catalog.mode !== "live" ||
    catalog.offers.length !== 5 ||
    catalog.offers.some((o) => !o.enabled)
  )
    throw new Error("Production catalog mismatch");
  console.log(
    JSON.stringify({
      check: "live catalog",
      prices: catalog.offers.map((o) => ({ id: o.id, price: o.price, enabled: o.enabled })),
    }),
  );
  const foreign = {
    id: "evt_wechatai_deployment_isolation_check",
    object: "event",
    livemode: true,
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_other_business_probe",
        metadata: { service: "deployment-isolation-check", environment: "live" },
        status: "complete",
        payment_status: "paid",
      },
    },
  };
  const payload = JSON.stringify(foreign);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: secrets.STRIPE_WEBHOOK_SECRET,
  });
  for (const [name, header, expected] of [
    ["foreign service ignored", signature, 200],
    ["invalid signature rejected", "invalid", 400],
  ]) {
    const r = await fetch(`${origin}/api/billing/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": header },
      body: payload,
    });
    if (r.status !== expected) throw new Error(`${name}: HTTP ${r.status}`);
    console.log(JSON.stringify({ check: name, status: r.status }));
  }
  if (process.argv.includes("--checkout")) {
    // Verify every offer, then expire each unpaid session. Never submit payment details.
    for (const offer of catalog.offers) {
      const { url } = await request("/billing/checkout", { offerId: offer.id });
      const id = new URL(url).pathname.split("/").at(-1);
      const session = await stripe.checkout.sessions.retrieve(id);
      try {
        if (
          !session.livemode ||
          session.metadata.service !== "wechatai" ||
          session.metadata.userId !== account.userId ||
          session.amount_total !== Math.round(offer.price * 100) ||
          session.currency !== "cny" ||
          session.mode !== "payment" ||
          !["card", "alipay", "wechat_pay"].every((method) =>
            session.payment_method_types.includes(method),
          ) ||
          session.status !== "open"
        )
          throw new Error("Live checkout mismatch");
      } finally {
        if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
      }
      console.log(
        JSON.stringify({
          check: "live wallet checkout",
          offer: offer.id,
          amount: offer.price,
          paymentMethods: session.payment_method_types,
          currency: "cny",
          status: "expired without payment",
        }),
      );
    }
  }
  const dashboard = await request("/dashboard");
  if (dashboard.plan !== "free" || dashboard.wallet.purchased !== 0)
    throw new Error("Unexpected entitlement on unpaid verification account");
  console.log(
    JSON.stringify({
      check: "no accidental grant",
      plan: dashboard.plan,
      purchased: dashboard.wallet.purchased,
    }),
  );
} catch (error) {
  // Never print raw Stripe response objects or local credentials.
  console.error(
    error.type ? `Stripe verification error: ${error.type} ${error.code || ""}` : error.message,
  );
  process.exitCode = 1;
}
