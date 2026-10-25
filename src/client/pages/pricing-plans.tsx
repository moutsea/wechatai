import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { api, json } from "../api";
import { useAuth } from "../auth";
import { trackFunnel } from "../analytics-client";
import { BILLING_OFFERS } from "../../shared/billing-offers";
import { DAILY_CREDIT_DEFAULTS } from "../../shared/credits";
import { PLUGIN_LIMITS } from "../../shared/plugin-access";
import { WECHAT_LINK_LIMITS } from "../../shared/wechat-links";
import "./pricing-plans.css";

const monthly = BILLING_OFFERS.find((offer) => offer.id === "plus_monthly")!;
const yearly = BILLING_OFFERS.find((offer) => offer.id === "plus_yearly")!;
// 年付相对「按月买 12 次」省下的钱，跟着 BILLING_OFFERS 自动变，不手写。
const yearlySaving = (monthly.amount * 12 - yearly.amount) / 100;

const yuan = (amount: number) => `¥${Number((amount / 100).toFixed(2))}`;

/**
 * /pricing 的价格卡。
 *
 * 这页原先只有一张 760px 宽的对比表和一篇长文，**表内表后都没有购买按钮**，
 * 想付钱的人只能自己绕到工作台里找。这里把两个档位摆出来，Plus 直接走
 * 与 /app/billing 相同的 POST /billing/checkout。
 */
export function PricingPlans() {
  const { data: session, isPending } = useAuth();
  const [interval, setInterval] = useState<"month" | "year">("year");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const offer = interval === "year" ? yearly : monthly;
  // 主价格永远是「这一档真实要付的钱」，月均价只作为副标注，避免 ¥7.33 看起来像月付价。
  const headline = interval === "year" ? yearly.amount : monthly.amount;
  const perMonth = yearly.amount / 12 / 100;

  async function startCheckout() {
    setError("");
    setBusy(true);
    trackFunnel("checkout_start", { offer: offer.id, from: "pricing" });
    try {
      const result = await api<{ url: string }>("/billing/checkout", json({ offerId: offer.id }));
      window.location.assign(result.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="plans" aria-labelledby="plans-title">
      <div className="plans-head">
        <h2 id="plans-title">两个档位，随时切换</h2>
        <p>模型调用费用由你的 API 服务商收取，本站只收消息中转的 credits。</p>
      </div>
      <div className="plans-grid">
        <article className="plan plan-free">
          <header>
            <h3>免费版</h3>
            <p className="plan-price">
              <strong>¥0</strong>
              <span>永久免费</span>
            </p>
          </header>
          <ul>
            <li>
              <Check size={15} aria-hidden="true" />每天 {DAILY_CREDIT_DEFAULTS.free} credits
            </li>
            <li>
              <Check size={15} aria-hidden="true" />
              {WECHAT_LINK_LIMITS.free} 个微信链接
            </li>
            <li>
              <Check size={15} aria-hidden="true" />
              {PLUGIN_LIMITS.free} 个插件
            </li>
            <li>
              <Check size={15} aria-hidden="true" />
              自带 API Key，模型费用付给服务商
            </li>
          </ul>
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
        </article>

        <article className="plan plan-plus">
          <header>
            <div className="plan-top">
              <h3>Plus</h3>
              <div className="plan-switch" role="group" aria-label="计费周期">
                <button
                  type="button"
                  aria-pressed={interval === "month"}
                  onClick={() => setInterval("month")}
                >
                  月付
                </button>
                <button
                  type="button"
                  aria-pressed={interval === "year"}
                  onClick={() => setInterval("year")}
                >
                  年付
                </button>
              </div>
            </div>
            <p className="plan-price">
              <strong>{yuan(headline)}</strong>
              <span className="plan-price-unit">{interval === "year" ? "/ 年" : "/ 月"}</span>
            </p>
            <p className="plan-note">
              {interval === "year"
                ? `折合 ${yuan(perMonth * 100)} / 月，比按月付省 ${yuan(yearlySaving * 100)}`
                : `年付 ${yuan(yearly.amount)}，折合 ${yuan(perMonth * 100)} / 月`}
            </p>
          </header>
          <ul>
            <li>
              <Check size={15} aria-hidden="true" />每天 {DAILY_CREDIT_DEFAULTS.plus} credits
            </li>
            <li>
              <Check size={15} aria-hidden="true" />
              {WECHAT_LINK_LIMITS.plus} 个微信链接
            </li>
            <li>
              <Check size={15} aria-hidden="true" />
              插件数量不限
            </li>
            <li>
              <Check size={15} aria-hidden="true" />
              图片、文件与语音附件
            </li>
          </ul>
          {isPending ? null : session ? (
            <button type="button" className="button plan-cta" disabled={busy} onClick={startCheckout}>
              {busy ? (
                <>
                  <Loader2 size={17} className="spin" aria-hidden="true" />
                  正在跳转支付…
                </>
              ) : (
                <>
                  开通 Plus · {interval === "year" ? yuan(yearly.amount) : yuan(monthly.amount)}
                  <ArrowRight size={17} aria-hidden="true" />
                </>
              )}
            </button>
          ) : (
            <Link className="button plan-cta" to="/register">
              免费开始，再升级
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          )}
          {error && (
            <p className="plan-error" role="alert">
              {error}
            </p>
          )}
        </article>
      </div>
      <p className="plans-fineprint">
        支付由 Stripe 处理。credits 用完后可以单独购买加油包，价格见下方说明。
      </p>
    </section>
  );
}
