import { Worker } from "node:worker_threads";
export function executeAttachments(input, signal) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const worker = new Worker(new URL("./attachments-worker.mjs", import.meta.url), {
      workerData: input,
      resourceLimits: { maxOldGenerationSizeMb: 192 },
    });
    let settled = false;
    const timer = setTimeout(() => finish(new Error("attachment_timeout")), 120000);
    const abort = () => finish(new Error("attachment_aborted"));
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      void worker.terminate();
      if (error) reject(error);
      else resolve(value);
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.once("error", (e) => finish(e));
    worker.once("exit", (code) => {
      if (code) finish(new Error("attachment_exit"));
    });
    worker.once("message", (r) =>
      r.ok
        ? finish(null, r.value)
        : finish(Object.assign(new Error(r.message), { name: "AppError", code: r.code })),
    );
  });
}
