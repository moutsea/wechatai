import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, Loader2, Minus } from "lucide-react";
import { ApiError, api, json } from "../api";
import { useAuth } from "../auth";
import { trackFunnel } from "../analytics-client";
import {
  BILLING_OFFERS,
  BILLING_PRICE_CHECKED_AT,
  FREE_PLAN_AMOUNT_CENTS,
} from "../../shared/billing-offers";
import { approxYuan } from "../../shared/pricing-copy";
import { DAILY_CREDIT_DEFAULTS } from "../../shared/credits";
import { pricingCopy } from "../../shared/i18n/en/copy/pricing";
import { PLUGIN_LIMITS } from "../../shared/plugin-access";
import { WECHAT_LINK_LIMITS } from "../../shared/wechat-links";
import { useLocale } from "../locale";
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

const plansCopyZh = {
  title: "免费版与 Plus 对比",
  free: {
    name: "免费版",
    badge: "轻松体验",
    description: "从日常问答开始",
    unit: "永久免费",
    note: "无需购买会员，即可开始使用",
    workspace: "进入工作台",
    start: "免费开始",
  },
  badgeFlexible: "灵活选择",
  badgeSave: (saving: string) => `省 ${saving}`,
  descriptionAnnual: "长期使用，年付更划算",
  descriptionMonthly: "更多额度，解锁小薇 AI",
  unitYear: "/ 年",
  unitMonth: "/ 月",
  noteAnnual: (monthlyPrice: string, saving: string) =>
    `折合 ${monthlyPrice} / 月，比按月买省 ${saving}`,
  noteMonthly: "按月购买，按需续费",
  ctaBusy: "正在跳转支付…",
  ctaSubscribe: (name: string, price: string) => `开通${name} · ${price}`,
  ctaChoose: (name: string) => `选择${name}`,
  features,
  highlights: ["每天 credits", "微信连接", "插件配置"],
  supported: "支持",
  unsupported: "不支持",
  comparisonCaption: "权益对比 · Plus 月付与年付权益相同",
  comparisonHeaders: ["功能与额度", "免费版", "Plus"],
  common: "所有方案均支持模型聊天、AI 生图、角色扮演与免费服务通知推送。",
  fineprint: "Plus 单次购买，不自动续费；月付与年付权益相同。每日赠额当天有效、不累积。",
  checked: "价格核查于",
};

function PlanValue({ value }: { value: string | number | boolean }) {
  const { locale } = useLocale();
  const copy = locale === "en" ? pricingCopy.plans : plansCopyZh;
  return typeof value === "boolean" ? (
    <strong className={value ? "plan-supported" : "plan-unavailable"}>
      {value ? <Check size={16} aria-hidden="true" /> : <Minus size={16} aria-hidden="true" />}
      {value ? copy.supported : copy.unsupported}
    </strong>
  ) : (
    <strong className={typeof value === "number" ? "plan-credit-value" : undefined}>{value}</strong>
  );
}

function PlanHighlights({ plus }: { plus: boolean }) {
  const { locale } = useLocale();
  const { features: rows, highlights: labels } = locale === "en" ? pricingCopy.plans : plansCopyZh;
  return (
    <dl className="plan-highlights">
      {labels.map((label, index) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{rows[index][plus ? "plus" : "free"]}</dd>
        </div>
      ))}
    </dl>
  );
}

function PlanFeatures({ plus }: { plus: boolean }) {
  const { locale } = useLocale();
  const { features: rows } = locale === "en" ? pricingCopy.plans : plansCopyZh;
  return (
    <ul className="plan-features">
      {rows.map((feature) => {
        const value = feature[plus ? "plus" : "free"];
        return (
          <li key={feature.label}>
            <span>
              {feature.href ? <Link to={feature.href}>{feature.label}</Link> : feature.label}
            </span>
            <PlanValue value={value} />
          </li>
        );
      })}
    </ul>
  );
}

