import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { productionOrigin } from "./site-origin.mjs";

export async function verifyHttpsRedirects(origin) {
  for (const path of ["/", "/register", "/login?returnTo=%2Fapp%2Fplugins", "/api/health"]) {
    const expected = new URL(path, origin);
    const insecure = new URL(expected);
    insecure.protocol = "http:";
    const response = await fetch(insecure, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    await response.body?.cancel();
    if (
      ![301, 302, 307, 308].includes(response.status) ||
      response.headers.get("location") !== expected.href
    )
      throw new Error(
        `HTTP ${path} must redirect to the same HTTPS URL before serving content. Enable Always Use HTTPS in Cloudflare.`,
      );
  }
  console.log("HTTPS redirects verified for homepage, registration, login and API.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await verifyHttpsRedirects(productionOrigin());
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
