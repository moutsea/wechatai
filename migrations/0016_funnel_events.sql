-- 转化漏斗事件。page_views 只能回答「谁看了哪一页」，注册验证、引导步骤、配渠道、
-- 绑微信、付费墙曝光、结账这些没有页面变化的节点只能靠显式事件。
-- 字段口径与 page_views 一致：不保存 IP/UA，visitor_hash 按天加盐，
-- 同一 event_id 重复投递只算一次。
CREATE TABLE IF NOT EXISTS funnel_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  name TEXT NOT NULL,
  props TEXT NOT NULL DEFAULT '{}',
  path TEXT NOT NULL DEFAULT '',
  visitor_hash TEXT NOT NULL,
  session_id TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT 'desktop',
  created_at INTEGER NOT NULL,
  event_id TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_funnel_events_event ON funnel_events(event_id);
CREATE INDEX IF NOT EXISTS idx_funnel_events_day ON funnel_events(day, name);
CREATE INDEX IF NOT EXISTS idx_funnel_events_visitor ON funnel_events(day, visitor_hash);
