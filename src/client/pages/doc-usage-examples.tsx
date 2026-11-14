import { AudioLines, FileText } from "lucide-react";
import { BILLING_OFFERS } from "../../shared/billing-offers";
import { estimateTextCost } from "../../shared/cost-estimate";
import { DAILY_CREDIT_DEFAULTS, OUTPUT_TOKEN_WEIGHT } from "../../shared/credits";
import { PLUGIN_LIMITS } from "../../shared/plugin-access";
import { WECHAT_LINK_LIMITS } from "../../shared/wechat-links";

export function DocAttachmentFlow() {
  return (
    <figure className="docs-channel-example" aria-label="先发送文件，再补充处理要求的对话示意">
      <div className="docs-channel-example-card">
        <div className="docs-channel-example-header">
          <strong>微信 ClawBot</strong>
          <span>对话示意</span>
        </div>
        <div className="docs-plugin-messages">
          <div className="docs-attachment-stage">01 · 先发文件</div>
          <div className="docs-plugin-bubble docs-plugin-bubble-user docs-attachment-file">
            <FileText size={30} aria-hidden="true" />
            <div>
              <strong>会议记录.docx</strong>
              <span>Word 文档 · 128 KB</span>
            </div>
          </div>
          <div className="docs-plugin-bubble">
            已暂存 1 个附件，暂未发送给模型，也不会扣除 credits。
          </div>
          <div className="docs-attachment-stage">02 · 再发要求</div>
          <div className="docs-plugin-bubble docs-plugin-bubble-user">
            帮我整理成待办清单，列出任务、负责人和截止时间。
          </div>
          <div className="docs-plugin-bubble">
            <strong>待办清单</strong>
            <div>整理产品方案 · 李明 · 周五前</div>
            <div>确认上线时间 · 负责人待确认</div>
          </div>
        </div>
      </div>
      <figcaption>
        示例展示文件分析流程，回复内容仅为演示。生成文件或转换格式请使用小薇。
      </figcaption>
    </figure>
  );
}

export function DocVoiceExample() {
  return (
    <figure className="docs-channel-example" aria-label="用语音补充附件要求及微信转写文字的示意">
      <div className="docs-channel-example-card">
        <div className="docs-channel-example-header">
          <strong>微信 ClawBot</strong>
          <span>语音示意</span>
        </div>
        <div className="docs-plugin-messages">
          <div className="docs-plugin-bubble">文件已暂存，请告诉我需要怎么处理。</div>
          <div
            className="docs-plugin-bubble docs-plugin-bubble-user docs-voice-message"
            aria-label="6 秒语音消息，静态示意"
          >
            <span>6″</span>
            <AudioLines size={24} aria-hidden="true" />
          </div>
          <div className="docs-plugin-bubble docs-plugin-bubble-user">
            <span className="docs-voice-transcript-label">微信附带的转写文字 · 示意</span>
            帮我总结刚才的文档，提炼出三条重点。
          </div>
          <div className="docs-plugin-bubble">
            <strong>文档的三条重点</strong>
            <div>1. 本周完成产品方案。</div>
            <div>2. 下周安排内部评审。</div>
            <div>3. 上线时间仍需确认。</div>
          </div>
        </div>
      </div>
      <figcaption>语音与转写仅作示意，不可播放；处理附件前，请先等待暂存成功。</figcaption>
    </figure>
  );
}

export function DocMembershipPlans() {
  return (
    <div className="docs-membership-plans" role="group" aria-label="Free 与 Plus 核心权益对比">
      {(["free", "plus"] as const).map((plan) => (
        <div className={`docs-membership-plan docs-membership-plan-${plan}`} key={plan}>
          <div className="docs-membership-heading">
            <strong>{plan === "free" ? "Free 免费版" : "Plus 会员"}</strong>
            <span>
              {plan === "free"
                ? "¥0"
                : BILLING_OFFERS.filter((offer) => offer.kind === "plus")
                    .map(
                      (offer) =>
                        `¥${offer.amount / 100}/${offer.interval === "month" ? "月" : "年"}`,
                    )
                    .join(" · ")}
            </span>
          </div>
          <div className="docs-membership-allowance">
            <strong>{DAILY_CREDIT_DEFAULTS[plan].toLocaleString("zh-CN")}</strong>
            <span>credits / 天</span>
          </div>
          <ul>
            <li>
              <strong>{WECHAT_LINK_LIMITS[plan]} 个</strong>微信连接
            </li>
            <li>
              插件配置
              <strong>{PLUGIN_LIMITS[plan] === null ? "不限" : `${PLUGIN_LIMITS[plan]} 个`}</strong>
            </li>
            <li>文字聊天、带转写的语音提问</li>
            {plan === "plus" ? (
              <>
                <li>图片与文件输入、网页会话记录</li>
                <li>模型 @快捷调用、云端助手小薇</li>
              </>
            ) : (
              <li>生图、角色扮演等插件任选其一配置</li>
            )}
          </ul>
        </div>
      ))}
    </div>
  );
}

const exampleInput = 1000;
const exampleOutput = 250;
const exampleCredits = estimateTextCost(exampleInput, exampleOutput, 1, 0, 0)?.credits;

export function DocCreditExample() {
  return (
    <figure className="docs-credit-example" aria-label="一轮文字对话的 credits 计算示例">
      <div className="docs-credit-example-header">
        <strong>一轮文字对话示例</strong>
        <span>微伴 credits</span>
      </div>
      <div className="docs-credit-calculation">
        <div>
          <span>输入 tokens</span>
          <strong>{exampleInput.toLocaleString("zh-CN")}</strong>
          <small>问题 + 实际携带的上下文</small>
        </div>
        <div>
          <span>输出 tokens</span>
          <strong>{exampleOutput.toLocaleString("zh-CN")}</strong>
          <small>AI 回复，按 {OUTPUT_TOKEN_WEIGHT} 倍计量</small>
        </div>
        <div className="docs-credit-result">
          <span>本轮消耗</span>
          <strong>{exampleCredits}</strong>
          <small>credits</small>
        </div>
      </div>
      <figcaption>仅演示平台文字计费，实际消耗随输入和回复长度变化；模型 API 费用另计。</figcaption>
    </figure>
  );
}
