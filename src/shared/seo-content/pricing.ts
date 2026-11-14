import type { SeoPage } from "../seo-pages";
import { BILLING_OFFERS } from "../billing-offers";
import { DAILY_CREDIT_DEFAULTS } from "../credits";
import { PLUS_MONTHLY_YUAN, PLUS_YEARLY_YUAN, approxYuan } from "../pricing-copy";

const packs = BILLING_OFFERS.filter((offer) => offer.kind === "credits")
  .map((offer) => `¥${offer.amount / 100} / ${offer.credits} credits`)
  .join("、");
const intro =
  "免费版满足日常问答，Plus 解锁更多额度与小薇 AI。模型需自备 API Key，费用另付服务商。";

export const pricingPage: SeoPage = {
  path: "/pricing",
  kind: "pricing",
  title: `价格：免费版每天 ${DAILY_CREDIT_DEFAULTS.free} credits，Plus ¥${PLUS_MONTHLY_YUAN}/月`,
  description: `对比微伴免费版与 Plus：每日额度、微信连接、插件、附件与小薇 AI。免费版每天 ${DAILY_CREDIT_DEFAULTS.free} credits，Plus ¥${PLUS_MONTHLY_YUAN}/月或 ¥${PLUS_YEARLY_YUAN}/年，单次购买，不自动续费。模型 API 费用另付。`,
  eyebrow: "价格与方案",
  h1: "免费开始，按需升级 Plus",
  lede: intro,
  answer: intro,
  primaryKeyword: "微信 AI 价格",
  secondaryKeywords: ["微伴 价格", "微信 ai 收费", "微信 ai 免费额度", "clawbot 收费吗"],
  highlights: [],
  sections: [],
  faq: [
    {
      question: "会员费包含模型费用吗？",
      answer:
        "不包含。会员与 credits 用于微伴的平台服务；普通聊天、生图和小薇使用你配置的模型 API，费用另付模型服务商。已有 Muse、Hermes、OpenClaw 沿用各自的模型与费用配置。",
      guide: { label: "了解模型配置", href: "/docs/channels-models" },
    },
    {
      question: "credits 怎么用？每天的额度会累积吗？",
      answer: `credits 是平台用量额度。文字按输入、输出和历史上下文计量，例如一次 1000 输入 tokens、1000 输出 tokens 约消耗 1.8 credits；生成图片每张另计 5 credits，描述文字另计。免费版每天赠送 ${DAILY_CREDIT_DEFAULTS.free}、Plus 每天 ${DAILY_CREDIT_DEFAULTS.plus} credits，当天有效、不累积。服务通知的 Webhook 推送不扣 credits。`,
      guide: { label: "查看完整计费规则", href: "/docs/credits" },
    },
    {
      question: "额度用完了怎么办？",
      answer: `可以等第二天赠额重置，或单独购买加油包：${packs}。加油包无需 Plus，购买的 credits 长期有效；购买加油包不会解锁 Plus 专属功能。`,
      guide: { label: "前往会员与 credits", href: "/app/billing" },
    },
    {
      question: "Plus 的小薇 AI 能做什么？",
      answer:
        "小薇是在微伴云端运行的助手，可以处理文件、生成文档并执行任务，将结果发回微信。无需自行安装或部署，配置文本模型后即可启用。执行次数、存储额度与服务状态以插件页为准；模型 API 费用另付。",
      guide: { label: "认识小薇与使用条件", href: "/docs/cloud-agent" },
    },
    {
      question: "Plus 多少钱？会自动续费吗？",
      answer: `Plus ¥${PLUS_MONTHLY_YUAN}/月，或 ¥${PLUS_YEARLY_YUAN}/年（折合约 ${approxYuan((PLUS_YEARLY_YUAN * 100) / 12)}/月）。新购买的会员均为单次付费，不自动续费；提前续费会顺延有效期。到期未续费则恢复免费版，已购买的 credits 保留。历史自动续费订阅可在「管理订阅」中取消后续续费。`,
    },
    {
      question: "购买后可以退款吗？",
      answer:
        "如需退款，请提供订单信息联系我们。我们会根据实际订单、使用情况及适用法律处理，具体以服务协议为准。",
      guide: { label: "联系支持", href: "/contact" },
    },
    {
      question: "开始使用前，需要准备什么？",
      answer:
        "先确认手机微信已有 ClawBot 入口，微伴无法替账号开通该入口。普通聊天和小薇还需准备模型 API Key；生图需配置图片模型与插件。手机扫码连接时，可用电脑或另一台设备展示二维码。",
      guide: { label: "查看入门教程", href: "/docs/getting-started" },
    },
  ],
  related: [],
  updatedAt: "2026-11-14",
};
