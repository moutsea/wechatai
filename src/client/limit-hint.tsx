import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { BILLING_OFFERS } from "../shared/billing-offers";
import { DAILY_CREDIT_DEFAULTS } from "../shared/credits";
import { PLUGIN_LIMITS } from "../shared/plugin-access";
import { WECHAT_LINK_LIMITS } from "../shared/wechat-links";

const plusMonthly = BILLING_OFFERS.find((offer) => offer.id === "plus_monthly");
const plusYuan = plusMonthly ? plusMonthly.amount / 100 : 9.9;
const pluginText = PLUGIN_LIMITS.plus === null ? "插件不限" : `${PLUGIN_LIMITS.plus} 个插件`;

const LIMIT_LABELS: Record<string, string> = {
  channel_limit: "渠道数量",
  plugin_limit: "插件数量",
  wechat_link_limit: "微信链接数量",
};

/**
 * 套餐限额的升级出口。
 *
 * 限额是 Free 用户最容易撞墙的地方，而撞墙那一刻原来的界面只有一行红字，既没告诉他
 * Plus 能拿到什么，也没有任何可点的去处。这里把「差多少」和「去哪升级」放在同一块里，
 * 文案全部从 billing / credits / limits 常量推导，避免价格或额度改了两处不一致。
 */
export function LimitHint({ code }: { code?: string }) {
  const label = code ? LIMIT_LABELS[code] : undefined;
  // 只认自己认识的三类限额；其它错误码交给调用方原本的错误提示，避免误报「已达上限」。
  if (!label) return null;
  return (
    <div className="limit-hint">
      <p>
        <strong>{label}已达当前方案上限。</strong>Plus ¥{plusYuan} / 月起：每天{" "}
        {DAILY_CREDIT_DEFAULTS.plus} credits、{pluginText}、可绑定{" "}
        {WECHAT_LINK_LIMITS.plus} 个微信链接。
      </p>
      <div className="limit-hint-actions">
        <Link className="button small" to="/pricing">
          看看 Plus 的额度
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
        <Link className="text-link" to="/app/billing">
          先单独买 credits
        </Link>
      </div>
    </div>
  );
}
