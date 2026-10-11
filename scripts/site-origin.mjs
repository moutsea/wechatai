import { unstable_readConfig } from "wrangler";
import { productionConfigPath } from "./production.mjs";

// Deployment helpers must target the operator's domain, never the hosted product by default.
export function productionOrigin() {
  const value =
    process.env.WECHATAI_SITE_URL ||
    unstable_readConfig({ config: productionConfigPath(), env: "production" }).vars?.APP_URL;
  const url = new URL(String(value));
  if (
    url.protocol !== "https:" ||
    url.hostname === "example.com" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Set your HTTPS site origin in WECHATAI_SITE_URL or the private production APP_URL.",
    );
  return url.origin;
}
