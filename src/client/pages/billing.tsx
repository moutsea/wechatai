import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Coins,
  ReceiptText,
  Leaf,
  Sparkles,
  Gift,
} from "lucide-react";
import { useApp } from "../context";
import { browserAnalyticsHeaders, trackFunnel } from "../analytics-client";
import { PageHead, SectionTitle } from "../ui";
import { json } from "../api";
import { formatCredits } from "../../shared/types";
import {
  BILLING_OFFERS,
  type BillingCatalog,
  type BillingOffer,
  type BillingOfferId,
  type CheckoutStatus,
  type SubscriptionInfo,
} from "../../shared/billing";
import { approxYuan } from "../../shared/pricing-copy";

/** 年付省多少、折合月价多少，都从 BILLING_OFFERS 推导：写死的「省 ¥49」早就和 990/8800 不符了。 */
const plusMonthlyAmount = BILLING_OFFERS.find((offer) => offer.id === "plus_monthly")?.amount ?? 0;
const plusYearlyAmount = BILLING_OFFERS.find((offer) => offer.id === "plus_yearly")?.amount ?? 0;
const plusYearlySaving = (plusMonthlyAmount * 12 - plusYearlyAmount) / 100;
const plusYearlyPerMonth = approxYuan(plusYearlyAmount / 12);

