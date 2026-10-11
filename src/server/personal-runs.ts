import { AppError } from "./config";
import type { ModelMessage } from "./llm";
import type { PersonalAssistantProgress } from "./plugins/personal-assistant";

export type PersonalRun = {
  version: 1;
  modelId: string;
  pluginId: string;
  modelConfig: string;
  pluginConfig: string;
  sessionId: string;
  connectionId: string;
  generation: string;
  contextStart: number;
  resetAt: number;
  startedAt: number;
  deadline: number;
  resumes: number;
  outputLimit: number;
  reminderTarget: { connectionId: string; generation: string } | null;
  attachmentBatch?: { connectionId: string; token: string };
  omitted?: boolean;
  retryBudget?: number;
};
export type PersonalRunInput = { original: ModelMessage[]; prepared?: ModelMessage[] };

// Keep checkpoints in the owning account's SQLite storage, alongside its inbox.
// Chunk blobs so large contexts and attachments stay below SQLite's row limit.
export class PersonalRunStore {
  constructor(private storage: DurableObjectStorage) {}
  init() {
    this.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS personal_runs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS personal_run_data (id TEXT NOT NULL, kind TEXT NOT NULL, part INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY(id,kind,part));
    `);
  }
  get(id: string): PersonalRun | undefined {
    const row = this.storage.sql
      .exec<{ data: string }>("SELECT data FROM personal_runs WHERE id=?", id)
      .toArray()[0];
    return row ? JSON.parse(row.data) : undefined;
  }
  save(id: string, data: PersonalRun) {
    this.storage.sql.exec(
      "INSERT INTO personal_runs VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      id,
      JSON.stringify(data),
    );
  }
  read<T extends PersonalRunInput | PersonalAssistantProgress>(
    id: string,
    kind: "input" | "progress",
  ): T | undefined {
    const parts = this.storage.sql
      .exec<{ data: ArrayBuffer }>(
        "SELECT data FROM personal_run_data WHERE id=? AND kind=? ORDER BY part",
        id,
        kind,
      )
      .toArray();
    if (!parts.length) return;
    const bytes = new Uint8Array(parts.reduce((n, p) => n + p.data.byteLength, 0));
    let offset = 0;
    for (const part of parts) {
      bytes.set(new Uint8Array(part.data), offset);
      offset += part.data.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  }
  write(
    id: string,
    kind: "input" | "progress",
    value: PersonalRunInput | PersonalAssistantProgress,
  ) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    if (bytes.byteLength > 32 * 1024 * 1024)
      throw new AppError(
        "personal_checkpoint_size",
        "本轮上下文过大，无法保存处理进度，请新建会话或减少附件",
        422,
      );
    this.storage.transactionSync(() => {
      this.storage.sql.exec("DELETE FROM personal_run_data WHERE id=? AND kind=?", id, kind);
      for (let offset = 0, part = 0; offset < bytes.length; offset += 256 * 1024, part++)
        this.storage.sql.exec(
          "INSERT INTO personal_run_data VALUES (?,?,?,?)",
          id,
          kind,
          part,
          bytes.slice(offset, offset + 256 * 1024),
        );
    });
  }
  clearProgress(id: string) {
    this.storage.sql.exec("DELETE FROM personal_run_data WHERE id=? AND kind='progress'", id);
  }
  remove(id: string) {
    this.storage.sql.exec("DELETE FROM personal_run_data WHERE id=?", id);
    this.storage.sql.exec("DELETE FROM personal_runs WHERE id=?", id);
  }
  cancelPlugin(pluginId: string) {
    this.storage.transactionSync(() => {
      for (const { id } of this.storage.sql
        .exec<{ id: string }>(
          "SELECT id FROM personal_runs WHERE json_extract(data,'$.pluginId')=?",
          pluginId,
        )
        .toArray()) {
        this.storage.sql.exec(
          "UPDATE runs SET status='failed' WHERE id=? AND status='interrupted'",
          id,
        );
        this.storage.sql.exec(
          "UPDATE inbox SET state='done',payload='{}',reply='' WHERE id=? AND state='pending'",
          id,
        );
        this.remove(id);
      }
    });
  }
  prune() {
    // Cancellation, session deletion and disconnected links must erase saved
    // prompts as well. Completed/failed runs never need another model call.
    this.storage.sql.exec(
      "DELETE FROM personal_runs WHERE NOT EXISTS(SELECT 1 FROM runs r JOIN inbox i ON i.id=r.id WHERE r.id=personal_runs.id AND r.status IN ('running','interrupted') AND i.state='pending') OR (json_extract(data,'$.deadline')<=? AND EXISTS(SELECT 1 FROM runs r WHERE r.id=personal_runs.id AND r.status='interrupted'))",
      Date.now(),
    );
    this.storage.sql.exec(
      "DELETE FROM personal_run_data WHERE NOT EXISTS(SELECT 1 FROM personal_runs r WHERE r.id=personal_run_data.id)",
    );
  }
}
