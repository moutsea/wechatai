-- 注册归因：把「这次注册」和「这次访问的落地页」连起来，回答「哪篇页面真的带来了注册」。
-- 只存会话号与从 page_views 里查到的落地页信息，不存邮箱、账户 ID 或任何身份字段。
CREATE TABLE IF NOT EXISTS signup_attributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  session_id TEXT NOT NULL,
  landing_path TEXT NOT NULL DEFAULT '',
  referrer_host TEXT NOT NULL DEFAULT '',
  utm_source TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  event_id TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_signup_attributions_event ON signup_attributions(event_id);
CREATE INDEX IF NOT EXISTS idx_signup_attributions_day ON signup_attributions(day);
CREATE INDEX IF NOT EXISTS idx_signup_attributions_session ON signup_attributions(session_id);

-- 归因要按会话取「第一次浏览」，只靠 0014 的 (day, session_id) 复合索引不够，补一个。
CREATE INDEX IF NOT EXISTS idx_page_views_session_created ON page_views(session_id, created_at);
