import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = createRequire(
  require.resolve("wrangler/package.json"),
)("miniflare");
const [mode, directory, origin] = process.argv.slice(2);
const packed = await build({
  entryPoints: [fileURLToPath(new URL("./cutover-edge.mjs", import.meta.url))],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  target: "es2022",
  loader: { ".md": "text" },
  external: ["cloudflare:*", "node:*"],
});
const mf = new Miniflare({
  ...convertV4MiniflareOptions({
    name: "cutover-local",
    modules: true,
    script: packed.outputFiles[0].text,
    compatibilityDate: "2026-08-22",
    compatibilityFlags: ["nodejs_compat"],
    ip: "127.0.0.1",
    port: 0,
    durableObjects: { ACCOUNTS: { className: "PersonalAccount", useSQLite: true } },
    d1Databases: { DB: "local-routes" },
    r2Buckets: { MEDIA: "local-assets" },
    bindings: {
      APP_URL: "https://comparison.example",
      WECHATAI_BACKEND_ORIGIN: origin || "http://127.0.0.1:1",
      WECHATAI_RPC_SECRET: "s".repeat(32),
      ORIGIN: origin || "http://127.0.0.1:1",
      SIGN: "s".repeat(32),
      ENCRYPTION_KEY: "e".repeat(32),
    },
  }),
  resourcePersistencePath: join(directory, "cloudflare"),
  isolatedResourcePersistencePath: join(directory, "isolated"),
});
try {
  const db = await mf.getD1Database("DB");
  const owner = "isolated-rehearsal-user";
  const request = async (path) => {
    const response = await mf.dispatchFetch("http://rehearsal.local" + path);
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  if (mode === "seed") {
    const routes = await readFile(
      new URL("../../../../migrations/0019_account_backend_routes.sql", import.meta.url),
      "utf8",
    );
    await db.prepare(routes.slice(routes.indexOf("CREATE TABLE"))).run();
    await db
      .prepare("CREATE TABLE drill_reads(owner TEXT PRIMARY KEY,location TEXT NOT NULL)")
      .run();
    await db.prepare("INSERT INTO drill_reads VALUES(?,?)").bind(owner, "do").run();
    await db
      .prepare(
        "CREATE TABLE referral(invitee_id TEXT PRIMARY KEY,inviter_id TEXT NOT NULL,status TEXT NOT NULL)",
      )
      .run();
    for (const row of [
      [owner, "original-inviter", "qualified"],
      ["invited-friend", owner, "rewarded"],
      ["pending-friend", owner, "pending"],
    ]) {
      await db
        .prepare("INSERT INTO referral VALUES(?,?,?)")
        .bind(...row)
        .run();
    }
    const seed = await request("/seed");
    await writeFile(
      join(directory, "original-identity.json"),
      JSON.stringify({
        format: "wechatai-original-identity-v1",
        accountId: seed.id,
        userId: owner,
      }),
      { mode: 0o600 },
    );
    await writeFile(join(directory, "seed.json"), JSON.stringify(seed), { mode: 0o600 });
  } else if (mode === "receiver") {
    const { accountId } = JSON.parse(
      await readFile(join(directory, "original-identity.json"), "utf8"),
    );
    await db
      .prepare("INSERT INTO account_backend_routes VALUES(?,?,'go',2)")
      .bind(owner, accountId)
      .run();
    const response = await mf.dispatchFetch("http://rehearsal.local/receiver", {
      headers: { Upgrade: "websocket" },
    });
    assert.equal(response.status, 101);
    const ws = response.webSocket;
    const frames = [],
      resolvers = [];
    ws.addEventListener("message", (e) => {
      const waiter = resolvers.shift();
      if (waiter) waiter(e.data);
      else frames.push(e.data);
    });
    ws.accept();
    const receive = async () => {
      if (frames.length) return frames.shift();
      let timer;
      try {
        return await Promise.race([
          new Promise((resolve) => resolvers.push(resolve)),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("receiver timed out")), 4000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    };
    const sendBatch = async (fromCursor, cursor, msgs, generation = "test") => {
      const id = crypto.randomUUID();
      ws.send(
        JSON.stringify({
          type: "batch",
          id,
          connectionId: "comparison",
          generation,
          fromCursor,
          cursor,
          msgs,
        }),
      );
      for (;;) {
        const r = JSON.parse(await receive());
        if (r.type === "config") continue;
        assert.equal(r.id, id);
        return r;
      }
    };
    const message = (seq, token) => ({
      message_type: 1,
      message_id: "0",
      seq,
      from_user_id: "sender",
      context_token: token,
    });
    try {
      const config = JSON.parse(await receive());
      assert.equal(config.type, "config");
      assert.equal(config.links[0].credentials.token, "fixture-only");
      const state = await request("/receiver-state");
      assert.equal(state.delegated, true);
      assert.equal(state.watchdog, "vps");
      assert.equal(state.connectedLinks, 1);
      assert.ok(state.nextAlarm > Date.now());
      ws.send("wechatai-receiver-ping-v1");
      assert.equal(await receive(), "wechatai-receiver-pong-v1");
      const replay = [message(11, "middle"), message(10, "old")];
      assert.equal((await sendBatch("previous", "committed", replay)).cursor, "committed");
      assert.equal((await sendBatch("previous", "committed", replay)).cursor, "committed");
      const big = [
        message("9223372036854775809", "last"),
        message("9223372036854775808", "first"),
        { ...message(23, "wrong sender"), from_user_id: "other" },
      ];
      assert.equal((await sendBatch("committed", "next", big)).cursor, "next");
      assert.equal((await sendBatch("committed", "next", big)).cursor, "next");
      assert.equal((await sendBatch("next", "stale", replay, "superseded")).stale, true);
    } finally {
      ws.close(1000, "done");
      await db.prepare("DELETE FROM account_backend_routes WHERE owner_id=?").bind(owner).run();
    }
  } else if (mode === "compare") {
    const { reference, replica, grants } = await request("/compare");
    assert.equal(grants.length, 2);
    for (const grant of grants) {
      assert.equal(grant.amount, 500000);
      assert.equal(grant.remaining, grant.amount);
      assert.equal(grant.expires, Number.MAX_SAFE_INTEGER);
    }
    await writeFile(join(directory, "reference-grants.json"), JSON.stringify(grants), {
      mode: 0o600,
    });
    assert.match(reference.identity, /^[a-f0-9]{64}$/);
    assert.deepEqual(reference.notice.connections, [
      { id: "claw", name: "我的连接", shortcut: "claw", currentVersion: "1.0.0" },
    ]);
    assert.equal(reference.history[0].data.dismissedAt, 123456);
    assert.deepEqual(
      reference.history[1].data.map((s) => s.connectionId),
      ["default", "comparison"],
    );
    assert.deepEqual(
      reference.history[2].data.map((m) => m.content),
      ["attachment preview", "reply"],
    );
    assert.equal(reference.history[2].data[0].estimated, true);
    assert.equal(reference.history[3].data.length, 1);
    assert.equal(reference.history[4].error, "session_missing");
    assert.deepEqual(reference.callbacks, [
      [200, { received: true }],
      [200, { received: true }],
      [409, { error: "cloud_callback_conflict" }],
      [409, { error: "identity_mismatch" }],
      [401, { error: "invalid_signature" }],
    ]);
    assert.equal(reference.history[5].data.text, "previous plot");
    assert.equal(reference.history[6].error, "role_session_required");
    assert.deepEqual(
      reference.assets.map((a) => a.status),
      [200, 200, 404, 404, 404, 404, 404],
    );
    assert.equal(reference.assets[0].body, "from R2");
    assert.equal(
      reference.assets[0].headers["content-security-policy"],
      "default-src 'none'; sandbox",
    );
    assert.match(reference.assets[1].headers["content-disposition"], /filename\*=UTF-8''/);
    const [libraries, personal, entries, reminders, deleted, unknown, invalid] = reference.personal;
    assert.deepEqual(libraries.data, ["", "comparison", "deleted"]);
    assert.equal(personal.data.total, 4);
    assert.deepEqual(personal.data.totals, [
      { currency: "CNY", income: "1.23", expense: "12.34", net: "-11.11" },
      { currency: "USD", income: "0.00", expense: "9.99", net: "-9.99" },
    ]);
    assert.equal(entries.data.total, 3);
    assert.equal(entries.data.records.length, 1);
    assert.equal(entries.data.records[0].private, undefined);
    assert.equal(reminders.data.records[0].reminderLastFailure.code, "test");
    assert.deepEqual(deleted.data, { records: [], total: 0, totals: [] });
    assert.equal(unknown.error, "connection_missing");
    assert.equal(invalid.error, "invalid_input");
    const [first, next, filtered, bad, active, stopped, hidden] = reference.cloud;
    assert.equal(first.data.tasks.length, 30);
    assert.equal(next.data.tasks.length, 3);
    assert.equal(next.data.nextCursor, null);
    assert.equal(filtered.data.tasks.length, 1);
    assert.equal(bad.error, "invalid_task_cursor");
    assert.equal(active.data.status, "finalizing");
    assert.equal(active.data.canCancelFiles, true);
    assert.equal(stopped.data.sessionId, null);
    assert.equal(stopped.data.status, "cancelled");
    assert.equal(hidden.error, "task_missing");
    assert.equal(first.data.tasks[0].credits, 1.75);
    assert.equal(first.data.tasks[0].prompt, "附件任务");
    assert.deepEqual(Object.keys(first.data.tasks[0].files[0]).sort(), ["bytes", "id", "name"]);
    assert.equal(reference.stats.tokens, 113);
    assert.equal(reference.stats.failedRequests, 1);
    assert.equal(reference.stats.pluginUsage[0].pluginId, "example/plugin");
    assert.equal(reference.stats.purchasedCredits, 42);
    // Only the sampling instant differs between these sequential RPCs.
    assert.ok(Math.abs(reference.stats.sampledAt - replica.stats.sampledAt) < 30000);
    delete reference.stats.sampledAt;
    delete replica.stats.sampledAt;
    assert.deepEqual(replica, reference);
  } else {
    const change = async (from, to) => {
      const r = await db
        .prepare("UPDATE drill_reads SET location=? WHERE owner=? AND location=?")
        .bind(to, owner, from)
        .run();
      assert.equal(r.meta.changes, 1);
    };
    const before = await request("/read");
    assert.equal(before.location, "do");
    const activation = await mf.dispatchFetch("http://rehearsal.local/activate");
    assert.equal(activation.status, 503);
    assert.equal((await activation.json()).code, "backend_not_ready");
    assert.deepEqual(await request("/read"), before);
    await change("do", "go");
    try {
      const go = await request("/read");
      assert.deepEqual(go, {
        location: "go",
        state: { accountId: before.id, userId: owner, routeEpoch: 2, phase: "prepared" },
      });
    } finally {
      await change("go", "do");
    }
    assert.deepEqual(await request("/read"), before);
  }
} finally {
  await mf.dispose();
}
