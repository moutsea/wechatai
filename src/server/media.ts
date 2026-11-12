import { imageSize } from "image-size";
import { AppError } from "./config";
import { createHash } from "node:crypto";
import { gifDimensions, svgDocument } from "./file-image-validation";
import { verifyPngPixels } from "./png-validation";
import { verifyGeneratedPdf } from "./pdf-validation";
export const MEDIA_TTL_MS = 30 * 86400000;
export const MAX_GENERATED_BYTES = 8 * 1024 * 1024;
export type OutputAsset = {
  id: string;
  runId: string;
  sessionId: string | null;
  mime: string;
  bytes: number;
  width: number;
  height: number;
  expiresAt: number;
  committed: number;
  wechat: string;
  name: string;
};

export function verifyGeneratedImage(data: Uint8Array) {
  if (!data.length || data.length > MAX_GENERATED_BYTES)
    throw new AppError("image_size", "生成图片为空或超过 8 MB，请调整尺寸后重试", 502);
  try {
    const info = imageSize(data);
    const mime = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" }[info.type ?? ""];
    const b = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const complete =
      info.type === "png"
        ? b.length >= 45 && b.subarray(-8, -4).toString() === "IEND"
        : info.type === "jpg"
          ? b.subarray(-2).equals(Buffer.from([0xff, 0xd9]))
          : info.type === "webp" && b.length >= 20 && b.readUInt32LE(4) + 8 === b.length;
    if (!mime || !complete || !info.width || !info.height || info.width * info.height > 25_000_000)
      throw new Error("Invalid raster image");
    if (info.type === "png") verifyPngPixels(data, info.width, info.height);
    return { mime, width: info.width, height: info.height };
  } catch {
    throw new AppError(
      "image_invalid",
      "上游没有返回完整可用的 PNG、JPEG 或 WebP 图片，本次未扣费",
      502,
    );
  }
}

