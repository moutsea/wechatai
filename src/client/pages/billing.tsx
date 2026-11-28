import { workspaceError, workspaceLabel } from "../workspace-copy";
import { useLocale } from "../locale";
import { copy as sourceCopy } from "../../shared/i18n/zh-CN/copy/billing-page";
import { copy as koCopy } from "../../shared/i18n/ko/copy/billing-page";
import { workspaceCopy as ptCopy } from "../../shared/i18n/pt/copy/workspace";
import { formatCopy } from "../../shared/i18n/dashboard";
import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router-dom";
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
import { approxYuan, OWN_API_COST_NOTE, CLOUD_AGENT_COST_NOTE } from "../../shared/pricing-copy";
import { clearPluginUpgrade, pluginUpgradeReturnPath } from "../plugin-upgrade";
import { billingReturnPath, clearBillingReturn, rememberBillingReturn } from "../billing-return";

/** 年付省多少、折合月价多少，都从 BILLING_OFFERS 推导：写死的「省 ¥49」早就和 990/8800 不符了。 */
const plusMonthlyAmount = BILLING_OFFERS.find((offer) => offer.id === "plus_monthly")?.amount ?? 0;
const plusYearlyAmount = BILLING_OFFERS.find((offer) => offer.id === "plus_yearly")?.amount ?? 0;
const plusYearlySaving = (plusMonthlyAmount * 12 - plusYearlyAmount) / 100;
const plusYearlyPerMonth = approxYuan(plusYearlyAmount / 12);

export function Billing() {
  const { user } = useApp();
  // The session can arrive after dashboard data, so arrival state belongs to the account.
  return <AccountBilling key={user.email} email={user.email} />;
}

function AccountBilling({ email }: { email: string }) {
  const location = useLocation();
  // Read once per account, before payment polling or localized content mounts.
  const [returnPath, setReturnPath] = useState(() => billingReturnPath(email));
  useEffect(() => {
    if (!returnPath || returnPath === location.pathname) {
      clearBillingReturn(email);
      setReturnPath(null);
    }
  }, [returnPath, location.pathname, email]);
  if (returnPath && returnPath !== location.pathname)
    return <Navigate to={`${returnPath}${location.search}${location.hash}`} replace />;
  return <BillingContent />;
}

