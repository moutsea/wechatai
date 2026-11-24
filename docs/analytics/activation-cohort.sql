-- A single incomplete account makes its entire in-range signup day unavailable.
-- Unavailable counts are NULL in SQL and omitted in the API; complete zeroes are real.
-- Stages are independent accounts in the SAME signup cohort. Notification/Agent
-- users may skip model configuration, so adjacent stages are not a conversion funnel.
-- Paid accounts use current status='paid', deduplicated by account and billing mode.
-- There are no gross/net amounts or refund adjustments.
-- lastWechatReplyAt cannot reconstruct D7 retention: later activity overwrites it.
-- Read-only. Bind five positional parameters in this order:
-- ?1 from_ms (inclusive), ?2 to_ms (exclusive), ?3 observed_until_ms,
-- ?4 window_ms (7 * 86400000 for the API), ?5 mode ('live'/'test').
-- Clamp from_ms to the verified instrumentation collection start before binding.
-- Registration timestamps support the same seconds/milliseconds formats as admin.ts.
WITH cohort AS (
  SELECT u.id,
    CASE WHEN u.createdAt < 100000000000 THEN u.createdAt * 1000 ELSE u.createdAt END created_at,
    s.user_id snapshot_user_id, s.synced_at, s.data
  FROM user u LEFT JOIN admin_account_stats s ON s.user_id = u.id
  WHERE (CASE WHEN u.createdAt < 100000000000 THEN u.createdAt * 1000 ELSE u.createdAt END) >= ?1
    AND (CASE WHEN u.createdAt < 100000000000 THEN u.createdAt * 1000 ELSE u.createdAt END) < ?2
), daily AS (
  SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', '+8 hours') signup_day,
    MAX(created_at + ?4 > ?3) window_incomplete,
    MAX(snapshot_user_id IS NULL) snapshot_missing,
    MAX(snapshot_user_id IS NOT NULL AND synced_at < created_at + ?4) snapshot_stale,
    MAX(snapshot_user_id IS NOT NULL AND json_type(data, '$.activation') IS NOT 'object') activation_missing,
    COUNT(*) accounts,
    SUM(CASE WHEN json_extract(data, '$.activation.firstModelTestAt')
      BETWEEN created_at AND created_at + ?4 THEN 1 ELSE 0 END) model_tested,
    SUM(CASE WHEN json_extract(data, '$.activation.firstWechatConnectedAt')
      BETWEEN created_at AND created_at + ?4 THEN 1 ELSE 0 END) connected,
    SUM(CASE WHEN json_extract(data, '$.activation.firstWechatReplyAt')
      BETWEEN created_at AND created_at + ?4 THEN 1 ELSE 0 END) first_reply_delivered,
    SUM(CASE WHEN EXISTS (
      SELECT 1 FROM billing_order b WHERE b.user_id = cohort.id AND b.mode = ?5
        AND b.status = 'paid' AND b.paid_at BETWEEN cohort.created_at AND cohort.created_at + ?4
    ) THEN 1 ELSE 0 END) paid_accounts
  FROM cohort GROUP BY signup_day
), qualified AS (
  SELECT *, (window_incomplete + snapshot_missing + snapshot_stale + activation_missing = 0) available
  FROM daily
)
SELECT signup_day, available, window_incomplete, snapshot_missing, snapshot_stale, activation_missing,
  CASE WHEN available THEN accounts END accounts,
  CASE WHEN available THEN model_tested END model_tested,
  CASE WHEN available THEN connected END connected,
  CASE WHEN available THEN first_reply_delivered END first_reply_delivered,
  CASE WHEN available THEN paid_accounts END paid_accounts
FROM qualified ORDER BY signup_day;
