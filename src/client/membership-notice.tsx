import { Link } from "react-router-dom";
import { useApp } from "./context";
import { membershipExpiry } from "./membership";
import { PLUGIN_LIMITS } from "../shared/plugin-access";
import { WECHAT_LINK_LIMITS } from "../shared/wechat-links";
import { dashboardCopy, formatCopy } from "../shared/i18n/dashboard";
import { useLocale } from "./locale";
import "./membership-notice.css";

export function MembershipNotice() {
  const { data, base } = useApp();
  const { locale } = useLocale();
  const { dashboard, membership: copy } = dashboardCopy[locale];
  if (!data?.planUntil) return null;
  const remaining = data.planUntil - Date.now();
  const expired = data.plan === "free" && remaining <= 0;
  if (!expired && (data.plan !== "plus" || remaining > 7 * 86400000 || remaining <= 0)) return null;
  const pausedPlugins = Math.max(0, (data.plugins?.length ?? 0) - PLUGIN_LIMITS.free);
  const pausedLinks = Math.max(0, data.connections.length - WECHAT_LINK_LIMITS.free);
  const limits = (plugins: number, links: number) => ({
    plugins: formatCopy(plugins === 1 ? copy.pluginOne : copy.plugins, { count: plugins }),
    links: formatCopy(links === 1 ? copy.linkOne : copy.links, { count: links }),
  });
  const details = [
    formatCopy(copy.expiry, { date: membershipExpiry(data.planUntil, true, locale) }),
    expired
      ? formatCopy(copy.freeLimits, limits(PLUGIN_LIMITS.free, WECHAT_LINK_LIMITS.free))
      : copy.willPause,
  ];
  if (expired && (pausedPlugins > 0 || pausedLinks > 0)) {
    details.push(formatCopy(copy.paused, limits(pausedPlugins, pausedLinks)));
  }
  details.push(copy.renewNote);
  return (
    <section className="membership-notice" role="status" aria-label={copy.label}>
      <div>
        <strong>{expired ? dashboard.expired : copy.expiring}</strong>
        <p>{details.join(locale === "zh-CN" || locale === "ja" ? "" : " ")}</p>
      </div>
      <div className="membership-notice-actions">
        <Link className="button small" to={`${base}/billing`}>
          {copy.viewPlan}
        </Link>
        {expired && pausedPlugins > 0 && <Link to={`${base}/plugins`}>{copy.managePlugins}</Link>}
        {expired && pausedLinks > 0 && <Link to={`${base}/wechat`}>{copy.viewPaused}</Link>}
      </div>
    </section>
  );
}
