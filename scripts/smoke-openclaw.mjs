// Isolated native Gateway proof. Uses a temporary profile and loopback mock LLM
// and relay; never reads the user's OpenClaw config or contacts WeChat.
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

const dir = await mkdtemp(join(tmpdir(), "wechatai-gateway-smoke-"));
const accountId = randomUUID(),
  routeId = randomUUID(),
  jobId = randomUUID();
let state = "pending",
  outputs = [],
  llmCalls = 0,
  gateway,
  log = "";
const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
  const json = (value) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(value));
  };
  if (req.url === "/api/openclaw/poll") {
    assert.equal(body.waitMs, 15000);
    if (state === "complete") {
      const timer = setTimeout(() => json({ jobs: [], retryAfterMs: 0 }), body.waitMs);
      res.on("close", () => clearTimeout(timer));
      return;
    }
    return json({
      retryAfterMs: 0,
      jobs:
        state === "complete"
          ? []
          : [
              {
                id: jobId,
                routeId,
                text: "Reply with a brief greeting only.",
                agentId: "research",
                state,
              },
            ],
    });
  }
  if (req.url === "/api/openclaw/claim") {
    state = "claimed";
    return json({ claimed: true });
  }
  if (req.url === "/api/openclaw/heartbeat") return json({ ok: true });
  if (req.url === "/api/openclaw/event") {
    outputs.push(body);
    if (body.jobId) state = "complete";
    return json({ status: "queued" });
  }
  if (req.url === "/v1/chat/completions") {
    llmCalls++;
    res.setHeader("content-type", "text/event-stream");
    for (const choice of [
      {
        delta: { role: "assistant", content: "OpenClaw channel smoke reply." },
        finish_reason: null,
      },
      { delta: {}, finish_reason: "stop" },
    ])
      res.write(
        `data: ${JSON.stringify({ id: "smoke", object: "chat.completion.chunk", created: 1, model: "smoke", choices: [{ index: 0, ...choice }] })}\n\n`,
      );
    return res.end("data: [DONE]\n\n");
  }
  res.statusCode = 404;
  json({ error: "unexpected path" });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const endpoint = `http://127.0.0.1:${server.address().port}`;
const reserve = createServer();
await new Promise((resolve) => reserve.listen(0, "127.0.0.1", resolve));
const port = reserve.address().port;
await new Promise((resolve) => reserve.close(resolve));
await mkdir(join(dir, "workspace"));
const configPath = join(dir, "openclaw.json");
await writeFile(
  configPath,
  JSON.stringify({
    gateway: {
      mode: "local",
      port,
      bind: "loopback",
      auth: { mode: "token", token: "isolated-smoke-only-token" },
    },
    plugins: {
      allow: ["wechatai"],
      load: { paths: [resolve("integrations/openclaw")] },
      entries: { wechatai: { enabled: true } },
    },
    channels: {
      wechatai: {
        accounts: {
          [accountId]: { endpoint, token: "isolated-relay-token", agentId: "main", enabled: true },
        },
      },
    },
    agents: {
      defaults: {
        workspace: join(dir, "workspace"),
        skipBootstrap: true,
        model: { primary: "local/smoke" },
      },
      list: [
        { id: "main", default: true },
        { id: "research", name: "Research helper" },
      ],
    },
    models: {
      providers: {
        local: {
          baseUrl: endpoint + "/v1",
          apiKey: "isolated-model-key",
          api: "openai-completions",
          models: [
            {
              id: "smoke",
              name: "smoke",
              input: ["text"],
              reasoning: false,
              contextWindow: 128000,
              maxTokens: 1024,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            },
          ],
        },
      },
    },
    tools: { deny: ["*"] },
  }),
  { mode: 0o600 },
);
const childEnv = {
  ...process.env,
  OPENCLAW_STATE_DIR: dir,
  OPENCLAW_CONFIG_PATH: configPath,
  OPENCLAW_GATEWAY_TOKEN: "isolated-smoke-only-token",
};
try {
  gateway = spawn("openclaw", ["gateway", "run", "--port", String(port), "--bind", "loopback"], {
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  gateway.stdout.on("data", (c) => {
    log += c;
  });
  gateway.stderr.on("data", (c) => {
    log += c;
  });
  const deadline = Date.now() + 90000;
  while (!outputs.some((e) => e.jobId) && Date.now() < deadline && gateway.exitCode === null)
    await delay(500);
  const reply = outputs.find((e) => e.jobId);
  assert.equal(reply?.status, "completed", `Native inbound failed: ${log.slice(-8000)}`);
  assert.match(reply.text, /OpenClaw channel smoke reply/);
  assert.equal(llmCalls, 1);
  console.log("Native Gateway selected non-default Agent dispatch and final reply passed.");
  const child = spawn(
    "openclaw",
    [
      "message",
      "send",
      "--channel",
      "wechatai",
      "--account",
      accountId,
      "--target",
      routeId,
      "--message",
      "Background task smoke result",
      "--json",
    ],
    { env: childEnv, stdio: ["ignore", "pipe", "pipe"] },
  );
  let sendLog = "";
  child.stdout.on("data", (c) => {
    sendLog += c;
  });
  child.stderr.on("data", (c) => {
    sendLog += c;
  });
  const exited = await new Promise((resolve) => {
    child.on("exit", resolve);
    setTimeout(() => child.kill("SIGTERM"), 30000).unref();
  });
  assert.equal(exited, 0, sendLog.slice(-5000));
  const pushStarted = Date.now();
  const pushDeadline = pushStarted + 5000;
  while (!outputs.some((e) => !e.jobId) && Date.now() < pushDeadline) await delay(500);
  assert.equal(outputs.find((e) => !e.jobId)?.text, "Background task smoke result");
  console.log(
    `Native shared message tool outbound/background delivery passed (${Date.now() - pushStarted}ms after CLI acceptance, while inbound long poll remained open).`,
  );
  const cron = spawn(
    "openclaw",
    [
      "cron",
      "add",
      "--name",
      "Wechatai isolated smoke",
      "--at",
      new Date(Date.now() + 10000).toISOString(),
      "--agent",
      "research",
      "--session",
      "isolated",
      "--message",
      "Reply with a brief greeting only.",
      "--announce",
      "--channel",
      "wechatai",
      "--account",
      accountId,
      "--to",
      routeId,
      "--delete-after-run",
      "--json",
    ],
    { env: childEnv, stdio: ["ignore", "pipe", "pipe"] },
  );
  let cronLog = "";
  cron.stdout.on("data", (c) => {
    cronLog += c;
  });
  cron.stderr.on("data", (c) => {
    cronLog += c;
  });
  const cronExit = await new Promise((resolve) => {
    cron.on("exit", resolve);
    setTimeout(() => cron.kill("SIGTERM"), 30000).unref();
  });
  assert.equal(cronExit, 0, cronLog.slice(-5000));
  const cronDeadline = Date.now() + 45000;
  while (
    !outputs.some((e) => !e.jobId && e.text.includes("smoke reply")) &&
    Date.now() < cronDeadline
  )
    await delay(500);
  assert(
    outputs.some((e) => !e.jobId && e.text.includes("smoke reply")),
    `Cron delivery failed: ${log.slice(-5000)}`,
  );
  console.log("Native scheduled cron Agent and announce delivery passed.");
} finally {
  if (gateway && gateway.exitCode === null) {
    gateway.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => gateway.on("exit", resolve)), delay(5000)]);
    if (gateway.exitCode === null) gateway.kill("SIGKILL");
  }
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
}
