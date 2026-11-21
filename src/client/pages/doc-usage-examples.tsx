import { AudioLines, FileText } from "lucide-react";
import { BILLING_OFFERS } from "../../shared/billing-offers";
import { estimateTextCost } from "../../shared/cost-estimate";
import { DAILY_CREDIT_DEFAULTS, OUTPUT_TOKEN_WEIGHT } from "../../shared/credits";
import { PLUGIN_LIMITS } from "../../shared/plugin-access";
import { WECHAT_LINK_LIMITS } from "../../shared/wechat-links";
import { useLocale } from "../locale";

export function DocAttachmentFlow() {
  const en = useLocale().locale === "en";
  return (
    <figure
      className="docs-channel-example"
      aria-label={
        en
          ? "Conversation example: send the file first, then the processing request"
          : "先发送文件，再补充处理要求的对话示意"
      }
    >
      <div className="docs-channel-example-card">
        <div className="docs-channel-example-header">
          <strong>{en ? "WeChat ClawBot" : "微信 ClawBot"}</strong>
          <span>{en ? "Conversation example" : "对话示意"}</span>
        </div>
        <div className="docs-plugin-messages">
          <div className="docs-attachment-stage">{en ? "01 · Send the file" : "01 · 先发文件"}</div>
          <div className="docs-plugin-bubble docs-plugin-bubble-user docs-attachment-file">
            <FileText size={30} aria-hidden="true" />
            <div>
              <strong>{en ? "meeting-notes.docx" : "会议记录.docx"}</strong>
              <span>{en ? "Word document · 128 KB" : "Word 文档 · 128 KB"}</span>
            </div>
          </div>
          <div className="docs-plugin-bubble">
            {en
              ? "Staged 1 attachment. It has not been sent to the model and no credits were charged."
              : "已暂存 1 个附件，暂未发送给模型，也不会扣除 credits。"}
          </div>
          <div className="docs-attachment-stage">
            {en ? "02 · Send the request" : "02 · 再发要求"}
          </div>
          <div className="docs-plugin-bubble docs-plugin-bubble-user">
            {en
              ? "Turn this into a to-do list with the task, owner and deadline."
              : "帮我整理成待办清单，列出任务、负责人和截止时间。"}
          </div>
          <div className="docs-plugin-bubble">
            <strong>{en ? "To-do list" : "待办清单"}</strong>
            <div>
              {en
                ? "Finalize the product plan · Li Ming · by Friday"
                : "整理产品方案 · 李明 · 周五前"}
            </div>
            <div>{en ? "Confirm launch time · owner pending" : "确认上线时间 · 负责人待确认"}</div>
          </div>
        </div>
      </div>
      <figcaption>
        {en
          ? "The example shows a file-analysis flow; replies are for demonstration only. Use Xiaowei to generate files or convert formats."
          : "示例展示文件分析流程，回复内容仅为演示。生成文件或转换格式请使用小薇。"}
      </figcaption>
    </figure>
  );
}

export function DocVoiceExample() {
  const en = useLocale().locale === "en";
  return (
    <figure
      className="docs-channel-example"
      aria-label={
        en
          ? "Example of adding attachment instructions by voice and the WeChat transcript"
          : "用语音补充附件要求及微信转写文字的示意"
      }
    >
      <div className="docs-channel-example-card">
        <div className="docs-channel-example-header">
          <strong>{en ? "WeChat ClawBot" : "微信 ClawBot"}</strong>
          <span>{en ? "Voice example" : "语音示意"}</span>
        </div>
        <div className="docs-plugin-messages">
          <div className="docs-plugin-bubble">
            {en
              ? "The file is staged. Tell me how you want it processed."
              : "文件已暂存，请告诉我需要怎么处理。"}
          </div>
          <div
            className="docs-plugin-bubble docs-plugin-bubble-user docs-voice-message"
            aria-label={en ? "Six-second voice message, static example" : "6 秒语音消息，静态示意"}
          >
            <span>6″</span>
            <AudioLines size={24} aria-hidden="true" />
          </div>
          <div className="docs-plugin-bubble docs-plugin-bubble-user">
            <span className="docs-voice-transcript-label">
              {en ? "Transcript attached by WeChat · example" : "微信附带的转写文字 · 示意"}
            </span>
            {en
              ? "Summarize the document I just sent and pull out three key points."
              : "帮我总结刚才的文档，提炼出三条重点。"}
          </div>
          <div className="docs-plugin-bubble">
            <strong>{en ? "Three key points" : "文档的三条重点"}</strong>
            <div>{en ? "1. Finish the product plan this week." : "1. 本周完成产品方案。"}</div>
            <div>{en ? "2. Schedule the internal review next week." : "2. 下周安排内部评审。"}</div>
            <div>
              {en ? "3. The launch time still needs confirmation." : "3. 上线时间仍需确认。"}
            </div>
          </div>
        </div>
      </div>
      <figcaption>
        {en
          ? "Voice and transcript are illustrations only and cannot be played. Wait for staging to succeed before processing an attachment."
          : "语音与转写仅作示意，不可播放；处理附件前，请先等待暂存成功。"}
      </figcaption>
    </figure>
  );
}

