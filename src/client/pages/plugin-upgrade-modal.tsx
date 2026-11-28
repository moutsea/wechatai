import { rememberBillingReturn } from "../billing-return";
import { useWorkspaceText, useWorkspaceError } from "../workspace-copy";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import type { BillingCatalog, BillingOffer, SubscriptionInfo } from "../../shared/billing";
import { BILLING_OFFERS } from "../../shared/billing-offers";
import { PLUGIN_LIMITS } from "../../shared/plugin-access";
import { WECHAT_LINK_LIMITS } from "../../shared/wechat-links";
import { useApp } from "../context";
import { json } from "../api";
import { trackFunnel } from "../analytics-client";
import { rememberPluginUpgrade, type PluginUpgradeTarget } from "../plugin-upgrade";
import { Modal } from "../ui";

const plusOffers = BILLING_OFFERS.filter((offer) => offer.kind === "plus");

export function PluginUpgradeModal({
  target,
  onClose,
}: {
  target: PluginUpgradeTarget;
  onClose: () => void;
}) {
  const errorText = useWorkspaceError();
  const copyText = useWorkspaceText();
  const { data, request, base, user } = useApp();
  const [catalog, setCatalog] = useState<BillingCatalog | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState("");
  useEffect(() => {
    trackFunnel("paywall_view", { surface: "plugins", plugin: target.kind });
  }, [target.kind]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void Promise.all([
      request<BillingCatalog>("/billing/catalog", { signal: controller.signal }),
      request<SubscriptionInfo>("/billing/subscription", { signal: controller.signal }),
    ])
      .then(([nextCatalog, nextSubscription]) => {
        if (controller.signal.aborted) return;
        setCatalog(nextCatalog);
        setSubscription(nextSubscription);
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(errorText(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [request, retry]);
  if (!data) return null;
  const recurring =
    subscription &&
    !subscription.cancelAtPeriodEnd &&
    ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"].includes(
      subscription.status,
    );
  const cloud = target.kind === "wechatai/cloud-agent";
  async function buy(offer: BillingOffer) {
    if (busy || !offer.enabled) return;
    setBusy(offer.id);
    setError("");
    trackFunnel("paywall_click", { surface: "plugins", offer: offer.id });
    trackFunnel("checkout_start", { offer: offer.id, from: "plugins" });
    try {
      const result = await request<{ url: string }>(
        "/billing/checkout",
        json({ offerId: offer.id }),
      );
      const url = new URL(result.url);
      if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com")
        throw new Error(copyText("支付链接无效，请重试。"));
      rememberPluginUpgrade(user.email, target);
      rememberBillingReturn(user.email, `${base}/billing${window.location.search}${window.location.hash}`);
      window.location.assign(result.url);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  }
  return (
    <Modal
      title={cloud ? copyText("开通 Plus，解锁小薇") : copyText("开通 Plus，配置更多插件")}
      description={
        cloud
          ? copyText("小薇是 Plus 专属云端助手，在微信交代任务、处理文件和生成文档。")
          : copyText(
              "Free 最多配置 {value0} 个插件，你已使用当前名额。Plus 可配置不限数量的插件。",
              { value0: PLUGIN_LIMITS.free },
            )
      }
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <div className="plugin-upgrade-body">
        <p className="plugin-upgrade-note">
          {copyText("Plus 不包含模型 API 费用，需另付服务商；使用小薇需先配置自己的模型 API Key。")}
        </p>
        <ul className="plugin-upgrade-features">
          {[
            copyText("每天赠送 {value0} credits", { value0: data.wallet.dailyGrants.plus }),
            copyText("最多 {value0} 个微信连接", { value0: WECHAT_LINK_LIMITS.plus }),
            copyText("插件配置数量不限"),
            copyText("小薇 AI 云端助手"),
            copyText("图片与文件输入"),
            copyText("网页查看聊天记录"),
          ].map((feature) => (
            <li key={feature}>
              <Check size={16} aria-hidden="true" /> {feature}
            </li>
          ))}
        </ul>
        {catalog?.mode === "test" && (
          <p className="form-hint" role="status">
            {copyText("测试模式 · 支付仅用于测试，不会产生真实扣款。")}
          </p>
        )}
        <div className="plugin-upgrade-plans">
          {plusOffers.map((preset) => {
            const offer = catalog?.offers.find((item) => item.id === preset.id);
            const annual = preset.interval === "year";
            return (
              <article
                key={preset.id}
                className={`plugin-upgrade-plan${annual ? " annual" : ""}`}
                aria-label={copyText(preset.name)}
              >
                <span className="plugin-upgrade-badge">
                  {annual ? copyText("年付更划算") : copyText("灵活选择")}
                </span>
                <h3>{copyText(preset.name)}</h3>
                <p className="plugin-upgrade-price">
                  <strong>¥{offer?.price ?? preset.amount / 100}</strong>
                  <span>/ {annual ? copyText("年") : copyText("月")}</span>
                </p>
                <p>{copyText("单次购买，到期手动续费")}</p>
                {recurring ? (
                  <Link
                    className="button secondary"
                    to={`${base}/billing`}
                    onClick={() => rememberPluginUpgrade(user.email, target)}
                  >
                    {copyText("管理已有订阅 ")}
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                ) : (
                  <button
                    className="button"
                    disabled={loading || !offer?.enabled || Boolean(busy)}
                    onClick={() => offer && void buy(offer)}
                  >
                    {busy === preset.id ? (
                      <>
                        <Loader2 size={16} className="spin" aria-hidden="true" />
                        {copyText(" 正在跳转…")}
                      </>
                    ) : loading ? (
                      copyText("正在加载…")
                    ) : offer?.enabled ? (
                      annual ? (
                        copyText("开通年付 Plus")
                      ) : (
                        copyText("开通月付 Plus")
                      )
                    ) : (
                      copyText("暂未开放购买")
                    )}
                  </button>
                )}
              </article>
            );
          })}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}{" "}
            {!catalog && (
              <button className="text-link" onClick={() => setRetry((value) => value + 1)}>
                {copyText("重新加载")}
              </button>
            )}
          </p>
        )}
        <p className="plugin-upgrade-note">
          {copyText("月付与年付权益相同，不自动续费。小薇执行次数与可用状态以插件页为准。")}
        </p>
        {!cloud && (
          <p className="plugin-upgrade-note">
            {copyText("也可以删除不用的插件配置，释放 Free 名额；仅停用不会释放名额。")}
          </p>
        )}
      </div>
      <div className="modal-actions">
        <button className="button secondary" disabled={Boolean(busy)} onClick={onClose}>
          {copyText("暂时不用")}
        </button>
        <Link
          className="text-link"
          to={`${base}/billing`}
          aria-disabled={Boolean(busy)}
          onClick={(event) => {
            if (busy) event.preventDefault();
            else rememberPluginUpgrade(user.email, target);
          }}
        >
          {copyText("查看全部会员权益 ")}
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </Modal>
  );
}
