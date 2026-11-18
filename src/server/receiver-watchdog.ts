import { secret } from "./config";

// The VPS normally compares these sessions with its local receiver. The Worker
// cron takes over if the whole VPS (including the supervisor) disappears.
const LEASE_MS = 60_000;
type Bindings = Pick<Env, "DB" | "ACCOUNTS">;
export const watchdogHeader = "X-Wechatai-Receiver-Watchdog";
export const watchdogBackupMs = 15 * 60_000;

function scopeFor(env: Env) {
  return secret(env, "WECHAT_RECEIVER_WATCHDOG_ACCOUNTS", false)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}
export function watchdogEnabled(env: Env, account: string) {
  const scope = scopeFor(env);
  return scope.includes(account) || scope.includes("all");
}

export async function enrollWatchdog(db: D1Database, account: string, session: string) {
  const now = Date.now();
  const result = await db
    .prepare(
      "INSERT INTO receiver_watchdog_sessions(session,account_id,check_after) SELECT ?,?,? FROM receiver_watchdog_supervisor WHERE id=1 AND seen_at>?",
    )
    .bind(session, account, now + LEASE_MS, now - LEASE_MS)
    .run();
  return result.meta.changes === 1;
}

export async function recoverReceiverSession(env: Bindings, session: string) {
  const now = Date.now();
  // Claim with a retry deadline before RPC; a lost reply or crashed sweeper
  // leaves a durable retry. A replacement socket has its own immutable token.
  const row = await env.DB.prepare(
    "UPDATE receiver_watchdog_sessions SET check_after=? WHERE session=? AND check_after<=? RETURNING account_id",
  )
    .bind(now + LEASE_MS, session, now)
    .first<{ account_id: string }>();
  if (!row) return;
  await env.ACCOUNTS.get(env.ACCOUNTS.idFromString(row.account_id)).recoverReceiverWatchdog(
    session,
  );
  await forgetWatchdogSession(env.DB, session);
}

export async function forgetWatchdogSession(db: D1Database, session: string) {
  await db.prepare("DELETE FROM receiver_watchdog_sessions WHERE session=?").bind(session).run();
}

export async function fallbackWatchdogs(env: Env) {
  const now = Date.now();
  const scope = scopeFor(env);
  const rows = await env.DB.prepare(
    "SELECT session FROM receiver_watchdog_sessions WHERE check_after<=? AND ((?=0 AND account_id NOT IN (SELECT value FROM json_each(?))) OR NOT EXISTS (SELECT 1 FROM receiver_watchdog_supervisor WHERE id=1 AND seen_at>?)) ORDER BY check_after LIMIT 32",
  )
    .bind(now, scope.includes("all") ? 1 : 0, JSON.stringify(scope), now - LEASE_MS)
    .all<{ session: string }>()
    .catch((error: unknown) => {
      // The cron also runs on installations that have not enabled this migration.
      if (scope.length === 0 && /no such table: receiver_watchdog_/.test(String(error)))
        return { results: [] };
      throw error;
    });
  const results = await Promise.allSettled(
    rows.results.map((row) => recoverReceiverSession(env, row.session)),
  );
  const failed = results.find((r) => r.status === "rejected");
  if (failed) throw failed.reason;
}

export async function listWatchdogSessions(db: D1Database, after: string) {
  const limit = 100;
  const rows = await db
    .prepare(
      "SELECT session FROM receiver_watchdog_sessions WHERE session>? AND check_after<=? ORDER BY session LIMIT ?",
    )
    .bind(after, Date.now(), limit)
    .all<{ session: string }>();
  const sessions = rows.results.map((r) => r.session);
  return { sessions, next: sessions.length === limit ? sessions[sessions.length - 1] : null };
}

export async function recordWatchdogHeartbeat(db: D1Database) {
  await db
    .prepare(
      "INSERT INTO receiver_watchdog_supervisor VALUES(1,?) ON CONFLICT(id) DO UPDATE SET seen_at=MAX(seen_at,excluded.seen_at)",
    )
    .bind(Date.now())
    .run();
}
