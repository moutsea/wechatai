/**
 * 首页「常见问题」。这是唯一事实源：landing 页渲染它，`src/shared/seo.ts` 的
 * FAQPage 结构化数据也从这里生成，避免结构化数据和页面上写的不一致。
 *
 * 回答里的价格与额度不要手写具体数字，用常量拼，防止改价后文案漂移。
 */
import { DAILY_CREDIT_DEFAULTS } from "./credits";
import { PLUGIN_LIMITS } from "./plugin-access";
import { WECHAT_LINK_LIMITS } from "./wechat-links";
import { PLUS_MONTHLY_YUAN, PLUS_YEARLY_YUAN } from "./pricing-copy";

const yuan = (value: number) => `¥${value}`;

export type LandingFaqItem = { question: string; answer: string };

export const LANDING_FAQ: readonly LandingFaqItem[] = [
  {
    question: "需要自己准备 API Key 吗？",
    answer:
      "需要。微伴不自带模型额度，你在自己的模型服务商处充值，把 API Key 填进来即可。模型调用费用由服务商按官方价目表收取，本站只收消息中转的 credits——两笔账分开，各自可核。",
  },
  {
    question: "免费版有额度吗？会过期吗？",
    answer: `免费版永久免费，每天赠送 ${DAILY_CREDIT_DEFAULTS.free} credits，可绑定 ${WECHAT_LINK_LIMITS.free} 个微信链接、安装 ${PLUGIN_LIMITS.free} 个插件。每日额度当天有效，用不完不累积。`,
  },
  {
    question: "Plus 多少钱？比免费版多什么？",
    answer: `Plus ${yuan(PLUS_MONTHLY_YUAN)}/月或 ${yuan(PLUS_YEARLY_YUAN)}/年，每天 ${DAILY_CREDIT_DEFAULTS.plus} credits、${WECHAT_LINK_LIMITS.plus} 个微信链接、插件数量不限，并解锁图片、文件与语音附件。`,
  },
  {
    question: "支持哪些模型？",
    answer:
      "任何兼容 OpenAI Chat Completions、OpenAI Responses 或 Anthropic Messages 协议的服务地址都可以接入，常见的是 DeepSeek、Claude 与 GPT 系列。同一个微信里可以按需切换，不用换号。",
  },
  {
    question: "从注册到在微信里聊上，要几步？",
    answer:
      "四步：注册账号 → 添加模型渠道（填 API Key 与模型名）→ 扫码连接微信 → 直接在微信里对话。全程不用写代码，配置过程在文档中心有逐步截图。",
  },
  {
    question: "API Key 和聊天记录存在哪？",
    answer:
      "API Key 加密存在服务端，只在向你的服务商发起请求时使用，不会下发到浏览器；聊天记录归属于你的账号，可随时在会话记录中删除。具体范围见隐私政策。",
  },
] as const;
