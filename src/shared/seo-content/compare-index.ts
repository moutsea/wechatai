import type { SeoPage } from "../seo-pages";

export const compareIndexPage: SeoPage = {
  path: "/compare",
  kind: "comparison",
  title: "微信 AI 对比：微伴与三类方案",
  description:
    "微伴与微信官方内置 AI、开源自建 OpenClaw、其他商业微信 AI 平台三类方案对比：价格、自备 Key、群聊、设备在线与部署要求。",
  eyebrow: "微信 AI × 三类方案",
  h1: "微信 AI 对比：先看三类方案再选",
  lede: "微信 AI 有三类做法：微信官方内置 AI、自建 OpenClaw 等 Agent、其他商业微信 AI 平台。微伴是把自选模型接入微信单聊的第三方服务，普通聊天和小薇需自备模型 API Key，接入已有 OpenClaw 沿用 Agent 的模型配置。",
  answer:
    "微信 AI 有三类做法：微信官方内置 AI、自建 OpenClaw 等 Agent、其他商业微信 AI 平台。微伴是其中把自选模型接进微信单聊的一类：普通聊天和小薇需自备模型 API Key，接入已有 OpenClaw 沿用 Agent 的模型配置，只支持 ClawBot 单聊。",
  primaryKeyword: "微信 AI 对比",
  secondaryKeywords: ["微信 AI 助手哪个好", "微伴对比"],
  highlights: ["三对比较各自独立成页", "缺失字段明确标注", "不把运维成本算成零"],
  sections: [
    {
      id: "vs-official",
      title: "对比微信官方内置 AI：先看能不能换模型",
      body: `微信官方内置 AI 不需要自备 Key，模型、额度与资费由微信维护，用户不能替换模型。要指定模型、使用插件或接入自己的 Agent，再考虑微伴这类第三方接入。逐项对照见[微伴 vs 微信官方内置 AI](/compare/wechatai-vs-wechat-official-ai)。`,
    },
    {
      id: "vs-openclaw",
      title: "对比自建 OpenClaw：把运行和维护算进成本",
      body: `自建 OpenClaw 需要自己部署并保持运行设备在线；本地推理不产生模型 API 费，使用云 API 时另按服务商规则计费，设备与维护成本仍然存在。日常问答可用微伴托管聊天，需要访问本机文件、运行本机命令或接入自定义工具时再考虑自建。逐项对照见[微伴 vs 自建 OpenClaw](/compare/wechatai-vs-openclaw)。`,
    },
    {
      id: "vs-commercial",
      title: "对比商业微信 AI 平台：费用和模型归谁管",
      body: `商业微信 AI 平台通常代管模型与计费，按平台积分或套餐收费，模型范围受平台上架列表限制。微伴普通聊天和小薇需自备模型 API Key，平台中转费与模型费分开核对。逐项对照见[微伴 vs 商业微信 AI 平台](/compare/wechatai-vs-commercial-wechat-ai)。`,
    },
  ],
  faq: [
    {
      question: "这三类微信 AI 方案怎么选？",
      answer:
        "只要微信自带的基础问答，选官方内置；需要指定模型、插件或接入自己的 Agent，选微伴这类第三方接入；需要访问本机文件、运行本机命令或接入自定义工具，再自建 OpenClaw；不想接触 Key 且接受平台给定的模型列表，可选商业平台。",
    },
    {
      question: "微伴需要自备 API Key 吗？",
      answer:
        "普通聊天和小薇需要模型 API Key；接入已有 OpenClaw 沿用 Agent 的模型配置，无需另配微伴模型渠道。使用云 API 才涉及服务商费用，本地推理不产生模型 API 费。",
    },
    {
      question: "微伴支持群聊吗？",
      answer:
        "不支持。微伴只处理你与微信 ClawBot 的单聊消息，没有群聊开关。OpenClaw 与商业平台的群聊能力没有统一的公开口径，本站不写成支持或不支持。",
    },
    {
      question: "用微伴需要一直开着电脑吗？",
      answer:
        "普通模型聊天不需要；接入自建 Agent 时需要，Agent 进程与运行设备由你自己维护。",
    },
  ],
  related: [
    { label: "微信 AI 的几种接入方案对比", href: "/wechat-ai-options" },
    { label: "微信用 AI 会不会封号", href: "/wechat-ai-ban-risk" },
  ],
  updatedAt: "2026-11-20",
};
