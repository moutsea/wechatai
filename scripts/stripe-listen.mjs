import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
const config = JSON.parse(readFileSync(".stripe-test.local", "utf8"));
if (!config.STRIPE_SECRET_KEY.startsWith("sk_test_"))
  throw new Error("Only test mode is allowed for local forwarding");
function saveConfig() {
  let text = readFileSync(".dev.vars", "utf8");
  for (const [key, value] of Object.entries(config)) {
    const line = `${key}=${JSON.stringify(value)}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    text = pattern.test(text) ? text.replace(pattern, () => line) : `${text.trimEnd()}\n${line}\n`;
  }
  writeFileSync(".dev.vars", text, { mode: 0o600 });
  chmodSync(".dev.vars", 0o600);
}
saveConfig();
const events =
  "checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,invoice.paid,customer.subscription.updated,customer.subscription.deleted";
const child = spawn(
  "stripe",
  [
    "listen",
    "--skip-update",
    "--events",
    events,
    "--forward-to",
    "http://127.0.0.1:5173/api/billing/webhook",
  ],
  {
    env: { ...process.env, STRIPE_API_KEY: config.STRIPE_SECRET_KEY },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
function output(data) {
  const text = data.toString();
  const match = text.match(/whsec_[A-Za-z0-9]+/);
  if (match) {
    config.STRIPE_WEBHOOK_SECRET = match[0];
    saveConfig();
    console.log("Stripe test webhook forwarding ready; signing secret saved privately.");
  } else if (text.includes("-->") || text.includes("<--"))
    console.log(
      text.replace(/(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+/g, "[redacted]").trim(),
    );
  else if (/error|failed|ERR/i.test(text))
    console.error(
      text.replace(/(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+/g, "[redacted]").trim(),
    );
}
child.stdout.on("data", output);
child.stderr.on("data", output);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