/** Names and upstream MIME types are presentation hints, never billing evidence. */
function inspectFileImage(data: Uint8Array, declaredType: string) {
  const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ||
    (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP")
  )
    return verifyGeneratedImage(data);
  const invalid = () =>
    new AppError(
      "image_invalid",
      "云端返回的图片损坏或格式暂不支持，请生成完整的 PNG、JPEG、WebP、GIF 或 SVG 图片，本次未扣 credits。",
      502,
    );
  const checked = (mime: string, info: { width: number; height: number }) => {
    if (data.length > MAX_GENERATED_BYTES || info.width * info.height > 25_000_000)
      throw new AppError("image_size", "生成图片超过 8 MB 或像素上限，请调整尺寸后重试。", 502);
    return { mime, ...info };
  };
  try {
    if (/^GIF8[79]a$/.test(bytes.toString("ascii", 0, 6))) {
      if (data.length > MAX_GENERATED_BYTES)
        throw new AppError("image_size", "生成图片超过 8 MB，请调整尺寸后重试。", 502);
      return checked("image/gif", gifDimensions(data));
    }
    const svg = svgDocument(data);
    if (svg !== null) {
      let size = { width: 0, height: 0 };
      try {
        const info = imageSize(Buffer.from(svg));
        size = { width: info.width, height: info.height };
      } catch {
        // SVGs can be valid without an intrinsic size.
      }
      return checked("image/svg+xml", size);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw invalid();
  }
  let type: string | undefined;
  try {
    type = imageSize(data).type;
  } catch {
    // Unknown documents remain files. Dimensions alone never prove image validity.
  }
  if ((type && type !== "svg") || declaredType.toLowerCase().startsWith("image/")) throw invalid();
  return null;
}

export class MediaStore {
  constructor(
    private sql: SqlStorage,
    private bucket: R2Bucket,
    private account: string,
  ) {}
  init() {
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS output_assets (id TEXT PRIMARY KEY, runId TEXT NOT NULL, sessionId TEXT, mime TEXT NOT NULL, bytes INTEGER NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, expiresAt INTEGER NOT NULL, committed INTEGER NOT NULL DEFAULT 0, wechat TEXT NOT NULL DEFAULT '')`,
    );
    this.sql.exec("CREATE INDEX IF NOT EXISTS assets_session ON output_assets(sessionId)");
    if (
      !this.sql
        .exec<{ name: string }>("PRAGMA table_info(output_assets)")
        .toArray()
        .some((column) => column.name === "name")
    )
      this.sql.exec("ALTER TABLE output_assets ADD COLUMN name TEXT NOT NULL DEFAULT ''");
  }
  key(id: string) {
    return `generated/${this.account}/${id}`;
  }
  row(id: string) {
    return this.sql.exec<OutputAsset>("SELECT * FROM output_assets WHERE id = ?", id).toArray()[0];
  }
  async save(runId: string, sessionId: string | null, data: Uint8Array) {
    const info = verifyGeneratedImage(data);
    const id = crypto.randomUUID();
    const expiresAt = Date.now() + MEDIA_TTL_MS;
    await this.bucket.put(this.key(id), data, {
      httpMetadata: { contentType: info.mime },
      customMetadata: { runId, expiresAt: String(expiresAt) },
    });
    this.sql.exec(
      "INSERT INTO output_assets (id,runId,sessionId,mime,bytes,width,height,expiresAt) VALUES (?,?,?,?,?,?,?,?)",
      id,
      runId,
      sessionId,
      info.mime,
      data.length,
      info.width,
      info.height,
      expiresAt,
    );
    return this.row(id)!;
  }
  async resolve(id: string, runId: string) {
    const a = this.row(id);
    if (!a || a.runId !== runId || a.committed < 0 || a.expiresAt <= Date.now()) return null;
    const stored = await this.bucket.head(this.key(id));
    return stored && stored.size === a.bytes && stored.customMetadata?.runId === runId
      ? {
          assetId: id,
          runId,
          kind: a.mime.startsWith("image/") ? ("image" as const) : ("file" as const),
          ready: true,
        }
      : null;
  }
  async saveFile(
    runId: string,
    sessionId: string,
    file: { path: string; name: string; contentType: string },
    data: Uint8Array,
  ) {
    if (!data.length || data.length > 16 * 1024 * 1024)
      throw new AppError("cloud_file_size", "生成文件为空或超过 16 MB。", 502);
    const image = inspectFileImage(data, file.contentType);
    const pdf =
      file.contentType.toLowerCase() === "application/pdf" ||
      /\.pdf$/i.test(file.name) ||
      Buffer.from(data.subarray(0, 5)).equals(Buffer.from("%PDF-"));
    if (pdf) await verifyGeneratedPdf(data);
    const mime = image?.mime ?? (pdf ? "application/pdf" : file.contentType);
    const hash = createHash("sha256")
      .update(JSON.stringify([runId, file.path]))
      .digest("hex");
    const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
    const old = this.row(id);
    if (old) return old;
    const expiresAt = Date.now() + MEDIA_TTL_MS;
    await this.bucket.put(this.key(id), data, {
      httpMetadata: { contentType: mime },
      customMetadata: { runId, expiresAt: String(expiresAt) },
    });
    this.sql.exec(
      "INSERT OR IGNORE INTO output_assets (id,runId,sessionId,mime,bytes,width,height,expiresAt,name) VALUES (?,?,?,?,?,?,?,?,?)",
      id,
      runId,
      sessionId,
      mime,
      data.length,
      image?.width ?? 0,
      image?.height ?? 0,
      expiresAt,
      file.name,
    );
    return this.row(id)!;
  }
  commit(id: string) {
    this.sql.exec("UPDATE output_assets SET committed = 1 WHERE id = ?", id);
  }
  discard(id: string) {
    this.sql.exec("UPDATE output_assets SET committed=-1,expiresAt=0,wechat='' WHERE id=?", id);
  }
  discardRun(runId: string) {
    this.sql.exec(
      "UPDATE output_assets SET committed=-1,expiresAt=0,wechat='' WHERE runId=? AND committed=0",
      runId,
    );
  }
  revoke(sessionId?: string) {
    if (sessionId)
      this.sql.exec(
        "UPDATE output_assets SET committed = -1, expiresAt = 0, wechat = '' WHERE sessionId = ?",
        sessionId,
      );
    else this.sql.exec("UPDATE output_assets SET committed = -1, expiresAt = 0, wechat = ''");
  }
  nextExpiry() {
    return this.sql
      .exec<{ time: number | null }>("SELECT MIN(expiresAt) AS time FROM output_assets")
      .one().time;
  }
  async cleanup() {
    const rows = this.sql
      .exec<{ id: string }>(
        "SELECT id FROM output_assets WHERE expiresAt <= ? LIMIT 50",
        Date.now(),
      )
      .toArray();
    if (!rows.length) return;
    await this.bucket.delete(rows.map((a) => this.key(a.id)));
    for (const a of rows)
      this.sql.exec("DELETE FROM output_assets WHERE id = ? AND expiresAt <= ?", a.id, Date.now());
  }
  async read(id: string) {
    const a = this.row(id);
    if (!a || a.committed !== 1 || a.expiresAt <= Date.now()) return null;
    const stored = await this.bucket.get(this.key(id));
    const fresh = this.row(id);
    if (!stored || !fresh || fresh.committed !== 1 || fresh.expiresAt <= Date.now()) {
      await stored?.body.cancel();
      return null;
    }
    return { asset: fresh, body: stored.body };
  }
}
