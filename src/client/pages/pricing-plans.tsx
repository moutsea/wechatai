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

function PlanValue({ value }: { value: string | number | boolean }) {
  const { locale } = useLocale();
  const english = locale === "en";
  return typeof value === "boolean" ? (
    <strong className={value ? "plan-supported" : "plan-unavailable"}>
      {value ? <Check size={16} aria-hidden="true" /> : <Minus size={16} aria-hidden="true" />}
      {english
        ? value
          ? pricingCopy.plans.supported
          : pricingCopy.plans.unsupported
        : value
          ? "支持"
          : "不支持"}
    </strong>
  ) : (
    <strong className={typeof value === "number" ? "plan-credit-value" : undefined}>{value}</strong>
  );
}

function PlanHighlights({ plus }: { plus: boolean }) {
  const { locale } = useLocale();
  const english = locale === "en";
  const rows = english ? pricingCopy.plans.features : features;
  const labels = english
    ? pricingCopy.plans.highlights
    : (["每天 credits", "微信连接", "插件配置"] as const);
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
  const english = locale === "en";
  const rows = english ? pricingCopy.plans.features : features;
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
  const copy = pricingCopy.plans;
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
          ? code && Object.hasOwn(copy.checkoutErrors, code)
            ? copy.checkoutErrors[code as keyof typeof copy.checkoutErrors]
            : copy.checkoutFailed
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
          {english ? copy.title : "免费版与 Plus 对比"}
        </h2>
      </div>
      <div className="plans-grid">
        <article className="plan plan-free">
          <header>
            <div className="plan-top">
              <h3>{english ? copy.free.name : "免费版"}</h3>
              <span className="plan-badge">{english ? copy.free.badge : "轻松体验"}</span>
            </div>
            <p className="plan-description">
              {english ? copy.free.description : "从日常问答开始"}
            </p>
            <p className="plan-price">
              <strong>{yuan(FREE_PLAN_AMOUNT_CENTS)}</strong>
              <span className="plan-price-unit">
                {english ? copy.free.unit : "永久免费"}
              </span>
            </p>
            <p className="plan-note">{english ? copy.free.note : "无需购买会员，即可开始使用"}</p>
          </header>
          {isPending ? null : session ? (
            <Link className="button secondary plan-cta" to="/app">
              {english ? copy.free.workspace : "进入工作台"}
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          ) : (
            <Link className="button secondary plan-cta" to="/register">
              {english ? copy.free.start : "免费开始"}
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          )}
          <PlanHighlights plus={false} />
          <PlanFeatures plus={false} />
        </article>

        {[monthly, yearly].map((offer) => {
          const annual = offer.interval === "year";
          const name = english ? copy.offerName(annual ? "year" : "month") : offer.name;
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
                    {annual
                      ? english
                        ? copy.badgeSave(yuan(yearlySaving * 100))
                        : `省 ${yuan(yearlySaving * 100)}`
                      : english
                        ? copy.badgeFlexible
                        : "灵活选择"}
                  </span>
                </div>
                <p className="plan-description">
                  {annual
                    ? english
                      ? copy.descriptionAnnual
                      : "长期使用，年付更划算"
                    : english
                      ? copy.descriptionMonthly
                      : "更多额度，解锁小薇 AI"}
                </p>
                <p className="plan-price">
                  <strong>{yuan(offer.amount)}</strong>
                  <span className="plan-price-unit">
                    {annual
                      ? english
                        ? copy.unitYear
                        : "/ 年"
                      : english
                        ? copy.unitMonth
                        : "/ 月"}
                  </span>
                </p>
                <p className="plan-note">
                  {annual
                    ? english
                      ? copy.noteAnnual(
                          approx(yearly.amount / 12),
                          yuan(yearlySaving * 100),
                        )
                      : `折合 ${approx(yearly.amount / 12)} / 月，比按月买省 ${yuan(yearlySaving * 100)}`
                    : english
                      ? copy.noteMonthly
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
                      {english ? copy.ctaBusy : "正在跳转支付…"}
                    </>
                  ) : (
                    <>
                      {english
                        ? copy.ctaSubscribe(name, yuan(offer.amount))
                        : `开通${offer.name} · ${yuan(offer.amount)}`}
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
                  {planError?.loginRequired
                    ? copy.loginAgain
                    : english
                      ? copy.ctaChoose(name)
                      : `选择${offer.name}`}
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
          <caption>
            {english ? copy.comparisonCaption : "权益对比 · Plus 月付与年付权益相同"}
          </caption>
          <thead>
            <tr>
              <th scope="col">{english ? copy.comparisonHeaders[0] : "功能与额度"}</th>
              <th scope="col">{english ? copy.comparisonHeaders[1] : "免费版"}</th>
              <th scope="col">Plus</th>
            </tr>
          </thead>
          <tbody>
            {(english ? pricingCopy.plans.features : features).map((feature) => (
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
      <p className="plans-common">
        {english
          ? copy.common
          : "所有方案均支持模型聊天、AI 生图、角色扮演与免费服务通知推送。"}
      </p>
      <p className="plans-fineprint">
        {english
          ? copy.fineprint
          : "Plus 单次购买，不自动续费；月付与年付权益相同。每日赠额当天有效、不累积。"}
      </p>
      <p className="plans-checked">
        {english ? copy.checked : "价格核查于"}{" "}
        <time dateTime={BILLING_PRICE_CHECKED_AT}>{BILLING_PRICE_CHECKED_AT}</time>
      </p>
    </section>
  );
}
