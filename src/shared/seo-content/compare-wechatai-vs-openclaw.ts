import type { SeoPage } from "../seo-pages";
import { DAILY_CREDIT_DEFAULTS } from "../credits";
import { PLUS_MONTHLY_YUAN, PLUS_YEARLY_YUAN } from "../pricing-copy";

export const wechataiVsOpenclawPage: SeoPage = {
  path: "/compare/wechatai-vs-openclaw",
  kind: "comparison",
  title: "微伴 vs 自建 OpenClaw：运行、维护与成本",
  description:
    "对比微伴托管聊天与开源自建 OpenClaw：是否要自备 Key、设备是否常开、要不要部署、群聊与费用差异。写不出的字段留空并注明，不编造数据。",
  eyebrow: "微伴 × OpenClaw",
  h1: "微伴 vs 自建 OpenClaw：把运行和维护也算进成本",
  lede: "日常对话可用微伴托管聊天。服务经运营方开放后，Plus 会员可用云端小薇把发来的材料生成 Word，无需自行部署。需要访问本机文件、运行本机命令或接入自定义工具时，再考虑自建 OpenClaw。",
  answer:
    "微伴托管普通模型聊天，不需要你的设备常开，平台按 credits 计费，模型 API 费用另付；自建 OpenClaw 需要自己部署并保持运行设备在线，本地模型只算运行与维护成本，使用云 API 时另算服务商费用。微伴不托管 OpenClaw 进程；需要访问本机文件、运行本机命令或接入自定义工具时，再考虑自建 OpenClaw。",
  primaryKeyword: "微伴 OpenClaw 对比",
  secondaryKeywords: [
    "OpenClaw 微信 自建",
    "微伴和OpenClaw区别",
    "OpenClaw 需要一直开着电脑吗",
    "微信 Agent 托管还是自建",
  ],
  highlights: ["托管与自建逐项对照", "缺失字段明确标注", "不把运维成本算成零"],
  comparison: {
    title: "五项事实对照",
    columns: ["维度", "微伴 Wechatai", "自建 OpenClaw 直连"],
    rows: [
      {
        label: "价格",
        values: [
          `Free 每天 ${DAILY_CREDIT_DEFAULTS.free} credits；Plus ¥${PLUS_MONTHLY_YUAN}/月或 ¥${PLUS_YEARLY_YUAN}/年；模型 API 费用另付服务商`,
          "本地推理不产生模型 API 费；使用云 API 时另按服务商规则计费。两种方式都要算设备或托管与维护成本；开源软件按项目许可证使用",
        ],
      },
      {
        label: "是否需自备 Key",
        values: [
          "普通聊天和小薇需要模型 API Key；接入已有 OpenClaw 沿用 Agent 的模型配置，无需微伴模型渠道",
          "本地 Ollama 无需真实服务商凭据；云 API 按服务商要求使用 Key 或账号",
        ],
      },
      {
        label: "是否支持群聊",
        values: ["不支持，仅 ClawBot 单聊", null],
      },
      {
        label: "是否需设备在线",
        values: ["普通模型聊天不需要；接入自建 Agent 时需要", "需要，运行 Agent 的设备必须持续在线"],
      },
      {
        label: "是否需自行部署",
        values: [
          "普通聊天无需自行部署；自建 OpenClaw 或 Hermes 由用户自行部署和维护；接入已有托管 Muse 需配置 hook，但无需自行部署",
          "需要，自行安装、配置并维护",
        ],
      },
    ],
    note:
      "标记为「—」的字段没有找到可公开核实的来源，不代表对方不支持；价格、许可证与可用范围以项目及服务商当前公开说明为准。",
  },
  sections: [
    {
      id: "hosted-vs-selfhosted",
      title: "先分清：托管聊天与自建 Agent 的分工",
      body: `微伴的普通模型聊天跑在微伴服务端：你填 Key、扫码绑定，微信消息由中转服务转发给模型，不需要自己的电脑一直开机。它不托管 OpenClaw，也不会替你在本机执行命令。

自建 OpenClaw 则相反：Agent 进程、工具、文件访问和运行环境都在你这里。微信只是入口，设备关机或休眠后任务就无法执行；要持续可用，就得部署到常开的电脑或服务器。

日常问答可用微伴托管聊天。服务经运营方开放后，Plus 会员可用[云端小薇](/docs/wechat-ai-assistant)把发来的材料生成 Word，无需自行部署。需要访问本机文件、运行本机命令或接入自定义工具时，再考虑自建 Agent。托管聊天与自建 Agent 可以共用一个微信链接，用命令切换，见[把 Agent 接进微信](/wechat-agent)。`,
    },
    {
      id: "five-facts",
      title: "五项事实：Key、部署、设备与群聊",
      body: `最容易被低估的是**设备在线**。微伴普通聊天不需要你的电脑常开；自建 OpenClaw 需要一台持续运行的环境，本机、云主机或托管服务器都算成本。

**部署**同样要计入：安装运行时、配置模型与工具、处理依赖升级、看日志、设置进程守护，都是持续投入。微伴只负责中转，不替你维护 OpenClaw。

**自备 Key** 取决于模型跑在哪：微伴普通聊天要求填写模型服务商的 API Key；自建 OpenClaw 连接[本地 Ollama](https://docs.openclaw.ai/providers/ollama/setup)运行本地模型时不需要真实服务商凭据，接云 API 时按服务商要求配置 Key 或账号。群聊能力没有找到统一的公开口径，因此表中留空，不能当作「不支持」。`,
    },
    {
      id: "cost",
      title: "成本不止模型费：把设备和维护列出来",
      body: `自建都要考虑设备或云主机以及维护时间。本地模型不产生模型 API 费用，但硬件、电费、带宽和运维时间仍是成本；使用云 API 时，还要按服务商的资费计算模型调用。只比较模型 token 单价会漏掉运行和维护成本。

微伴的成本是 credits 加模型费：Free 每天 ${DAILY_CREDIT_DEFAULTS.free} credits，Plus 为 ¥${PLUS_MONTHLY_YUAN}/月或 ¥${PLUS_YEARLY_YUAN}/年，模型调用另付服务商。credits 只抵扣中转费，不等于模型免费。

在[费用估算器](/pricing#estimate)填入每轮输入与输出 tokens、每日轮数，工具会自动估算微伴的 credits 用量；另填服务商的输入与输出单价，可估算模型 API 费用。比较时，自建侧另算设备和维护成本，只有使用云 API 才计服务商费用。`,
    },
    {
      id: "when-hosted",
      title: "什么时候只用微伴",
      body: `满足这些条件时，自建 OpenClaw 通常是过度配置：

- 主要在微信里问答、写作、翻译、整理粘贴的文字。
- 不需要读写本地文件、执行命令或调用自建工具。
- 不想维护 Agent 进程、依赖与日志。
- 希望设备关机后仍能收到模型的文字回复。

这类需求用微伴托管普通聊天即可，先确认微信有 ClawBot 入口，再按[ClawBot 绑定说明](/wechat-clawbot)配置。注意微伴只支持单聊，不支持群聊。`,
    },
    {
      id: "when-openclaw",
      title: "什么时候值得自建 OpenClaw",
      body: `需要下面这些能力时，托管聊天就不够了：

- **本地文件与命令**：让 Agent 读项目文件、跑脚本、处理本机资料。
- **自定义工具链**：接入自己的 API、数据库或内部系统。
- **可控运行环境**：自己决定模型、依赖版本、日志与数据存放位置。
- **定时与后台任务**：需要进程持续在线执行，而不是一问一答。

代价是你要对可用性负责：设备休眠、进程崩溃、依赖升级失败都会让微信侧没有响应。已有 OpenClaw 想接入微伴 Channel 时，按[OpenClaw 接入指南](/developers/openclaw)配置；Agent 仍由你自己运行。`,
    },
    {
      id: "together",
      title: "两者可以一起用，不必二选一",
      body: `常见做法是保留微伴托管聊天作为默认入口，需要访问本机文件、运行本机命令或接入自定义工具时再切到自建 OpenClaw。日常问答不依赖你的设备。

切换前要确认两边使用的是哪个模型、上下文是否互通，以及出问题时从哪里看日志。自建 Agent 的回复失败不会由微伴代为执行，平台也不托管 Agent 进程；把责任边界写清楚，比单纯比较价格更重要。多 Agent 的配置方法见[在微信里接入多个 OpenClaw](/docs/multiple-openclaw-in-wechat)。`,
    },
  ],
  faq: [
    {
      question: "微伴和 OpenClaw 是替代关系吗？",
      answer:
        "不完全是。微伴提供托管的普通模型聊天与 ClawBot 接入；OpenClaw 是需要自己运行的自建 Agent。只做日常问答可以用微伴，需要本地文件、命令和自定义工具时再自建 OpenClaw。",
    },
    {
      question: "用 OpenClaw 一定要一直开着电脑吗？",
      answer:
        "运行 Agent 的设备必须持续在线，否则微信侧收不到执行结果。可以放在常开的电脑、云主机或服务器上；关机、休眠或进程退出都会让任务不可用。微伴不托管 OpenClaw 进程。",
    },
    {
      question: "微伴能帮我部署 OpenClaw 吗？",
      answer:
        "不能。微伴提供 Channel 接入与配置说明，但安装、运行、升级和排障由你自己负责。具体步骤见 OpenClaw 接入指南；平台不代管你的 Agent 设备。",
    },
    {
      question: "自建 OpenClaw 还需要付微伴 credits 吗？",
      answer:
        "OpenClaw 直连且不经过微伴中转，不产生微伴 credits。本地 Ollama 运行本地模型不产生模型 API 费，但仍有运行和维护成本；使用云 API 时按服务商规则计费。若通过微伴 Channel 接入，微伴 credits 按当前价格页规则另算。",
    },
    {
      question: "两边都支持群聊吗？",
      answer:
        "微伴只处理与微信 ClawBot 的单聊消息，不支持群聊。OpenClaw 的群聊能力取决于具体接入方式与项目实现，本站没有找到统一可核实的口径，因此不写成支持或不支持。",
    },
  ],
  related: [
    { label: "微信接入 Muse 托管助理", href: "/wechat-muse" },
    { label: "把 Agent 接进微信", href: "/wechat-agent" },
    { label: "OpenClaw 接入指南", href: "/developers/openclaw" },
    { label: "微伴 vs 微信官方内置 AI", href: "/compare/wechatai-vs-wechat-official-ai" },
    { label: "微伴 vs 商业微信 AI 平台", href: "/compare/wechatai-vs-commercial-wechat-ai" },
    { label: "微信 AI 的几种接入方案对比", href: "/wechat-ai-options" },
    { label: "价格与免费额度", href: "/pricing" },
  ],
  updatedAt: "2026-11-19",
};
