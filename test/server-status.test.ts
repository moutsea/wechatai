import { env, createExecutionContext } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import migration from "../migrations/0013_server_status.sql?raw";
import worker from "../src/server/index";
import {
  adminServerStatus,
  saveServerStatus,
  serverMonitorAuthorized,
} from "../src/server/server-status";
import { type ServerReport } from "../src/shared/server-status";

const monitorSecret = "test-only-server-monitor-credential-32-characters";
const bindings = (secret = monitorSecret) => ({ ...env, SERVER_MONITOR_SECRET: secret }) as Env;
const report = (sampledAt = Date.now()): ServerReport => ({
  name: "测试服务器",
  sampledAt,
  uptimeSeconds: 1000,
  cpu: { cores: 4, percent: 25, load: [0.5, 0.2, 0.1] },
  memory: { total: 4096, available: 2048 },
  disk: { total: 10000, available: 5000 },
  receiver: {
    reachable: true,
    ok: true,
    latencyMs: 1,
    accounts: 2,
    connected: 2,
    links: 3,
    forwarded: 4,
    typingSent: 0,
    typingFailed: null,
  },
  executor: {
    reachable: true,
    ok: true,
    latencyMs: 2,
    draining: false,
    active: 0,
    completed: 5,
    failed: 0,
  },
});
beforeAll(async () => {
  await env.DB.exec(migration.replace(/^--.*$/gm, "").replace(/\n/g, " "));
});
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM server_status").run();
});

describe("server status monitor", () => {
  it("requires a dedicated sufficiently long credential; absent configuration fails closed", async () => {
    expect(serverMonitorAuthorized(bindings(""), `Bearer ${monitorSecret}`)).toBe(false);
    expect(serverMonitorAuthorized(bindings(), `Bearer ${monitorSecret}`)).toBe(true);
    expect(serverMonitorAuthorized(bindings(), "Bearer other")).toBe(false);
    expect(serverMonitorAuthorized(bindings(), monitorSecret)).toBe(false);
    for (const authorization of ["", "Bearer wrong"]) {
      const response = await worker.fetch(
        new Request(`${env.APP_URL}/api/internal/server-status`, {
          method: "POST",
          headers: { authorization, "content-type": "application/json" },
          body: JSON.stringify(report()),
        }),
        bindings(),
        createExecutionContext(),
      );
      expect(response.status).toBe(401);
    }
    const response = await worker.fetch(
      new Request(`${env.APP_URL}/api/internal/server-status`, {
        method: "POST",
        headers: { authorization: `Bearer ${monitorSecret}`, "content-type": "application/json" },
        body: JSON.stringify(report()),
      }),
      bindings(),
      createExecutionContext(),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("returns a clear unconfigured/empty state and handles stale snapshots", async () => {
    expect(await adminServerStatus(bindings(""))).toMatchObject({
      configured: false,
      stale: true,
      report: null,
      receivedAt: null,
    });
    expect(await adminServerStatus(bindings())).toMatchObject({
      configured: true,
      stale: true,
      report: null,
    });
    await saveServerStatus(bindings(), report());
    expect(await adminServerStatus(bindings())).toMatchObject({
      configured: true,
      stale: false,
      report: { name: "测试服务器" },
    });
    await env.DB.prepare("UPDATE server_status SET received_at=?")
      .bind(Date.now() - 91_000)
      .run();
    expect((await adminServerStatus(bindings())).stale).toBe(true);
  });
  it("keeps only one row and ignores duplicate/out-of-order reports without refreshing freshness", async () => {
    const now = Date.now();
    await saveServerStatus(env, report(now - 2000));
    await env.DB.prepare("UPDATE server_status SET received_at=1").run();
    expect(await saveServerStatus(env, report(now - 2000))).toEqual({ ok: true, accepted: false });
    expect(await saveServerStatus(env, report(now - 3000))).toEqual({ ok: true, accepted: false });
    expect((await adminServerStatus(env)).receivedAt).toBe(1);
    expect(await saveServerStatus(env, { ...report(now - 1000), name: "new" })).toEqual({
      ok: true,
      accepted: true,
    });
    expect(
      (await env.DB.prepare("SELECT count(*) AS n FROM server_status").first<{ n: number }>())!.n,
    ).toBe(1);
    expect((await adminServerStatus(env)).report?.name).toBe("new");
  });
  it("rejects malformed, extra, impossible and old/future data while allowing unavailable readings", async () => {
    for (const payload of [
      null,
      {},
      { ...report(), secret: "no" },
      { ...report(), cpu: { cores: 4, percent: 101, load: [0, 0, 0] } },
      { ...report(), memory: { total: 10, available: 11 } },
    ])
      await expect(saveServerStatus(env, payload)).rejects.toMatchObject({
        code: "invalid_report",
      });
    for (const timestamp of [Date.now() - 61_000, Date.now() + 40_000])
      await expect(saveServerStatus(env, report(timestamp))).rejects.toMatchObject({
        code: "report_clock_skew",
      });
    await saveServerStatus(env, { ...report(), memory: null, disk: null });
    expect((await adminServerStatus(env)).report?.memory).toBeNull();
  });
});