export function DocMembershipPlans() {
  const en = useLocale().locale === "en";
  const numberFormat = en ? "en-US" : "zh-CN";
  return (
    <div
      className="docs-membership-plans"
      role="group"
      aria-label={en ? "Free and Plus core benefits" : "Free 与 Plus 核心权益对比"}
    >
      {(["free", "plus"] as const).map((plan) => (
        <div className={`docs-membership-plan docs-membership-plan-${plan}`} key={plan}>
          <div className="docs-membership-heading">
            <strong>
              {plan === "free" ? (en ? "Free" : "Free 免费版") : en ? "Plus" : "Plus 会员"}
            </strong>
            <span>
              {plan === "free"
                ? "¥0"
                : BILLING_OFFERS.filter((offer) => offer.kind === "plus")
                    .map(
                      (offer) =>
                        `¥${offer.amount / 100}/${offer.interval === "month" ? (en ? "month" : "月") : en ? "year" : "年"}`,
                    )
                    .join(" · ")}
            </span>
          </div>
          <div className="docs-membership-allowance">
            <strong>{DAILY_CREDIT_DEFAULTS[plan].toLocaleString(numberFormat)}</strong>
            <span>{en ? "credits / day" : "credits / 天"}</span>
          </div>
          <ul>
            {en ? (
              <>
                <li>
                  <strong>{WECHAT_LINK_LIMITS[plan]}</strong> WeChat links
                </li>
                <li>
                  Plugin configurations
                  <strong>
                    {PLUGIN_LIMITS[plan] === null ? "Unlimited" : PLUGIN_LIMITS[plan]}
                  </strong>
                </li>
              </>
            ) : (
              <>
                <li>
                  <strong>{WECHAT_LINK_LIMITS[plan]} 个</strong>微信连接
                </li>
                <li>
                  插件配置
                  <strong>
                    {PLUGIN_LIMITS[plan] === null ? "不限" : `${PLUGIN_LIMITS[plan]} 个`}
                  </strong>
                </li>
              </>
            )}
            <li>
              {en
                ? "Text chat and voice questions with a transcript"
                : "文字聊天、带转写的语音提问"}
            </li>
            {plan === "plus" ? (
              <>
                <li>
                  {en
                    ? "Image and file input, web session history"
                    : "图片与文件输入、网页会话记录"}
                </li>
                <li>
                  {en
                    ? "Model @ shortcut calls, the Xiaowei cloud assistant"
                    : "模型 @快捷调用、云端助手小薇"}
                </li>
              </>
            ) : (
              <li>
                {en
                  ? "One plugin of your choice, such as image generation or roleplay"
                  : "生图、角色扮演等插件任选其一配置"}
              </li>
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
  const en = useLocale().locale === "en";
  const numberFormat = en ? "en-US" : "zh-CN";
  return (
    <figure
      className="docs-credit-example"
      aria-label={en ? "Credits calculation for one text turn" : "一轮文字对话的 credits 计算示例"}
    >
      <div className="docs-credit-example-header">
        <strong>{en ? "One text conversation example" : "一轮文字对话示例"}</strong>
        <span>{en ? "Wechatai credits" : "微伴 credits"}</span>
      </div>
      <div className="docs-credit-calculation">
        <div>
          <span>{en ? "Input tokens" : "输入 tokens"}</span>
          <strong>{exampleInput.toLocaleString(numberFormat)}</strong>
          <small>{en ? "Question + context actually included" : "问题 + 实际携带的上下文"}</small>
        </div>
        <div>
          <span>{en ? "Output tokens" : "输出 tokens"}</span>
          <strong>{exampleOutput.toLocaleString(numberFormat)}</strong>
          <small>
            {en
              ? `AI reply, weighted ${OUTPUT_TOKEN_WEIGHT}×`
              : `AI 回复，按 ${OUTPUT_TOKEN_WEIGHT} 倍计量`}
          </small>
        </div>
        <div className="docs-credit-result">
          <span>{en ? "This turn" : "本轮消耗"}</span>
          <strong>{exampleCredits}</strong>
          <small>credits</small>
        </div>
      </div>
      <figcaption>
        {en
          ? "Illustrates platform text billing only; actual usage varies with input and reply length. Model API fees are separate."
          : "仅演示平台文字计费，实际消耗随输入和回复长度变化；模型 API 费用另计。"}
      </figcaption>
    </figure>
  );
}