export function PricingPlans() {
  const { data: session, isPending, requireSignIn } = useAuth();
  const { locale } = useLocale();
  const english = locale === "en";
  const copy = english ? pricingCopy.plans : plansCopyZh;
  const [params] = useSearchParams();
  const requestedInterval = params.get("interval");
  const [busyOffer, setBusyOffer] = useState<string | null>(null);
  const [error, setError] = useState<{
    offerId: string;
    message: string;
    loginRequired: boolean;
  } | null>(null);

  async function startCheckout(offer: typeof monthly | typeof yearly) {
    setError(null);
    setBusyOffer(offer.id);
    trackFunnel("checkout_start", { offer: offer.id, from: "pricing" });
    try {
      const result = await api<{ url: string }>("/billing/checkout", json({ offerId: offer.id }));
      window.location.assign(result.url);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      const loginRequired = english && code === "unauthorized";
      if (loginRequired) requireSignIn();
      setError({
        offerId: offer.id,
        message: english
          ? code && Object.hasOwn(pricingCopy.plans.checkoutErrors, code)
            ? pricingCopy.plans.checkoutErrors[code as keyof typeof pricingCopy.plans.checkoutErrors]
            : pricingCopy.plans.checkoutFailed
          : (e as Error).message,
        loginRequired,
      });
    } finally {
      setBusyOffer(null);
    }
  }

  return (
    <section className="plans" aria-labelledby="plans-title">
      <div className="plans-head">
        <h2 id="plans-title" className="visually-hidden">
          {copy.title}
        </h2>
      </div>
      <div className="plans-grid">
        <article className="plan plan-free">
          <header>
            <div className="plan-top">
              <h3>{copy.free.name}</h3>
              <span className="plan-badge">{copy.free.badge}</span>
            </div>
            <p className="plan-description">{copy.free.description}</p>
            <p className="plan-price">
              <strong>{yuan(FREE_PLAN_AMOUNT_CENTS)}</strong>
              <span className="plan-price-unit">{copy.free.unit}</span>
            </p>
            <p className="plan-note">{copy.free.note}</p>
          </header>
          {isPending ? null : session ? (
            <Link className="button secondary plan-cta" to="/app">
              {copy.free.workspace}
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          ) : (
            <Link className="button secondary plan-cta" to="/register">
              {copy.free.start}
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          )}
          <PlanHighlights plus={false} />
          <PlanFeatures plus={false} />
        </article>

        {[monthly, yearly].map((offer) => {
          const annual = offer.interval === "year";
          const name = english ? pricingCopy.plans.offerName(annual ? "year" : "month") : offer.name;
          const planError = error?.offerId === offer.id ? error : null;
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
                  <h3 id={`plan-${offer.interval}-title`}>{name}</h3>
                  <span className="plan-badge">
                    {annual ? copy.badgeSave(yuan(yearlySaving * 100)) : copy.badgeFlexible}
                  </span>
                </div>
                <p className="plan-description">
                  {annual ? copy.descriptionAnnual : copy.descriptionMonthly}
                </p>
                <p className="plan-price">
                  <strong>{yuan(offer.amount)}</strong>
                  <span className="plan-price-unit">
                    {annual ? copy.unitYear : copy.unitMonth}
                  </span>
                </p>
                <p className="plan-note">
                  {annual
                    ? copy.noteAnnual(approx(yearly.amount / 12), yuan(yearlySaving * 100))
                    : copy.noteMonthly}
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
                      {copy.ctaBusy}
                    </>
                  ) : (
                    <>
                      {copy.ctaSubscribe(name, yuan(offer.amount))}
                      <ArrowRight size={17} aria-hidden="true" />
                    </>
                  )}
                </button>
              ) : (
                <Link
                  className="button plan-cta"
                  to={`${planError?.loginRequired ? "/login" : "/register"}?returnTo=${encodeURIComponent(
                    `${english ? "/en/pricing" : "/pricing"}?interval=${offer.interval}#plan-${offer.interval}`,
                  )}`}
                >
                  {planError?.loginRequired ? pricingCopy.plans.loginAgain : copy.ctaChoose(name)}
                  <ArrowRight size={17} aria-hidden="true" />
                </Link>
              )}
              {planError && (
                <p className="plan-error" role="alert">
                  {planError.message}
                </p>
              )}
              <PlanHighlights plus />
              <PlanFeatures plus />
            </article>
          );
        })}
      </div>
      <div className="plans-comparison">
        <table>
          <caption>{copy.comparisonCaption}</caption>
          <thead>
            <tr>
              {copy.comparisonHeaders.map((label) => (
                <th key={label} scope="col">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {copy.features.map((feature) => (
              <tr key={feature.label}>
                <th scope="row">
                  {feature.href ? <Link to={feature.href}>{feature.label}</Link> : feature.label}
                </th>
                <td>
                  <PlanValue value={feature.free} />
                </td>
                <td>
                  <PlanValue value={feature.plus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="plans-common">{copy.common}</p>
      <p className="plans-fineprint">{copy.fineprint}</p>
      <p className="plans-checked">
        {copy.checked}{" "}
        <time dateTime={BILLING_PRICE_CHECKED_AT}>{BILLING_PRICE_CHECKED_AT}</time>
      </p>
    </section>
  );
}
