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
  const dir = await open(join(file, ".."), "r");
  try {
    await dir.sync();
  } finally {
    await dir.close();
  }
}
export const log = (event, data = {}) =>
  console.log(JSON.stringify({ event, ...data, at: new Date().toISOString() }));
export class Executor {
  constructor(options) {
    this.options = options;
    this.running = new Map();
    this.stopController = new AbortController();
    this.metrics = { completed: 0, failed: 0 };
    this.lastDiscovery = 0;
    this.draining = false;
  }
  async api(path, payload) {
    const response = await fetch(new URL("/api/internal/executor/" + path, this.options.endpoint), {
      headers: {
        authorization: "Bearer " + this.options.secret,
        "content-type": "application/json",
        "user-agent": "WeChatAI-Executor/1.0",
      },
      ...(payload === undefined ? {} : { method: "POST", body: JSON.stringify(payload) }),
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("control_http_" + response.status);
    }
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > 40 * 1024 * 1024) {
        throw new Error("control_size");
      }
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString());
  }
  async report(file, record) {
    let delay = 1000;
    while (!this.stopController.signal.aborted) {
      try {
        const result = await this.api(record.accountId + "/complete", record.payload);
        if (result.data?.accepted || result.data?.stale) {
          await unlink(file);
          return;
        }
      } catch {
        /* Acknowledgement loss replays this result, never its upstream request. */
      }
      await sleep(delay, undefined, { signal: this.stopController.signal }).catch(() => {});
      delay = Math.min(30000, delay * 2);
    }
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
    await this.report(file, record);
  }
  async recover() {
    await mkdir(this.options.directory, { recursive: true, mode: 0o700 });
    for (const name of await readdir(this.options.directory)) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      const file = join(this.options.directory, name),
        record = JSON.parse(await readFile(file, "utf8"));
      record.payload.result ??= {
        ok: false,
        code: "executor_interrupted",
        message: "执行服务在处理期间重启，本次未扣 credits。为避免重复调用上游，请重新发送。",
      };
      await durableWrite(file, record);
      await this.report(file, record);
    }
  }
  async tick() {
    if (this.draining) return;
    const { accounts } = await this.api("accounts");
    this.lastDiscovery = Date.now();
    for (const accountId of accounts) {
      if (this.draining || this.running.size >= this.options.concurrency || this.stopController.signal.aborted)
        break;
      if (!/^[a-f0-9]{64}$/.test(accountId) || this.running.has(accountId)) continue;
      if (this.options.only?.size && !this.options.only.has(accountId)) continue;
      const { data: job } = await this.api(accountId + "/claim", {});
      if (!job) continue;
      const promise = this.runAccount(accountId, job)
        .catch(() => log("execution.delivery_pending"))
        .finally(() => this.running.delete(accountId));
      this.running.set(accountId, promise);
    }
  }
  async runAccount(accountId, job) {
    while (job) {
      await this.execute(accountId, job);
      // Give the account alarm time to resume, then claim its next tool step
      // directly. Idle accounts still use discovery; no Cloudflare long poll.
      await sleep(500, undefined, { signal: this.stopController.signal }).catch(() => {});
      if (this.stopController.signal.aborted || this.draining) return;
      ({ data: job } = await this.api(accountId + "/claim", {}));
    }
  }
  async run() {
    await this.recover();
    while (!this.stopController.signal.aborted) {
      try {
        await this.tick();
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
      active: this.running.size,
      ...this.metrics,
    };
  }
  drain() {
    this.draining = true;
  }
  async stop() {
    this.stopController.abort();
    await Promise.allSettled([...this.running.values()]);
  }
}
