/**
 * 首页「常见问题」。这是唯一事实源：landing 页渲染它，`src/shared/seo.ts` 的
 * FAQPage 结构化数据也从这里生成，避免结构化数据和页面上写的不一致。
 *
 * 回答里的价格与额度不要手写具体数字，用常量拼，防止改价后文案漂移。
 */
import { DAILY_CREDIT_DEFAULTS } from "./credits";
import { PLUGIN_LIMITS } from "./plugin-access";
import { WECHAT_LINK_LIMITS } from "./wechat-links";
import {
  PLUS_MONTHLY_YUAN,
  PLUS_YEARLY_YUAN,
  OWN_API_COST_NOTE,
  CLOUD_AGENT_COST_NOTE,
} from "./pricing-copy";

const yuan = (value: number) => `¥${value}`;

export type LandingFaqItem = { question: string; answer: string };

export const LANDING_FAQ: readonly LandingFaqItem[] = [
  {
    question: "需要自己准备 API Key 吗？",
    answer: `普通模型聊天需要自己的 API Key；只收 Webhook 通知不需要，已有 OpenClaw、Hermes 在其运行端配置模型。${OWN_API_COST_NOTE}${CLOUD_AGENT_COST_NOTE}`,
  },
  {
    question: "免费版有额度吗？会过期吗？",
    answer: `免费版永久免费，每天赠送 ${DAILY_CREDIT_DEFAULTS.free} credits，可绑定 ${WECHAT_LINK_LIMITS.free} 个微信链接、安装 ${PLUGIN_LIMITS.free} 个插件。每日额度当天有效，用不完不累积。`,
  },
  {
    question: "Plus 多少钱？比免费版多什么？",
    answer: `Plus ${yuan(PLUS_MONTHLY_YUAN)}/月或 ${yuan(PLUS_YEARLY_YUAN)}/年，每天 ${DAILY_CREDIT_DEFAULTS.plus} credits、${WECHAT_LINK_LIMITS.plus} 个微信链接、插件数量不限，并解锁图片与文件输入。带微信转写文字的语音，Free 也能使用；没有转写时，任何套餐都无法读取原始语音。`,
  },
  {
    question: "支持哪些模型？",
    answer:
      "微伴实现 OpenAI Chat Completions、OpenAI Responses 和 Anthropic Messages 三种协议适配；具体模型、工具与附件仍需逐项测试，常见的是 DeepSeek、Claude 与 GPT 系列。同一个微信里可以按需切换，不用换号。",
  },
  {
    question: "从注册到在微信里聊上，要几步？",
    answer:
      "先确认手机微信已有 ClawBot 入口，再注册并扫码绑定。聊模型或运行 Plus 云端助手小薇需配置文本模型；已有 Muse、Hermes、OpenClaw 可按各自指南配对，无需另配本站模型。使用 Agent 前发送 /use 快捷名。只收通知则发送 /wx help 后配置消息提醒 Token。",
  },
  {
    question: "可以先不注册，看看界面上有什么吗？",
    answer:
      "可以。公开文档提供配置步骤与界面截图，无需注册即可阅读；首页的对话、任务和扫码展示均为功能示意。注册与扫码无需模型 Key；普通聊天和小薇执行任务前需配置模型，已有外部 Agent 或只收通知无需另配本站模型。",
  },
  {
    question: "API Key 和聊天记录存在哪？",
    answer:
      "API Key 加密存在服务端，只在向你的服务商发起请求时使用，不会下发到浏览器；聊天记录归属于你的账号；Free 网页不可查看历史正文，但仍可删除会话，删除平台记录不等于删除微信或服务商的副本。具体范围见隐私政策。",
  },
] as const;
