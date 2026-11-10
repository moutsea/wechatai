import { Link } from "react-router-dom";
import { useApp } from "./context";
import { membershipExpiry } from "./membership";
import { PLUGIN_LIMITS } from "../shared/plugin-access";
import { WECHAT_LINK_LIMITS } from "../shared/wechat-links";
import "./membership-notice.css";

export function MembershipNotice() {
  const { data, base } = useApp();
  if (!data?.planUntil) return null;
  const remaining = data.planUntil - Date.now();
  const expired = data.plan === "free" && remaining <= 0;
  if (!expired && (data.plan !== "plus" || remaining > 3 * 86400000 || remaining <= 0)) return null;
  const pausedPlugins = Math.max(0, (data.plugins?.length ?? 0) - PLUGIN_LIMITS.free);
  const pausedLinks = Math.max(0, data.connections.length - WECHAT_LINK_LIMITS.free);
  return (
    <section className="membership-notice" role="status" aria-label="会员到期提醒">
      <div>
        <strong>{expired ? "Plus 会员已到期" : "Plus 会员即将到期"}</strong>
        <p>
          到期时间：{membershipExpiry(data.planUntil, true)}（北京时间）。
          {expired
            ? `当前已恢复为 Free，可使用 ${PLUGIN_LIMITS.free} 个插件和 ${WECHAT_LINK_LIMITS.free} 条微信链接。`
            : "到期后恢复为 Free，超出名额的插件和微信链接将暂停。"}
          {expired &&
            (pausedPlugins > 0 || pausedLinks > 0) &&
            `当前有 ${pausedPlugins} 个插件、${pausedLinks} 条微信链接因名额限制暂停。`}
          配置与绑定会保留；续费后恢复可用范围。
        </p>
      </div>
      <div className="membership-notice-actions">
        <Link className="button small" to={`${base}/billing`}>
          查看会员 / 续费
        </Link>
        {expired && pausedPlugins > 0 && <Link to={`${base}/plugins`}>管理插件名额</Link>}
        {expired && pausedLinks > 0 && <Link to={`${base}/wechat`}>查看暂停的微信链接</Link>}
      </div>
    </section>
  );
}
