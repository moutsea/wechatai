import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import Stripe from "stripe";

// Test-mode only. Creates unpaid checkouts; --keep-open retains the annual one for visual QA.
try {
  const origin = "http://localhost:5173";
  const config = JSON.parse(await readFile(".stripe-test.local", "utf8"));
  if (!config.STRIPE_SECRET_KEY.startsWith("sk_test_")) throw new Error("Expected a test key");
  const stripe = new Stripe(config.STRIPE_SECRET_KEY, { timeout: 15000, maxNetworkRetries: 1 });
  let account;
  try {
    account = JSON.parse(await readFile(".stripe-prepaid-smoke.local", "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    account = {
      email: `wallet-check-${Date.now()}@example.test`,
      password: randomBytes(24).toString("base64url"),
    };
  }
  const login = await fetch(`${origin}/api/auth/${account.userId ? "sign-in" : "sign-up"}/email`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({
      email: account.email,
      password: account.password,
      name: "支付方式测试",
    }),
  });
  if (!login.ok) throw new Error(`Test login HTTP ${login.status}`);
  account.cookie = login.headers
    .getSetCookie()
    .map((s) => s.split(";")[0])
    .join("; ");
  account.userId = (await login.json()).user.id;
  await writeFile(".stripe-prepaid-smoke.local", JSON.stringify(account), { mode: 0o600 });
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
  if (catalog.mode !== "test" || catalog.offers.some((o) => !o.enabled))
    throw new Error("Test catalog mismatch");
  for (const offer of catalog.offers) {
    const { url } = await request("/billing/checkout", { offerId: offer.id });
    const session = await stripe.checkout.sessions.retrieve(
      new URL(url).pathname.split("/").at(-1),
    );
    let keep = false;
    try {
      if (
        session.livemode ||
        session.mode !== "payment" ||
        session.amount_total !== Math.round(offer.price * 100) ||
        session.metadata.service !== "wechatai" ||
        session.metadata.userId !== account.userId ||
        !["card", "alipay", "wechat_pay"].every((method) =>
          session.payment_method_types.includes(method),
        )
      )
        throw new Error("Test checkout mismatch");
      if (process.argv.includes("--keep-open") && offer.id === "plus_yearly") {
        account.checkoutUrl = url;
        account.sessionId = session.id;
        await writeFile(".stripe-prepaid-smoke.local", JSON.stringify(account), { mode: 0o600 });
        keep = true;
      }
      console.log(
        JSON.stringify({
          offer: offer.id,
          mode: session.mode,
          amount: offer.price,
          methods: session.payment_method_types,
          paid: false,
        }),
      );
    } finally {
      if (!keep && session.status === "open") await stripe.checkout.sessions.expire(session.id);
    }
  }
  const dashboard = await request("/dashboard");
  if (dashboard.plan !== "free" || dashboard.wallet.purchased !== 0)
    throw new Error("Unexpected entitlement for unpaid test account");
  console.log("Unpaid test account remains Free with no purchased credits.");
} catch (error) {
  console.error(
    error.type ? `Stripe verification error: ${error.type} ${error.code || ""}` : error.message,
  );
  process.exitCode = 1;
}
