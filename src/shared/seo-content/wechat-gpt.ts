import type { SeoPage } from "../seo-pages";

export const wechatGptPage: SeoPage = {
  path: "/wechat-gpt",
  kind: "tutorial",
  title: "微信接入 GPT：不部署开源项目也能用",
  description:
    "在微信里用 GPT，可以部署 CowAgent（原 chatgpt-on-wechat）等开源项目，也可以用微伴托管消息转发。本文介绍自带 API Key 的配置与扫码绑定步骤。",
  eyebrow: "GPT × 微信",
  h1: "微信接入 GPT：跳过部署这一步",
  lede: "在微信里使用 GPT，可以自己部署接入服务，也可以交给微伴托管。先按你是否需要改代码、维护服务来选择。",
  answer:
    "把 GPT 接进微信有两种常见做法：部署 CowAgent（原 chatgpt-on-wechat）等开源项目，或在微伴配置模型服务商提供的 API Key，由微伴转发消息。CowAgent 与微伴都支持官方微信通道扫码接入，主要差别在服务由谁部署和维护。",
  primaryKeyword: "微信 接入 GPT",
  secondaryKeywords: [
    "微信 怎么接入ChatGPT",
    "微信 chatgpt 机器人",
    "chatgpt-on-wechat 替代",
    "openai api 微信",
  ],
  highlights: ["不用部署、不用服务器", "OpenAI 两种协议都支持", "可接自建中转地址"],
  sections: [
    {
      id: "two-ways",
      title: "自建服务与微伴托管怎么选",
      body: `| | 自建 CowAgent（原 chatgpt-on-wechat） | 微伴托管普通聊天 |
| --- | --- | --- |
| 需要服务器 | 需要（云主机或常开电脑） | 不需要 |
| 需要懂运维 | 需要（进程守护、升级、日志） | 不需要 |
| 微信接入 | 官方微信 API，扫码授权 | 微信 ClawBot 官方插件通道，扫码授权 |
| 准备工作 | 安装项目、配置模型与微信通道 | 配置渠道与模型、扫码绑定 |
| 可控性 | 高，可改代码 | 中，配置层面可调 |

自建适合需要改代码、接自己的数据库或添加工具的人，也需要自己维护进程、升级和日志。微伴托管普通聊天则省去这些部署工作，仍由你选择模型服务商和管理 API 余额。

CowAgent 当前的微信接入使用官方 API，见 [项目接入文档](https://docs.cowagent.ai/channels/weixin)。**自建不等于使用非官方协议，扫码也不是托管服务独有的功能。** 选择时应分别看接入通道、可定制程度和维护责任。`,
    },
    {
      id: "key",
      title: "关于 OpenAI Key 的两个现实问题",
      body: `**第一，Key 从哪来。** OpenAI 官方接口对部分地区有访问限制，实际使用中常见三种做法：官方直连（需要可用的网络环境）、使用官方授权的中转服务、或换用兼容 OpenAI 协议的其它厂商。三者都可以填进微伴的渠道，只是地址不同。

**第二，协议选哪个。** OpenAI 现在有两套接口：

- **Chat Completions**（\`/v1/chat/completions\`）：最通用，兼容实现最多。
- **Responses**（\`/v1/responses\`）：新接口，支持内置工具与会话状态，部分代理服务尚未实现。

使用 OpenAI 官方服务时，在「服务商」中选择「OpenAI」，微伴会预填 Responses 协议和官方地址。使用第三方地址或其他协议时，选择「自定义（第三方渠道 / 其他协议）」，按服务商文档填写协议与 Base URL，并检查页面上的实际请求地址预览。

> 提醒：模型费用始终由你的 API 服务商结算，微伴不转售 token，也不承诺模型在国内可直接访问。`,
    },
    {
      id: "steps",
      title: "配置步骤",
      body: `1. **拿到 API Key**：在模型服务商控制台创建密钥，确认可用模型和余额；使用第三方服务时，同时记下它提供的 Base URL 与协议。
2. **添加渠道**：打开[渠道与模型](/app/channels)，点击「添加渠道」。官方服务选择「OpenAI」并填写 API Key；第三方地址选择「自定义（第三方渠道 / 其他协议）」，填写渠道名称、协议、Base URL 和 API Key，再保存。
3. **确认文本模型**：新建服务商预设渠道后会尝试自动导入模型，请检查渠道卡片中的文本模型列表。自定义渠道可点击「获取可用模型」；如果获取失败或没有所需模型，点击「添加模型」，按服务商文档填写模型 ID。
4. **测试连接**：有文本模型后，点击该模型行的闪电图标「测试连接」。系统会发送固定测试请求，无需自己输入消息；测试会消耗少量 credits，并可能产生上游 API 费用。
5. **扫码绑定微信**：确认模型可用后，在「连接微信」生成二维码；打开微信「设置」，在「功能」分组进入「插件 → 微信 ClawBot → 扫一扫」，扫码确认。
6. **在微信里验证**：发「你好」，再发 \`/wx status\` 看当前模型、\`/wx balance\` 看 credits。

模型列表获取失败不代表渠道没有保存，也不一定代表模型无法调用；可以先手动添加服务商确认支持的模型，再测试连接。测试报错时核对 Key、地址、协议、模型 ID 和余额；测试成功但微信没有回复时，再检查微信链接状态及当前使用的模型。`,
    },
    {
      id: "extras",
      title: "装完之后，GPT 在微信里能多做什么",
      body: `GPT 的工具调用生态比较成熟，配上微伴的插件能覆盖几类常见需求：

- **联网问答**：配置自己的搜索 API 后，DS Chat 由模型判断是否需要搜索或阅读网页，也可以直接回答。进入插件不代表每条回复都已联网核验。
- **生图**：AI 生图插件支持用你自己的画图模型，把 prompt 发在微信里直接出图。
- **Agent 接入**：OpenClaw、Hermes 这类 Agent 可以接进微信，任务结果主动推送到聊天窗口。
- **提醒推送**：自己的服务通过 HTTP Webhook 把订单、告警、任务结果推到微信，这条推送不扣 credits。

先发 \`/wx plugins\` 查看配置的别名，再用 \`/use 别名\` 切换插件（例如 \`/use ds\`），回普通聊天发 \`/exit\`。这里使用快捷别名，不是插件的显示名称。完整清单见 [微信 AI](/wechat-ai#what-you-can-do)。`,
    },
    {
      id: "compare",
      title: "该选 GPT、Claude 还是 DeepSeek",
      body: `不追求「最好的模型」，追求「最合适的组合」：

- **GPT**：生态最全、工具调用成熟，适合要联网、要函数调用、要与第三方服务打通的场景。
- **Claude**：长文与代码阅读更稳，适合读文档、改代码。
- **DeepSeek**：中文顺、价格低，适合当默认模型处理日常问答与写作。

务实做法是 **DeepSeek 打底 + 需要时切**：日常对话用便宜的，遇到长文或复杂推理再切到 GPT / Claude。先用 \`/wx models\` 查看当前渠道的模型编号，再用 \`/wx model 编号\` 切换；跨渠道时先用 \`/wx channels\` 查看编号，再用 \`/wx channel 编号\` 切换渠道。

切换后会继续目标模型最近的活动会话，没有则新建。旧会话保留，但当前上下文不会自动带到新模型；需要它继续处理的材料，请在目标会话中重新提供。

具体对比见 [微信 AI 的几种接入方案](/wechat-ai-options)。`,
    },
  ],
  faq: [
    {
      question: "微信接入 GPT 一定要部署开源项目吗？",
      answer:
        "不一定。部署 CowAgent（原 chatgpt-on-wechat）等项目适合需要改代码、自己管理服务的人；如果只想在微信里对话，可以让微伴托管消息转发，无需自己部署服务器。两种方式都可以通过官方微信通道扫码接入。",
    },
    {
      question: "没有 OpenAI 账号能接 GPT 吗？",
      answer:
        "可以接兼容 OpenAI 协议的其它服务商，地址与模型名换成该服务商的即可。也可以接你自己的网关或中转，只要它能提供 /v1/chat/completions 或 /v1/responses 接口。",
    },
    {
      question: "自建服务和使用托管服务，哪个更容易封号？",
      answer:
        "不能仅按自建或托管判断。CowAgent 和微伴都支持官方微信通道；其他方案应核对具体接口、是否改动客户端，以及平台的使用规则。扫码不代表所有服务都采用相同协议，任何第三方服务也无法保证账号绝不受限。",
    },
    {
      question: "GPT 的回答能带联网搜索吗？",
      answer:
        "可以。配置 DS Chat 的回答模型和你自己的搜索 API 后，模型会按需要搜索或阅读网页，也可能直接回答。进入 DS Chat 不代表每次都会联网；普通模型聊天不会自动启用 DS Chat 的搜索能力。",
    },
    {
      question: "一个 Key 能同时给微信和别的工具用吗？",
      answer:
        "能，但用量会合并计费、也难分辨来源。建议按用途分别创建 Key，出问题时好定位，也方便单独吊销。",
    },
  ],
  related: [
    { label: "在微信里使用 Claude", href: "/wechat-claude" },
    { label: "在微信里使用 DeepSeek", href: "/wechat-deepseek" },
    { label: "微信 ClawBot 支持哪些模型", href: "/wechat-clawbot-models" },
    { label: "微信用 AI 会不会封号", href: "/wechat-ai-ban-risk" },
    { label: "自带 API Key 的微信 AI", href: "/bring-your-own-api-key" },
    { label: "渠道与模型配置", href: "/docs/channels-models" },
    { label: "价格与免费额度", href: "/pricing" },
  ],
  updatedAt: "2026-10-24",
};
