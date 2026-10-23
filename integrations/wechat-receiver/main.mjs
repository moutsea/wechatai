import { createServer } from "node:http";
import { ReceiverService } from "./receiver.mjs";

const endpoint = new URL(process.env.WECHATAI_ENDPOINT || "https://wechatai.app");
if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password)
  throw new Error("HTTPS endpoint required");
const secret = process.env.WECHAT_RECEIVER_SECRET;
if (!secret || secret.length < 32) throw new Error("Missing receiver secret");
const service = new ReceiverService({
  endpoint,
  secret,
  onlyAccounts: new Set(
    (process.env.WECHAT_RECEIVER_ONLY || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ),
  directory: process.env.STATE_DIRECTORY || "/var/lib/wechatai-receiver",
});
const server = createServer((request, response) => {
  if (request.method !== "GET" || request.url !== "/health") {
    response.writeHead(404).end();
    return;
  }
  const health = service.health();
  response.writeHead(health.ok ? 200 : 503, { "Content-Type": "application/json" });
  response.end(JSON.stringify(health));
});
server.listen(Number(process.env.HEALTH_PORT || "18180"), "127.0.0.1");
const running = service.run();
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    await service.stop();
    await running;
    server.close();
  });
