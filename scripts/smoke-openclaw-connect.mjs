// Real CLI installation into an isolated profile. Never touches the running user Gateway.
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import assert from "node:assert/strict";

const dir = await mkdtemp(join(tmpdir(), "wechatai-connect-smoke-"));
const accountId = randomUUID();
const secret = randomBytes(32).toString("base64url");
const code = `pair1.${"a".repeat(64)}.${accountId}.${secret}.${"b".repeat(43)}`;
const token = `${"a".repeat(64)}.${accountId}.${"c".repeat(43)}.${"d".repeat(43)}`;
const configPath = join(dir, "openclaw.json");
let paired = 0,
  proof,
  receivedAgents,
  heartbeat,
  gateway,
  restartCalls = 0;
const server = createServer(async (req, res) => {
  const json = (data) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(data));
  };
  if (req.url.startsWith("/downloads/")) {
    const file = req.url.endsWith(".tgz") ? "wechatai-openclaw-1.0.1.tgz" : "wechatai-connect.mjs";
    res.end(await readFile(resolve("public/downloads", file)));
    return;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
  if (req.url === "/api/openclaw/pair") {
    assert.equal(req.headers.authorization, `Bearer ${code}`);
    if (!proof) proof = body.proof;
    assert.equal(proof, body.proof, "Retry must retain installer proof");
    paired++;
    receivedAgents = body.agents;
    // First response lost after claiming: the installer retries without a new identity.
    if (paired === 1) {
      req.socket.destroy();
      return;
    }
    return json({ accountId, agentId: "custom", token });
  }
  assert.equal(req.headers.authorization, `Bearer ${token}`);
  if (req.url === "/api/openclaw/heartbeat") {
    heartbeat = body;
    return json({ ok: true });
  }
  if (req.url === "/api/openclaw/poll") return json({ jobs: [] });
  res.statusCode = 404;
  json({ error: "unexpected" });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const endpoint = `http://127.0.0.1:${server.address().port}`;
await mkdir(join(dir, "bin"));
await mkdir(join(dir, "workspace"));
// Intercept only service restart: avoid controlling the user's launchd/systemd service.
// All installation/config/agent discovery commands use the actual installed CLI.
const realBinary =
  process.env.WECHATAI_SMOKE_OPENCLAW ||
  execFileSync("which", ["openclaw"], { encoding: "utf8" }).trim();
await writeFile(
  join(dir, "bin", "openclaw"),
  `#!/usr/bin/env node\nconst {spawnSync}=require("node:child_process");const {appendFileSync}=require("node:fs");const a=process.argv.slice(2);if(a[0]==="gateway"&&a[1]==="restart"){appendFileSync(${JSON.stringify(join(dir, "restart"))},"1");process.exit(0)}const r=spawnSync(${JSON.stringify(realBinary)},a,{stdio:"inherit",env:process.env});process.exit(r.status??1);\n`,
  { mode: 0o700 },
);
await writeFile(
  configPath,
  JSON.stringify({
    gateway: {
      mode: "local",
      bind: "loopback",
      auth: { mode: "token", token: "isolated-connect-smoke-token" },
    },
    plugins: { allow: ["memory-core"] },
    agents: {
      defaults: { workspace: join(dir, "workspace"), skipBootstrap: true },
      list: [
        { id: "custom", name: "Default helper", default: true },
        { id: "secondary", name: "Second helper" },
      ],
    },
    channels: { telegram: { enabled: false, botToken: "isolated-preserve-me" } },
  }),
  { mode: 0o600 },
);
const childEnv = {
  ...process.env,
  PATH: join(dir, "bin") + ":" + process.env.PATH,
  OPENCLAW_STATE_DIR: dir,
  OPENCLAW_CONFIG_PATH: configPath,
  OPENCLAW_GATEWAY_TOKEN: "isolated-connect-smoke-token",
};
let log = "";
try {
  const bootstrap = `(async()=>{const r=await fetch(${JSON.stringify(endpoint + "/downloads/wechatai-connect.mjs")},{redirect:"error"});if(!r.ok)throw Error("download");const m=await import("data:text/javascript;base64,"+Buffer.from(await r.text()).toString("base64"));await m.connect(${JSON.stringify({ endpoint, code })})})().catch(e=>{console.error(e.message);process.exitCode=1})`;
  const installer = spawn(process.execPath, ["-e", bootstrap], {
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  installer.stdout.on("data", (c) => {
    log += c;
  });
  installer.stderr.on("data", (c) => {
    log += c;
  });
  const exit = await new Promise((r) => {
    installer.on("exit", r);
    setTimeout(() => installer.kill("SIGTERM"), 240000).unref();
  });
  assert.equal(exit, 0, log.slice(-4000));
  assert(!log.includes(token), "Permanent credentials must not be logged");
  assert.equal(paired, 2);
  assert.deepEqual(
    receivedAgents.map((a) => a.id),
    ["custom", "secondary"],
  );
  assert.equal(receivedAgents.find((a) => a.isDefault).id, "custom");
  assert.deepEqual(Object.keys(receivedAgents[0]).sort(), ["id", "isDefault", "name"]);
  const config = JSON.parse(await readFile(configPath, "utf8"));
  assert.equal(config.channels.telegram.botToken, "isolated-preserve-me");
  assert(config.plugins.allow.includes("memory-core"));
  assert(config.plugins.allow.includes("wechatai"));
  assert.equal(config.agents.list[0].id, "custom");
  assert.equal(config.channels.wechatai.accounts[accountId].token, token);
  assert.equal(config.channels.wechatai.accounts[accountId].agentId, "custom");
  restartCalls = (await readFile(join(dir, "restart"), "utf8")).length;
  assert.equal(restartCalls, 1);
  console.log(
    "One-command download, actual CLI install, Agent discovery, lost-response retry and preserving existing config passed.",
  );
  const reserve = createServer();
  await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  let gatewayLog = "";
  gateway = spawn(realBinary, ["gateway", "run", "--port", String(port), "--bind", "loopback"], {
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  gateway.stdout.on("data", (c) => (gatewayLog += c));
  gateway.stderr.on("data", (c) => (gatewayLog += c));
  const deadline = Date.now() + 60000;
  while (!heartbeat && Date.now() < deadline && gateway.exitCode === null) await delay(500);
  assert(heartbeat, `Installed package failed to connect: ${gatewayLog.slice(-5000)}`);
  assert.equal(heartbeat.agents.find((a) => a.isDefault).id, "custom");
  console.log(
    "Installed JavaScript package loaded in the real isolated Gateway and reported Agent catalog/online status.",
  );
} finally {
  if (gateway && gateway.exitCode === null) {
    gateway.kill("SIGTERM");
    await Promise.race([new Promise((r) => gateway.on("exit", r)), delay(5000)]);
    if (gateway.exitCode === null) gateway.kill("SIGKILL");
  }
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
}
