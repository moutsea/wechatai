import type { SeoPage } from "../seo-pages";
import { DAILY_CREDIT_DEFAULTS } from "../credits";
import { PLUS_MONTHLY_YUAN, PLUS_YEARLY_YUAN } from "../pricing-copy";

export const wechataiVsWechatAiPage: SeoPage = {
  path: "/compare/wechatai-vs-wechat-official-ai",
  kind: "comparison",
  title: "微伴 vs 微信官方内置 AI：能力与费用差异",
  description: `对比微伴与微信官方内置 AI：要不要自备 API Key、能不能换模型、是否支持群聊、设备是否常开、费用怎么算。缺失字段明确标注，不猜竞品数据。`,
  eyebrow: "微伴 × 微信官方 AI",
  h1: "微伴 vs 微信官方内置 AI：先分清你要的是哪一类能力",
  lede: "官方内置胜在零配置，微伴胜在模型自选与插件。两者不是同一层服务，先按「能不能换模型」「要不要接自己的 Agent」排除，再比较价格。",
  answer:
    "微信官方内置 AI 由微信提供，模型不可替换，具体能力、额度与资费以微信对应功能说明为准；微伴是第三方 ClawBot 单聊接入服务，需要你自己提供模型 API Key，平台按 credits 计费，模型费用另付服务商。只要微信自带的基础问答，官方内置更省事；需要固定模型、插件或自建 Agent，才考虑微伴。",
  primaryKeyword: "微伴 微信官方 AI 对比",
  secondaryKeywords: [
    "微信自带AI和第三方区别",
    "微信官方AI能换模型吗",
    "微伴值得用吗",
    "微信官方AI收费吗",
  ],
  highlights: ["五项事实逐条对照", "缺失字段明确标注", "价格与站内定价同源"],
  comparison: {
    title: "五项事实对照",
    columns: ["维度", "微伴 Wechatai", "微信官方内置 AI"],
    rows: [
      {
        label: "价格",
        values: [
          `Free 每天 ${DAILY_CREDIT_DEFAULTS.free} credits；Plus ¥${PLUS_MONTHLY_YUAN}/月或 ¥${PLUS_YEARLY_YUAN}/年；模型 API 费用另付服务商`,
          "以微信对应功能说明为准",
        ],
      },
      {
        label: "是否需自备 Key",
        values: ["需要（模型服务商的 API Key）", "不需要"],
      },
      {
        label: "是否支持群聊",
        values: ["不支持，仅 ClawBot 单聊", null],
      },
      {
        label: "是否需设备在线",
        values: ["普通模型聊天不需要；接入自建 Agent 时需要", "否（由微信提供）"],
      },
      {
        label: "是否需自行部署",
        values: ["普通聊天不需要；接入 Agent 时需要", "否"],
      },
    ],
    note:
      "标记为「—」的字段没有找到可公开核实的来源，不代表对方不支持；价格与可用范围以对方当前公开说明为准。",
  },
  sections: [
    {
      id: "not-same-layer",
      title: "先分清：一个是微信自带能力，一个是第三方接入",
      body: `微信官方内置 AI 是微信自己提供的能力，入口、可用范围、免费额度与资费由微信维护，用户不需要自己准备模型 Key，也不能把模型换成别家的。它可以覆盖「偶尔问两句」的需求，但能力边界由平台决定。

微伴是独立第三方服务，做的是把**你自选的模型 API** 接到微信 ClawBot 单聊。它不提供模型额度，也不与微信官方存在隶属关系；注册前仍要确认账号有 ClawBot 入口。两者不是互相替代的同一款产品，比较时应先看需求是否落在官方能力范围内。

如果你还没有决定走哪条路线，先看[微信 AI 的几种接入方案](/wechat-ai-options)，再回到这一页核对官方内置与微伴的差别。`,
    },
    {
      id: "five-facts",
      title: "五项事实：Key、模型、群聊、设备与部署",
      body: `上表只列能公开核实的字段。最关键的差异是 **Key 归谁**：官方内置不需要你准备 API Key，模型与额度由微信管理；微伴需要你自己的模型 Key，模型费用直接付给服务商。

第二项差异是**能不能换模型**。官方内置不可替换模型；微伴支持兼容 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages 协议的模型，具体可用范围取决于你选择的模型服务商与账号权限。

群聊、设备在线与部署三项在官方侧没有找到统一、可引用的公开口径，因此表中留空。不要用「—」推断对方不支持；如果群聊是硬需求，应直接以微信当前功能说明为准，而不是按第三方的二手总结下结论。`,
    },
    {
      id: "price",
      title: "费用怎么算：先把两笔账分开",
      body: `微伴的账分两层：平台按消息文字量收 credits，模型调用费由你的 API 服务商收取。Free 每天赠送 ${DAILY_CREDIT_DEFAULTS.free} credits，Plus 为 ¥${PLUS_MONTHLY_YUAN}/月或 ¥${PLUS_YEARLY_YUAN}/年；赠送额度不包含模型费用。具体规则与算例见[价格与免费额度](/pricing)。

官方内置的收费与免费额度以微信对应功能说明为准，这里不写无法核实的具体数字。比较时不要拿「微伴 Free 的 credits」直接对比「官方免费」：credits 只抵扣中转费，模型 token 仍要另付。

要估算自己的用量，可以用[费用估算器](/pricing#estimate)分别填写平台单价与模型单价，再与官方当前说明对照。没有统一口径的价格数据时，不承诺哪一方更便宜。`,
    },
    {
      id: "official-enough",
      title: "什么情况下官方内置够用",
      body: `满足下面这些条件时，官方内置通常已经够用，不必额外接入第三方：

- 只是偶尔在微信里问问题、做简单总结，不要求指定模型。
- 不需要插件、联网搜索、生图或自己的 Agent。
- 不需要把结果主动推送到微信，也不需要自己管理聊天上下文与存储。
- 接受能力与额度由微信统一调整，不想维护 API Key 与账单。

官方能力也会更新，具体入口和资费请以微信内当前展示为准；第三方文章里的旧截图不能当作现在的承诺。`,
    },
    {
      id: "choose-wechatai",
      title: "什么情况下选微伴",
      body: `出现以下任一需求时，官方内置就满足不了，需要考虑自带 Key 的中转服务：

- **指定模型**：要固定使用某个模型，或在不同模型之间切换。
- **插件与工具**：需要 DS Chat 联网、生图、角色卡、个人助理等插件能力。
- **自建 Agent**：要把 OpenClaw、Hermes 等 Agent 接进微信；微伴提供 Channel，但 Agent 进程仍由你自己运行和维护。
- **账单可控**：希望模型费与平台费分开核对，Key 掌握在自己手里。

代价也要接受：需要自己开通模型服务商、管理 Key 与余额；微伴只支持 ClawBot 单聊，不支持群聊；普通聊天不需要设备常开，接入自建 Agent 后仍需要一台在线的运行环境。`,
    },
    {
      id: "misconceptions",
      title: "三个常见误区",
      body: `**误区一：微伴是微信官方产品。** 不是。微伴是独立维护的第三方接入服务，与微信、腾讯没有官方关联，也不代表微信官方立场。

**误区二：免费 credits 等于模型免费用。** 不等于。credits 只抵扣微伴的中转费用，模型 API 仍由服务商按 token 计费。

**误区三：用了第三方就一定会封号。** 不能这样下结论。账号风险取决于具体接入通道与使用行为，不能只按「官方/第三方」二分。微伴使用微信 ClawBot 官方插件通道，不修改客户端；但仍需遵守平台规则，任何第三方服务都无法保证账号绝不受限。更多说明见[微信用 AI 会不会封号](/wechat-ai-ban-risk)。`,
    },
  ],
  faq: [
    {
      question: "微伴和微信官方内置 AI 是同一个产品吗？",
      answer:
        "不是。微信官方内置 AI 由微信提供；微伴是独立维护的第三方 ClawBot 单聊接入服务，与微信、腾讯没有官方关联，需要用户自备模型 API Key。",
    },
    {
      question: "微伴能换模型，官方内置不能吗？",
      answer:
        "微伴可以接入符合兼容协议的模型，具体范围取决于模型服务商与账号权限；微信官方内置 AI 的模型由平台决定，用户不能替换。官方能力若有调整，以微信当前功能说明为准。",
    },
    {
      question: "微信官方内置 AI 收费吗？",
      answer:
        "官方能力可能包含免费额度，也可能按功能收费，具体以微信对应功能说明为准。本站不写无法核实的固定金额，也不把第三方文章里的旧报价当作当前价格。",
    },
    {
      question: "微伴免费版够用吗？",
      answer: `免费版每天赠送 ${DAILY_CREDIT_DEFAULTS.free} credits，用于抵扣微伴中转费用；模型 API 费用另付服务商。是否够用取决于消息长度、模型输出与历史上下文，可以用价格页的估算器按自己的用量计算。`,
    },
    {
      question: "官方内置能接自己的 Agent 或插件吗？",
      answer:
        "官方内置的能力边界由微信决定，不能替换模型，也不能按第三方插件协议接入自己的 Agent。需要这类能力时，应选择支持自备 Key 与插件的中转服务，并自行核对通道与平台规则。",
    },
  ],
  related: [
    { label: "微信 AI 的几种接入方案对比", href: "/wechat-ai-options" },
    { label: "微伴 vs 自建 OpenClaw", href: "/compare/wechatai-vs-openclaw" },
    { label: "微伴 vs 商业微信 AI 平台", href: "/compare/wechatai-vs-commercial-wechat-ai" },
    { label: "自带 API Key 的微信 AI", href: "/bring-your-own-api-key" },
    { label: "微信 AI：把你的大模型接进微信", href: "/wechat-ai" },
    { label: "价格与免费额度", href: "/pricing" },
  ],
  updatedAt: "2026-11-18",
};
