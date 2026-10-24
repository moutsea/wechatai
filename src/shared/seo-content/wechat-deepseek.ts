import type { SeoPage } from "../seo-pages";

export const wechatDeepseekPage: SeoPage = {
  path: "/wechat-deepseek",
  kind: "tutorial",
  title: "微信接入 DeepSeek：托管聊天与本机 Agent 对比",
  description:
    "在微信里用 DeepSeek，可以选择微伴托管聊天，或在本机运行 OpenClaw。这篇对比两者的配置与费用，并说明微信 ClawBot 的绑定步骤。",
  eyebrow: "DeepSeek × 微信",
  h1: "微信接入 DeepSeek：先选路，再配置",
  lede: "DeepSeek 便宜、中文好，是微信 AI 最常见的默认模型。真正麻烦的不是模型配置，而是「用哪种方式把它接进微信」。",
  answer:
    "在微信里用 DeepSeek，可以把 API Key 配进微伴，由微伴托管普通聊天；也可以在自己的设备上运行 OpenClaw，再接到微信。两者都可以使用 DeepSeek API，区别在于运行和维护由谁负责。微伴的微信连接仍通过 ClawBot 插件完成，不能绕过该入口。",
  primaryKeyword: "微信接入 DeepSeek",
  secondaryKeywords: [
    "微信 deepseek 怎么用",
    "微信接入 deepseek 教程",
    "deepseek 微信 机器人",
    "微信 用 deepseek api",
  ],
  highlights: ["托管聊天与本机 Agent 对比", "先配模型，再连接微信", "常见报错与处理"],
  sections: [
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
      body: `不管选哪条路，第一步都一样：

1. 登录 DeepSeek 开放平台，创建一个 API Key。
2. 记下接口地址与模型名（DeepSeek 官方接口兼容 OpenAI Chat Completions 协议）。
3. 充入少量余额。DeepSeek 按 token 计费，日常问答的花费通常很低。

使用微伴时，按这个顺序配置：

1. 打开[渠道与模型](/app/channels)，点击「添加渠道」，服务商选择「DeepSeek」，填写 API Key 并保存。官方地址与 OpenAI Chat Completions 协议会自动填好。第三方地址请选择「自定义（第三方渠道 / 其他协议）」，按服务商文档填写地址、协议和密钥。
2. 新建预设渠道后会尝试自动导入模型，请检查渠道卡片的文本模型列表。自定义渠道可点击「获取可用模型」；获取失败或没有所需模型时，点击「添加模型」，填写服务商提供的模型 ID。
3. 点击文本模型行的闪电图标「测试连接」。系统会发送固定测试请求，无需手动输入消息；测试正常扣除 credits，上游 API 也可能计费。
4. 确认模型可用后，到「连接微信」生成二维码。打开微信「设置」，在「功能」分组进入「插件 → 微信 ClawBot → 扫一扫」绑定，随后发送 \`/wx status\` 确认当前模型。

获取模型失败时，渠道仍可能已保存，可以手动添加模型后再测试。逐字段说明见 [渠道与模型](/docs/channels-models)。`,
    },
    {
      id: "byok-or-platform",
      title: "DeepSeek 值得自带 Key，还是买平台额度",
      body: `DeepSeek 的单价在主流模型里偏低，这让「自带 Key」与「买平台额度」的差距不像贵价模型那么悬殊，但结构上的差别依然存在：

- **自带 Key**：你按 DeepSeek 官方价目表付费，用多少付多少；换模型（比如临时切到 Claude 处理长文）不需要换工具。
- **平台额度**：省去开通步骤，但模型选择被平台限制，且积分与人民币之间隔了一层换算。

一个务实的判断标准：**如果你一个月问不到几十句话**，平台的低门槛更划算；**如果你每天都在用，或者已经有一个在用的 Key**，自带 Key 长期更省，也更自由。完整的取舍分析见 [自带 API Key 的微信 AI](/bring-your-own-api-key)。`,
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
- **群消息总结**：把一段聊天记录粘过去让它提炼结论。
- **配合 DS Chat 联网**：配置自己的搜索 API 后，模型按需要搜索或阅读网页，也可以直接回答；进入插件不代表每条回复都已联网核验。
- **配合个人助理**：记事、记账、待办、定时提醒这些结构化任务，用便宜模型就够。

如果某次需要读一整份长文档或看代码，先用 \`/wx models\` 查看当前渠道的编号，再用 \`/wx model 编号\` 切到更合适的模型；跨渠道时先发 \`/wx channels\`，再用 \`/wx channel 编号\` 切换渠道。旧记录保留，但各模型继续自己的活动会话，上下文不会自动互通，请在目标会话里重新提供需要处理的材料。`,
    },
  ],
  faq: [
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
        "模型可以是同一个，差别在入口与附加能力。微信里能直接用语音、转发消息、挂插件（联网问答、生图、助理、提醒），但界面不如网页版适合长文编辑。",
    },
    {
      question: "接入 DeepSeek 要花钱吗？",
      answer:
        "模型调用按 DeepSeek 官方价目表计费，由你的账户余额扣除。若使用微伴，另有按消息文字量计算的 credits 成本；免费版每天赠送 100 credits，日常问答通常够用。",
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
  updatedAt: "2026-10-24",
};
