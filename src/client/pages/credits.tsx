import { ledgerNote, workspaceLabel } from "../workspace-copy";
import { useLocale } from "../locale";
import { copy as sourceCopy } from "../../shared/i18n/zh-CN/copy/credits-page";
import { copy as koCopy } from "../../shared/i18n/ko/copy/credits-page";
import { workspaceCopy as ptCopy } from "../../shared/i18n/pt/copy/workspace";
import { formatCopy } from "../../shared/i18n/dashboard";
import { Link } from "react-router-dom";
import { ArrowUpRight, CreditCard } from "lucide-react";
import { useApp } from "../context";
import { PageHead, SectionTitle } from "../ui";
import { formatCredits } from "../../shared/types";
import {
  OWN_API_COST_NOTE,
  CLOUD_AGENT_COST_NOTE,
  IMAGE_CREDIT_COST_NOTE,
} from "../../shared/pricing-copy";

export function Credits() {
  const { locale } = useLocale();
  const pageCopy =
    locale === "ko" ? koCopy : locale === "pt" ? ptCopy : sourceCopy;

  const { data, base } = useApp();
  if (!data) return null;
  return (
    <div className="page-enter credits-page">
      <PageHead
        eyebrow="CREDIT HISTORY"
        title={pageCopy["额度明细"]}
        description={pageCopy["查看每日赠送、模型消耗与充值等额度变动。"]}
        action={
          <Link className="button secondary" to={`${base}/billing`}>
            {pageCopy["会员与 credits"]}
            <ArrowUpRight size={16} />
          </Link>
        }
      />
      <SectionTitle title={pageCopy["最近额度明细"]}>
        <span className="ledger-limit">{pageCopy["最近 30 条 · 单位 credits"]}</span>
      </SectionTitle>
      <div className="panel ledger-table">
        <div className="ledger-head">
          <span>{pageCopy["变动说明"]}</span>
          <span>{pageCopy["类型"]}</span>
          <span>{pageCopy["时间"]}</span>
          <span>{pageCopy["额度变动"]}</span>
        </div>
        {data.ledger.length ? (
          data.ledger.map((l) => (
            <div key={l.id} className="ledger-row">
              <div className="ledger-description">
                <strong>{ledgerNote(locale, l.note)}</strong>
                {l.meter && (
                  <small>
                    {pageCopy["平台计量 · "]}
                    {l.meter.inputTokens.toLocaleString()}
                    {pageCopy[" 输入 /"]} {l.meter.outputTokens.toLocaleString()}
                    {pageCopy[" 输出"]}
                    {l.meter.outputImages > 0 &&
                      formatCopy(pageCopy[" / {value0} 张图片"], { value0: l.meter.outputImages })}
                    <span title={l.meter.tokenizerVersion}>{pageCopy[" · 规则 v1"]}</span>
                  </small>
                )}
              </div>
              <span className="tag">
                {(
                  {
                    daily: pageCopy["每日赠送"],
                    purchase: pageCopy["充值"],
                    referral: pageCopy["邀请奖励"],
                    subscription: pageCopy["会员额度"],
                    usage: pageCopy["实际消耗"],
                    context_summary: pageCopy["上下文整理"],
                    reserve: pageCopy["预留"],
                    settlement:
                      l.amount < 0
                        ? pageCopy["结算补扣"]
                        : l.amount > 0
                          ? pageCopy["结算返还"]
                          : pageCopy["结算完成"],
                    refund: pageCopy["失败返还"],
                    expiry: pageCopy["额度到期"],
                  } as Record<string, string>
                )[l.kind] || l.kind}
              </span>
              <time dateTime={new Date(l.createdAt).toISOString()}>
                {new Date(l.createdAt).toLocaleString(locale === "ko" ? "ko-KR" : locale === "pt" ? "pt-BR" : "zh-CN", {
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
          <div className="list-loading">{pageCopy["还没有额度变动记录。"]}</div>
        )}
      </div>
      <details className="credit-rules">
        <summary>{pageCopy["Credits 怎么计算？"]}</summary>
        <div className="billing-rule">
          <span className="rule-icon">
            <CreditCard size={23} />
          </span>
          <div>
            <p>
              {
                pageCopy[
                  "消耗 =（输入 Token + 输出 Token × 8）÷ 5,000。包含实际发送的历史上下文，按 0.001 credit 向上取整。Token 由微伴统一分词计数，不采用上游返回的用量。"
                ]
              }
            </p>
            <p>
              {pageCopy["例如：4,000 输入 + 500 输出 = "]}
              <strong>1.6 credits</strong>
              {
                pageCopy[
                  "。请求前不预扣，模型请求成功后按实际用量扣费，失败不扣费。余额大于 0 即可发起请求，余额为 0 或负数时暂停新请求。"
                ]
              }
            </p>
            <p>
              {
                pageCopy[
                  "自动摘要、内部重试和 Agent 内部调用不额外扣本站 credits。整理后的摘要如果包含在实际输入中，则计入该次输入。"
                ]
              }
            </p>
            <p>
              {workspaceLabel(locale, IMAGE_CREDIT_COST_NOTE)}{" "}
              <Link to="/docs/credits#metering">{pageCopy["查看计费教程"]}</Link>。
            </p>
            <p>
              {
                pageCopy[
                  "结算后余额可以为负数，欠额在次日赠送额度刷新、充值或邀请奖励到账时优先抵扣；未抵完的部分继续保留。邀请奖励永久有效。"
                ]
              }
            </p>
            <small>
              {pageCopy["Credits 是平台服务额度。"]}
              {workspaceLabel(locale, OWN_API_COST_NOTE)}
              {workspaceLabel(locale, CLOUD_AGENT_COST_NOTE)}
              {
                pageCopy[
                  "云端任务按输入与最终输出计费，失败或确认取消不扣 credits；请求停止后仍可能完成，费用以最终结果为准。 具体额度与套餐以「会员与 credits」页面为准。"
                ]
              }
            </small>
          </div>
        </div>
      </details>
    </div>
  );
}
