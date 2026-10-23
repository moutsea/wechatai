import { createServer } from "node:http";
import { Executor, log } from "./service.mjs";
import { executeAttachments } from "./attachments.mjs";
const endpoint = new URL(process.env.WECHATAI_ENDPOINT ?? "");
if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password)
  throw new Error("HTTPS endpoint required");
const secret = process.env.EXECUTOR_SECRET ?? "";
if (secret.length < 32) throw new Error("Dedicated executor secret required");
const service = new Executor({
  endpoint: endpoint.origin,
  secret,
  directory: process.env.STATE_DIRECTORY || "/var/lib/wechatai-executor",
  concurrency: Math.min(8, Math.max(1, Number(process.env.EXECUTOR_CONCURRENCY) || 4)),
  only: new Set((process.env.EXECUTOR_ONLY || "").split(",").filter(Boolean)),
  attachments: executeAttachments,
});
const server = createServer((req, res) => {
  if (req.url !== "/health") {
    res.writeHead(404).end();
    return;
  }
  const state = service.health();
  res
    .writeHead(state.ok ? 200 : 503, { "content-type": "application/json" })
    .end(JSON.stringify(state));
});
server.listen(Number(process.env.HEALTH_PORT) || 18181, "127.0.0.1");
const running = service.run();
process.on("SIGUSR2", () => service.drain());
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    await service.stop();
    server.close();
  });
await running;
log("execution.stopped");
