// Integration smoke test against an installed OpenClaw SDK; no real credentials or messages.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const root =
  process.env.OPENCLAW_PACKAGE_ROOT ||
  join(execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(), "openclaw");
const dir = await mkdtemp(join(tmpdir(), "wechatai-claw-runtime-"));
process.env.OPENCLAW_STATE_DIR = dir;
process.env.OPENCLAW_CONFIG_PATH = join(dir, "openclaw.json");
const controller = new AbortController();
const originalFetch = globalThis.fetch;
try {
  await mkdir(join(dir, "node_modules"));
  await symlink(root, join(dir, "node_modules", "openclaw"));
  await writeFile(join(dir, "package.json"), '{"type":"module"}');
  await writeFile(process.env.OPENCLAW_CONFIG_PATH, "{}");
  for (const name of ["index", "transport"])
    await writeFile(
      join(dir, `${name}.js`),
      stripTypeScriptTypes(await readFile(resolve(`integrations/openclaw/${name}.ts`), "utf8"), {
        mode: "transform",
      }),
    );
  const { createWechataiChannel } = await import(pathToFileURL(join(dir, "index.js")));
  const reply = await import(pathToFileURL(join(root, "dist/plugin-sdk/reply-runtime.js")));
  const { resolveCommandAuthorization } = await import(
    pathToFileURL(join(root, "dist/plugin-sdk/command-auth.js"))
  );
  const routeId = randomUUID();
  const normal = {
    id: randomUUID(),
    routeId,
    agentId: "main",
    text: "long task",
    state: "pending",
  };
  const stop = { ...normal, id: randomUUID(), text: "/stop", command: "stop", lane: "control" };
  const help = { ...normal, id: randomUUID(), text: "/help", command: "help" };
  let releaseNormal;
  const waiting = new Promise((resolve) => {
    releaseNormal = resolve;
  });
  let started = false,
    stopReceived = false,
    normalFinished = false;
  const offered = new Set(),
    deliveries = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    if (String(url).endsWith("poll")) {
      assert.equal(body.nativeCommands, true);
      let job;
      if (body.lane === "control" && started) job = stop;
      if (body.lane === "message")
        job = !offered.has(normal.id) ? normal : normalFinished ? help : undefined;
      if (job && !offered.has(job.id)) {
        offered.add(job.id);
        return Response.json({ jobs: [job], retryAfterMs: 0 });
      }
      return Response.json({ jobs: [], retryAfterMs: 10 });
    }
    if (String(url).endsWith("claim")) {
      assert.equal(body.nativeCommands, true);
      return Response.json({ claimed: true });
    }
    if (String(url).endsWith("event")) {
      deliveries.push(body);
      if (deliveries.length === 3) controller.abort();
      return Response.json({ status: "queued" });
    }
    return Response.json({ ok: true });
  };
  const runtime = {
    reply,
    session: {
      resolveStorePath: () => join(dir, "sessions.json"),
      recordInboundSession: async () => {},
    },
    inbound: {
      dispatchReply: async ({ cfg, ctxPayload, delivery }) => {
        if (ctxPayload.Body === normal.text) {
          assert.equal(ctxPayload.CommandAuthorized, false);
          started = true;
          await waiting;
          normalFinished = true;
          await delivery.deliver({ text: "stopped task" }, { kind: "final" });
          return;
        }
        assert.equal(ctxPayload.CommandAuthorized, true);
        assert.equal(
          resolveCommandAuthorization({ ctx: ctxPayload, cfg, commandAuthorized: true })
            .isAuthorizedSender,
          true,
        );
        assert.equal(
          resolveCommandAuthorization({
            ctx: ctxPayload,
            cfg: { ...cfg, commands: { allowFrom: { "*": [] } } },
            commandAuthorized: true,
          }).isAuthorizedSender,
          false,
        );
        if (ctxPayload.Body === "/stop") {
          assert.equal(normalFinished, false);
          stopReceived = true;
          releaseNormal();
        }
        const result = await reply.getReplyFromConfig(ctxPayload, {}, cfg);
        for (const payload of [result].flat().filter(Boolean))
          await delivery.deliver(payload, { kind: "final" });
      },
    },
  };
  let status = {};
  const channel = createWechataiChannel({ runtime: { state: { resolveStateDir: () => dir } } });
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    await channel.gateway.startAccount({
      account: {
        accountId: randomUUID(),
        endpoint: "https://relay.example.com",
        token: "test-only",
        agentId: "main",
        enabled: true,
      },
      cfg: {
        agents: { defaults: { workspace: dir } },
        session: { store: join(dir, "sessions.json") },
      },
      channelRuntime: runtime,
      abortSignal: controller.signal,
      setStatus: (value) => {
        status = { ...status, ...value };
      },
      getStatus: () => status,
    });
  } finally {
    clearTimeout(timer);
  }
  assert.equal(stopReceived, true);
  assert.equal(deliveries.length, 3);
  assert.ok(deliveries.every((event) => event.status === "completed"));
  assert.match(deliveries.find((event) => event.jobId === help.id).text, /\/new.*\/reset/);
  console.log(
    "OpenClaw runtime: native help, authorization, concurrent stop and final delivery passed.",
  );
} finally {
  controller.abort();
  globalThis.fetch = originalFetch;
  await rm(dir, { recursive: true, force: true });
}
