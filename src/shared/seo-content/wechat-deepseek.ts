import type { SeoPage } from "../seo-pages";

export const wechatDeepseekPage: SeoPage = {
  path: "/wechat-deepseek",
  kind: "product",
  title: "微信里怎么用 DeepSeek？接入方式、费用与教程",
  description:
    "想在微信里使用 DeepSeek？了解 ClawBot 接入条件、API Key、免费额度与模型费用，查看带截图的配置教程，以及联网、语音和不回复的排查方法。",
  eyebrow: "DeepSeek × 微信",
  h1: "想在微信里用 DeepSeek？从这里开始",
  lede: "不用为了问一句话来回切换应用。把自己的 DeepSeek API 接进微信，日常问答、写作和整理都可以在聊天框完成。先确认接入条件，再跟着截图配置。",
  answer:
    "在微信里用 DeepSeek，可以把 API Key 配进微伴，由微伴托管普通聊天；也可以在自己的设备上运行 OpenClaw，再接到微信。两者都可以使用 DeepSeek API，区别在于运行和维护由谁负责。微伴的微信连接仍通过 ClawBot 插件完成，不能绕过该入口。",
  primaryKeyword: "微信里使用 DeepSeek",
  secondaryKeywords: [
    "微信 deepseek 怎么用",
    "微信接入 deepseek 教程",
    "deepseek 微信 机器人",
    "微信 用 deepseek api",
    "微信 deepseek 免费吗",
    "deepseek 微信 助手",
  ],
  highlights: ["普通聊天无需电脑常开", "Free 可开始，模型费用另计", "附截图教程与排查指引"],
  ctaLabel: "查看 DeepSeek 微信教程",
  ctaHref: "/docs/deepseek-in-wechat",
  sections: [
    {
      id: "start-here",
      title: "先回答你最关心的四个问题",
      body: `| 你的问题 | 使用微伴接入时的答案 |
| --- | --- |
| 微信里面能用 DeepSeek 吗？ | 可以通过微伴把自己的 DeepSeek API 接入微信 ClawBot 单聊；先确认账号有该入口。 |
| 要下载软件或一直开电脑吗？ | 普通模型聊天在微伴服务端中转，不需要自己的电脑常开；选择本机 Agent 才需要在线设备。 |
| 免费吗？ | 微伴 Free 每天有 100 credits 中转额度；DeepSeek API 由服务商另行计费，不是免费模型额度。 |
| 从哪里开始？ | 已有 Key 且微信有入口，直接看[带截图的配置教程](/docs/deepseek-in-wechat)；找不到入口，先看[ClawBot 检查说明](/wechat-clawbot)。 |

微伴是多模型接入工具，DeepSeek 是其中一种选择。使用后仍可配置 Claude、GPT 或其他兼容模型，按需要切换；不同模型的会话上下文不会自动互通。`,
    },

    {
      id: "three-paths",
      title: "托管聊天和本机 Agent 怎么选",
      body: `| | 微伴托管普通聊天 | 本机 OpenClaw 接入 |
| --- | --- | --- |
| 需要自己的设备常开 | 不需要 | 需要 |
| 需要安装 Agent | 不需要 | 需要 |
| 需要维护什么 | 渠道配置与 API 余额 | 还需维护 Agent、工具与连接器 |
| 适合谁 | 主要想在微信里对话 | 需要读写文件、执行工具与自动化任务 |

两者都可以配置 DeepSeek API Key。**ClawBot 是微信侧的通道**，不是与微伴互斥的另一种聊天服务；使用微伴时，同样需要从微信 ClawBot 的「扫一扫」绑定。

选择本机 OpenClaw，意味着需要自己的设备持续在线；选择微伴托管普通聊天，模型请求由微伴服务端转发，无需你的电脑常开。若通过微伴连接本机 OpenClaw，Agent 仍在你自己的设备运行。`,
    },
    {
      id: "key",
      title: "先拿到 Key，再选路径",
      body: `普通聊天需要有效 API Key 和服务商余额；本机 Agent 还需要在线设备和已运行的 Agent。两条路径都要先确认微信 ClawBot 入口可用。

确定选择微伴托管聊天后，进入 [DeepSeek 操作教程](/docs/deepseek-in-wechat)：按字段添加渠道、检查模型、测试连接，再绑定微信并发送第一条消息。本文用于选型，逐步操作与报错处理放在教程中。

请核对 [DeepSeek 官方 API 文档](https://api-docs.deepseek.com/zh-cn/) 中的地址、模型和价格；测试请求也可能产生服务商费用。`,
    },
    {
      id: "byok-or-platform",
      title: "DeepSeek 值得自带 Key，还是买平台额度",
      body: `自带 Key 可以独立管理服务商账户与账单；平台额度可能减少配置步骤。两者的总成本取决于实际模型、输入输出量、缓存、套餐和额度有效期，不能由使用频率直接推导。

你可以用 [费用估算器](/pricing#estimate) 分开计算微伴 credits 与自己填写的模型单价，再与其他方案的同等用量报价比较。没有统一口径的价格数据时，不承诺哪种方式更便宜。`,
    },
    {
      id: "config",
      title: "配置完不回复：DeepSeek 场景下最常见的四类问题",
      body: `| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 提示 401 / 鉴权失败 | Key 复制时多了空格，或已被删除 | 重新创建 Key，注意首尾不要带空格 |
| 提示模型不存在 | 模型名与平台文档不一致 | 按服务商文档逐字核对模型名 |
| 提示余额不足 | 服务商账户余额为 0 | 充值后重试，注意与微伴的 credits 是两笔账 |
| 一直没有返回 | 协议选错（把 Anthropic 协议用在 OpenAI 兼容服务上） | 改为 OpenAI Chat Completions 后重试 |

补充两个容易忽略的点：**长文一次发太多会超出输入上限**，可以在渠道设置里调整输入输出上限；**附件需要 Plus**，纯文字问答不受影响。更细的排查顺序见 [微信 ClawBot 插件怎么用](/wechat-clawbot#no-reply)。`,
    },
    {
      id: "usage",
      title: "接进微信之后，DeepSeek 适合做什么",
      body: `把 DeepSeek 当默认模型，最顺手的几个场景：

- **随手问答与翻译**：微信里直接发，不需要切换 App。
- **写作与润色**：长一点的段落丢进去改，比在手机上逐句改快。
- **整理粘贴的聊天记录**：手动粘贴你有权处理的文字，让模型提炼结论；本站不接入微信群，也不会自动读取群消息。
- **配合 DS Chat 联网**：配置自己的搜索 API 后，模型按需要搜索或阅读网页，也可以直接回答；进入插件不代表每条回复都已联网核验。
- **配合个人助理**：记事、记账、待办、定时提醒这些结构化任务需配置相应插件，并确认所选模型支持工具调用。

如果某次需要读一整份长文档或看代码，先用 \`/wx models\` 查看当前渠道的编号，再用 \`/wx model 编号\` 切到更合适的模型；跨渠道时先发 \`/wx channels\`，再用 \`/wx channel 编号\` 切换渠道。旧记录保留，但各模型继续自己的活动会话，上下文不会自动互通，请在目标会话里重新提供需要处理的材料。`,
    },
  ],
  faq: [
    {
      question: "微信里怎么使用 DeepSeek？",
      answer:
        "先确认手机微信有 ClawBot 入口，再在微伴添加 DeepSeek 渠道、填写自己的 API Key 并测试模型。随后扫码连接微信，在对应单聊里发送文字。完整步骤和截图见本站 DeepSeek 操作教程。",
    },
    {
      question: "微信没有 ClawBot 入口，还能通过微伴接入吗？",
      answer:
        "暂时不能完成微信绑定。微伴无法替你的账号开放入口，也不提供绕过方法。请先查看微信入口说明，未确认可用前无需付费或提交 API Key；可以先体验首页的模拟预览。",
    },
    {
      question: "接入后能像 DeepSeek 网页版一样联网吗？",
      answer:
        "普通 API 聊天不会自动继承网页版的联网能力。可另外配置 DS Chat 的回答模型与搜索服务；搜索是否执行取决于问题、模型判断及接口可用性，模型和搜索费用另计。",
    },

    {
      question: "微信接入 DeepSeek 需要一直开着电脑吗？",
      answer:
        "取决于接入方式。自建 OpenClaw 需要一台常开的电脑，关机就离线；用中转服务扫码绑定时，模型调用在云端完成，不需要你的电脑在线。",
    },
    {
      question: "DeepSeek 的 API Key 能同时用在多个地方吗？",
      answer:
        "可以，Key 本身不限制只在一个工具里使用。但同一个 Key 的用量会合并计费，出问题时也更难定位来源，建议按用途分开创建。",
    },
    {
      question: "微信里的 DeepSeek 和网页版有什么区别？",
      answer:
        "微信接入使用你配置的 API 模型，不会同步 DeepSeek 网页版账号、会员或历史对话。语音依赖微信附带转写；搜索、生图和个人助理需分别配置，不会自动继承网页版功能。",
    },
    {
      question: "接入 DeepSeek 要花钱吗？",
      answer:
        "模型调用按 DeepSeek 官方价目表计费，由你的账户余额扣除。若使用微伴，另有按消息文字量计算的 credits 成本；免费版每天赠送 100 credits；实际可用轮数取决于输入、输出及历史上下文。",
    },
    {
      question: "可以用 DeepSeek 的推理模型吗？",
      answer:
        "可以，只要该模型通过兼容 OpenAI Chat Completions 的接口提供。推理模型的输出通常更长，会相应消耗更多 credits 与服务商 token。",
    },
  ],
  related: [
    { label: "在微信里使用 DeepSeek（文档教程）", href: "/docs/deepseek-in-wechat" },
    { label: "微信 ClawBot 支持哪些模型", href: "/wechat-clawbot-models" },
    { label: "在微信里使用 Claude", href: "/wechat-claude" },
    { label: "自带 API Key 的微信 AI", href: "/bring-your-own-api-key" },
    { label: "价格与免费额度", href: "/pricing" },
    { label: "渠道与模型配置", href: "/docs/channels-models" },
  ],
  updatedAt: "2026-11-08",
};
