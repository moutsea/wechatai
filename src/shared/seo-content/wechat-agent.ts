import type { SeoPage } from "../seo-pages";

export const wechatAgentPage: SeoPage = {
  path: "/wechat-agent",
  kind: "product",
  title: "微信接入 Agent：让 AI 主动给你发消息",
  description:
    "把 Agent 接进微信，和把模型接进微信是两回事。这篇讲清 ClawBot 通道、OpenClaw 与 Hermes 的接法、定时任务与主动推送，以及多 Agent 并存。",
  eyebrow: "Agent × 微信",
  h1: "把 Agent 接进微信，而不只是模型",
  lede: "模型等你提问，Agent 会自己干活。接进微信之后，差别体现在一件事上：任务完成后，它会主动发消息给你。",
  answer:
    "使用微伴接入 OpenClaw 或 Hermes 时，Agent 在你自己的设备上运行，微伴负责把微信消息转发给它，再把结果送回聊天窗口。微信连接需要通过 ClawBot 插件扫码绑定。普通模型聊天由微伴托管，但本机 Agent 仍需要设备持续在线。",
  primaryKeyword: "微信 接入 agent",
  secondaryKeywords: ["微信 ai agent", "微信 接入 智能体", "openclaw 微信", "hermes 微信"],
  highlights: ["定时任务与主动推送", "支持多个 Agent 并存", "Agent 侧费用与 credits 分开"],
  steps: [
    {
      title: "在本机跑起 Agent",
      text: "按 OpenClaw 或 Hermes 的文档安装，先用它自带的命令行验证能跑通一次任务。",
    },
    {
      title: "接到微信",
      text: "先在微伴配置渠道和文本模型，通过微信 ClawBot 扫码连接微信，再到 Agent 插件生成连接命令，在 Agent 所在设备执行。",
    },
    {
      title: "验证主动推送",
      text: "让 Agent 创建一个定时任务，并说明把结果发回当前对话，等它自己发来。",
    },
  ],
  sections: [
    {
      id: "agent-vs-model",
      title: "Agent 和「接个模型」差在哪",
      body: `把模型接进微信，得到的是一个会聊天的联系人：你问，它答。

把 Agent 接进微信，得到的是一个**有工具、有记忆、会自己行动**的执行者：

- 它能读写文件、跑命令、调用 API —— 具体能做什么由你给它配的工具决定。
- 它能被定时触发，不需要你先说话。
- 它能主动把结果发回微信，而不是等你来问。

因此判断要不要接 Agent，标准不是「回答质量」，而是**你手上有没有需要自动跑的任务**：定时汇总、监控告警、批量处理、长期跟进。没有这类需求时，接模型就够了，Agent 只会增加运维负担。`,
    },
    {
      id: "paths",
      title: "Agent 放在电脑还是服务器上",
      body: `OpenClaw 和 Hermes 都需要你安装并运行。微伴负责微信消息转发，不提供这两个 Agent 的云端托管。你可以按使用习惯选择运行设备：

| | 自己的电脑 | 自己部署的服务器 |
| --- | --- | --- |
| 运行位置 | 电脑上的 Agent 进程 | 服务器上的 Agent 进程 |
| 电脑关机后 | 无法执行任务，等待电脑恢复在线 | 服务器和 Agent 持续在线时仍可执行 |
| 可访问的文件与工具 | 电脑上授权的文件和工具 | 服务器上授权的文件和工具 |
| 维护工作 | 自己安装、升级并保持进程运行 | 自己安装、升级并维护服务器 |

需要处理电脑上的文件，可以在电脑上运行；需要持续接收任务，可以部署到常开的服务器。微伴的普通模型聊天无需你的电脑在线，但接入 OpenClaw 或 Hermes 后，运行 Agent 的设备仍需在线。

**在本机执行不等于消息只留在本机。** 通过微伴接入时，请求原文与最终回复会经过微信和微伴，微伴会暂存待执行请求；并非只转发摘要。Agent 使用云端模型或外部工具时，相关内容还会发送给你配置的服务商。文件放在哪里、工具在哪执行，与消息经过哪些服务是两回事，具体处理方式见 [隐私政策](/privacy)。

在实际运行 Agent 的设备上执行连接命令，步骤分别见 [OpenClaw 接入指南](/developers/openclaw) 与 [Hermes 接入指南](/developers/hermes)。需要自己写适配器时，可参考 [插件协议](/developers/plugins)。`,
    },
    {
      id: "push",
      title: "主动推送：Agent 接进微信最有价值的部分",
      body: `模型只能被动回答，Agent 能主动找你 —— 这是接进微信之后体验差别最大的一处。

典型的三种用法：

1. **定时任务**：每天早上让 Agent 汇总一次待办、跑一次数据、抓一次价格变化，把结果发到微信。做法是在 Agent 侧建任务，并说明「把结果发回当前对话」。
2. **后台结果回传**：长任务不需要一直守着。你切到别的插件也不影响它，任务完成后结果会带着来源标记发回来。
3. **事件告警**：你自己的服务通过 HTTP Webhook 把订单、异常、构建结果推到微信。这条推送**不扣 credits**，适合高频事件的低成本触达。Webhook 的用法见 [消息提醒](/docs/notifications)。

OpenClaw 与 Hermes 的主动推送需要开启「接收定时任务和后台结果推送」，并保持 Agent 所在设备和进程在线。设备离线时无法执行新任务或产生新结果，恢复在线后才能继续处理；消息提醒 Webhook 是独立通道，不依赖本机 Agent。`,
    },
    {
      id: "multi",
      title: "一个微信里放多个 Agent",
      body: `同时接多个 Agent 是常见需求：一个负责工作、一个负责生活、一个专门跑爬虫。微伴的做法是给每个 Agent 起不同的快捷名，并用补丁式调用区分：

- 用 \`/use 快捷名\` 切换当前 Agent，之后的消息都交给它。
- 用 \`@快捷名 任务\` 临时调用一次，不切换当前插件。
- 用 \`/exit\` 回到普通模型聊天。
- 用 \`/wx status\` 查看当前在哪个插件里。

免费版可绑定 1 个微信链接，Plus 可绑 10 个，适合把工作号和生活号彻底分开。多 Agent 的详细配置见 [在微信里使用多个 OpenClaw](/docs/multiple-openclaw-in-wechat)。`,
    },
    {
      id: "cost",
      title: "费用：Agent 内部调用算谁的",
      body: `这是最容易误解的一处，明确说清：

- **微伴 credits**：只计算本次发进插件的文字与最终回复，主动推送只计输出。Agent 内部调用模型多少次，微伴不重复计量。
- **Agent 内部的模型费用**：由你自己的 API 服务商按量收取。Agent 跑得越复杂，这部分越高 —— 它可能一次任务里调用几十次模型。
- **插件设置里的输入输出上限**：控制的是微信这一侧传入和返回的文字量，不限制 Agent 内部的模型用量。

所以「Agent 很贵」通常贵在模型侧，而不是中转侧。想控成本，优先优化 Agent 的任务设计，而不是纠结 credits。`,
    },
  ],
  faq: [
    {
      question: "微信接入 Agent 需要一直开着电脑吗？",
      answer:
        "需要运行 Agent 的设备持续在线。如果 OpenClaw 或 Hermes 装在你的电脑上，关机或休眠后就无法执行任务；需要电脑关机后仍可用，应把 Agent 部署到持续在线的服务器。微伴提供消息中转，不托管这两个 Agent；仅接入中转服务无法让离线的 Agent 继续工作。",
    },
    {
      question: "普通用户需要接 Agent 吗？",
      answer:
        "多数情况下不需要。如果只是问答、翻译、写作、生图，接一个模型加插件就够了。Agent 的价值在于自动执行任务与主动推送，适合有明确自动化需求的用户。",
    },
    {
      question: "Agent 能主动给我发消息吗？",
      answer:
        "能。在 Agent 侧创建定时任务或长任务，并说明把结果发回当前对话，同时确认插件设置里「接收定时任务和后台结果推送」已开启。即使你切换到了别的插件，结果仍会送达。",
    },
    {
      question: "能同时接多个 Agent 吗？",
      answer:
        "能。给每个 Agent 起不同快捷名，用 /use 切换、用 @快捷名 临时调用。Plus 支持绑定 10 个微信链接，可把不同用途彻底分开。",
    },
    {
      question: "Agent 内部调用模型会重复扣 credits 吗？",
      answer:
        "不会。微伴只计算发进插件的文字与最终回复，主动推送只计输出。Agent 内部多次调用模型的费用由你的模型服务商单独收取。",
    },
  ],
  related: [
    { label: "OpenClaw 接入指南", href: "/developers/openclaw" },
    { label: "Hermes 接入指南", href: "/developers/hermes" },
    { label: "在微信里使用多个 OpenClaw", href: "/docs/multiple-openclaw-in-wechat" },
    { label: "消息提醒 Webhook", href: "/docs/notifications" },
    { label: "微信 AI 的几种接入方案对比", href: "/wechat-ai-options" },
    { label: "插件协议与开发文档", href: "/developers/plugins" },
  ],
  updatedAt: "2026-10-24",
};
