import os from "node:os";
import { readFile, statfs } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const count = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : null);
export function memoryFromProc(text) {
  const fields = Object.fromEntries(
    [...text.matchAll(/^(MemTotal|MemAvailable):\s+(\d+) kB$/gm)].map((m) => [
      m[1],
      Number(m[2]) * 1024,
    ]),
  );
  return count(fields.MemTotal) > 0 &&
    count(fields.MemAvailable) !== null &&
    fields.MemAvailable <= fields.MemTotal
    ? { total: fields.MemTotal, available: fields.MemAvailable }
    : null;
}
export function cpuSnapshot(cpus) {
  return cpus.reduce(
    (sum, cpu) => ({
      idle: sum.idle + cpu.times.idle,
      total: sum.total + Object.values(cpu.times).reduce((a, b) => a + b, 0),
    }),
    { idle: 0, total: 0 },
  );
}
export function cpuPercent(previous, current) {
  const total = current.total - previous.total,
    idle = current.idle - previous.idle;
  if (total <= 0 || idle < 0 || idle > total) return null;
  return Math.round((1 - idle / total) * 1000) / 10;
}
export async function probe(url, fetcher = fetch) {
  const start = performance.now();
  let reachable = false;
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(3000), redirect: "error" });
    reachable = true;
    // Health endpoints are fixed localhost URLs. Still bound both their body and wait.
    const reader = response.body?.getReader();
    let bytes = 0,
      text = "";
    if (reader) {
      const decoder = new TextDecoder();
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 8192) throw new Error("health response too large");
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        await reader.cancel().catch(() => {});
      }
    }
    const data = JSON.parse(text);
    if (!data || typeof data.ok !== "boolean") throw new Error("invalid health response");
    return {
      reachable,
      ok: response.ok && data.ok,
      latencyMs: Math.round(performance.now() - start),
      data,
    };
  } catch {
    return { reachable, ok: false, latencyMs: null, data: {} };
  }
}

export function createCollector(name = "微信消息服务器") {
  let previous = cpuSnapshot(os.cpus());
  return async () => {
    const cpus = os.cpus(),
      current = cpuSnapshot(cpus);
    const percent = cpuPercent(previous, current);
    previous = current;
    const [memory, disk, receiver, executor] = await Promise.all([
      (os.platform() === "linux"
        ? readFile("/proc/meminfo", "utf8").then(memoryFromProc)
        : Promise.resolve({ total: os.totalmem(), available: os.freemem() })
      ).catch(() => null),
      statfs("/")
        .then((s) => ({ total: s.blocks * s.bsize, available: s.bavail * s.bsize }))
        .catch(() => null),
      probe("http://127.0.0.1:18180/health"),
      probe("http://127.0.0.1:18181/health"),
    ]);
    return {
      name,
      sampledAt: Date.now(),
      uptimeSeconds: Math.floor(os.uptime()),
      cpu: { cores: cpus.length, percent, load: os.loadavg() },
      memory,
      disk,
      receiver: {
        reachable: receiver.reachable,
        ok: receiver.ok,
        latencyMs: receiver.latencyMs,
        ...Object.fromEntries(
          ["accounts", "connected", "links", "forwarded", "typingSent", "typingFailed"].map(
            (key) => [key, count(receiver.data[key])],
          ),
        ),
      },
      executor: {
        reachable: executor.reachable,
        ok: executor.ok,
        latencyMs: executor.latencyMs,
        draining: typeof executor.data.draining === "boolean" ? executor.data.draining : null,
        ...Object.fromEntries(
          ["active", "completed", "failed"].map((key) => [key, count(executor.data[key])]),
        ),
      },
    };
  };
}
