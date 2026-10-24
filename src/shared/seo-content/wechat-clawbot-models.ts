import type { SeoPage } from "../seo-pages";

export const wechatClawbotModelsPage: SeoPage = {
  path: "/wechat-clawbot-models",
  kind: "product",
  title: "微信 ClawBot 支持哪些模型？通道与模型的关系",
  description:
    "ClawBot 本身不提供模型，也不带 API Key。它支持哪些模型，取决于你绑定哪一端。这篇讲清三种协议、常见组合，以及怎么换模型。",
  eyebrow: "ClawBot × 模型",
  h1: "微信 ClawBot 支持哪些模型？",
  lede: "搜这个问题的人通常在找一份模型清单。真实答案是：ClawBot 没有清单 —— 它是通道，模型在你绑定的那一端。",
  answer:
    "ClawBot 不内置任何模型，也不提供 API Key。它能「支持」哪些模型，取决于你绑定的是什么服务：如果绑定的是自带 Key 的中转服务，则可以接所有兼容 OpenAI Chat Completions、OpenAI Responses 或 Anthropic Messages 协议的模型；如果绑定的是某个封装好的 Agent，则受该 Agent 自身支持范围的限制。",
  primaryKeyword: "微信 ClawBot 支持哪些模型",
  secondaryKeywords: [
    "微信 ClawBot 模型",
    "ClawBot 能用 GPT 吗",
    "ClawBot 需要自己买 API 吗",
    "微信 ClawBot DeepSeek",
  ],
  highlights: ["通道与模型是两层", "三种协议覆盖绝大多数模型", "换模型不用重新绑定"],
  sections: [
    {
      id: "two-layers",
      title: "为什么这个问题没有统一答案",
      body: `「ClawBot 支持哪些模型」之所以各家答案不同，是因为它其实在问两件不同的事：

- **问通道**：ClawBot 这条链路本身对模型有没有限制？答案是几乎没有 —— 它传的是文本，不解析模型品牌。
- **问你绑定的服务**：那个服务支持哪些模型？答案取决于它实现了什么协议、填得进谁的 Key。

所以正确的问题是：**我要绑定的那一端，支持哪些模型？** 微伴这一端的答案是：只要服务商提供三种协议之一，就能接。

这也解释了一个常见困惑：有人在教程里看到「ClawBot 支持 GPT-4o、Claude、DeepSeek」，有人看到「只支持某一家」。两种说法可能都对 —— 它们描述的是各自绑定的服务，不是 ClawBot 本体。`,
    },
    {
      id: "protocols",
      title: "三种协议，覆盖绝大多数模型",
      body: `添加渠道时，选择服务商后会自动填好协议与地址。使用第三方地址或需要更换协议时，选择「自定义（第三方渠道 / 其他协议）」，按服务商文档填写：

| 协议 | 常见适用对象 | 说明 |
| --- | --- | --- |
| OpenAI Chat Completions | DeepSeek、Moonshot、智谱、各类兼容服务 | 最通用的一种，多数国产服务都兼容 |
| OpenAI Responses | OpenAI 新接口、部分代理服务 | 支持内置工具调用与会话状态 |
| Anthropic Messages | Claude 系列、兼容实现 | 长文与代码场景常用 |

判断方法很简单：打开你的 API 服务商文档，看它给的示例是 \`/v1/chat/completions\`、\`/v1/responses\` 还是 \`/v1/messages\`，三者分别对应上表。填错协议是最常见的「配置完不回复」原因。

三种协议的字段差异、输入输出上限设置，[渠道与模型](/docs/channels-models) 里有逐项说明。`,
    },
    {
      id: "combinations",
      title: "常见组合与适合的场景",
      body: `同样是接进微信，选不同模型，体验差别主要在四件事上：中文表达、长文能力、工具调用稳定性、价格。

- **DeepSeek 类**：中文顺、价格低，适合日常问答、写作、翻译。作为默认模型最不容易踩坑，配置见 [在微信里使用 DeepSeek](/wechat-deepseek)。
- **Claude 类**：长文档理解与代码阅读更稳，适合丢一整篇文档进去让它总结，或读代码。见 [在微信里使用 Claude](/wechat-claude)。
- **GPT 类**：生态最全，工具调用成熟，适合需要联网、函数调用的场景。见 [在微信里使用 GPT](/wechat-gpt)。
- **自建 / 中转服务**：只要兼容上述协议就能接，适合已有网关或私有部署的团队。

一个实用做法是**同时配置两个模型**：日常对话用便宜的，遇到长文或复杂推理，先用 \`/wx models\` 查看编号，再用 \`/wx model 编号\` 切换。旧聊天记录会保留，但不会自动把当前上下文交给另一个模型。`,
    },
    {
      id: "switch",
      title: "怎么换模型，以及换模型时会发生什么",
      body: `查看状态、列出模型、切换模型是三个不同的操作：

- **查看当前模型或插件**：\`/wx status\`。
- **查看当前渠道的模型编号**：\`/wx models\`。
- **切换普通模型**：\`/wx model 编号\`，例如 \`/wx model 2\`。
- **切换渠道**：先发 \`/wx channels\` 查看编号，再发 \`/wx channel 编号\`；进入该渠道后，再查看和选择模型。

切换普通模型时，会进入**目标模型最近的活动会话**，没有则新建。旧会话及聊天记录保留，但当前上下文不会自动带到目标模型；需要继续讨论的材料，请在目标会话里重新发送。想使用目标模型开一段空白对话，可以再发 \`/wx new\`。

如果原本在插件中，切换普通模型会**退出插件模式**，不会修改插件配置里的回答模型。想回到插件，先用 \`/wx plugins\` 查看别名，再发 \`/use 别名\`。

这些切换命令本身不扣 credits，也不需要重新绑定微信。切换后可用 \`/wx status\` 确认当前状态。

命令的完整清单见 [微信命令速查](/docs/commands)。`,
    },
    {
      id: "cost",
      title: "模型费用的归属：谁收你的钱",
      body: `这是「ClawBot 支持哪些模型」背后真正的决策问题 —— 不同模式的钱付给谁完全不同：

- **平台卖 token**：你付钱给平台，平台再向模型服务商付钱。方便，但你无法核对单价，也无法换供应商。
- **自带 API Key**：你直接付给模型服务商，按官方价目表结算；微伴只收 credits 用于消息中转计量。透明，且随时可以换一家更便宜的。

两种模式没有绝对优劣：不想管 Key 的人适合前者，在意成本与可替换性的人适合后者。微伴做的是后者，所以本站不卖 token，也不承诺模型免费。`,
    },
  ],
  faq: [
    {
      question: "ClawBot 自带模型吗？",
      answer:
        "不带。ClawBot 是微信侧的接入通道，只负责传递消息。模型由你绑定的服务提供，因此「ClawBot 支持哪些模型」取决于那一端实现了什么协议。",
    },
    {
      question: "用 ClawBot 需要自己买 API Key 吗？",
      answer:
        "取决于你绑定的服务。绑自带 Key 的中转服务时，需要你先在模型服务商开通并拿到 Key；绑平台型服务时，通常由平台代收模型费用，不需要你单独买 Key。",
    },
    {
      question: "能同时接多个模型吗？",
      answer:
        "能。用 /wx models 查看当前渠道的模型编号，再用 /wx model 编号切换；跨渠道先用 /wx channels 和 /wx channel 编号。切换不需要重新绑定微信，但会进入目标模型自己的会话，上下文不会自动互通。",
    },
    {
      question: "ClawBot 支持本地部署的模型吗？",
      answer:
        "只要该模型对外暴露兼容上述三种协议之一的 HTTP 接口，就可以接进来。注意本地模型需要有一个外网可访问的地址，纯局域网地址微伴无法访问。",
    },
    {
      question: "换模型会重新扣 credits 吗？",
      answer:
        "换模型本身不扣 credits。文字聊天按加权 token 计 credits，费率不随模型品牌变化；AI 生图每张 5 credits，描述文字另计。模型调用费用由你的 API 服务商单独收取。",
    },
  ],
  related: [
    { label: "微信 ClawBot 插件怎么用", href: "/wechat-clawbot" },
    { label: "自带 API Key 的微信 AI", href: "/bring-your-own-api-key" },
    { label: "渠道与模型配置（文档）", href: "/docs/channels-models" },
    { label: "在微信里使用 DeepSeek", href: "/wechat-deepseek" },
    { label: "在微信里使用 Claude", href: "/wechat-claude" },
    { label: "价格与免费额度", href: "/pricing" },
  ],
  updatedAt: "2026-10-24",
};
