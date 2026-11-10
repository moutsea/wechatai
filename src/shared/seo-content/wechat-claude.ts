import type { SeoPage } from "../seo-pages";

export const wechatClaudePage: SeoPage = {
  path: "/wechat-claude",
  kind: "tutorial",
  title: "微信接入 Claude：不装 Claude Code 也能用",
  description:
    "把 Claude 接进微信，不需要装 Claude Code，也不需要搭桥接服务。用 Anthropic Messages 协议填一个 API Key，扫码就能在微信里对话。",
  eyebrow: "Claude × 微信",
  h1: "微信接入 Claude：绕开桥接的那条路",
  lede: "在微信里用 Claude，常被理解成必须给 Claude Code 做桥接。如果你只需要在微信里对话，直连 API 是一条更短的路径。",
  answer:
    "在微信里使用 Claude 有两种做法：一是给 Claude Code 做桥接，需要本机常开并维护；二是直接用 Claude 的 API Key 通过 Anthropic Messages 协议接入微信，扫码绑定即可，不需要电脑常开。后者只提供模型对话，不读取本机文件、不执行命令，也不使用 Claude 聊天订阅的额度。",
  primaryKeyword: "微信 接入 Claude",
  secondaryKeywords: [
    "微信 使用 claude",
    "claude 微信 机器人",
    "claude api 微信",
    "微信 claude 教程",
  ],
  highlights: ["不需要 Claude Code", "Anthropic Messages 协议直连", "工具与视觉按模型核对"],
  sections: [
    {
      id: "two-roads",
      title: "桥接 Claude Code，和直接接 API，是两件事",
      body: `桥接方案是在自己的设备上运行 Claude Code，再用桥接程序转发微信消息。这需要保持运行设备在线，并维护 Claude Code 和桥接程序；设备关机或休眠时无法处理新任务。

第二种做法常被忽略：Claude 本身提供 API，只要用 **Anthropic Messages 协议**填一个 Key，就能把模型接进微信。模型在服务端跑，与你的电脑是否在线无关。

两者的区别可以用一句话概括：**桥接是把「工具」接进微信，直连是把「模型」接进微信**。如果你需要 Claude 读写本地文件、跑命令，前者才有意义；如果只是对话、总结、写代码片段，后者够用且省事。

> 说明：Claude Code CLI 可以通过支持的 Claude 订阅登录，也可以使用 Anthropic Console 的 API Key，后者按 API 用量计费，并非必须单独购买订阅。Claude 聊天订阅不包含独立 API 额度；微伴调用 Claude API 时需要你自己的 API Key。可用登录方式见 [Claude Code 官方说明](https://code.claude.com/docs/en/overview)。`,
    },
    {
      id: "why-claude",
      title: "什么任务适合 Claude：先核对四类条件",
      body: `Claude 是一组模型，不是一个固定能力。是否适合你的任务，取决于具体型号和账号权限；先核对下面四类条件，再决定要不要配置：

- **上下文长度**：需要一次读完长文档时，先看该模型 ID 的上下文窗口与最大输出，并对照你设置的输入上限。输入仍受微伴配置与模型窗口限制，必要时按章节分段。
- **本地文件与命令**：读写在你的本机文件、执行命令，需要有相应权限且在线的 Agent 或工具环境（例如桥接 Claude Code）；普通 API 对话不具备本机文件权限，只发送你在微信里输入的文字和附件。
- **图片与文件输入**：附件需要 Plus；只有图片输入要求所选模型支持视觉。TXT、DOCX 和可提取文字的 PDF 会先解析为文字，不要求视觉模型；扫描版 PDF 需要先做文字识别。可发送的文件类型与大小限制见 [图片、文件与语音](/docs/attachments)。
- **费用与账号权限**：按服务商对该模型 ID 的公开单价和你的 token 用量结算，微伴 credits 另计；账号是否可用该模型，以控制台为准。没有你自己的用量与报价，无法判断 Claude 是否比别的模型更贵或更省。

确认这些之后，如果任务确实需要长上下文或代码阅读，可以把 Claude 配成按需切换的模型；日常问答用哪个模型，取决于你核对过的单价与实测效果，不存在对所有账号都成立的默认选择。

切换方式：先用 \`/wx models\` 查看编号，再用 \`/wx model 编号\` 切到 Claude；若 Claude 在另一渠道，先发 \`/wx channels\`，再用 \`/wx channel 编号\` 切换渠道。各模型会继续自己最近的活动会话，没有则新建。旧聊天记录保留，但上下文不会自动转给 Claude；请在切换后发送需要处理的材料。`,
    },
    {
      id: "config",
      title: "配置步骤",
      body: `1. **创建 Key**：在 Anthropic 控制台创建 API Key，确认可用模型和余额。
2. **添加渠道**：打开[渠道与模型](/app/channels)，点击「添加渠道」，服务商选择「Claude（Anthropic）」并填写 API Key，协议与官方地址会自动填好。使用第三方渠道时，选择「自定义（第三方渠道 / 其他协议）」，按服务商文档填写协议、Base URL 和密钥。
3. **确认文本模型**：新建预设渠道后会尝试自动导入模型。检查渠道卡片的文本模型列表；自定义渠道可点击「获取可用模型」。如果获取失败或缺少所需模型，点击「添加模型」，按服务商文档填写模型 ID。
4. **设置上限并测试**：通过模型行的编辑按钮设置输入、输出上限，然后点击闪电图标「测试连接」。系统发送固定测试请求，无需输入消息；测试正常扣除 credits，上游 API 也可能计费。
5. **扫码绑定微信**：确认模型可用后，进入「连接微信」生成二维码；打开微信「设置」，在「功能」分组进入「插件 → 微信 ClawBot → 扫一扫」，扫码确认。
6. **验证**：发一句「你好」，再用 \`/wx status\` 确认当前模型。

官方预设使用 Anthropic Messages 协议。第三方渠道可能提供不同的兼容接口，请按其文档选择协议，并核对页面上的实际请求地址预览。获取模型失败不代表渠道没有保存，可先手动添加模型再测试。`,
    },
    {
      id: "long-context",
      title: "长文场景的实操建议",
      body: `微信里处理长文档，瓶颈往往不是模型，而是输入方式：

- **先把材料变成可用输入**：文档可先发文件（格式与大小限制见 [图片、文件与语音](/docs/attachments)，需 Plus）；截图需要所选模型支持图片输入才能读，纯文本模型读不了，应先转成文字。
- **分段喂**：一次贴太长会触及输入上限，按章节分几次发，让它在同一会话里累积上下文。
- **明确输出格式**：例如「用三级标题 + 要点列表，不超过 500 字」，比「总结一下」有用得多。
- **善用会话**：用 \`/wx new\` 为每份文档开独立会话，避免和别的任务串味。

如果经常做这件事，值得把输出上限调高一些 —— 长输出消耗的 credits 更多（输出按 8 倍权重计入），这一点在 [会员与 credits](/docs/credits) 里有算法说明。`,
    },
    {
      id: "cost",
      title: "成本怎么算：两笔账分开核对",
      body: `具体金额取决于你选的模型 ID、服务商当前价目表、输入输出比例，所以这里不给倍数，只给可核对的结构：

- **模型费用**：由 Anthropic（或其授权渠道）按该模型的 token 单价计费，以服务商账单为准；中文长文通常输入远大于输出。
- **中转费用**：微伴按实际计量的输入、输出 tokens 收取 credits，相同输入输出量适用相同费率，不随模型品牌变化。换模型后，回复长度和历史上下文可能改变，实际消耗也会变化。
- **输出更贵**：无论哪个模型，输出都按 8 倍权重计入 credits，长回答比长问题消耗更快。
- **核对方法**：在服务商后台导出该 Key 的用量与账单，与微信里的消息记录对照，两笔费用分开加总。

比较成本时，要同时核对服务商单价和实际输入输出量。先看 [费用估算](/pricing#estimate)，填入查到的单价和预计用量，再结合实际消耗决定是否设为常用模型；没有你自己的用量与报价时，本站不宣称 Claude 比其它模型更贵或更便宜。`,
    },
  ],
  faq: [
    {
      question: "在微信里用 Claude 需要装 Claude Code 吗？",
      answer:
        "不需要。直接使用 Claude 的 API Key，通过 Anthropic Messages 协议接入即可。本页比较的两种路径里，只有桥接具备本机文件与命令权限；这类操作还需要在线的 Agent 或工具环境，普通 API 对话只处理你发送的文字与附件。",
    },
    {
      question: "Claude 的订阅能直接当 API 用吗？",
      answer:
        "不能。Claude 的订阅（Pro/Max）面向聊天客户端与 Claude Code，API 是独立计费的产品，需要单独在控制台创建 Key 并充值。",
    },
    {
      question: "微信里能发图片给 Claude 看吗？",
      answer:
        "要看具体模型是否支持图片输入：附件功能需要 Plus，且所选模型 ID 必须支持视觉，否则会报错或忽略图片。语音需要微信转写为文字后才能处理；没有附带转写时请改发文字。先用一张图测试，不要按品牌推断。",
    },
    {
      question: "Claude 和 DeepSeek 能同时配置吗？",
      answer:
        "能。分别配置渠道和模型后，先用 /wx channels 查看渠道编号，用 /wx channel 编号切换渠道，再用 /wx models 和 /wx model 编号选择模型。各模型继续自己的活动会话，上下文不会自动互通。",
    },
    {
      question: "通过第三方中转访问 Claude 安全吗？",
      answer:
        "取决于该中转是否可信，以及它是否被服务商条款和你所在地区规则允许：你的消息与 Key 都会经过它。选择时看它是否加密存储 Key、是否公开说明转发路径与运营主体。若在意，请使用 Anthropic 官方地址；本站不建议用任何中转规避地区限制或服务商规则。",
    },
  ],
  related: [
    { label: "微信 ClawBot 支持哪些模型", href: "/wechat-clawbot-models" },
    { label: "在微信里使用 DeepSeek", href: "/wechat-deepseek" },
    { label: "在微信里使用 GPT", href: "/wechat-gpt" },
    { label: "自带 API Key 的微信 AI", href: "/bring-your-own-api-key" },
    { label: "渠道与模型配置", href: "/docs/channels-models" },
    { label: "价格与免费额度", href: "/pricing" },
  ],
  updatedAt: "2026-11-10",
};
