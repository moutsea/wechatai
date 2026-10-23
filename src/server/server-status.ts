import { createHash, timingSafeEqual } from "node:crypto";
import {
  serverReportSchema,
  SERVER_STATUS_STALE_MS,
  type AdminServerStatus,
} from "../shared/server-status";
import { AppError, secret } from "./config";

export function serverMonitorAuthorized(env: Env, authorization: string) {
  const expected = secret(env, "SERVER_MONITOR_SECRET", false);
  if (expected.length < 32 || !authorization.startsWith("Bearer ")) return false;
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(expected), hash(authorization.slice(7)));
}

export async function saveServerStatus(env: Env, payload: unknown) {
  const parsed = serverReportSchema.safeParse(payload);
  if (!parsed.success) throw new AppError("invalid_report", "服务器状态数据无效");
  const now = Date.now(),
    report = parsed.data;
  if (report.sampledAt < now - 60_000 || report.sampledAt > now + 30_000)
    throw new AppError("report_clock_skew", "采集时间不正确，请检查服务器时钟", 409);
  // One current snapshot, never an unbounded series of host IDs or metrics.
  // Replayed/late reports cannot overwrite a newer sample or refresh its heartbeat.
  const result = await env.DB.prepare(
    `INSERT INTO server_status(id,sampled_at,received_at,payload) VALUES (1,?,?,?)
     ON CONFLICT(id) DO UPDATE SET sampled_at=excluded.sampled_at,
       received_at=excluded.received_at,payload=excluded.payload
     WHERE excluded.sampled_at>server_status.sampled_at`,
  )
    .bind(report.sampledAt, now, JSON.stringify(report))
    .run();
  return { ok: true, accepted: result.meta.changes > 0 };
}

export async function adminServerStatus(env: Env): Promise<AdminServerStatus> {
  const row = await env.DB.withSession("first-primary")
    .prepare("SELECT received_at,payload FROM server_status WHERE id=1")
    .first<{ received_at: number; payload: string }>();
  const now = Date.now();
  return {
    configured: secret(env, "SERVER_MONITOR_SECRET", false).length >= 32,
    generatedAt: now,
    receivedAt: row?.received_at ?? null,
    stale: !row || now - row.received_at > SERVER_STATUS_STALE_MS,
    report: row ? serverReportSchema.parse(JSON.parse(row.payload)) : null,
  };
}
