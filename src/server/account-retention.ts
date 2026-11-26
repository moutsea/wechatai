import type { AccountRetention } from "../shared/metrics-retention";
import { dayWindow } from "./wallet";

export const RETENTION_DAY_MS = 86_400_000;

export const retentionCollectionSql = `SELECT MIN(json_extract(s.data,'$.retention.startedAt')) startedAt
  FROM admin_account_stats s JOIN user u ON u.id=s.user_id
  WHERE json_type(s.data,'$.retention.startedAt')='integer'
    AND json_extract(s.data,'$.retention.startedAt')>0
    AND json_extract(s.data,'$.retention.startedAt')<=?`;

/** usage is committed at successful settlement and retained independently of chat history. */
export function readAccountRetention(
  sql: SqlStorage,
  registeredAt: number,
  now: number,
  collectionStart?: number,
): AccountRetention {
  const result: AccountRetention = { startedAt: now, days: {} };
  const registration = registeredAt < 100_000_000_000 ? registeredAt * 1000 : registeredAt;
  if (!Number.isSafeInteger(registration) || registration < 0 || registration > now) return result;
  const registrationDay = dayWindow(registration).start;
  // The first sync records a marker only. Historical cohorts never gain facts.
  if (collectionStart === undefined || registrationDay < collectionStart) return result;
  for (const offset of [1, 7] as const) {
    const start = registrationDay + offset * RETENTION_DAY_MS;
    const end = start + RETENTION_DAY_MS;
    if (end > now) continue;
    const active = sql
      .exec<{ active: number }>(
        "SELECT EXISTS(SELECT 1 FROM usage WHERE createdAt>=? AND createdAt<?) active",
        start,
        end,
      )
      .one().active;
    result.days[offset === 1 ? "d1" : "d7"] = {
      day: dayWindow(start).day,
      active: Boolean(active),
      observedAt: now,
    };
  }
  return result;
}
