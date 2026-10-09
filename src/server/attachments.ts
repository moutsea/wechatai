import { Unzip, UnzipInflate } from "fflate";
import { SaxesParser } from "saxes";
import { AppError } from "./config";
import type { WxItem } from "./wechat";

export const ATTACHMENT_TTL_MS = 15 * 60_000;
export const MAX_ATTACHMENTS = 4;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_BATCH_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_CHARS = 100_000;
const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "jsonl",
  "log",
  "yaml",
  "yml",
  "xml",
  "html",
  "htm",
  "js",
  "ts",
  "tsx",
  "jsx",
  "py",
  "css",
  "sql",
  "sh",
  "java",
  "go",
  "rs",
]);
export const safeFileName = (value: string) =>
  value
    .split(/[\\/]/)
    .at(-1)!
    // Strip control characters from untrusted display names.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 160) || "附件";
function extension(name: string) {
  return name.split(".").at(-1)!.toLowerCase();
}
export function validateAttachment(item: WxItem): WxItem {
  const source = item.type === 2 ? item.image_item : item.file_item;
  if (!source?.media) throw new AppError("attachment_missing", "附件信息不完整，请重新发送");
  if (JSON.stringify(item).length > 16000)
    throw new AppError("attachment_metadata_size", "附件信息过大，请重新发送");
  if (item.type === 4) {
    const name = safeFileName(item.file_item?.file_name ?? "附件");
    if (!["pdf", "docx"].includes(extension(name)) && !TEXT_EXTENSIONS.has(extension(name)))
      throw new AppError(
        "file_type",
        "目前支持 PDF、Word（.docx）和 TXT、Markdown、CSV 等纯文本文件。旧版 .doc 请先另存为 .docx。",
      );
    if (Number(item.file_item?.len ?? 0) > MAX_ATTACHMENT_BYTES)
      throw new AppError("attachment_size", "每个附件最大 5 MB，请缩小或拆分后发送");
    return { type: 4, file_item: { file_name: name, media: source.media, aeskey: source.aeskey } };
  }
  return { type: 2, image_item: { media: source.media, aeskey: source.aeskey } };
}

