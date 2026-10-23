import assert from "node:assert/strict";
import { test } from "node:test";
import { cpuSnapshot, cpuPercent, memoryFromProc, probe, createCollector } from "./collector.mjs";

test("Linux memory includes reclaimable cache rather than MemFree alone", () => {
  assert.deepEqual(
    memoryFromProc(
      "MemTotal:       4096000 kB\nMemFree:         100000 kB\nMemAvailable:   3000000 kB\n",
    ),
    {
      total: 4096000 * 1024,
      available: 3000000 * 1024,
    },
  );
  assert.equal(memoryFromProc("MemTotal: 20 kB\n"), null);
  assert.equal(memoryFromProc("MemTotal: 20 kB\nMemAvailable: 30 kB\n"), null);
});

test("CPU uses interval deltas summed across cores, including counter resets", () => {
  const previous = cpuSnapshot([
    { times: { idle: 500, user: 100, sys: 100 } },
    { times: { idle: 500, user: 100, sys: 100 } },
  ]);
  assert.equal(cpuPercent(previous, { idle: 1300, total: 1800 }), 25);
  assert.equal(cpuPercent(previous, previous), null);
  assert.equal(cpuPercent(previous, { idle: 0, total: 100 }), null);
});

test("health failures distinguish unreachable from an unhealthy or malformed response", async () => {
  const url = "http://127.0.0.1/health";
  const healthy = await probe(url, async () => Response.json({ ok: true, active: 2 }));
  assert.equal(healthy.ok, true);
  assert.equal(healthy.reachable, true);
  const unhealthy = await probe(url, async () => Response.json({ ok: false }, { status: 503 }));
  assert.equal(unhealthy.ok, false);
  assert.equal(unhealthy.reachable, true);
  for (const body of ["bad json", "null", "{}", "x".repeat(8193)]) {
    const result = await probe(url, async () => new Response(body));
    assert.equal(result.ok, false);
    assert.equal(result.reachable, true);
    assert.deepEqual(result.data, {});
  }
  const offline = await probe(url, async () => {
    throw new Error("connection refused");
  });
  assert.equal(offline.ok, false);
  assert.equal(offline.reachable, false);
  assert.equal(offline.latencyMs, null);
});

test("collector only exports allowed metrics, not credentials or raw service errors", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) =>
    Response.json({
      ok: true,
      secret: "must-not-leak",
      rawError: "must-not-leak",
      token: "must-not-leak",
      accounts: 2,
      connected: 2,
      links: 3,
      forwarded: 5,
      draining: false,
      active: 1,
      completed: 9,
      failed: 0,
      ...(String(url).includes("18181") ? {} : { typingSent: 12 }),
    }),
  );
  const result = await createCollector("test server")();
  assert.equal(result.receiver.connected, 2);
  assert.equal(result.executor.completed, 9);
  assert.equal(result.receiver.typingFailed, null);
  assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
  assert.ok(result.cpu.cores > 0);
  assert.ok(result.memory.total > 0);
});
