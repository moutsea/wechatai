import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
const origin = "http://localhost:5173";
let account;
try {
  account = JSON.parse(await readFile(".stripe-e2e.local", "utf8"));
} catch {
  const password = randomBytes(24).toString("base64url");
  const email = `billing-test-${Date.now()}@example.test`;
  const response = await fetch(`${origin}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email, password, name: "支付测试" }),
  });
  if (!response.ok) throw new Error(`Test signup failed: ${response.status}`);
  const user = await response.json();
  account = {
    email,
    password,
    userId: user.user.id,
    cookie: response.headers
      .getSetCookie()
      .map((x) => x.split(";")[0])
      .join("; "),
  };
  await writeFile(".stripe-e2e.local", JSON.stringify(account), { mode: 0o600 });
}
const call = async (path, body) => {
  const r = await fetch(`${origin}/api${path}`, {
    method: body ? "POST" : "GET",
    headers: { cookie: account.cookie, origin, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`${path}: ${r.status} ${d.message}`);
  return d;
};
const arg = process.argv[2] || "catalog";
if (arg === "catalog") console.log(JSON.stringify(await call("/billing/catalog")));
else if (arg === "snapshot") {
  const d = await call("/dashboard");
  console.log(
    JSON.stringify({
      plan: d.plan,
      planUntil: d.planUntil,
      balance: d.wallet.balance,
      purchased: d.wallet.purchased,
      daily: d.wallet.daily,
      subscription: await call("/billing/subscription"),
    }),
  );
} else if (arg === "status")
  console.log(
    JSON.stringify(
      await call(`/billing/checkout-status?session_id=${encodeURIComponent(account.sessionId)}`),
    ),
  );
else if (arg === "portal") console.log(JSON.stringify(await call("/billing/portal", {})));
else {
  const session = await call("/billing/checkout", { offerId: arg });
  account.lastCheckoutUrl = session.url;
  account.sessionId = session.url.match(/cs_test_[^#/?]+/)?.[0];
  await writeFile(".stripe-e2e.local", JSON.stringify(account), { mode: 0o600 });
  console.log(JSON.stringify({ offer: arg, url: session.url }));
}