export function Billing() {
  const { data, request, refresh, notify, base } = useApp();
  const [offers, setOffers] = useState<BillingOffer[]>(
    BILLING_OFFERS.map((o) => ({ ...o, price: o.amount / 100, currency: "cny", enabled: false })),
  );
  const [mode, setMode] = useState<"test" | "live">("test");
  const [subscription, setSubscription] = useState<SubscriptionInfo>(null);
  const [interval, setInterval] = useState<"month" | "year">("year");
  const [packId, setPackId] = useState<BillingOfferId>("credits_5000");
  const [params, setParams] = useSearchParams();
  const [paymentMessage, setPaymentMessage] = useState("");
  const [paymentState, setPaymentState] = useState<"pending" | "paid" | "retry" | "cancelled" | "">(
    "",
  );
  const [retry, setRetry] = useState(0);
  const sessionId = params.get("session_id");
  const checkoutResult = params.get("checkout");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    void Promise.all([
      request<BillingCatalog>("/billing/catalog").then((result) => {
        setOffers(result.offers);
        setMode(result.mode);
      }),
      request<SubscriptionInfo>("/billing/subscription").then(setSubscription),
    ]).catch((e) => notify(e.message, true));
  }, [request, notify]);
  useEffect(() => {
    if (checkoutResult === "cancelled") {
      setPaymentState("cancelled");
      setPaymentMessage("已返回工作台，你可以重新选择方案继续支付。");
      return;
    }
    if (checkoutResult !== "success" || !sessionId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    setPaymentState("pending");
    setPaymentMessage("正在确认支付结果，到账后会自动更新。");
    async function checkPayment() {
      try {
        const result = await request<CheckoutStatus>(
          `/billing/checkout-status?session_id=${encodeURIComponent(sessionId!)}`,
          { headers: browserAnalyticsHeaders() },
        );
        if (cancelled) return;
        if (result.status === "paid") {
          await refresh();
          const sub = await request<SubscriptionInfo>("/billing/subscription");
          if (cancelled) return;
          setSubscription(sub);
          setPaymentState("paid");
          setPaymentMessage(
            result.kind === "plus"
              ? "支付成功，Plus 会员有效期已更新。"
              : `${formatCredits(result.credits)} credits 已到账。`,
          );
        } else if (result.status === "pending" && ++attempts < 10)
          timer = setTimeout(() => void checkPayment(), 1500);
        else {
          setPaymentState("retry");
          setPaymentMessage(
            result.status === "pending"
              ? "暂未确认到账，请稍后重新查询。无需重复付款。"
              : "这笔订单未完成支付，你可以重新选择方案。",
          );
        }
      } catch (e) {
        if (!cancelled) {
          setPaymentState("retry");
          setPaymentMessage((e as Error).message);
        }
      }
    }
    void checkPayment();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [checkoutResult, sessionId, retry, request, refresh]);
  if (!data) return null;
  const plus = offers.find((o) => o.kind === "plus" && o.interval === interval);
  const hasRecurringSubscription =
    subscription &&
    !subscription.cancelAtPeriodEnd &&
    ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"].includes(
      subscription.status,
    );
  const topup = offers.find((o) => o.id === packId);
  const price = (offer?: BillingOffer) =>
    offer?.price !== null && offer?.price !== undefined
      ? new Intl.NumberFormat("zh-CN", { style: "currency", currency: offer.currency }).format(
          offer.price,
        )
      : "暂未开放";
  const buy = async (kind: BillingOfferId | "portal") => {
    setBusy(kind);
    if (kind !== "portal") trackFunnel("checkout_start", { offer: kind });
    try {
      const r = await request<{ url: string }>(
        kind === "portal" ? "/billing/portal" : "/billing/checkout",
        json(kind === "portal" ? {} : { offerId: kind }),
      );
      const url = new URL(r.url);
      if (
        url.protocol !== "https:" ||
        !["checkout.stripe.com", "billing.stripe.com"].includes(url.hostname)
      )
        throw new Error("支付链接无效");
      window.location.assign(r.url);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="page-enter billing-page">
      <PageHead
        eyebrow="A LITTLE MORE POSSIBILITY"
        title="会员与 credits"
        description="查看可用额度，选择适合你的会员方案。"
        action={
          <div className="billing-head-actions">
            <Link className="button secondary" to={`${base}/invite`}>
              <Gift size={16} />
              邀请得 credits
            </Link>
            <Link className="button secondary" to={`${base}/credits`}>
              <ReceiptText size={16} />
              额度明细
            </Link>
            {subscription && (
              <button
                className="button secondary"
                disabled={Boolean(busy)}
                onClick={() => void buy("portal")}
              >
                管理订阅
                <ArrowUpRight size={16} />
              </button>
            )}
          </div>
        }
      />
      {mode === "test" && offers.some((o) => o.enabled) && (
        <div className="billing-notice">测试模式 · 支付仅用于测试，不会产生真实扣款。</div>
      )}
      {paymentState && (
        <div className={`billing-notice ${paymentState === "paid" ? "success" : ""}`} role="status">
          <span>{paymentMessage}</span>
          {paymentState === "retry" && (
            <button className="text-link" onClick={() => setRetry((value) => value + 1)}>
              重新查询
            </button>
          )}
          {paymentState !== "pending" && (
            <button
              className="icon-button"
              aria-label="关闭支付提示"
              onClick={() => {
                setPaymentState("");
                setParams({}, { replace: true });
              }}
            >
              ×
            </button>
          )}
        </div>
      )}
      {subscription && (
        <p className="billing-subscription-note">
          原有{subscription.offerId === "plus_yearly" ? "年付订阅" : "月付订阅"} ·
          {subscription.status === "canceled"
            ? "订阅已结束"
            : subscription.cancelAtPeriodEnd
              ? "已取消自动续费"
              : ["past_due", "unpaid"].includes(subscription.status)
                ? "续费未完成，请管理订阅更新支付方式"
                : "自动续费中"}{" "}
          · 当前周期至 {new Date(subscription.periodEnd).toLocaleDateString("zh-CN")}
        </p>
      )}
      {data.plan === "plus" && (
        <p className="billing-subscription-note">
          Plus 有效期至{" "}
          {new Date(data.planUntil).toLocaleString("zh-CN", {
            timeZone: "Asia/Shanghai",
            hour12: false,
          })}
          （北京时间）。
          {hasRecurringSubscription
            ? "如需改为单次购买，请先在「管理订阅」中取消自动续费，剩余有效期会保留。"
            : "到期手动续费，提前购买会顺延有效期。"}
        </p>
      )}
      <div className="billing-summary">
        <div className="wallet-hero">
          <span>
            <Coins size={19} />
            我的 Credits
          </span>
          <strong>{formatCredits(data.wallet.balance)}</strong>
          <p>
            {data.wallet.debt > 0 ? "待抵扣欠额将从后续到账额度中扣除" : "可用于你配置的全部模型"}
          </p>
          <div>
            <span>
              今日消耗 <b>{formatCredits(data.wallet.spentToday)}</b>
            </span>
            <span className="tag">{data.plan === "plus" ? "PLUS 会员" : "FREE 账户"}</span>
          </div>
        </div>
        <div className="panel balance-breakdown">
          <h3>额度构成</h3>
          {[
            [
              "每日赠送",
              data.wallet.daily,
              `每天 ${formatCredits(data.wallet.dailyGrant)} credits，北京时间 00:00 刷新`,
            ],
            ...(data.wallet.subscription > 0
              ? [["历史会员额度", data.wallet.subscription, "保留至原会员周期结束"]]
              : []),
            ["购买额度", data.wallet.purchased, "不随每日刷新清零"],
            ["邀请奖励", data.wallet.referral, "永久有效，不随每日刷新清零"],
            ...(data.wallet.debt > 0
              ? [["待抵扣欠额", -data.wallet.debt, "后续赠送、充值或会员额度优先抵扣"]]
              : []),
          ].map(([label, amount, note]) => (
            <div key={String(label)}>
              <span>
                <strong>{label}</strong>
                <small>{note}</small>
              </span>
              <b>
                {formatCredits(Number(amount))}
                <small> credits</small>
              </b>
            </div>
          ))}
        </div>
      </div>
      <SectionTitle title="找到适合你的方式" />
      <div className="plans-grid">
        <article className="plan-card panel">
          <span className="plan-icon">
            <Leaf size={25} />
          </span>
          <h2>Free</h2>
          <p>从第一段对话开始。</p>
          <div className="plan-price">
            免费<small>一直可以使用</small>
          </div>
          <ul>
            <li>
              <Check size={16} />
              支持三种 LLM 协议
            </li>
            <li>
              <Check size={16} />
              最多 1 个微信链接
            </li>
            <li>
              <Check size={16} />
              最多 1 个插件配置
            </li>
            <li>
              <Check size={16} />
              微信中管理和切换会话
            </li>
            <li>
              <Check size={16} />
              每日赠送 {formatCredits(data.wallet.dailyGrants.free)} credits
            </li>
          </ul>
          <div className="plan-card-bottom">
            {data.plan === "free" ? (
              <span className="current-plan">
                <Check size={15} />
                当前方案
              </span>
            ) : (
              <span className="subtle">基础功能对所有用户开放</span>
            )}
          </div>
        </article>
        <article className="plan-card plus-plan">
          <span className="recommended-label">给更常聊天的你</span>
          <span className="plan-icon">
            <Sparkles size={25} />
          </span>
          <h2>Plus</h2>
          <p>让你的 AI，更顺手一点。</p>
          <div className="billing-interval" role="group" aria-label="会员付费周期">
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
              年付 · 省 ¥{plusYearlySaving}
            </button>
          </div>
          <div className="plan-price">
            {price(plus)}
            <small>/ {interval === "year" ? "年" : "月"}</small>
          </div>
          <p className="billing-renewal-note">
            {interval === "year" ? `约 ${plusYearlyPerMonth} / 月，按年付费` : "按月付费"}
            ，单次购买，不自动续费。支持微信支付、支付宝和银行卡。
          </p>
          <ul>
            <li>
              <Check size={16} />
              最多 10 个微信链接
            </li>
            <li>
              <Check size={16} />
              插件配置数量不限
            </li>
            <li>
              <Check size={16} />
              网页查看历史聊天记录
            </li>
            <li>
              <Check size={16} />
              网页切换、归档和整理会话
            </li>
            <li>
              <Check size={16} />
              更多渠道与自定义模型快捷名称
            </li>
            <li>
              <Check size={16} />
              图片问答，正常扣除 credits
            </li>
            <li>
              <Check size={16} />
              每日赠送 {formatCredits(data.wallet.dailyGrants.plus)} credits
            </li>
          </ul>
          <div className="plan-card-bottom">
            <button
              className="button full"
              disabled={!plus?.enabled || Boolean(busy)}
              onClick={() => plus && void buy(hasRecurringSubscription ? "portal" : plus.id)}
            >
              {busy === plus?.id
                ? "正在跳转…"
                : plus?.enabled
                  ? hasRecurringSubscription
                    ? "管理自动续费订阅"
                    : data.plan === "plus"
                      ? "续费 Plus"
                      : "升级 Plus"
                  : "暂未开放购买"}
              {data.plan !== "plus" && <ArrowRight size={17} />}
            </button>
          </div>
        </article>
        <article className="plan-card panel">
          <span className="plan-icon">
            <Coins size={25} />
          </span>
          <h2>Credits 加油包</h2>
          <p>好奇心多一点，也没关系。</p>
          <div className="plan-price">
            {price(topup)}
            <small>/ 包</small>
          </div>
          <fieldset className="credit-pack-options">
            <legend>选择额度包</legend>
            {offers
              .filter((o) => o.kind === "credits")
              .map((offer) => (
                <label key={offer.id}>
                  <input
                    type="radio"
                    name="credits-pack"
                    value={offer.id}
                    checked={packId === offer.id}
                    onChange={() => setPackId(offer.id)}
                  />
                  <span>{formatCredits(offer.credits)} credits</span>
                  <strong>{price(offer)}</strong>
                </label>
              ))}
          </fieldset>
          <ul>
            <li>
              <Check size={16} />
              Free 和 Plus 都可以购买
            </li>
            <li>
              <Check size={16} />
              不随每日赠送额度清零
            </li>
            <li>
              <Check size={16} />
              优先使用即将到期的赠送额度
            </li>
          </ul>
          <div className="plan-card-bottom">
            <button
              className="button secondary full"
              disabled={!topup?.enabled || Boolean(busy)}
              onClick={() => topup && void buy(topup.id)}
            >
              {busy === topup?.id
                ? "正在跳转…"
                : topup?.enabled
                  ? "补充额度"
                  : "充值暂未开放"}
              <ArrowUpRight size={16} />
            </button>
          </div>
        </article>
      </div>
      <p className="billing-footnote">
        Credits 是平台服务额度，自备 API Key 的模型费用由供应商另行收取。
        <Link to={`${base}/credits`}>
          查看计费规则与额度明细
          <ArrowUpRight size={14} />
        </Link>
      </p>
    </div>
  );
}
