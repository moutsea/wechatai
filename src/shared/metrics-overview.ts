export type SnapshotReason = "not_synced" | "legacy_snapshot" | "day_incomplete" | "not_covered";

export type SnapshotMetric<T> =
  | { available: true; reason: null; value: T; observed: T }
  | { available: false; reason: SnapshotReason; value: null; observed: T | null };

export type OverviewUsage = { requests: number; tokens: number; credits: number };
export type OverviewStock = OverviewUsage & {
  plus: number;
  links: number;
  connected: number;
  channels: number;
  models: number;
  plugins: number;
  sessions: number;
  failedRequests: number;
  purchasedCredits: number;
  debt: number;
};
export type OverviewDayUsage = OverviewUsage & { activeUsers: number; failedRequests: number };
export type OverviewPluginUsage = OverviewUsage & { pluginId: string; users: number };

export type MetricsOverview = {
  service: "wechatai";
  documentationVersion: "1";
  timezone: "Asia/Shanghai";
  generatedAt: number;
  window: {
    startsAt: number;
    endsAt: number;
    startDay: string;
    endDay: string;
    days: 30;
    includesToday: true;
    endInclusive: true;
    activeUsers: "distinct_users_with_settled_usage_per_day";
    credits: "settled_units_divided_by_1000_before_refunds";
    source: "admin_account_stats";
  };
  coverage: {
    totalUsers: number;
    syncedUsers: number;
    oldestSyncedAt: number | null;
    newestSyncedAt: number | null;
    legacySnapshots: number;
    complete: boolean;
    reason: "not_synced" | "legacy_snapshot" | null;
  };
  summary: {
    users: number;
    snapshot: SnapshotMetric<OverviewStock> & {
      asOf: { oldest: number | null; newest: number | null };
    };
  };
  daily: { day: string; newUsers: number; snapshot: SnapshotMetric<OverviewDayUsage> }[];
  plugins: {
    available: boolean;
    reason: SnapshotReason | null;
    items: OverviewPluginUsage[] | null;
  };
};
