import { callFailureReasons } from "../shared/call-failures";
import { AppError } from "./config";

export function initCallFailures(sql: SqlStorage) {
  sql.exec(`CREATE TABLE IF NOT EXISTS call_failures (
    id TEXT PRIMARY KEY, createdAt INTEGER NOT NULL, code TEXT NOT NULL, upstreamStatus INTEGER);
    CREATE INDEX IF NOT EXISTS call_failures_created ON call_failures(createdAt);`);
  if (sql.exec("SELECT 1 FROM settings WHERE key='callFailuresMigrated'").toArray().length) return;
  // Preserve surviving historical failures before users clear their chat history.
  // Their original cause was not stored, so do not infer it from current balances.
  sql.exec(`INSERT OR IGNORE INTO call_failures
    SELECT r.id,r.createdAt,'legacy_unknown',NULL FROM runs r
    WHERE r.status='failed' AND NOT EXISTS(SELECT 1 FROM usage u WHERE u.id=r.id)`);
  // Remote failure replies were stored as completed runs for delivery deduplication.
  // Their job state still confirms failure; no provider reason was retained.
  sql.exec(`INSERT OR IGNORE INTO call_failures
    SELECT 'legacy-remote:' || id,createdAt,'remote_agent_failed',NULL FROM claw_jobs
    WHERE state='failed'`);
  sql.exec("INSERT INTO settings VALUES ('callFailuresMigrated','true')");
}

export function recordCallFailure(sql: SqlStorage, id: string, error: unknown, now = Date.now()) {
  const rawCode =
    error instanceof AppError
      ? error.code
      : error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)
        ? "request_timeout"
        : "request_failed";
  const code = Object.hasOwn(callFailureReasons, rawCode) ? rawCode : "request_failed";
  const status = error instanceof AppError ? error.upstreamStatus : undefined;
  // Retries and post-commit delivery/scheduler errors cannot reclassify settled calls.
  sql.exec(
    `INSERT OR IGNORE INTO call_failures(id,createdAt,code,upstreamStatus)
    SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM usage WHERE id=?)`,
    id,
    now,
    code,
    status ?? null,
    id,
  );
}
