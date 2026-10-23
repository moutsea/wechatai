import { setTimeout as sleep } from "node:timers/promises";
import { createCollector } from "./collector.mjs";

const print = process.argv.includes("--print");
const endpoint = process.env.MONITOR_ENDPOINT || "";
const secret = process.env.SERVER_MONITOR_SECRET || "";
const name = process.env.MONITOR_NAME?.trim() || "微信消息服务器";
if (!name || name.length > 80) throw new Error("MONITOR_NAME must be 1–80 characters");
if (!print) {
  const url = new URL(endpoint);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("MONITOR_ENDPOINT must be an HTTPS origin");
  if (secret.length < 32)
    throw new Error("Set a dedicated SERVER_MONITOR_SECRET (at least 32 characters)");
}
const controller = new AbortController();
for (const event of ["SIGINT", "SIGTERM"]) process.on(event, () => controller.abort());
const collect = createCollector(name);
try {
  // Obtain a real CPU interval rather than a lifetime average on the first report.
  await sleep(1000, undefined, { signal: controller.signal });
  while (!controller.signal.aborted) {
    const started = Date.now();
    try {
      const report = await collect();
      if (print) {
        console.log(JSON.stringify(report));
        break;
      }
      const response = await fetch(new URL("/api/internal/server-status", endpoint), {
        method: "POST",
        redirect: "error",
        headers: {
          authorization: `Bearer ${secret}`,
          "content-type": "application/json",
          "user-agent": "WeChatAI-Monitor/1.0",
        },
        body: JSON.stringify(report),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
      });
      await response.body?.cancel();
      if (!response.ok)
        console.error(
          JSON.stringify({ event: "monitor.report_rejected", status: response.status }),
        );
    } catch {
      if (!controller.signal.aborted)
        console.error(JSON.stringify({ event: "monitor.report_failed" }));
    }
    // Sequential loop: slow/failed reports cannot build up a queue of old samples.
    await sleep(Math.max(1000, 30000 - (Date.now() - started)), undefined, {
      signal: controller.signal,
    });
  }
} catch (error) {
  if (!controller.signal.aborted) throw error;
}
