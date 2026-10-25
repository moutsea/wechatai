/** Worker 与 Node 报表共用；日期只接受内部生成的 ISO 日，不能插入任意 SQL。 */
export function signupConversionQueries(from: string, to: string) {
  if (![from, to].every((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)))
    throw new Error("Invalid analytics date range");
  const range = `day BETWEEN '${from}' AND '${to}'`;
  // 同一窗口内每个会话仅取第一条注册快照，汇总和明细使用同一去重集合。
  const signups = `WITH ranked_signups AS (
    SELECT session_id, landing_path,
      ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at, id) AS rn
    FROM signup_attributions WHERE ${range} AND session_id <> ''
  ), signups AS (
    SELECT session_id, landing_path FROM ranked_signups WHERE rn = 1
  )`;
  const activeSessions = `${signups}, active_sessions AS (
    SELECT DISTINCT session_id FROM page_views WHERE ${range} AND session_id <> ''
    UNION SELECT session_id FROM signups
  )`;
  return {
    totals: `${activeSessions}
      SELECT COUNT(DISTINCT session_id) AS total,
        COUNT(DISTINCT CASE WHEN landing_path <> '' THEN session_id END) AS attributed,
        (SELECT COUNT(*) FROM active_sessions) AS sessions
      FROM signups`,
    // 分母是区间内有浏览或注册的会话。首访从完整保留期取，不能被查询窗口截断；
    // 已注册会话优先采用落地页快照，即使浏览明细过期也能归因。空快照保持未归因。
    funnel: `${activeSessions}, landings AS (
      SELECT a.session_id,
        COALESCE(s.landing_path, (
          SELECT path FROM page_views v WHERE v.session_id = a.session_id
          ORDER BY created_at, id LIMIT 1
        )) AS path,
        s.session_id AS converted_session
      FROM active_sessions a LEFT JOIN signups s ON s.session_id = a.session_id
    )
    SELECT path AS label, COUNT(DISTINCT session_id) AS sessions,
      COUNT(DISTINCT converted_session) AS signups
    FROM landings WHERE path <> ''
    GROUP BY path ORDER BY signups DESC, sessions DESC, path LIMIT 15`,
  };
}
