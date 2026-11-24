/** Internal account observations. The HTTP response exposes only cohort aggregates. */
export type RetentionObservation = {
  day: string;
  active: boolean;
  observedAt: number;
};

export type AccountRetention = {
  startedAt: number;
  days: { d1?: RetentionObservation; d7?: RetentionObservation };
  sourceUnavailable?: true;
};

export type RetentionReason =
  | "collection_not_started"
  | "before_collection"
  | "window_incomplete"
  | "coverage_incomplete"
  | "empty_cohort";

export type RetentionPeriod = {
  targetDay: string;
  available: boolean;
  reason: RetentionReason | null;
  numerator: number | null;
  denominator: number | null;
  rate: number | null;
};

export type MetricsRetention = {
  timezone: "Asia/Shanghai";
  generatedAt: number;
  collectionStartDay: string | null;
  window: { days: number; from: string; to: string };
  cohorts: { day: string; d1: RetentionPeriod; d7: RetentionPeriod }[];
};
