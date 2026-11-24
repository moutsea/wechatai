import activationSql from "../../docs/analytics/activation-cohort.sql?raw";
import { billingMode } from "./billing";

export const ACTIVATION_WINDOW_MS = 7 * 86400000;
// First complete Shanghai day after verified production deployment 9e0058f.
// https://github.com/moutsea/wechatai/actions/runs/44890566353 completed
// 2026-11-21T17:43:24+08:00. This conservative floor omits earlier registrations.
export const ACTIVATION_COLLECTION_START_MS = Date.parse("2026-11-22T00:00:00+08:00");

export type ActivationRange = { from_ms: number; to_ms: number };

const dayReasons = [
  "window_incomplete",
  "snapshot_missing",
  "snapshot_stale",
  "activation_missing",
] as const;
type DayReason = (typeof dayReasons)[number];
type Counts = {
  accounts: number;
  model_tested: number;
  connected: number;
  first_reply_delivered: number;
  paid_accounts: number;
};
type CohortRow = { signup_day: string } & Record<DayReason, number> &
  (({ available: 1 } & Counts) | ({ available: 0 } & Record<keyof Counts, null>));

export function parseActivationRange(params: URLSearchParams): ActivationRange | null {
  const from = params.getAll("from_ms");
  const to = params.getAll("to_ms");
  if (from.length !== 1 || to.length !== 1 || !/^\d+$/.test(from[0]) || !/^\d+$/.test(to[0]))
    return null;
  const from_ms = Number(from[0]);
  const to_ms = Number(to[0]);
  if (!Number.isSafeInteger(from_ms) || !Number.isSafeInteger(to_ms) || from_ms >= to_ms)
    return null;
  return { from_ms, to_ms };
}

export async function getActivationMetrics(
  env: Env,
  range: ActivationRange,
  observedUntil = Date.now(),
  collectionStartedAt: number | null = ACTIVATION_COLLECTION_START_MS,
) {
  const metadata = {
    timezone: "Asia/Shanghai",
    requested_range: range,
    collection_started_at_ms: collectionStartedAt,
    collection_start_policy: "first_full_shanghai_day_after_verified_deployment",
    observed_until_ms: observedUntil,
    window_ms: ACTIVATION_WINDOW_MS,
    mode: billingMode(env),
    registration_interval: "[from_ms,to_ms)",
    event_interval: "[created_at_ms,created_at_ms+window_ms]",
    stages_independent: true,
    paid_accounts_basis: "current_status_paid_deduplicated_by_account",
    amount_basis: "not_applicable",
    refund_adjustment: "none",
  };
  if (collectionStartedAt === null) {
    return {
      ...metadata,
      available: false,
      reasons: ["collection_start_unknown"],
      effective_range: null,
      days: [],
    };
  }
  const effectiveRange = {
    from_ms: Math.max(range.from_ms, collectionStartedAt),
    to_ms: range.to_ms,
  };
  if (effectiveRange.from_ms >= effectiveRange.to_ms) {
    return {
      ...metadata,
      available: false,
      reasons: ["before_collection_start"],
      effective_range: null,
      days: [],
    };
  }
  const { results } = await env.DB.prepare(activationSql)
    .bind(
      effectiveRange.from_ms,
      effectiveRange.to_ms,
      observedUntil,
      ACTIVATION_WINDOW_MS,
      metadata.mode,
    )
    .all<CohortRow>();
  const days = results.map((row) => {
    if (row.available === 0) {
      return {
        signup_day: row.signup_day,
        available: false as const,
        reasons: dayReasons.filter((reason) => row[reason] === 1),
      };
    }
    return {
      signup_day: row.signup_day,
      available: true as const,
      accounts: row.accounts,
      model_tested: row.model_tested,
      connected: row.connected,
      first_reply_delivered: row.first_reply_delivered,
      paid_accounts: row.paid_accounts,
    };
  });
  return {
    ...metadata,
    available: days.every((day) => day.available),
    reasons: [...new Set(days.flatMap((day) => (day.available ? [] : day.reasons)))],
    effective_range: effectiveRange,
    days,
  };
}
