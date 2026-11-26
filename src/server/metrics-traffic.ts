import {
  shanghaiDay,
  shanghaiDaysAgo,
  type TrafficBucket,
  type TrafficSummary,
  type SignupConversions,
} from "../shared/analytics";
import { getSignupConversions, getTrafficSummary } from "./analytics";
import { anonymousAnalyticsDailyLimit } from "./analytics-budget";
import { METRICS_TRAFFIC_PATHS } from "./metrics-traffic-paths";

const paths = new Set<string>(METRICS_TRAFFIC_PATHS);
const sources = new Set([
  "",
  "utm:bing",
  "utm:newsletter",
  "google.com",
  "bing.com",
  "chatgpt.com",
]);
const devices = new Set(["desktop", "mobile", "tablet"]);

type CoverageReason =
  | "storage_unavailable"
  | "collection_disabled"
  | "collection_budget_limited"
  | "coverage_unknown";

function bucket(row: TrafficBucket, label: string | null) {
  return { label, labelRedacted: label === null, pv: row.pv, visitorDays: row.visitorDays };
}

function sourceDimension(value: string) {
  const source = sources.has(value) ? value : null;
  return {
    source,
    label: source === "" ? "（直接访问）" : source,
    sourceRedacted: source === null,
  };
}

function projectTraffic(traffic: TrafficSummary) {
  return {
    totals: {
      pv: traffic.totals.pv,
      visitorDays: traffic.totals.visitorDays,
      sessions: traffic.totals.sessions,
      pagesPerSession: traffic.totals.pagesPerSession,
    },
    daily: traffic.daily.map((row) => ({
      day: row.day,
      pv: row.pv,
      uv: row.uv,
      sessions: row.sessions,
    })),
    topPages: traffic.topPages.map((row) => bucket(row, paths.has(row.label) ? row.label : null)),
    sources: traffic.sources.map((row) => ({
      ...sourceDimension(row.label),
      pv: row.pv,
      visitorDays: row.visitorDays,
    })),
    sourceDepth: traffic.sourceDepth.map((row) => ({
      ...sourceDimension(row.label),
      pv: row.pv,
      sessions: row.sessions,
      pagesPerSession: row.pagesPerSession,
    })),
    countries: traffic.countries.map((row) =>
      bucket(row, /^[A-Z]{2}$/.test(row.label) ? row.label : null),
    ),
    devices: traffic.devices.map((row) => bucket(row, devices.has(row.label) ? row.label : null)),
  };
}

function projectConversions(conversions: SignupConversions) {
  return {
    total: conversions.total,
    unattributed: conversions.unattributed,
    sessions: conversions.sessions,
    rate: null,
    rows: conversions.rows.map((row) => {
      const label = paths.has(row.label) ? row.label : null;
      return {
        label,
        labelRedacted: label === null,
        sessions: row.sessions,
        signups: row.signups,
        rate: null,
      };
    }),
    sourceRows: conversions.sourceRows.map((row) => {
      const source = sources.has(row.source) ? row.source : null;
      const landingPath = paths.has(row.landingPath) ? row.landingPath : null;
      return {
        source,
        sourceRedacted: source === null,
        landingPath,
        landingPathRedacted: landingPath === null,
        sessions: row.sessions,
        signups: row.signups,
        rate: null,
      };
    }),
  };
}

function unavailable<T>(reason: CoverageReason, observed: T | null) {
  return { available: false as const, reason, data: null, observed };
}

/** Reuse stored aggregates, without inferring historical coverage from reserved permits. */
export async function readMetricsTraffic(env: Env, days: number, at = new Date()) {
  const to = shanghaiDay(at);
  const from = shanghaiDaysAgo(days - 1, at);
  const tables = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('page_views','signup_attributions','anonymous_analytics_budget')",
  ).all<{ name: string }>();
  const names = new Set(tables.results.map((row) => row.name));
  const hasBudget = names.has("anonymous_analytics_budget");
  const limit = anonymousAnalyticsDailyLimit(env);
  // Only today's current permit availability can be compared with the current limit.
  const reserved = hasBudget
    ? await env.DB.prepare("SELECT reserved FROM anonymous_analytics_budget WHERE day=?")
        .bind(to)
        .first<number>("reserved")
    : null;
  let reason: CoverageReason = "coverage_unknown";
  let basis: string | null = null;
  if (!hasBudget) reason = "storage_unavailable";
  else if (limit === 0) {
    reason = "collection_disabled";
    basis = "current_budget_config";
  } else if (reserved !== null && reserved >= limit) {
    reason = "collection_budget_limited";
    basis = "current_day_permits_fully_reserved";
  }

  const hasTraffic = hasBudget && names.has("page_views");
  const hasConversions = hasTraffic && names.has("signup_attributions");
  const [traffic, conversions] = await Promise.all([
    hasTraffic ? getTrafficSummary(env, days, at, "raw") : null,
    hasConversions ? getSignupConversions(env, days, at) : null,
  ]);

  return {
    service: "wechatai",
    documentationVersion: "1",
    timezone: "Asia/Shanghai",
    asOf: at.toISOString(),
    window: { from, to, days, includesToday: true },
    dataSource: "first_party_site_analytics",
    coverage: { complete: false, reason, basis, checkedDay: to },
    semantics: {
      observed: "stored_records_only",
      visitorDays: "sum_of_daily_deduplicated_visitors",
      pagesPerSession: "pv/sessions",
      conversionDenominator: "union_of_pageview_and_signup_sessions",
      rateUnit: "ratio",
      emptyTrafficSourceLabel: "（直接访问）",
      emptyConversionSourceLabel: "未识别来源",
      emptySourceIsConfirmedDirect: false,
    },
    limits: {
      topPages: 20,
      sources: 15,
      sourceDepth: 15,
      countries: 12,
      devices: 4,
      rows: 15,
      sourceRows: 15,
    },
    traffic: unavailable(
      traffic ? reason : "storage_unavailable",
      traffic ? projectTraffic(traffic) : null,
    ),
    conversions: unavailable(
      conversions ? reason : "storage_unavailable",
      conversions ? projectConversions(conversions) : null,
    ),
  };
}

export type MetricsTraffic = Awaited<ReturnType<typeof readMetricsTraffic>>;
