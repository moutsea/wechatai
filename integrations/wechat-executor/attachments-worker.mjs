import { parentPort, workerData } from "node:worker_threads";
import { executeHttp } from "./http.mjs";
import { parseAttachmentBatch } from "./attachments.bundle.mjs";
// The parser's network requests get the same pinned-public-DNS transport as LLM
// jobs; a CDN URL cannot reach the execution host's private services.
globalThis.fetch = async (url, init = {}) => {
  const r = await executeHttp(
    {
      url: String(url),
      method: init.method || "GET",
      headers: Object.fromEntries(new Headers(init.headers)),
      body: init.body,
      timeoutMs: 30000,
      maxBytes: 8 * 1024 * 1024,
    },
    init.signal ?? new AbortController().signal,
  );
  return new Response(Buffer.from(r.body, "base64"), { status: r.status, headers: r.headers });
};
try {
  parentPort.postMessage({ ok: true, value: await parseAttachmentBatch(workerData.items) });
} catch (error) {
  const safe =
    typeof error.code === "string" && /^(attachment_|pdf_|file_|doc|wechat_)/.test(error.code);
  parentPort.postMessage({
    ok: false,
    code: safe ? error.code : "attachment_failed",
    message: safe ? error.message : "附件处理失败，请检查格式或减少文件大小",
  });
}
