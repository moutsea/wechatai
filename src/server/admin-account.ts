import type { AdminAccountStats, AdminUsage } from "../shared/admin";
import { dayWindow } from "./wallet";
import { wechatLinkKey, WECHAT_LINK_LIMITS } from "../shared/wechat-links";

// Internal RPC only. Return aggregates, never messages, record titles, API keys or plugin config.
// Reading statistics must not grant daily credits, schedule alarms, or change chat state.
export function readAdminAccountStats(sql: SqlStorage, now = Date.now()): AdminAccountStats {
  const setting = <T>(key: string, fallback: T): T => {
    const row = sql
      .exec<{ value: string }>("SELECT value FROM settings WHERE key=?", key)
      .toArray()[0];
    return row ? (JSON.parse(row.value) as T) : fallback;
  };
  const planUntil = setting("planUntil", 0);
  const links = sql
    .exec<{ id: string }>("SELECT id FROM wechat_links ORDER BY createdAt,rowid")
    .toArray();
  if (
    !links.some((l) => l.id === "default") &&
    setting("connection", null) &&
    !setting("legacyLinkDeleted", false)
  )
    links.unshift({ id: "default" });
  const connected = links
    .slice(0, WECHAT_LINK_LIMITS[planUntil > now ? "plus" : "free"])
    .filter(
      (l) =>
        setting(wechatLinkKey(l.id, "connection"), { status: "disconnected" }).status ===
        "connected",
    ).length;
  const totals = sql
    .exec<AdminUsage & { lastActiveAt: number | null }>(
      "SELECT COUNT(*) requests, COALESCE(SUM(tokens),0) tokens, COALESCE(SUM(units),0)/1000.0 credits, MAX(createdAt) lastActiveAt FROM usage",
    )
    .one();
  const counts = sql
    .exec<{
      channels: number;
      models: number;
      plugins: number;
      sessions: number;
      purchasedCredits: number;
      debt: number;
    }>(
      `
    SELECT (SELECT COUNT(*) FROM channels) channels, (SELECT COUNT(*) FROM assistants) models,
      (SELECT COUNT(*) FROM plugins) plugins, (SELECT COUNT(*) FROM sessions) sessions,
      (SELECT COALESCE(SUM(remaining),0)/1000.0 FROM credit_buckets WHERE kind='purchase' AND expires>?) purchasedCredits,
      (SELECT amount/1000.0 FROM credit_debt WHERE id=1) debt`,
      now,
    )
    .one();
  const start = dayWindow(now).start - 29 * 86400000;
  const daily = sql
    .exec<AdminUsage & { day: string }>(
      `
    SELECT strftime('%Y-%m-%d',createdAt/1000,'unixepoch','+8 hours') day,
      COUNT(*) requests, SUM(tokens) tokens, SUM(units)/1000.0 credits
    FROM usage WHERE createdAt>=? AND createdAt<=? GROUP BY day ORDER BY day`,
      start,
      now,
    )
    .toArray();
  const pluginUsage = sql
    .exec<AdminUsage & { pluginId: string; day: string }>(
      `
    SELECT COALESCE(m.pluginId,json_extract(p.data,'$.pluginId'),'legacy') pluginId,
      strftime('%Y-%m-%d',u.createdAt/1000,'unixepoch','+8 hours') day,
      COUNT(*) requests, SUM(u.tokens) tokens, SUM(u.units)/1000.0 credits
    FROM usage u LEFT JOIN platform_metering m ON m.id=u.id
    LEFT JOIN claw_events e ON e.id=substr(u.id,6) AND u.id LIKE 'claw:%'
    LEFT JOIN plugins p ON p.id=e.pluginId
    WHERE u.createdAt>=? AND u.createdAt<=? GROUP BY 1,2 ORDER BY requests DESC`,
      start,
      now,
    )
    .toArray();
  return {
    ...totals,
    ...counts,
    sampledAt: now,
    planUntil,
    links: links.length,
    connected,
    daily,
    pluginUsage,
  };
}
