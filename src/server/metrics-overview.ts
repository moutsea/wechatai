import { adminOverview } from "./admin";
import { dayWindow } from "./wallet";
import { adminPluginNames, type AdminOverview } from "../shared/admin";
import type { MetricsOverview, SnapshotMetric, SnapshotReason } from "../shared/metrics-overview";

export async function metricsOverview(env: Env, now = Date.now()): Promise<MetricsOverview> {
  return projectMetricsOverview(
    await adminOverview(env, now, {
      snapshotCoverage: true,
      publicPluginIds: Object.keys(adminPluginNames),
    }),
  );
}

// Only explicitly selected aggregates leave this adapter. Internal payment,
// identity, activation and per-account fields never enter the response.
export function projectMetricsOverview(input: AdminOverview): MetricsOverview {
  const { summary, coverage, generatedAt } = input;
  const today = dayWindow(generatedAt);
  const startsAt = today.start - 29 * 86400000;
  // A caller without the inspection metadata must not assert completeness.
  const legacySnapshots = coverage.legacySnapshots ?? coverage.synced;
  const reason =
    summary.users > coverage.synced ? "not_synced" : legacySnapshots > 0 ? "legacy_snapshot" : null;
  const hasObservation = summary.users === 0 || (coverage.synced > 0 && legacySnapshots === 0);

  function metric<T>(observed: T, unavailable: SnapshotReason | null): SnapshotMetric<T> {
    if (unavailable)
      return {
        available: false,
        reason: unavailable,
        value: null,
        observed: hasObservation ? observed : null,
      };
    return { available: true, reason: null, value: observed, observed };
  }

  function dayReason(start: number): SnapshotReason | null {
    if (summary.users === 0) return null;
    if (reason) return reason;
    // Each snapshot retains only its own latest 30 Shanghai days. Checking both
    // edges prevents a newer snapshot's absent historical rows from becoming 0.
    if (
      coverage.oldest === null ||
      coverage.newest === null ||
      start < dayWindow(coverage.newest).start - 29 * 86400000 ||
      coverage.newest > generatedAt ||
      coverage.oldest < Math.min(start + 86400000, today.start)
    )
      return "not_covered";
    return start === today.start ? "day_incomplete" : null;
  }

  const pluginReason = dayReason(today.start);
  return {
    service: "wechatai",
    documentationVersion: "1",
    timezone: "Asia/Shanghai",
    generatedAt,
    window: {
      startsAt,
      endsAt: generatedAt,
      startDay: dayWindow(startsAt).day,
      endDay: today.day,
      days: 30,
      includesToday: true,
      endInclusive: true,
      activeUsers: "distinct_users_with_settled_usage_per_day",
      credits: "settled_units_divided_by_1000_before_refunds",
      source: "admin_account_stats",
    },
    coverage: {
      totalUsers: summary.users,
      syncedUsers: coverage.synced,
      oldestSyncedAt: coverage.oldest,
      newestSyncedAt: coverage.newest,
      legacySnapshots,
      complete: reason === null,
      reason,
    },
    summary: {
      users: summary.users,
      snapshot: {
        ...metric(
          {
            plus: summary.plus,
            links: summary.links,
            connected: summary.connected,
            channels: summary.channels,
            models: summary.models,
            plugins: summary.plugins,
            sessions: summary.sessions,
            requests: summary.requests,
            failedRequests: summary.failedRequests,
            tokens: summary.tokens,
            credits: summary.credits,
            purchasedCredits: summary.purchasedCredits,
            debt: summary.debt,
          },
          reason,
        ),
        asOf: { oldest: coverage.oldest, newest: coverage.newest },
      },
    },
    daily: input.daily.map((day, index) => ({
      day: day.day,
      newUsers: day.newUsers,
      snapshot: metric(
        {
          activeUsers: day.activeUsers,
          requests: day.requests,
          failedRequests: day.failedRequests,
          tokens: day.tokens,
          credits: day.credits,
        },
        dayReason(startsAt + index * 86400000),
      ),
    })),
    plugins: {
      available: pluginReason === null,
      reason: pluginReason,
      items: hasObservation
        ? input.plugins
            .filter((plugin) => Object.hasOwn(adminPluginNames, plugin.pluginId))
            .map((plugin) => ({
              pluginId: plugin.pluginId,
              users: plugin.users,
              requests: plugin.requests,
              tokens: plugin.tokens,
              credits: plugin.credits,
            }))
        : null,
    },
  };
}
