import { mkdir, open, readFile, readdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { executeHttp } from "./http.mjs";

export async function durableWrite(file, value) {
  const temp = file + "." + randomUUID() + ".tmp";
  const fd = await open(temp, "wx", 0o600);
  try {
    await fd.writeFile(JSON.stringify(value));
    await fd.sync();
  } finally {
    await fd.close();
  }
  await rename(temp, file);
  await syncParent(file);
}

async function syncParent(file) {
  const dir = await open(join(file, ".."), "r");
  try {
    await dir.sync();
  } finally {
    await dir.close();
  }
}
export const log = (event, data = {}) =>
  console.log(JSON.stringify({ event, ...data, at: new Date().toISOString() }));
async function archiveReceipt(file) {
  await rename(file, file + "." + randomUUID() + ".review");
  await syncParent(file);
  log("execution.receipt_needs_review");
}

async function responseJSON(response, limit) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > limit) throw new Error("control_size");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}

export class Executor {
  constructor(options) {
    this.options = options;
    this.running = new Map();
    this.claiming = new Map();
    this.pendingReports = new Map();
    this.reporting = new Map();
    this.claimRetryAt = new Map();
    this.stopController = new AbortController();
    this.metrics = { completed: 0, failed: 0 };
    this.lastDiscovery = 0;
    this.draining = false;
  }
  async api(path, payload) {
    const body = payload === undefined ? undefined : JSON.stringify(payload);
    const response = await fetch(new URL("/api/internal/executor/" + path, this.options.endpoint), {
      headers: {
        authorization: "Bearer " + this.options.secret,
        "content-type": "application/json",
        "user-agent": "WeChatAI-Executor/1.0",
        ...(body === undefined
          ? {}
          : { "X-Wechatai-Body-SHA256": createHash("sha256").update(body).digest("hex") }),
      },
      ...(body === undefined ? {} : { method: "POST", body }),
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      let code;
      if (response.status === 409) {
        const failure = await responseJSON(response, 4096).catch(() => null);
        code = failure?.error;
      } else {
        await response.body?.cancel();
      }
      throw Object.assign(new Error("control_http_" + response.status), {
        status: response.status,
        code,
      });
    }
    return responseJSON(response, 40 * 1024 * 1024);
  }
  async report(file, record) {
    let acknowledged = false;
    let review = false;
    try {
      const { data } = await this.api(record.accountId + "/complete", record.payload);
      acknowledged = data?.accepted === true;
      review = data?.stale === true;
    } catch (error) {
      review =
        [400, 413, 422].includes(error?.status) ||
        (error?.status === 409 && error.code === "job_conflict");
    }
    if (acknowledged) {
      await unlink(file);
    } else if (review) {
      // A stale or conflicting receipt may be the only copy of a real outcome.
      await archiveReceipt(file);
    } else {
      const delay = Math.min(30000, (this.pendingReports.get(file)?.delay ?? 500) * 2);
      this.pendingReports.set(file, {
        accountId: record.accountId,
        delay,
        next: Date.now() + delay,
      });
      return false;
    }
    this.pendingReports.delete(file);
    return true;
  }
  // Retry durable receipts independently from claim slots. Keep only paths and
  // timing in memory while a backend is unavailable.
  flushReports() {
    for (const [file, pending] of this.pendingReports) {
      if (this.reporting.size >= this.options.concurrency || this.stopController.signal.aborted)
        break;
      if (pending.next > Date.now() || this.reporting.has(file)) continue;
      const delivery = readFile(file, "utf8")
        .then((text) => this.report(file, JSON.parse(text)))
        .catch(() => {
          pending.next = Date.now() + 30000;
          log("execution.receipt_io_error");
        })
        .finally(() => this.reporting.delete(file));
      this.reporting.set(file, delivery);
    }
    return Promise.all(this.reporting.values());
  }
  async execute(accountId, job) {
    const file = join(
      this.options.directory,
      createHash("sha256")
        .update(accountId + ":" + job.id)
        .digest("hex") + ".json",
    );
    const record = { accountId, payload: { id: job.id, lease: job.lease } };
    // Do not persist request bodies, API keys, or prompts on the execution host.
    await durableWrite(file, record);
    let result;
    const startedAt = Date.now();
    try {
      if (this.stopController.signal.aborted) throw new Error("stopped");
      const signal = AbortSignal.any([
        this.stopController.signal,
        AbortSignal.timeout(Math.max(1, job.expiresAt - Date.now() - 1000)),
      ]);
      const value =
        job.input.kind === "http"
          ? await executeHttp(job.input, signal)
          : await this.options.attachments(job.input, signal);
      result = { ok: true, value };
      this.metrics.completed++;
      log("execution.completed", {
        kind: job.input.kind,
        durationMs: Date.now() - startedAt,
        ...(job.input.kind === "http" ? { status: value.status } : {}),
      });
    } catch (error) {
      this.metrics.failed++;
      result = {
        ok: false,
        code: "executor_failed",
        message: "执行服务未完成本次请求，本次未扣 credits，请稍后重试。",
      };
      if (error?.name === "AppError" && typeof error.code === "string")
        result = { ok: false, code: error.code, message: error.message };
      log("execution.failed", { kind: job.input.kind, code: result.code });
    }
    record.payload.result = result;
    await durableWrite(file, record);
    return this.report(file, record);
  }
  async recover() {
    await mkdir(this.options.directory, { recursive: true, mode: 0o700 });
    for (const name of await readdir(this.options.directory)) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      const file = join(this.options.directory, name);
      try {
        const record = JSON.parse(await readFile(file, "utf8"));
        if (
          !/^[a-f0-9]{64}$/.test(record?.accountId) ||
          !record?.payload?.id ||
          !record.payload.lease
        ) {
          await archiveReceipt(file);
          continue;
        }
        if (!record.payload.result) {
          record.payload.result = {
            ok: false,
            code: "executor_interrupted",
            message: "执行服务在处理期间重启，本次未扣 credits。为避免重复调用上游，请重新发送。",
          };
          await durableWrite(file, record);
        }
        this.pendingReports.set(file, { accountId: record.accountId, delay: 500, next: 0 });
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        await archiveReceipt(file);
      }
    }
  }
  async tick({ waitForClaims = true } = {}) {
    void this.flushReports();
    if (this.draining) return;
    for (const [id, at] of this.claimRetryAt) {
      if (at <= Date.now()) this.claimRetryAt.delete(id);
    }
    const { accounts } = await this.api("accounts");
    this.lastDiscovery = Date.now();
    const candidates = new Set(accounts).values();
    const slots = this.options.concurrency - this.running.size - this.claiming.size;
    const claims = Promise.all(Array.from({ length: slots }, () => this.discoverJobs(candidates)));
    if (waitForClaims) await claims;
    else void claims.catch(() => log("execution.discovery_retry"));
  }
  async discoverJobs(candidates) {
    for (const accountId of candidates) {
      if (
        this.draining ||
        this.stopController.signal.aborted ||
        this.running.size + this.claiming.size >= this.options.concurrency
      )
        return;
      if (
        !/^[a-f0-9]{64}$/.test(accountId) ||
        this.running.has(accountId) ||
        this.claiming.has(accountId)
      )
        continue;
      if (this.options.only?.size && !this.options.only.has(accountId)) continue;
      if (this.claimRetryAt.has(accountId) || this.hasPendingReport(accountId)) continue;
      const pending = this.claim(accountId).then((job) => {
        this.claiming.delete(accountId);
        if (!job) return false;
        const execution = this.runAccount(accountId, job)
          .catch(() => log("execution.delivery_pending"))
          .finally(() => this.running.delete(accountId));
        this.running.set(accountId, execution);
        return true;
      });
      this.claiming.set(accountId, pending);
      if (await pending) return;
    }
  }
  hasPendingReport(accountId) {
    for (const pending of this.pendingReports.values()) {
      if (pending.accountId === accountId) return true;
    }
    return false;
  }
  async claim(accountId) {
    try {
      return (await this.api(accountId + "/claim", {})).data;
    } catch {
      this.claimRetryAt.set(accountId, Date.now() + 30000);
      log("execution.claim_retry");
      return null;
    }
  }
  async runAccount(accountId, job) {
    while (job) {
      if ((await this.execute(accountId, job)) === false) return;
      // Give the account alarm time to resume, then claim its next tool step
      // directly. Idle accounts still use discovery; no Cloudflare long poll.
      await sleep(500, undefined, { signal: this.stopController.signal }).catch(() => {});
      if (this.stopController.signal.aborted || this.draining) return;
      job = await this.claim(accountId);
    }
  }
  async run() {
    await this.recover();
    while (!this.stopController.signal.aborted) {
      try {
        await this.tick({ waitForClaims: false });
      } catch {
        log("execution.discovery_retry");
      }
      await sleep(2000, undefined, { signal: this.stopController.signal }).catch(() => {});
    }
  }
  health() {
    return {
      ok: this.draining || Date.now() - this.lastDiscovery < 60000,
      draining: this.draining,
      active: this.running.size + this.claiming.size,
      ...this.metrics,
    };
  }
  drain() {
    this.draining = true;
  }
  async stop() {
    this.stopController.abort();
    await Promise.allSettled([...this.claiming.values()]);
    await Promise.allSettled([...this.running.values(), ...this.reporting.values()]);
  }
}
