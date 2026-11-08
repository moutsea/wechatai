-- Read-only, run after admin stats sync. Bind :from_ms, :to_ms, :observed_until_ms,
-- :window_ms (e.g. 7 * 86400000), :mode ('live'/'test').
-- Only use accounts created after this instrumentation was deployed.
-- Exclude cohorts whose full observation window or snapshot is incomplete.
WITH cohort AS (
  SELECT u.id, u.createdAt,
    json_extract(s.data,'$.activation.firstModelTestAt') model_test_at,
    json_extract(s.data,'$.activation.firstWechatConnectedAt') connected_at,
    json_extract(s.data,'$.activation.firstWechatReplyAt') replied_at,
    json_extract(s.data,'$.activation.lastWechatReplyAt') last_reply_at
  FROM user u JOIN admin_account_stats s ON s.user_id=u.id
  WHERE u.createdAt >= :from_ms AND u.createdAt < :to_ms
    AND u.createdAt + :window_ms <= :observed_until_ms
    AND s.synced_at >= u.createdAt + :window_ms
    AND json_type(s.data,'$.activation') = 'object'
)
SELECT strftime('%Y-%m-%d',createdAt/1000,'unixepoch','+8 hours') signup_day,
  COUNT(*) accounts,
  SUM(CASE WHEN model_test_at BETWEEN createdAt AND createdAt+:window_ms THEN 1 ELSE 0 END) model_tested,
  SUM(CASE WHEN connected_at BETWEEN createdAt AND createdAt+:window_ms THEN 1 ELSE 0 END) connected,
  SUM(CASE WHEN replied_at BETWEEN createdAt AND createdAt+:window_ms THEN 1 ELSE 0 END) first_reply_delivered,
  SUM(CASE WHEN EXISTS (
    SELECT 1 FROM billing_order b WHERE b.user_id=cohort.id AND b.mode=:mode
      AND b.status='paid' AND b.paid_at BETWEEN cohort.createdAt AND cohort.createdAt+:window_ms
  ) THEN 1 ELSE 0 END) paid_accounts
FROM cohort GROUP BY signup_day ORDER BY signup_day;
-- Stage counts are independent within the SAME signup cohort; do not divide adjacent
-- stages: notification/Agent users can legitimately skip model configuration.
-- Missing/old snapshots are excluded, not counted as conversion failures.
-- last_reply_at alone cannot reconstruct D7 retention: later activity overwrites it.
