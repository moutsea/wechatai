import { imageSize } from "image-size";
import { AppError } from "./config";
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
    return { mime, width: info.width, height: info.height };
  } catch {
    throw new AppError(
      "image_invalid",
      "上游没有返回完整可用的 PNG、JPEG 或 WebP 图片，本次未扣费",
      502,
    );
  }
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
      ? { assetId: id, runId, kind: "image" as const, ready: true }
      : null;
  }
  commit(id: string) {
    this.sql.exec("UPDATE output_assets SET committed = 1 WHERE id = ?", id);
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
