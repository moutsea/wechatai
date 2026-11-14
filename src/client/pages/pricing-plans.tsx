import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, Loader2, Minus } from "lucide-react";
import { api, json } from "../api";
import { useAuth } from "../auth";
import { trackFunnel } from "../analytics-client";
import { BILLING_OFFERS } from "../../shared/billing-offers";
import { approxYuan } from "../../shared/pricing-copy";
import { DAILY_CREDIT_DEFAULTS } from "../../shared/credits";
import { PLUGIN_LIMITS } from "../../shared/plugin-access";
import { WECHAT_LINK_LIMITS } from "../../shared/wechat-links";
import "./pricing-plans.css";

const monthly = BILLING_OFFERS.find((offer) => offer.id === "plus_monthly")!;
const yearly = BILLING_OFFERS.find((offer) => offer.id === "plus_yearly")!;
// 年付相对「按月买 12 次」省下的钱，跟着 BILLING_OFFERS 自动变，不手写。
const yearlySaving = (monthly.amount * 12 - yearly.amount) / 100;

const yuan = (amount: number) => `¥${Number((amount / 100).toFixed(2))}`;
/** 折合月价只留一位小数：和 /pricing 正文、账单页说同一个数（见 shared/pricing-copy）。 */
const approx = approxYuan;

const features = [
  { label: "每天赠送 credits", free: DAILY_CREDIT_DEFAULTS.free, plus: DAILY_CREDIT_DEFAULTS.plus },
  {
    label: "微信连接",
    free: `${WECHAT_LINK_LIMITS.free} 个`,
    plus: `${WECHAT_LINK_LIMITS.plus} 个`,
  },
  { label: "插件配置", free: `${PLUGIN_LIMITS.free} 个`, plus: "不限" },
  { label: "图片与文件输入", free: false, plus: true },
  { label: "网页查看聊天记录", free: false, plus: true },
  { label: "小薇 AI 云端助手", free: false, plus: true, href: "/docs/cloud-agent" },
];

function PlanFeatures({ plus }: { plus: boolean }) {
  return (
    <ul className="plan-features">
      {features.map((feature) => {
        const value = feature[plus ? "plus" : "free"];
        return (
          <li key={feature.label}>
            <span>
              {feature.href ? <Link to={feature.href}>{feature.label}</Link> : feature.label}
            </span>
            {typeof value === "boolean" ? (
              <strong className={value ? "plan-supported" : "plan-unavailable"}>
                {value ? (
                  <Check size={16} aria-hidden="true" />
                ) : (
                  <Minus size={16} aria-hidden="true" />
                )}
                {value ? "支持" : "不支持"}
              </strong>
            ) : (
              <strong className={typeof value === "number" ? "plan-credit-value" : undefined}>
                {value}
              </strong>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function PricingPlans() {
  const { data: session, isPending } = useAuth();
  const [params] = useSearchParams();
  const requestedInterval = params.get("interval");
  const [busyOffer, setBusyOffer] = useState<string | null>(null);
  const [error, setError] = useState<{ offerId: string; message: string } | null>(null);

  async function startCheckout(offer: typeof monthly | typeof yearly) {
    setError(null);
    setBusyOffer(offer.id);
    trackFunnel("checkout_start", { offer: offer.id, from: "pricing" });
    try {
      const result = await api<{ url: string }>("/billing/checkout", json({ offerId: offer.id }));
      window.location.assign(result.url);
    } catch (e) {
      setError({ offerId: offer.id, message: (e as Error).message });
    } finally {
      setBusyOffer(null);
    }
  }

  return (
    <section className="plans" aria-labelledby="plans-title">
      <div className="plans-head">
        <h2 id="plans-title" className="visually-hidden">
          免费版与 Plus 对比
        </h2>
      </div>
      <div className="plans-grid">
        <article className="plan plan-free">
          <header>
            <div className="plan-top">
              <h3>免费版</h3>
              <span className="plan-badge">轻松体验</span>
            </div>
            <p className="plan-description">从日常问答开始</p>
            <p className="plan-price">
              <strong>¥0</strong>
              <span className="plan-price-unit">永久免费</span>
            </p>
            <p className="plan-note">无需购买会员，即可开始使用</p>
          </header>
          {isPending ? null : session ? (
            <Link className="button secondary plan-cta" to="/app">
              进入工作台
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          ) : (
            <Link className="button secondary plan-cta" to="/register">
              免费开始
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          )}
          <PlanFeatures plus={false} />
        </article>

        {[monthly, yearly].map((offer) => {
          const annual = offer.interval === "year";
          return (
            <article
              id={`plan-${offer.interval}`}
              className={`plan plan-plus plan-${offer.interval}`}
              key={offer.id}
              aria-labelledby={`plan-${offer.interval}-title`}
              aria-current={requestedInterval === offer.interval ? "true" : undefined}
            >
              <header>
                <div className="plan-top">
                  <h3 id={`plan-${offer.interval}-title`}>{offer.name}</h3>
                  <span className="plan-badge">
                    {annual ? `省 ${yuan(yearlySaving * 100)}` : "灵活选择"}
                  </span>
                </div>
                <p className="plan-description">
                  {annual ? "长期使用，年付更划算" : "更多额度，解锁小薇 AI"}
                </p>
                <p className="plan-price">
                  <strong>{yuan(offer.amount)}</strong>
                  <span className="plan-price-unit">{annual ? "/ 年" : "/ 月"}</span>
                </p>
                <p className="plan-note">
                  {annual
                    ? `折合 ${approx(yearly.amount / 12)} / 月，比按月买省 ${yuan(yearlySaving * 100)}`
                    : "按月购买，按需续费"}
                </p>
              </header>
              {isPending ? null : session ? (
                <button
                  type="button"
                  className="button plan-cta"
                  disabled={busyOffer !== null}
                  onClick={() => startCheckout(offer)}
                >
                  {busyOffer === offer.id ? (
                    <>
                      <Loader2 size={17} className="spin" aria-hidden="true" />
                      正在跳转支付…
                    </>
                  ) : (
                    <>
                      开通{offer.name} · {yuan(offer.amount)}
                      <ArrowRight size={17} aria-hidden="true" />
                    </>
                  )}
                </button>
              ) : (
                <Link
                  className="button plan-cta"
                  to={`/register?returnTo=${encodeURIComponent(`/pricing?interval=${offer.interval}#plan-${offer.interval}`)}`}
                >
                  选择{offer.name}
                  <ArrowRight size={17} aria-hidden="true" />
                </Link>
              )}
              {error?.offerId === offer.id && (
                <p className="plan-error" role="alert">
                  {error.message}
                </p>
              )}
              <PlanFeatures plus />
            </article>
          );
        })}
      </div>
      <p className="plans-common">所有方案均支持模型聊天、AI 生图、角色扮演与免费服务通知推送。</p>
      <p className="plans-fineprint">
        Plus 单次购买，不自动续费；月付与年付权益相同。每日赠额当天有效、不累积。
      </p>
    </section>
  );
}
