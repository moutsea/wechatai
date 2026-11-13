/**
 * 首页问答与 FAQPage 结构化数据共用的事实源。
 * 价格与额度来自共享常量，教程链接在可见回答后展示。
 */
import { DAILY_CREDIT_DEFAULTS } from "./credits";
import { PLUGIN_LIMITS } from "./plugin-access";
import { WECHAT_LINK_LIMITS } from "./wechat-links";
import { PLUS_MONTHLY_YUAN, PLUS_YEARLY_YUAN } from "./pricing-copy";

const yuan = (value: number) => `¥${value}`;

export type LandingFaqItem = {
  question: string;
  answer: string;
  guide: { href: string; label: string };
};

export const LANDING_FAQ: readonly LandingFaqItem[] = [
  {
    question: "需要自己准备 API Key 吗？",
    answer:
      "普通模型聊天和小薇需要在微伴配置自己的模型 API Key，模型费用另付服务商。接入已有 Muse、Hermes 或 OpenClaw，沿用各自的模型配置；只接收服务通知则不需要模型 Key。",
    guide: { href: "/docs/channels-models", label: "查看 API Key 与模型配置教程" },
  },
  {
    question: "免费版有额度吗？会过期吗？",
    answer: `有。免费版永久免费，每天赠送 ${DAILY_CREDIT_DEFAULTS.free} credits，支持 ${WECHAT_LINK_LIMITS.free} 个微信连接、${PLUGIN_LIMITS.free} 个插件配置。每日赠额当天有效，用不完不累积；模型 API 费用另付服务商。`,
    guide: { href: "/pricing#estimate", label: "估算自己的每日用量" },
  },
  {
    question: "Plus 多少钱？比免费版多什么？",
    answer: `Plus ${yuan(PLUS_MONTHLY_YUAN)}/月或 ${yuan(PLUS_YEARLY_YUAN)}/年，每天 ${DAILY_CREDIT_DEFAULTS.plus} credits、${WECHAT_LINK_LIMITS.plus} 个微信连接，插件配置不限，支持图片与文件输入，还可启用小薇 AI 云端助手。小薇需配置模型，模型 API 费用另付；月付与年付权益相同，单次购买，不自动续费。`,
    guide: { href: "/docs/cloud-agent", label: "了解小薇能做什么与使用条件" },
  },
  {
    question: "支持哪些模型？",
    answer:
      "支持接入 DeepSeek、Claude、GPT，以及 Kimi、通义千问、MiniMax 等模型，在同一个微信里按需切换。可使用官方或兼容渠道，具体可用模型取决于服务商和你的 API Key；图片、工具等能力也需模型与渠道支持。",
    guide: { href: "/docs/channels-models", label: "查看支持的渠道与模型配置" },
  },
  {
    question: "从注册到在微信里聊上，要几步？",
    answer:
      "普通聊天分三步：配置模型、扫码连接微信、发送消息。开始前先确认微信有 ClawBot 入口并准备好 API Key；手机浏览时，用电脑或另一台设备展示二维码。已有 Agent 可按对应指南连接，无需另配本站模型。",
    guide: { href: "/docs/getting-started", label: "跟着入门教程开始" },
  },
  {
    question: "可以先不注册，看看界面上有什么吗？",
    answer:
      "可以。公开教程有配置步骤和真实界面截图，无需注册即可阅读；首页的对话、任务和扫码展示是功能示意。注册与扫码无需模型 Key，普通聊天和小薇执行任务前再配置模型。",
    guide: { href: "/docs/getting-started", label: "先看配置步骤与界面" },
  },
  {
    question: "API Key 和聊天记录存在哪？",
    answer:
      "API Key 加密保存在微伴服务端，用于向你配置的服务商发起请求，不会下发到浏览器。聊天记录归属于你的账号；免费版不能在网页查看历史正文，但可以删除会话。删除微伴记录不会删除微信或服务商的副本。",
    guide: { href: "/privacy", label: "查看隐私政策与数据处理范围" },
  },
] as const;
