import { Link } from "react-router-dom";
import { ArrowUpRight, CreditCard } from "lucide-react";
import { useApp } from "../context";
import { PageHead, SectionTitle } from "../ui";
import { formatCredits } from "../../shared/types";

export function Credits() {
  const { data, base } = useApp();
  if (!data) return null;
  return (
    <div className="page-enter credits-page">
      <PageHead
        eyebrow="CREDIT HISTORY"
        title="额度明细"
        description="查看每日赠送、模型消耗与充值等额度变动。"
        action={
          <Link className="button secondary" to={`${base}/billing`}>
            会员与 credits
            <ArrowUpRight size={16} />
          </Link>
        }
      />
      <SectionTitle title="最近额度明细">
        <span className="ledger-limit">最近 30 条 · 单位 credits</span>
      </SectionTitle>
      <div className="panel ledger-table">
        <div className="ledger-head">
          <span>变动说明</span>
          <span>类型</span>
          <span>时间</span>
          <span>额度变动</span>
        </div>
        {data.ledger.length ? (
          data.ledger.map((l) => (
            <div key={l.id} className="ledger-row">
              <div className="ledger-description">
                <strong>{l.note}</strong>
                {l.meter && (
                  <small>
                    平台计量 · {l.meter.inputTokens.toLocaleString()} 输入 /{" "}
                    {l.meter.outputTokens.toLocaleString()} 输出
                    {l.meter.outputImages > 0 && ` / ${l.meter.outputImages} 张图片`}
                    <span title={l.meter.tokenizerVersion}> · 规则 v1</span>
                  </small>
                )}
              </div>
              <span className="tag">
                {(
                  {
                    daily: "每日赠送",
                    purchase: "充值",
                    referral: "邀请奖励",
                    subscription: "会员额度",
                    usage: "实际消耗",
                    context_summary: "上下文整理",
                    reserve: "预留",
                    settlement: l.amount < 0 ? "结算补扣" : l.amount > 0 ? "结算返还" : "结算完成",
                    refund: "失败返还",
                    expiry: "额度到期",
                  } as Record<string, string>
                )[l.kind] || l.kind}
              </span>
              <time dateTime={new Date(l.createdAt).toISOString()}>
                {new Date(l.createdAt).toLocaleString("zh-CN", {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              <b className={l.amount > 0 ? "credit-positive" : ""}>
                {l.amount > 0 ? "+" : ""}
                {formatCredits(l.amount)}
              </b>
            </div>
          ))
        ) : (
          <div className="list-loading">还没有额度变动记录。</div>
        )}
      </div>
      <details className="credit-rules">
        <summary>Credits 怎么计算？</summary>
        <div className="billing-rule">
          <span className="rule-icon">
            <CreditCard size={23} />
          </span>
          <div>
            <p>
              消耗 =（输入 Token + 输出 Token × 8）÷ 5,000。包含实际发送的历史上下文，按 0.001
              credit 向上取整。Token 由微伴统一分词计数，不采用上游返回的用量。
            </p>
            <p>
              例如：4,000 输入 + 500 输出 = <strong>1.6 credits</strong>
              。请求前不预扣，模型请求成功后按实际用量扣费，失败不扣费。余额大于 0
              即可发起请求，余额为 0 或负数时暂停新请求。
            </p>
            <p>
              自动摘要、内部重试和 Agent 内部调用不额外扣本站
              credits。整理后的摘要如果包含在实际输入中，则计入该次输入。
              图片生成暂未开放，开放后结果图片按每张 5 credits
              计费；上传参考图、预览和重复投递不按结果图收费。
            </p>
            <p>
              结算后余额可以为负数，欠额在次日赠送额度刷新、充值或邀请奖励到账时优先抵扣；未抵完的部分继续保留。邀请奖励永久有效。
            </p>
            <small>
              Credits 是平台服务额度。使用自备 API
              Key，模型费用由供应商另行收取。具体额度与套餐以「会员与 credits」页面为准。
            </small>
          </div>
        </div>
      </details>
    </div>
  );
}
