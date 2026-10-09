import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Journal, executeJob, flush, relay, type Account, type Job } from "./transport.ts";

const account: Account = {
  accountId: "test",
  endpoint: "https://relay.example.com",
  token: "test-token",
  agentId: "main",
  enabled: true,
};
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "wechatai-channel-"));
  const path = join(dir, "journal.sqlite");
  const journal = new Journal(path);
  const job: Job = {
    id: randomUUID(),
    routeId: randomUUID(),
    agentId: "main",
    text: "hello",
    state: "pending",
  };
  return { dir, path, journal, job };
}
test("claims before execution and retries a lost event receipt without rerunning tools", async () => {
  const { dir, journal, job } = fixture();
  const original = globalThis.fetch;
  let executions = 0,
    deliveries = 0;
  const ids: string[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("claim")) return Response.json({ claimed: true });
    const body = JSON.parse(String(init?.body));
    ids.push(body.eventId);
    if (++deliveries === 1) throw new Error("lost acknowledgement");
    return Response.json({ status: "queued" });
  };
  try {
    await executeJob(job, journal, account, async () => {
      executions++;
      return "finished";
    });
    await assert.rejects(flush(journal, account));
    await executeJob({ ...job, state: "claimed" }, journal, account, async () => {
      executions++;
      return "duplicate";
    });
    await flush(journal, account);
    assert.equal(executions, 1);
    assert.equal(ids[0], ids[1]);
    assert.equal(journal.pending().length, 0);
  } finally {
    journal.close();
    globalThis.fetch = original;
    rmSync(dir, { recursive: true });
  }
});
test("a gateway restart never re-executes a job with unknown tool effects", async () => {
  const { dir, path, journal, job } = fixture();
  const runner = journal.runnerId;
  journal.start(job);
  journal.close();
  const restored = new Journal(path);
  try {
    assert.equal(restored.runnerId, runner);
    await executeJob({ ...job, state: "claimed" }, restored, account, async () => {
      throw new Error("must not run");
    });
    assert.equal(restored.pending()[0].status, "failed");
    assert.equal(restored.pending()[0].runnerId, runner);
  } finally {
    restored.close();
    rmSync(dir, { recursive: true });
  }
});
test("a crash before claim is finalized as a failed task rather than blocking the queue", async () => {
  const { dir, journal, job } = fixture();
  const original = globalThis.fetch;
  journal.start(job);
  globalThis.fetch = async () => Response.json({ claimed: true });
  try {
    await executeJob(job, journal, account, async () => {
      throw new Error("must not run");
    });
    assert.equal(journal.pending()[0].status, "failed");
  } finally {
    journal.close();
    globalThis.fetch = original;
    rmSync(dir, { recursive: true });
  }
});
test("a losing runner cannot mark the winning runner's task as failed", async () => {
  const { dir, journal, job } = fixture();
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ claimed: false });
  try {
    await executeJob(job, journal, account, async () => {
      throw new Error("must not run");
    });
    assert.equal(journal.pending().length, 0);
  } finally {
    journal.close();
    globalThis.fetch = original;
    rmSync(dir, { recursive: true });
  }
});
test("proactive output survives restart, targets only known routes, and stops on revoked route", async () => {
  const { dir, path, journal, job } = fixture();
  const original = globalThis.fetch;
  assert.throws(() => journal.push(randomUUID(), "hello"));
  journal.start(job);
  const id = journal.push(job.routeId, "scheduled result");
  journal.close();
  const restored = new Journal(path);
  globalThis.fetch = async () => new Response("gone", { status: 409 });
  try {
    assert.equal(restored.pending()[0].eventId, id);
    await flush(restored, account);
    assert.equal(restored.pending().length, 0);
  } finally {
    restored.close();
    globalThis.fetch = original;
    rmSync(dir, { recursive: true });
  }
});
test("transport accepts loopback development but rejects cleartext remote origins and redirects", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_, init) => {
    calls++;
    assert.equal(init?.redirect, "error");
    return Response.json({ ok: true });
  };
  try {
    await assert.rejects(relay({ ...account, endpoint: "http://remote.example.com" }, "poll", {}));
    await assert.rejects(
      relay({ ...account, endpoint: "https://username:password@remote.example.com" }, "poll", {}),
    );
    await relay({ ...account, endpoint: "http://localhost:5173" }, "poll", {});
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("queue notifications start delivery during an Agent turn and concurrent drains send each event once", async () => {
  const { dir, journal, job } = fixture();
  const original = globalThis.fetch;
  const deliveries: string[] = [];
  let releaseFirst!: () => void;
  const firstUpload = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const drains: Promise<void>[] = [];
  let notifications = 0;
  globalThis.fetch = async (_, init) => {
    const event = JSON.parse(String(init?.body));
    deliveries.push(event.eventId);
    if (deliveries.length === 1) await firstUpload;
    return Response.json({ status: "queued" });
  };
  const unsubscribe = journal.onQueued(() => {
    notifications++;
    drains.push(flush(journal, account));
  });
  try {
    journal.start(job); // Agent remains running throughout both proactive sends.
    const first = journal.push(job.routeId, "first background result");
    assert.deepEqual(deliveries, [first]);
    const second = journal.push(job.routeId, "second background result");
    const heartbeat = flush(journal, account);
    releaseFirst();
    await Promise.all([...drains, heartbeat]);
    assert.deepEqual(deliveries, [first, second]);
    assert.equal(journal.state(job.id), "running");
    assert.equal(journal.pending().length, 0);
    assert.equal(notifications, 2);
    unsubscribe();
    journal.push(job.routeId, "retained for reconnect");
    assert.equal(notifications, 2);
    assert.equal(journal.pending().length, 1);
  } finally {
    unsubscribe();
    releaseFirst();
    globalThis.fetch = original;
    journal.close();
    rmSync(dir, { recursive: true });
  }
});
