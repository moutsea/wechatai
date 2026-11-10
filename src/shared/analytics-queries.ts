/**
 * 来源归类：有 UTM 用 `utm:<值>`，其次 referrer 主机名，都没有记空串。
 * Worker 的流量汇总、来源×落地页报表与 CLI 共用这一份，避免三处口径分叉。
 * 空串在流量汇总里展示为「直接访问」，在来源×落地页里展示为「未识别来源」：
 * 没有外部来源可能是真正的直接访问，也可能是来源被应用剥掉了，不能当成同一种事实。
 */
export const SOURCE_EXPR = `CASE
  WHEN utm_source <> '' THEN 'utm:' || utm_source
  WHEN referrer_host <> '' THEN referrer_host
  ELSE '' END`;

/** Worker 与 Node 报表共用；日期只接受内部生成的 ISO 日，不能插入任意 SQL。 */
export function signupConversionQueries(from: string, to: string) {
  if (![from, to].every((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)))
    throw new Error("Invalid analytics date range");
  const range = `day BETWEEN '${from}' AND '${to}'`;
  // 同一窗口内每个会话仅取第一条注册快照，汇总和明细使用同一去重集合。
  // 快照里连同 referrer/utm 一起保存，来源×落地页才能和落地页用同一条归因记录。
  const signups = `WITH ranked_signups AS (
    SELECT session_id, landing_path, referrer_host, utm_source,
      ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at, id) AS rn
    FROM signup_attributions WHERE ${range} AND session_id <> ''
  ), signups AS (
    SELECT session_id, landing_path, referrer_host, utm_source
    FROM ranked_signups WHERE rn = 1
  )`;
  const activeSessions = `${signups}, active_sessions AS (
    SELECT DISTINCT session_id FROM page_views WHERE ${range} AND session_id <> ''
    UNION SELECT session_id FROM signups
  )`;
  // 分母是区间内有浏览或注册的会话。首访从完整保留期取，不能被查询窗口截断；
  // 已注册会话优先采用落地页与来源快照，即使浏览明细过期也能归因。
  // 快照为空时存的是空串而不是 NULL，COALESCE 不会回填，避免从更晚的浏览猜来源。
  // 对未注册会话用 (session_id, created_at) 索引定位首条 id，再读取同一行的归因字段。
  // LIMIT 1 避免扫描每个活跃会话在完整保留期内的全部浏览；注册快照不回查。
  const landings = `${activeSessions}, first_views AS (
    SELECT a.session_id, v.path, v.referrer_host, v.utm_source
    FROM active_sessions a
    JOIN page_views v ON v.id = (
      SELECT id FROM page_views WHERE session_id = a.session_id
      ORDER BY created_at, id LIMIT 1
    )
    WHERE NOT EXISTS (SELECT 1 FROM signups s WHERE s.session_id = a.session_id)
  ), landings AS (
    SELECT a.session_id,
      COALESCE(s.landing_path, f.path) AS path,
      COALESCE(s.referrer_host, f.referrer_host) AS referrer_host,
      COALESCE(s.utm_source, f.utm_source) AS utm_source,
      s.session_id AS converted_session
    FROM active_sessions a
    LEFT JOIN signups s ON s.session_id = a.session_id
    LEFT JOIN first_views f ON f.session_id = a.session_id
  )`;
  return {
    totals: `${activeSessions}
      SELECT COUNT(DISTINCT session_id) AS total,
        COUNT(DISTINCT CASE WHEN landing_path <> '' THEN session_id END) AS attributed,
        (SELECT COUNT(*) FROM active_sessions) AS sessions
      FROM signups`,
    funnel: `${landings}
      SELECT path AS label, COUNT(DISTINCT session_id) AS sessions,
        COUNT(DISTINCT converted_session) AS signups
      FROM landings WHERE path <> ''
      GROUP BY path ORDER BY signups DESC, sessions DESC, path LIMIT 15`,
    // 来源 × 落地页：一个会话只有一条 (source, path)，两个维度来自同一次首访归因。
    // 空来源保持空串交给展示层标成「未识别来源」，不在这里伪造成「直接访问」。
    // GROUP BY 写完整表达式而不是别名，避免不同 SQLite 版本对别名解析的差异。
    sourceFunnel: `${landings}
      SELECT ${SOURCE_EXPR} AS source, path,
        COUNT(DISTINCT session_id) AS sessions,
        COUNT(DISTINCT converted_session) AS signups
      FROM landings WHERE path <> ''
      GROUP BY ${SOURCE_EXPR}, path
      ORDER BY signups DESC, sessions DESC, source, path LIMIT 15`,
  };
}
