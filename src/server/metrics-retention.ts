import type {
  MetricsRetention,
  RetentionPeriod,
  RetentionReason,
} from "../shared/metrics-retention";
import { RETENTION_DAY_MS, retentionCollectionSql } from "./account-retention";
import { dayWindow } from "./wallet";

export function retentionDays(values: string[] | undefined): number | null {
  if (!values) return 30;
  if (values.length !== 1 || !/^[1-9]\d?$/.test(values[0])) return null;
  const days = Number(values[0]);
  return days <= 90 ? days : null;
}

type CohortRow = {
  day: string;
  denominator: number;
  d1Covered: number;
  d1Active: number;
  d7Covered: number;
  d7Active: number;
};

const createdMillis =
  "CASE WHEN u.createdAt<100000000000 THEN u.createdAt*1000 ELSE u.createdAt END";

function coverageSql(period: "d1" | "d7", offset: number) {
  const path = `$.retention.days.${period}`;
  return `routed IS NULL
    AND COALESCE(json_extract(data,'$.retention.sourceUnavailable'),0)=0
    AND json_type(data,'$.retention.startedAt')='integer'
    AND json_extract(data,'$.retention.startedAt')>0
    AND json_extract(data,'$.retention.startedAt')<=?
    AND json_extract(data,'${path}.day')=strftime('%Y-%m-%d',(dayStart+${offset}*86400000)/1000,'unixepoch','+8 hours')
    AND json_type(data,'${path}.active') IN ('true','false')
    AND json_type(data,'${path}.observedAt')='integer'
    AND json_extract(data,'${path}.observedAt')>=dayStart+${offset + 1}*86400000
    AND json_extract(data,'${path}.observedAt')<=?`;
}

/** All account associations and coverage checks stay inside the aggregate query. */
export async function readMetricsRetention(
  env: Env,
  days: number,
  now = Date.now(),
): Promise<MetricsRetention> {
  const today = dayWindow(now);
  const start = today.start - (days - 1) * RETENTION_DAY_MS;
  const db = env.DB.withSession("first-primary");
  const [collection, cohorts] = await db.batch<Record<string, string | number | null>>([
    db.prepare(retentionCollectionSql).bind(now),
    db
      .prepare(`WITH accounts AS (
      SELECT ${createdMillis} registeredAt,s.data,r.owner_id routed
      FROM user u LEFT JOIN admin_account_stats s ON s.user_id=u.id
      LEFT JOIN account_backend_routes r ON r.owner_id=u.id
      WHERE (${createdMillis})>=? AND (${createdMillis})<?
    ), observations AS (
      SELECT *,CAST((registeredAt+28800000)/86400000 AS INTEGER)*86400000-28800000 dayStart
      FROM accounts
    ), coverage AS (
      SELECT *,(${coverageSql("d1", 1)}) d1Covered,(${coverageSql("d7", 7)}) d7Covered
      FROM observations
    ) SELECT strftime('%Y-%m-%d',dayStart/1000,'unixepoch','+8 hours') day,
      COUNT(*) denominator,
      SUM(CASE WHEN d1Covered THEN 1 ELSE 0 END) d1Covered,
      SUM(CASE WHEN d1Covered AND json_extract(data,'$.retention.days.d1.active')=1 THEN 1 ELSE 0 END) d1Active,
      SUM(CASE WHEN d7Covered THEN 1 ELSE 0 END) d7Covered,
      SUM(CASE WHEN d7Covered AND json_extract(data,'$.retention.days.d7.active')=1 THEN 1 ELSE 0 END) d7Active
      FROM coverage GROUP BY day ORDER BY day`)
      .bind(start, today.start + RETENTION_DAY_MS, now, now, now, now),
  ]);
  const startedAt = collection.results[0]?.startedAt as number | null;
  const collectionStart = startedAt == null ? null : dayWindow(startedAt).start + RETENTION_DAY_MS;
  const rows = new Map((cohorts.results as unknown as CohortRow[]).map((row) => [row.day, row]));

  function period(dayStart: number, offset: 1 | 7, row?: CohortRow): RetentionPeriod {
    const targetStart = dayStart + offset * RETENTION_DAY_MS;
    const covered = offset === 1 ? row?.d1Covered : row?.d7Covered;
    let reason: RetentionReason | null = null;
    if (collectionStart === null) reason = "collection_not_started";
    else if (dayStart < collectionStart) reason = "before_collection";
    else if (targetStart + RETENTION_DAY_MS > now) reason = "window_incomplete";
    else if (!row?.denominator) reason = "empty_cohort";
    else if (covered !== row.denominator) reason = "coverage_incomplete";
    const numerator = reason === null ? (offset === 1 ? row!.d1Active : row!.d7Active) : null;
    const denominator = reason === null ? row!.denominator : null;
    return {
      targetDay: dayWindow(targetStart).day,
      available: reason === null,
      reason,
      numerator,
      denominator,
      rate: reason === null ? numerator! / denominator! : null,
    };
  }

  return {
    timezone: "Asia/Shanghai",
    generatedAt: now,
    collectionStartDay: collectionStart === null ? null : dayWindow(collectionStart).day,
    window: { days, from: dayWindow(start).day, to: today.day },
    cohorts: Array.from({ length: days }, (_, index) => {
      const dayStart = start + index * RETENTION_DAY_MS;
      const day = dayWindow(dayStart).day;
      return {
        day,
        d1: period(dayStart, 1, rows.get(day)),
        d7: period(dayStart, 7, rows.get(day)),
      };
    }),
  };
}
