import { timingSafeEqual } from "node:crypto";
import { AppError } from "./config";
import { notificationTokenHash } from "./notification-token";
import type { NotificationMessage, NotificationReceipt } from "../shared/notification";
import type { ReminderSchedule } from "./reminder-scheduler";

export type NotificationJob = NotificationReceipt & {
  pluginId: string;
  connectionId: string;
  generation: string;
  text: string;
  nextAt: number;
};
export class NotificationStore {
  private sql: SqlStorage;
  constructor(private storage: DurableObjectStorage) {
    this.sql = storage.sql;
    this.sql
      .exec(`CREATE TABLE IF NOT EXISTS notification_tokens (pluginId TEXT PRIMARY KEY, hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS notification_jobs (
        id TEXT PRIMARY KEY, pluginId TEXT NOT NULL, dedupe TEXT NOT NULL, fingerprint TEXT NOT NULL,
        connectionId TEXT NOT NULL, generation TEXT NOT NULL, title TEXT NOT NULL, text TEXT NOT NULL,
        state TEXT NOT NULL, createdAt INTEGER NOT NULL, sentAt INTEGER, attempts INTEGER NOT NULL DEFAULT 0,
        nextAt INTEGER NOT NULL, error TEXT NOT NULL DEFAULT '', UNIQUE(pluginId,dedupe));
      CREATE INDEX IF NOT EXISTS notification_due ON notification_jobs(state,nextAt);
      CREATE INDEX IF NOT EXISTS notification_created ON notification_jobs(createdAt);
      CREATE TABLE IF NOT EXISTS notification_schedule (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, acknowledged INTEGER NOT NULL);
      INSERT OR IGNORE INTO notification_schedule VALUES (1,0,0);`);
  }
  hasToken(pluginId: string) {
    return !!this.sql.exec("SELECT 1 FROM notification_tokens WHERE pluginId=?", pluginId).toArray()
      .length;
  }
  rotate(pluginId: string, hash: string) {
    this.sql.exec(
      "INSERT INTO notification_tokens VALUES (?,?) ON CONFLICT(pluginId) DO UPDATE SET hash=excluded.hash",
      pluginId,
      hash,
    );
  }
  authorize(pluginId: string, credential: string) {
    const row = this.sql
      .exec<{ hash: string }>("SELECT hash FROM notification_tokens WHERE pluginId=?", pluginId)
      .toArray()[0];
    if (
      !row ||
      !timingSafeEqual(Buffer.from(row.hash), Buffer.from(notificationTokenHash(credential)))
    )
      throw new AppError("invalid_token", "Token 无效或已撤销", 401);
  }
  revoke(pluginId: string) {
    this.sql.exec("DELETE FROM notification_tokens WHERE pluginId=?", pluginId);
    this.cancel(pluginId);
  }
  private changed() {
    this.sql.exec("UPDATE notification_schedule SET revision=revision+1 WHERE id=1");
  }
  schedule(): ReminderSchedule {
    const { revision } = this.sql
      .exec<{ revision: number }>("SELECT revision FROM notification_schedule WHERE id=1")
      .one();
    const { nextAt } = this.sql
      .exec<{ nextAt: number | null }>(
        "SELECT MIN(nextAt) nextAt FROM notification_jobs WHERE state IN ('pending','sending')",
      )
      .one();
    return { revision, nextAt };
  }
  pendingSync() {
    return !!this.sql
      .exec("SELECT 1 FROM notification_schedule WHERE revision>acknowledged")
      .toArray().length;
  }
  acknowledge(revision: number) {
    this.sql.exec(
      "UPDATE notification_schedule SET acknowledged=MAX(acknowledged,?) WHERE id=1",
      revision,
    );
  }
  private fingerprint(message: NotificationMessage) {
    return notificationTokenHash(JSON.stringify(message));
  }
  existing(pluginId: string, dedupe: string, message: NotificationMessage) {
    const row = this.sql
      .exec<NotificationJob & { fingerprint: string }>(
        "SELECT * FROM notification_jobs WHERE pluginId=? AND dedupe=? AND createdAt>=?",
        pluginId,
        dedupe,
        Date.now() - 7 * 86400000,
      )
      .toArray()[0];
    if (row && row.fingerprint !== this.fingerprint(message))
      throw new AppError("idempotency_conflict", "相同 Idempotency-Key 不能用于不同内容", 409);
    return row;
  }
  enqueue(
    pluginId: string,
    dedupe: string,
    message: NotificationMessage,
    connectionId: string,
    generation: string,
  ) {
    return this.storage.transactionSync(() => {
      const now = Date.now();
      this.sql.exec(
        "DELETE FROM notification_jobs WHERE createdAt<? AND state NOT IN ('pending','sending')",
        now - 7 * 86400000,
      );
      const prior = this.existing(pluginId, dedupe, message);
      if (prior) return { job: prior, duplicate: true };
      const counts = this.sql
        .exec<{ minute: number; day: number; pending: number }>(
          `SELECT
        (SELECT COUNT(*) FROM notification_jobs WHERE createdAt>?) minute,
        (SELECT COUNT(*) FROM notification_jobs WHERE createdAt>?) day,
        (SELECT COUNT(*) FROM notification_jobs WHERE state IN ('pending','sending')) pending`,
          now - 60000,
          now - 86400000,
        )
        .one();
      if (counts.minute >= 30 || counts.day >= 1000 || counts.pending >= 100)
        throw new AppError(
          "notification_limit",
          "消息提醒额度已达上限：每分钟 30 条、24 小时 1000 条、待发送最多 100 条",
          429,
        );
      const id = crypto.randomUUID();
      this.sql.exec(
        `INSERT INTO notification_jobs(id,pluginId,dedupe,fingerprint,connectionId,generation,title,text,state,createdAt,nextAt)
        VALUES (?,?,?,?,?,?,?,?,'pending',?,?)`,
        id,
        pluginId,
        dedupe,
        this.fingerprint(message),
        connectionId,
        generation,
        message.title,
        message.text,
        now,
        now,
      );
      this.changed();
      return { job: this.get(id)!, duplicate: false };
    });
  }
  get(id: string) {
    return this.sql
      .exec<NotificationJob>("SELECT * FROM notification_jobs WHERE id=?", id)
      .toArray()[0];
  }
  receipt(pluginId: string, id: string) {
    return this.sql
      .exec<NotificationReceipt>(
        "SELECT id,title,state,createdAt,sentAt,attempts,error FROM notification_jobs WHERE pluginId=? AND id=? AND createdAt>=?",
        pluginId,
        id,
        Date.now() - 7 * 86400000,
      )
      .toArray()[0];
  }
  due() {
    return this.sql
      .exec<NotificationJob>(
        "SELECT * FROM notification_jobs WHERE state IN ('pending','sending') AND nextAt<=? ORDER BY nextAt LIMIT 5",
        Date.now(),
      )
      .toArray();
  }
  claim(id: string) {
    const claimed =
      this.sql
        .exec(
          "UPDATE notification_jobs SET state='sending',attempts=attempts+1,nextAt=? WHERE id=? AND state IN ('pending','sending') AND nextAt<=? RETURNING id",
          Date.now() + 30000,
          id,
          Date.now(),
        )
        .toArray().length > 0;
    if (claimed) this.changed();
    return claimed;
  }
  finish(id: string, state: "sent" | "failed", error = "") {
    this.sql.exec(
      "UPDATE notification_jobs SET state=?,error=?,text='',sentAt=? WHERE id=? AND state IN ('pending','sending')",
      state,
      error,
      state === "sent" ? Date.now() : null,
      id,
    );
    this.changed();
  }
  retry(id: string, error: string, delay: number) {
    this.sql.exec(
      "UPDATE notification_jobs SET state='pending',error=?,nextAt=? WHERE id=? AND state IN ('pending','sending')",
      error,
      Date.now() + delay,
      id,
    );
    this.changed();
  }
  cancel(pluginId: string) {
    this.sql.exec(
      "UPDATE notification_jobs SET state='cancelled',text='',error='配置已停用、接收微信已更改或 Token 已撤销' WHERE pluginId=? AND state IN ('pending','sending')",
      pluginId,
    );
    this.changed();
  }
  receipts(pluginId: string): NotificationReceipt[] {
    return this.sql
      .exec<NotificationReceipt>(
        "SELECT id,title,state,createdAt,sentAt,attempts,error FROM notification_jobs WHERE pluginId=? AND createdAt>=? ORDER BY createdAt DESC LIMIT 20",
        pluginId,
        Date.now() - 7 * 86400000,
      )
      .toArray();
  }
}
