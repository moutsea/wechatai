import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { ReceiverService } from "../../../../integrations/wechat-receiver/receiver.mjs";

const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = createRequire(
  require.resolve("wrangler/package.json"),
)("miniflare");
const root = process.argv[2];
const packed = await build({
  entryPoints: [fileURLToPath(new URL("./edge.mjs", import.meta.url))],
  bundle: true,
  loader: { ".md": "text" },
  write: false,
  platform: "node",
  format: "esm",
  external: ["cloudflare:*", "node:*"],
  target: "es2022",
});
const secret = "local-only-receiver-bearer-credential";
const mf = new Miniflare({
  ...convertV4MiniflareOptions({
    name: "watchdog-test",
    modules: true,
    script: packed.outputFiles[0].text,
    compatibilityDate: "2026-08-22",
    compatibilityFlags: ["nodejs_compat"],
    ip: "127.0.0.1",
    port: 0,
    durableObjects: { ACCOUNTS: { className: "PersonalAccount", useSQLite: true } },
    d1Databases: { DB: "watchdog-local" },
    bindings: {
      WECHAT_RECEIVER_SECRET: secret,
      WECHAT_RECEIVER_ACCOUNTS: "all",
      WECHAT_RECEIVER_WATCHDOG_ACCOUNTS: "all",
      ENCRYPTION_KEY: "fixture-encryption-key-preserved-for-tests",
    },
    outboundService: () => new Response("External network disabled", { status: 503 }),
  }),
  resourcePersistencePath: join(root, "cf"),
  isolatedResourcePersistencePath: join(root, "isolated"),
});
const origin = (await mf.ready).origin;
const db = await mf.getD1Database("DB");
for (const name of ["0011_wechat_receivers", "0018_receiver_watchdog"]) {
  const sql = await readFile(
    new URL("../../../../migrations/" + name + ".sql", import.meta.url),
    "utf8",
  );
  for (const stmt of sql
    .split(";")
    .map((v) => v.trim())
    .filter(Boolean))
    await db.prepare(stmt).run();
}
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  if (new URL(input.url ?? input).hostname === "ilinkai.weixin.qq.com")
    return new Promise((_, reject) =>
      init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }),
    );
  return realFetch(input, init);
};
const service = new ReceiverService({ endpoint: origin, secret, directory: root });
const local = createServer(async (req, res) => {
  try {
    let data;
    if (req.url === "/watchdog") data = { sessions: service.watchdogSessions() };
    else if (req.url === "/start") {
      const id = await (await mf.dispatchFetch("http://edge.test/fixture/seed")).json();
      await db.prepare("INSERT INTO wechat_receivers VALUES(?,1,?)").bind(id, Date.now()).run();
      await service.discover();
      const deadline = Date.now() + 8000;
      while (!service.watchdogSessions().length && Date.now() < deadline) await sleep(20);
      if (!service.watchdogSessions().length)
        throw new Error("receiver did not negotiate watchdog");
      await db.prepare("UPDATE receiver_watchdog_sessions SET check_after=0").run();
      data = { ok: true };
    } else if (req.url === "/stale") {
      // Simulate missing VPS pongs while the remote hibernating socket is still open.
      for (const account of service.accounts.values()) account.lastPong = 0;
      data = { ok: true };
    } else {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(data));
  } catch (err) {
    res.writeHead(500).end(String(err));
  }
});
await new Promise((resolve) => local.listen(0, "127.0.0.1", resolve));
try {
  await writeFile(
    join(root, "endpoints.tmp"),
    JSON.stringify({ edge: origin, local: "http://127.0.0.1:" + local.address().port }),
  );
  const { rename } = await import("node:fs/promises");
  await rename(join(root, "endpoints.tmp"), join(root, "endpoints.json"));
  for await (const _ of process.stdin) {
  }
} finally {
  await service.stop();
  local.closeAllConnections();
  await new Promise((resolve) => local.close(resolve));
  await mf.dispose();
}