export type AttachmentScope = {
  connectionId: string;
  sessionId: string;
  generation: string;
  contextStart: number;
};
export type PendingAttachments = AttachmentScope & {
  token: string;
  items: WxItem[];
  messageIds: string[];
  expiresAt: number;
};
// Keep only small CDN references here; binary content is downloaded after an instruction.
// Rows are scoped to the account's DO, link, session, reset cursor and binding generation.
export class AttachmentQueue {
  constructor(private sql: SqlStorage) {}
  init() {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS pending_attachments (
      connectionId TEXT PRIMARY KEY, sessionId TEXT NOT NULL, generation TEXT NOT NULL,
      contextStart INTEGER NOT NULL, token TEXT NOT NULL, items TEXT NOT NULL, expiresAt INTEGER NOT NULL
    )`);
    this.expire();
  }
  expire() {
    // Retain only an empty marker so the next instruction gets an explicit expiry notice.
    this.sql.exec(
      "UPDATE pending_attachments SET items = '[]' WHERE expiresAt <= ? AND items != '[]'",
      Date.now(),
    );
  }
  nextExpiry() {
    return this.sql
      .exec<{ expires: number | null }>(
        "SELECT MIN(expiresAt) AS expires FROM pending_attachments WHERE items != '[]'",
      )
      .one().expires;
  }
  get(scope: AttachmentScope): PendingAttachments | undefined {
    this.expire();
    const row = this.sql
      .exec<Omit<PendingAttachments, "items" | "messageIds"> & { items: string }>(
        "SELECT * FROM pending_attachments WHERE connectionId = ?",
        scope.connectionId,
      )
      .toArray()[0];
    if (!row) return;
    if (
      row.sessionId !== scope.sessionId ||
      row.generation !== scope.generation ||
      row.contextStart !== scope.contextStart
    ) {
      this.clear(scope.connectionId);
      return;
    }
    const payload = JSON.parse(row.items) as WxItem[] | { items: WxItem[]; messageIds: string[] };
    return { ...row, ...(Array.isArray(payload) ? { items: payload, messageIds: [] } : payload) };
  }
  add(scope: AttachmentScope, items: WxItem[], messageId: string) {
    const old = this.get(scope);
    if (old?.messageIds.includes(messageId)) return old;
    const all = [...(old?.items ?? []), ...items.map(validateAttachment)];
    if (all.length > MAX_ATTACHMENTS)
      throw new AppError(
        "attachment_count",
        "一次最多暂存 4 个附件。请先发送处理要求，或用 /cancel 清空后重新发送。",
      );
    const value: PendingAttachments = {
      ...scope,
      token: crypto.randomUUID(),
      items: all,
      messageIds: [...(old?.messageIds ?? []), messageId],
      expiresAt: Date.now() + ATTACHMENT_TTL_MS,
    };
    this.sql.exec(
      "INSERT OR REPLACE INTO pending_attachments VALUES (?, ?, ?, ?, ?, ?, ?)",
      scope.connectionId,
      scope.sessionId,
      scope.generation,
      scope.contextStart,
      value.token,
      JSON.stringify({ items: all, messageIds: value.messageIds }),
      value.expiresAt,
    );
    return value;
  }
  clear(connectionId: string, token?: string) {
    if (token)
      this.sql.exec(
        "DELETE FROM pending_attachments WHERE connectionId = ? AND token = ?",
        connectionId,
        token,
      );
    else this.sql.exec("DELETE FROM pending_attachments WHERE connectionId = ?", connectionId);
  }
}

function checkedText(text: string) {
  if (text.length > MAX_TEXT_CHARS)
    throw new AppError(
      "file_text_size",
      "文件正文超过 10 万字，请拆分文件后再发送；本次未调用模型",
    );
  return text;
}
function decodeText(data: Uint8Array) {
  try {
    const encoding =
      data[0] === 0xff && data[1] === 0xfe
        ? "utf-16le"
        : data[0] === 0xfe && data[1] === 0xff
          ? "utf-16be"
          : "utf-8";
    const text = checkedText(new TextDecoder(encoding, { fatal: true }).decode(data));
    if (text.includes("\0")) throw new Error("Binary data");
    return text;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("file_encoding", "文件不是可读取的文本，请转为 UTF-8 编码后重新发送");
  }
}
function docxText(data: Uint8Array) {
  const parts: Uint8Array[] = [];
  let bytes = 0,
    found = false,
    complete = false,
    entries = 0;
  const zip = new Unzip((file) => {
    if (++entries > 10000) throw new Error("Too many archive entries");
    if (file.name !== "word/document.xml") return;
    if (found || (file.originalSize ?? 0) > 2_000_000) throw new Error("Document XML too large");
    found = true;
    file.ondata = (error, chunk, final) => {
      if (error) throw error;
      bytes += chunk.length;
      if (bytes > 2_000_000) throw new Error("Document XML too large");
      parts.push(chunk);
      complete = final;
    };
    file.start();
  });
  zip.register(UnzipInflate);
  // Bound each inflate step as well as the accumulated output.
  for (let offset = 0; offset < data.length; offset += 1024)
    zip.push(data.subarray(offset, offset + 1024), offset + 1024 >= data.length);
  if (!found || !complete) throw new Error("Missing document XML");
  const xml = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts));
  let text = "",
    inText = false;
  const parser = new SaxesParser({ xmlns: true });
  const wordNamespace = new Set([
    "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "http://purl.oclc.org/ooxml/wordprocessingml/main",
  ]);
  parser.on("doctype", () => {
    throw new Error("Document type declarations are not allowed");
  });
  parser.on("opentag", (tag) => {
    if (!wordNamespace.has(tag.uri)) return;
    if (tag.local === "t") inText = true;
    if (["tab", "br", "cr"].includes(tag.local))
      text = checkedText(text + (tag.local === "tab" ? "\t" : "\n"));
  });
  parser.on("text", (value) => {
    if (inText) text = checkedText(text + value);
  });
  parser.on("closetag", (tag) => {
    if (!wordNamespace.has(tag.uri)) return;
    if (tag.local === "t") inText = false;
    if (["p", "tr"].includes(tag.local)) text = checkedText(text + "\n");
    if (tag.local === "tc") text = checkedText(text + "\t");
  });
  parser.write(xml).close();
  return text;
}
export async function extractFileText(name: string, data: Uint8Array) {
  if (data.length > MAX_ATTACHMENT_BYTES)
    throw new AppError("attachment_size", "每个附件最大 5 MB，请拆分后发送");
  let text: string;
  try {
    if (extension(name) === "pdf") {
      const { getResolvedPDFJS } = await import("unpdf");
      const { getDocument } = await getResolvedPDFJS();
      const task = getDocument({
        data: new Uint8Array(data),
        disableFontFace: true,
        useSystemFonts: false,
        useWorkerFetch: false,
        useWasm: false,
        verbosity: 0,
      });
      try {
        const pdf = await task.promise;
        if (pdf.numPages > 100)
          throw new AppError("pdf_pages", "PDF 最多支持 100 页，请拆分后发送");
        text = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          try {
            const content = await page.getTextContent();
            text = checkedText(
              text +
                content.items
                  .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""))
                  .join("") +
                "\n",
            );
          } finally {
            page.cleanup();
          }
        }
      } finally {
        await task.destroy();
      }
    } else if (extension(name) === "docx") text = docxText(data);
    else if (TEXT_EXTENSIONS.has(extension(name))) text = decodeText(data);
    else throw new AppError("file_type", "请发送 PDF、Word（.docx）或纯文本文件");
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "file_parse",
      "文件解析失败，可能已损坏或加密。请解密后重发，或另存为 PDF、DOCX、TXT",
    );
  }
  if (!text.trim())
    throw new AppError(
      "file_empty",
      "没有读取到文件正文。扫描版 PDF 请先进行文字识别，或把相关页面作为图片发送",
    );
  return text.trim();
}
