import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Check,
  Copy,
  Gift,
  Link2,
  MessageCircle,
  RefreshCw,
  UserRoundPlus,
} from "lucide-react";
import { useApp } from "../context";
import { trackFunnel } from "../analytics-client";
import { PageHead, SectionTitle } from "../ui";
import { formatCredits } from "../../shared/types";
import { referralStatusLabel, type ReferralSummary } from "../../shared/referrals";
import "./invite.css";

export function Invite() {
  const { request, notify, base, data } = useApp();
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const result = await request<ReferralSummary>("/referrals", { signal: controller.signal });
        if (!controller.signal.aborted) {
          setSummary(result);
          setError("");
        }
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      }
    };
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 30000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [request, retry, data?.wallet.referral]);
  const copy = async () => {
    if (!summary?.url) return;
    try {
      await navigator.clipboard.writeText(summary.url);
      trackFunnel("invite_share_click");
      notify("邀请链接已复制，发给好友即可");
    } catch {
      input.current?.select();
      notify("已选中邀请链接，请手动复制");
    }
  };
  return (
    <div className="page-enter invite-page">
      <PageHead
        eyebrow="BETTER WITH FRIENDS"
        title="邀请好友"
        description="把微信里的 AI 分享给朋友，一起多聊一点。"
        action={
          <Link className="button secondary" to={`${base}/credits`}>
            额度明细
            <ArrowUpRight size={16} />
          </Link>
        }
      />
      <section className="invite-hero">
        <div className="invite-hero-top">
          <div>
            <span className="invite-kicker">
              <Gift size={17} /> 好友同行礼
            </span>
            <h2>
              你和好友，各得 <strong>500</strong> credits
            </h2>
            <p>好友通过你的链接注册，完成首次微信 AI 对话，奖励就会自动到账。</p>
            <span className="invite-permanent">
              <Check size={15} /> 永久有效 · Free 与 Plus 均可参与
            </span>
          </div>
          <div className="invite-gift" aria-hidden="true">
            <Gift size={58} strokeWidth={1.3} />
          </div>
        </div>
        <div className="invite-link-box">
          <label htmlFor="invite-url">你的专属邀请链接</label>
          <div className="invite-copy-row">
            <Link2 size={18} aria-hidden="true" />
            <input
              id="invite-url"
              ref={input}
              readOnly
              value={summary?.url || ""}
              placeholder="正在生成邀请链接…"
              onFocus={(e) => e.target.select()}
            />
            <button className="button" disabled={!summary?.url} onClick={() => void copy()}>
              <Copy size={16} />
              复制链接
            </button>
          </div>
        </div>
      </section>
      {error && (
        <div className="form-error" role="alert">
          {error}{" "}
          <button className="text-link" onClick={() => setRetry((n) => n + 1)}>
            重新加载
          </button>
        </div>
      )}
      {summary?.received && (
        <div className="invite-received" role="status">
          <Gift size={19} />
          <span>
            {summary.received === "pending"
              ? "你已接受好友邀请。配置模型并在微信完成首次 AI 对话，即可领取 500 credits。"
              : summary.received === "rewarded"
                ? "你的 500 credits 受邀奖励已到账，永久有效。"
                : summary.received === "qualified"
                  ? "首次对话已完成，正在发放双方的邀请奖励。"
                  : "当前微信不符合新用户奖励条件，你仍然可以正常使用微伴。"}
          </span>
          {summary.received === "pending" && (
            <Link to={`${base}/wechat`}>
              连接微信
              <ArrowUpRight size={15} />
            </Link>
          )}
        </div>
      )}
      <div className="invite-stats" aria-label="邀请统计">
        {[
          ["已邀请注册", summary?.registered, "位好友"],
          ["已完成邀请", summary?.completed, "位好友"],
          ["累计获得奖励", summary?.earned, "credits"],
        ].map(([label, value, unit]) => (
          <div key={String(label)}>
            <span>{label}</span>
            <strong>
              {typeof value === "number" ? formatCredits(value) : "—"}
              <small>{unit}</small>
            </strong>
          </div>
        ))}
      </div>
      <div className="invite-steps">
        {[
          [Link2, "分享专属链接", "把邀请链接发给还没注册的好友。"],
          [UserRoundPlus, "好友注册并连接", "支持邮箱、Google 或 GitHub 注册。"],
          [MessageCircle, "聊一次，双方到账", "首次微信 AI 对话成功，各得 500 credits。"],
        ].map(([Icon, title, description], i) => {
          const StepIcon = Icon as typeof Link2;
          return (
            <div key={String(title)}>
              <span className="invite-step-icon">
                <StepIcon size={19} />
              </span>
              <div>
                <h3>
                  <small>0{i + 1}</small>
                  {String(title)}
                </h3>
                <p>{String(description)}</p>
              </div>
            </div>
          );
        })}
      </div>
      <SectionTitle title="邀请记录">
        <button
          className="icon-button"
          aria-label="刷新邀请记录"
          onClick={() => setRetry((n) => n + 1)}
        >
          <RefreshCw size={15} />
        </button>
      </SectionTitle>
      <div className="panel invite-records">
        <div className="invite-record-head">
          <span>好友</span>
          <span>注册时间</span>
          <span>奖励状态</span>
        </div>
        {summary?.recent.length ? (
          summary.recent.map((row) => (
            <div className="invite-record" key={row.id}>
              <strong>{row.name}</strong>
              <time dateTime={new Date(row.createdAt).toISOString()}>
                {new Date(row.createdAt).toLocaleDateString("zh-CN")}
              </time>
              <span className={`tag ${row.status === "rewarded" ? "invite-rewarded" : ""}`}>
                {row.status === "rewarded" ? "+500 credits" : referralStatusLabel[row.status]}
              </span>
            </div>
          ))
        ) : (
          <div className="invite-empty">
            <UserRoundPlus size={26} />
            <strong>{summary ? "第一位好友，从一条链接开始" : "正在加载邀请记录…"}</strong>
            <p>成功邀请后，你可以在这里查看进度。最近保留展示 30 条。</p>
          </div>
        )}
      </div>
      <p className="invite-rules">
        仅限通过邀请链接注册的新用户；首次有效邀请归属保留 30
        天，注册后不可更改。每个新账户、同一微信仅能领取一次受邀奖励，不支持自邀。模型连接测试、微信命令和失败对话不计入。奖励永久有效，到账时会优先抵扣已有欠额。
      </p>
    </div>
  );
}
