-- 第一方访问统计。只保存聚合所需的字段：不保存原始 IP、User-Agent 或完整网址。
-- visitor_hash 是「IP + UA + 当天 + 盐」的哈希，按天变化，因此只能算出当日去重，
-- 无法跨天追踪同一个人。session_id 由浏览器存在 sessionStorage 里，关闭标签页即失效。
-- referrer_host 与 utm_* 是「这次会话从哪里来」，由浏览器在会话开始时记一次并沿用到
-- 会话结束，这样「某个来源带来的人均浏览页数」才有意义，而不是每页都重新归因。
CREATE TABLE IF NOT EXISTS page_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  referrer_host TEXT NOT NULL DEFAULT '',
  utm_source TEXT NOT NULL DEFAULT '',
  utm_medium TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  visitor_hash TEXT NOT NULL,
  session_id TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT 'desktop',
  created_at INTEGER NOT NULL,
  event_id TEXT NOT NULL
);

-- 同一条上报重复投递（重试、bfcache 恢复）只算一次浏览。
CREATE UNIQUE INDEX IF NOT EXISTS idx_page_views_event ON page_views(event_id);
CREATE INDEX IF NOT EXISTS idx_page_views_day ON page_views(day);
CREATE INDEX IF NOT EXISTS idx_page_views_path ON page_views(day, path);
CREATE INDEX IF NOT EXISTS idx_page_views_visitor ON page_views(day, visitor_hash);
CREATE INDEX IF NOT EXISTS idx_page_views_session ON page_views(day, session_id);
-- 不建单独的 created_at 索引：没有任何查询只按时间过滤，「某会话最早一条浏览」
-- 走 0015 的 (session_id, created_at)，而每个页面浏览都要写一次插入，少一个索引就少一次维护。
