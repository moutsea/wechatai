import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";

export type Account = {
  accountId: string;
  endpoint: string;
  token: string;
  agentId: string;
  enabled: boolean;
};
export type Job = {
  id: string;
  routeId: string;
  agentId: string;
  text: string;
  state: "pending" | "claimed";
  command?: string;
  lane?: "message" | "control";
};
export type Event = {
  eventId: string;
  routeId: string;
  jobId?: string;
  runnerId?: string;
  text: string;
  status: "completed" | "failed";
};
export class RelayError extends Error {
  constructor(public status: number) {
    super(`Wechatai relay returned HTTP ${status}`);
  }
}
export async function relay<T>(
  account: Account,
  action: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const url = new URL(account.endpoint);
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  )
    throw new Error("Use HTTPS, or loopback HTTP for local development");
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/")
    throw new Error("endpoint must be an origin");
  const response = await fetch(new URL(`/api/openclaw/${action}`, url), {
    method: "POST",
    redirect: "error",
    headers: { authorization: `Bearer ${account.token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new RelayError(response.status);
  }
  return (await response.json()) as T;
}
export const accountFingerprint = (a: Account) =>
  createHash("sha256").update(`${a.endpoint}\0${a.token}`).digest("hex");

// Local journal survives gateway restarts and ambiguous HTTP acknowledgements.
// On an interrupted dispatch we fail closed instead of repeating agent tools.
export class Journal {
  private db: DatabaseSync;
  private queuedListeners = new Set<() => void>();
  readonly runnerId: string;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, state TEXT NOT NULL, routeId TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS routes (id TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, data TEXT NOT NULL, state TEXT NOT NULL, createdAt INTEGER NOT NULL);`);
    this.db.prepare("INSERT OR IGNORE INTO settings VALUES ('runnerId', ?)").run(randomUUID());
    this.runnerId = (
      this.db.prepare("SELECT value FROM settings WHERE id = 'runnerId'").get() as { value: string }
    ).value;
  }
  state(id: string) {
    return (
      this.db.prepare("SELECT state FROM jobs WHERE id = ?").get(id) as
        | { state: string }
        | undefined
    )?.state;
  }
  start(job: Job) {
    this.db.prepare("INSERT OR IGNORE INTO jobs VALUES (?, 'running', ?)").run(job.id, job.routeId);
    this.db.prepare("INSERT OR IGNORE INTO routes VALUES (?)").run(job.routeId);
  }
  hasRoute(id: string) {
    return Boolean(this.db.prepare("SELECT id FROM routes WHERE id = ?").get(id));
  }
  queue(event: Event) {
    if (event.jobId) event = { ...event, runnerId: this.runnerId };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("INSERT OR IGNORE INTO outbox VALUES (?,?,'pending',?)")
        .run(event.eventId, JSON.stringify(event), Date.now());
      if (event.jobId)
        this.db.prepare("UPDATE jobs SET state = 'finished' WHERE id = ?").run(event.jobId);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    for (const listener of this.queuedListeners) listener();
    return event.eventId;
  }
  onQueued(listener: () => void) {
    this.queuedListeners.add(listener);
    return () => this.queuedListeners.delete(listener);
  }
  push(routeId: string, text: string) {
    if (!this.hasRoute(routeId))
      throw new Error("Unknown Wechatai destination; start a conversation from WeChat first");
    if (!text.trim() || text.length > 30000)
      throw new Error("Wechatai text must contain 1–30000 characters");
    return this.queue({ eventId: randomUUID(), routeId, text, status: "completed" });
  }
  pending() {
    return (
      this.db
        .prepare("SELECT data FROM outbox WHERE state = 'pending' ORDER BY createdAt LIMIT 20")
        .all() as { data: string }[]
    ).map((r) => JSON.parse(r.data) as Event);
  }
  settle(id: string, state: "sent" | "rejected") {
    this.db.prepare("UPDATE outbox SET state = ?, data = '{}' WHERE id = ?").run(state, id);
  }
  close() {
    this.db.close();
  }
}
const flushing = new WeakMap<Journal, Promise<void>>();
export function flush(journal: Journal, account: Account, signal?: AbortSignal): Promise<void> {
  const active = flushing.get(journal);
  if (active) return active.then(() => flush(journal, account, signal));
  const task = (async () => {
    // Queue notifications, heartbeat retries and completed turns share one drain.
    // Re-read after each batch to include messages queued while an upload awaited.
    for (let batch = journal.pending(); batch.length; batch = journal.pending()) {
      for (const event of batch) {
        try {
          await relay(account, "event", event, signal);
          journal.settle(event.eventId, "sent");
        } catch (e) {
          // Revoked route, expired job, invalid input and depleted credits require a
          // fresh user action. Do not replay old notifications after new consent.
          if (e instanceof RelayError && [400, 402, 403, 409, 413, 422].includes(e.status))
            journal.settle(event.eventId, "rejected");
          else throw e;
        }
      }
    }
  })().finally(() => flushing.delete(journal));
  flushing.set(journal, task);
  return task;
}
export async function executeJob(
  job: Job,
  journal: Journal,
  account: Account,
  execute: () => Promise<string | null>,
  signal?: AbortSignal,
) {
  const state = journal.state(job.id);
  if (state === "finished") return;
  // A journal entry means the prior process may already have executed tools.
  if (state === "running" || job.state === "claimed") {
    journal.start(job);
    if (job.state === "pending") {
      const claim = await relay<{ claimed: boolean }>(
        account,
        "claim",
        { id: job.id, runnerId: journal.runnerId, nativeCommands: true },
        signal,
      );
      if (!claim.claimed) return;
    }
    journal.queue({
      eventId: randomUUID(),
      routeId: job.routeId,
      jobId: job.id,
      text: "",
      status: "failed",
    });
    return;
  }
  // Persist before claiming; a crash in either gap cannot lead to re-execution.
  journal.start(job);
  const result = await relay<{ claimed: boolean }>(
    account,
    "claim",
    { id: job.id, runnerId: journal.runnerId, nativeCommands: true },
    signal,
  );
  if (!result.claimed) return;
  let text = "",
    status: Event["status"] = "completed";
  try {
    const result = await execute();
    text = result ?? "";
    if (result !== null && !text.trim()) status = "failed";
  } catch {
    status = "failed";
  }
  journal.queue({
    eventId: randomUUID(),
    routeId: job.routeId,
    jobId: job.id,
    text:
      text.length > 30000
        ? text.slice(0, 29950) + "\n\n[内容较长，剩余部分请在 OpenClaw 查看]"
        : text,
    status,
  });
}