function BillingContent() {
  const { locale } = useLocale();
  const pageCopy =
    locale === "ko" ? koCopy : locale === "pt" ? ptCopy : sourceCopy;

  const { data, request, refresh, notify, base, user } = useApp();
  const [params, setParams] = useSearchParams();
  const requestedOffer = BILLING_OFFERS.find((offer) => offer.id === params.get("offer"));
  const [offers, setOffers] = useState<BillingOffer[]>(
    BILLING_OFFERS.map((o) => ({ ...o, price: o.amount / 100, currency: "cny", enabled: false })),
  );
  const [mode, setMode] = useState<"test" | "live">("test");
  const [subscription, setSubscription] = useState<SubscriptionInfo>(null);
  const [interval, setInterval] = useState<"month" | "year">(requestedOffer?.interval ?? "year");
  const [packId, setPackId] = useState<BillingOfferId>(
    requestedOffer?.kind === "credits" ? requestedOffer.id : "credits_5000",
  );
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
    ]).catch((e) => notify(workspaceError(e, locale), true));
  }, [request, notify, locale]);
  useEffect(() => {
    if (checkoutResult === "cancelled") {
      setPaymentState("cancelled");
      setPaymentMessage(pageCopy["已返回工作台，你可以重新选择方案继续支付。"]);
      return;
    }
    if (checkoutResult !== "success" || !sessionId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    setPaymentState("pending");
    setPaymentMessage(pageCopy["正在确认支付结果，到账后会自动更新。"]);
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
              ? pageCopy["支付成功，Plus 会员有效期已更新。"]
              : formatCopy(pageCopy["{value0} credits 已到账。"], {
                  value0: formatCredits(result.credits),
                }),
          );
        } else if (result.status === "pending" && ++attempts < 10)
          timer = setTimeout(() => void checkPayment(), 1500);
        else {
          setPaymentState("retry");
          setPaymentMessage(
            result.status === "pending"
              ? pageCopy["暂未确认到账，请稍后重新查询。无需重复付款。"]
              : pageCopy["这笔订单未完成支付，你可以重新选择方案。"],
          );
        }
      } catch (e) {
        if (!cancelled) {
          setPaymentState("retry");
          setPaymentMessage(workspaceError(e as Error, locale));
        }
      }
    }
    void checkPayment();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [checkoutResult, sessionId, retry, request, refresh, pageCopy, locale]);
  if (!data) return null;
  const pluginReturnPath = pluginUpgradeReturnPath(user.email, base);
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
      ? new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "zh-CN", {
          style: "currency",
          currency: offer.currency,
        }).format(offer.price)
      : pageCopy["暂未开放"];
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
        throw new Error(pageCopy["支付链接无效"]);
      rememberBillingReturn(user.email, base);
      window.location.assign(r.url);
    } catch (e) {
      notify(workspaceError(e as Error, locale), true);
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="page-enter billing-page">
      <PageHead
        eyebrow="A LITTLE MORE POSSIBILITY"
        title={pageCopy["会员与 credits"]}
        description={pageCopy["查看可用额度，选择适合你的会员方案。"]}
        action={
          <div className="billing-head-actions">
            <Link className="button secondary" to={`${base}/invite`}>
              <Gift size={16} />
              {pageCopy["邀请得 credits"]}
            </Link>
            <Link className="button secondary" to={`${base}/credits`}>
              <ReceiptText size={16} />
              {pageCopy["额度明细"]}
            </Link>
            {subscription && (
              <button
                className="button secondary"
                disabled={Boolean(busy)}
                onClick={() => void buy("portal")}
              >
                {pageCopy["管理订阅"]}
                <ArrowUpRight size={16} />
              </button>
            )}
          </div>
        }
      />
      {mode === "test" && offers.some((o) => o.enabled) && (
        <div className="billing-notice">
          {pageCopy["测试模式 · 支付仅用于测试，不会产生真实扣款。"]}
        </div>
      )}
      {paymentState && (
        <div className={`billing-notice ${paymentState === "paid" ? "success" : ""}`} role="status">
          <span>{paymentMessage}</span>
          {paymentState === "retry" && (
            <button className="text-link" onClick={() => setRetry((value) => value + 1)}>
              {pageCopy["重新查询"]}
            </button>
          )}
          {paymentState !== "pending" && (
            <button
              className="icon-button"
              aria-label={pageCopy["关闭支付提示"]}
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
      {pluginReturnPath && (data.plan === "plus" || paymentState === "cancelled") && (
        <p className="billing-subscription-note">
          <Link
            className="text-link"
            to={pluginReturnPath}
            onClick={() => clearPluginUpgrade(user.email)}
          >
            {data.plan === "plus" ? pageCopy["继续配置刚才的插件"] : pageCopy["返回插件配置"]}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </p>
      )}
      {subscription && (
        <p className="billing-subscription-note">
          {pageCopy["原有"]}
          {subscription.offerId === "plus_yearly"
            ? pageCopy["年付订阅"]
            : pageCopy["月付订阅"]} ·
          {subscription.status === "canceled"
            ? pageCopy["订阅已结束"]
            : subscription.cancelAtPeriodEnd
              ? pageCopy["已取消自动续费"]
              : ["past_due", "unpaid"].includes(subscription.status)
                ? pageCopy["续费未完成，请管理订阅更新支付方式"]
                : pageCopy["自动续费中"]}{" "}
          {pageCopy["· 当前周期至 "]}
          {new Date(subscription.periodEnd).toLocaleDateString(locale === "ko" ? "ko-KR" : locale === "pt" ? "pt-BR" : "zh-CN")}
        </p>
      )}
      {data.plan === "plus" && (
        <p className="billing-subscription-note">
          {pageCopy["Plus 有效期至"]}{" "}
          {new Date(data.planUntil).toLocaleString(locale === "ko" ? "ko-KR" : locale === "pt" ? "pt-BR" : "zh-CN", {
            timeZone: "Asia/Shanghai",
            hour12: false,
          })}
          {pageCopy["（北京时间）。"]}
          {hasRecurringSubscription
            ? pageCopy["如需改为单次购买，请先在「管理订阅」中取消自动续费，剩余有效期会保留。"]
            : pageCopy["到期手动续费，提前购买会顺延有效期。"]}
        </p>
      )}
      <div className="billing-summary">
        <div className="wallet-hero">
          <span>
            <Coins size={19} />
            {pageCopy["我的 Credits"]}
          </span>
          <strong>{formatCredits(data.wallet.balance)}</strong>
          <p>
            {data.wallet.debt > 0
              ? pageCopy["待抵扣欠额将从后续到账额度中扣除"]
              : pageCopy["可用于你配置的全部模型"]}
          </p>
          <div>
            <span>
              {pageCopy["今日消耗 "]}
              <b>{formatCredits(data.wallet.spentToday)}</b>
            </span>
            <span className="tag">
              {data.plan === "plus" ? pageCopy["PLUS 会员"] : pageCopy["FREE 账户"]}
            </span>
          </div>
        </div>
        <div className="panel balance-breakdown">
          <h3>{pageCopy["额度构成"]}</h3>
          {[
            [
              pageCopy["每日赠送"],
              data.wallet.daily,
              formatCopy(pageCopy["每天 {value0} credits，北京时间 00:00 刷新"], {
                value0: formatCredits(data.wallet.dailyGrant),
              }),
            ],
            ...(data.wallet.subscription > 0
              ? [
                  [
                    pageCopy["历史会员额度"],
                    data.wallet.subscription,
                    pageCopy["保留至原会员周期结束"],
                  ],
                ]
              : []),
            [pageCopy["购买额度"], data.wallet.purchased, pageCopy["不随每日刷新清零"]],
            [pageCopy["邀请奖励"], data.wallet.referral, pageCopy["永久有效，不随每日刷新清零"]],
            ...(data.wallet.debt > 0
              ? [
                  [
                    pageCopy["待抵扣欠额"],
                    -data.wallet.debt,
                    pageCopy["后续赠送、充值或会员额度优先抵扣"],
                  ],
                ]
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
      <SectionTitle title={pageCopy["找到适合你的方式"]} />
      <div className="plans-grid">
        <article className="plan-card panel">
          <span className="plan-icon">
            <Leaf size={25} />
          </span>
          <h2>Free</h2>
          <p>{pageCopy["从第一段对话开始。"]}</p>
          <div className="plan-price">
            {pageCopy["免费"]}
            <small>{pageCopy["一直可以使用"]}</small>
          </div>
          <ul>
            <li>
              <Check size={16} />
              {pageCopy["支持三种 LLM 协议"]}
            </li>
            <li>
              <Check size={16} />
              {pageCopy["最多 1 个微信链接"]}
            </li>
            <li>
              <Check size={16} />
              {pageCopy["最多 1 个插件配置"]}
            </li>
            <li>
              <Check size={16} />
              {pageCopy["微信中管理和切换会话"]}
            </li>
            <li>
              <Check size={16} />
              {pageCopy["每日赠送 "]}
              {formatCredits(data.wallet.dailyGrants.free)} credits
            </li>
          </ul>
          <div className="plan-card-bottom">
            {data.plan === "free" ? (
              <span className="current-plan">
                <Check size={15} />
                {pageCopy["当前方案"]}
              </span>
            ) : (
              <span className="subtle">{pageCopy["基础功能对所有用户开放"]}</span>
            )}
          </div>
        </article>
        <article className="plan-card plus-plan">
          <span className="recommended-label">{pageCopy["给更常聊天的你"]}</span>
          <span className="plan-icon">
            <Sparkles size={25} />
          </span>
          <h2>Plus</h2>
          <p>{pageCopy["让你的 AI，更顺手一点。"]}</p>
          <div className="billing-interval" role="group" aria-label={pageCopy["会员付费周期"]}>
            <button
              type="button"
              aria-pressed={interval === "month"}
              onClick={() => setInterval("month")}
            >
              {pageCopy["月付"]}
            </button>
            <button
              type="button"
              aria-pressed={interval === "year"}
              onClick={() => setInterval("year")}
            >
              {pageCopy["年付 · 省 ¥"]}
              {plusYearlySaving}
            </button>
          </div>
          <div className="plan-price">
            {price(plus)}
            <small>/ {interval === "year" ? pageCopy["年"] : pageCopy["月"]}</small>
          </div>
          <p className="billing-renewal-note">
            {interval === "year"
              ? formatCopy(pageCopy["约 {value0} / 月，按年付费"], { value0: plusYearlyPerMonth })
              : pageCopy["按月付费"]}
            {pageCopy["，单次购买，不自动续费。支持微信支付、支付宝和银行卡。"]}
          </p>
          <ul>
            <li>
              <Check size={16} />
              {pageCopy["最多 10 个微信链接"]}
            </li>
            <li>
              <Check size={16} />
              {pageCopy["插件配置数量不限"]}
            </li>
            <li>
              <Check size={16} />
              {pageCopy["网页查看历史聊天记录"]}
            </li>
            <li>
              <Check size={16} />
              {pageCopy["网页切换、归档和整理会话"]}
            </li>
            <li>
              <Check size={16} />
              {pageCopy["更多渠道与自定义模型快捷名称"]}
            </li>
            <li>
              <Check size={16} />
              {pageCopy["图片问答，正常扣除 credits"]}
            </li>
            <li>
              <Check size={16} />
              {pageCopy["每日赠送 "]}
              {formatCredits(data.wallet.dailyGrants.plus)} credits
            </li>
          </ul>
          <div className="plan-card-bottom">
            <button
              className="button full"
              disabled={!plus?.enabled || Boolean(busy)}
              onClick={() => plus && void buy(hasRecurringSubscription ? "portal" : plus.id)}
            >
              {busy === plus?.id
                ? pageCopy["正在跳转…"]
                : plus?.enabled
                  ? hasRecurringSubscription
                    ? pageCopy["管理自动续费订阅"]
                    : data.plan === "plus"
                      ? pageCopy["续费 Plus"]
                      : pageCopy["升级 Plus"]
                  : pageCopy["暂未开放购买"]}
              {data.plan !== "plus" && <ArrowRight size={17} />}
            </button>
          </div>
        </article>
        <article className="plan-card panel">
          <span className="plan-icon">
            <Coins size={25} />
          </span>
          <h2>{pageCopy["Credits 加油包"]}</h2>
          <p>{pageCopy["好奇心多一点，也没关系。"]}</p>
          <div className="plan-price">
            {price(topup)}
            <small>{pageCopy["/ 包"]}</small>
          </div>
          <fieldset className="credit-pack-options">
            <legend>{pageCopy["选择额度包"]}</legend>
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
              {pageCopy["Free 和 Plus 都可以购买"]}
            </li>
            <li>
              <Check size={16} />
              {pageCopy["不随每日赠送额度清零"]}
            </li>
            <li>
              <Check size={16} />
              {pageCopy["优先使用即将到期的赠送额度"]}
            </li>
          </ul>
          <div className="plan-card-bottom">
            <button
              className="button secondary full"
              disabled={!topup?.enabled || Boolean(busy)}
              onClick={() => topup && void buy(topup.id)}
            >
              {busy === topup?.id
                ? pageCopy["正在跳转…"]
                : topup?.enabled
                  ? pageCopy["补充额度"]
                  : pageCopy["充值暂未开放"]}
              <ArrowUpRight size={16} />
            </button>
          </div>
        </article>
      </div>
      <p className="billing-footnote">
        {pageCopy["Credits 是平台服务额度。"]}
        {workspaceLabel(locale, OWN_API_COST_NOTE)}
        {workspaceLabel(locale, CLOUD_AGENT_COST_NOTE)}
        <Link to={`${base}/credits`}>
          {pageCopy["查看计费规则与额度明细"]}
          <ArrowUpRight size={14} />
        </Link>
      </p>
    </div>
  );
}
