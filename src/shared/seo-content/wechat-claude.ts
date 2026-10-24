import type { SeoPage } from "../seo-pages";

export const wechatClaudePage: SeoPage = {
  path: "/wechat-claude",
  kind: "tutorial",
  title: "微信接入 Claude：不装 Claude Code 也能用",
  description:
    "把 Claude 接进微信，不需要装 Claude Code，也不需要搭桥接服务。用 Anthropic Messages 协议填一个 API Key，扫码就能在微信里对话。",
  eyebrow: "Claude × 微信",
  h1: "微信接入 Claude：绕开桥接的那条路",
  lede: "搜「微信 接入 Claude」，出来的大多是给 Claude Code 做桥接的方案。如果你只是想在微信里和 Claude 说话，那是绕远了。",
  answer:
    "在微信里使用 Claude 有两种做法：一是给 Claude Code 做桥接，需要本机常开并维护；二是直接用 Claude 的 API Key 通过 Anthropic Messages 协议接入微信，扫码绑定即可，不需要电脑常开。后者更适合只想在微信里对话的人。",
  primaryKeyword: "微信 接入 Claude",
  secondaryKeywords: [
    "微信 使用 claude",
    "claude 微信 机器人",
    "claude api 微信",
    "微信 claude 教程",
  ],
  highlights: ["不需要 Claude Code", "Anthropic Messages 协议直连", "长文场景优势明显"],
  sections: [
    {
      id: "two-roads",
      title: "桥接 Claude Code，和直接接 API，是两件事",
      body: `桥接方案是在自己的设备上运行 Claude Code，再用桥接程序转发微信消息。这需要保持运行设备在线，并维护 Claude Code 和桥接程序；设备关机或休眠时无法处理新任务。

第二种是很多人没想到的：Claude 本身提供 API，只要用 **Anthropic Messages 协议**填一个 Key，就能把模型接进微信。模型在服务端跑，与你的电脑是否在线无关。

两者的区别可以用一句话概括：**桥接是把「工具」接进微信，直连是把「模型」接进微信**。如果你需要 Claude 读写本地文件、跑命令，前者才有意义；如果只是对话、总结、写代码片段，后者够用且省事。

> 说明：Claude Code CLI 可以通过支持的 Claude 订阅登录，也可以使用 Anthropic Console 的 API Key，后者按 API 用量计费，并非必须单独购买订阅。Claude 聊天订阅不包含独立 API 额度；微伴调用 Claude API 时需要你自己的 API Key。可用登录方式见 [Claude Code 官方说明](https://code.claude.com/docs/en/overview)。`,
    },
    {
      id: "why-claude",
      title: "什么场景下 Claude 比其他模型更值",
      body: `Claude 的单价通常高于 DeepSeek 一类模型，把它当日常聊天主力并不经济。它更值得用的场景是：

- **长文档理解**：丢一整篇论文、合同、需求文档进去做结构化总结，不易漏细节。
- **代码阅读与改造**：让它在上下文里读懂一段陌生代码，再提出改动方案。
- **写作的语感**：长段落的行文连贯性较好，适合需要通篇一致的长文。
- **不容易被带偏**：在需要严格按格式输出时更稳。

对应的做法是「按需切换」：默认用便宜的模型，遇到长文或复杂推理时，用 \`/wx models\` 查看编号，再用 \`/wx model 编号\` 切到 Claude。若 Claude 在另一渠道，先发 \`/wx channels\`，再用 \`/wx channel 编号\` 切换渠道。

各模型会继续自己最近的活动会话，没有则新建。旧聊天记录保留，但上下文不会自动转给 Claude；请在切换后发送需要处理的材料。`,
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

- **先把文档变成文字**：截图里的文字模型读不了，需要先转成文本（或让模型读图片，附件功能需要 Plus）。
- **分段喂**：一次贴太长会触及输入上限，按章节分几次发，让它在同一会话里累积上下文。
- **明确输出格式**：例如「用三级标题 + 要点列表，不超过 500 字」，比「总结一下」有用得多。
- **善用会话**：用 \`/wx new\` 为每份文档开独立会话，避免和别的任务串味。

如果经常做这件事，值得把输出上限调高一些 —— 长输出消耗的 credits 更多（输出按 8 倍权重计入），这一点在 [会员与 credits](/docs/credits) 里有算法说明。`,
    },
    {
      id: "cost",
      title: "成本：Claude 会比 DeepSeek 贵多少",
      body: `具体倍数取决于你选的型号与输入输出比例，不同时期价格也会调整，所以这里不给绝对值，只给结构：

- **模型费用**：由 Anthropic（或其授权渠道）按 token 计费，中文长文通常输入远大于输出。
- **中转费用**：微伴按消息文字量计 credits，与模型品牌无关 —— 也就是说，用 Claude 时微伴这一侧的成本和用 DeepSeek 时一样。
- **输出更贵**：无论哪个模型，输出都按 8 倍权重计入 credits，长回答比长问题消耗更快。

结论是：**用 Claude 的主要成本在模型侧，不在中转侧**。想让成本可控，最好的办法是把 Claude 放在「需要时才用」的位置，而不是设为默认。`,
    },
  ],
  faq: [
    {
      question: "在微信里用 Claude 需要装 Claude Code 吗？",
      answer:
        "不需要。直接使用 Claude 的 API Key，通过 Anthropic Messages 协议接入即可。Claude Code 是编程工具，只有当你要它读写本地文件、执行命令时，才需要走桥接方案。",
    },
    {
      question: "Claude 的订阅能直接当 API 用吗？",
      answer:
        "不能。Claude 的订阅（Pro/Max）面向聊天客户端与 Claude Code，API 是独立计费的产品，需要单独在控制台创建 Key 并充值。",
    },
    {
      question: "微信里能发图片给 Claude 看吗？",
      answer:
        "可以，图片与文件属于附件功能，需要 Plus。语音需要微信转写为文字后才能处理；没有附带转写时请改发文字。",
    },
    {
      question: "Claude 和 DeepSeek 能同时配置吗？",
      answer:
        "能。分别配置渠道和模型后，先用 /wx channels 查看渠道编号，用 /wx channel 编号切换渠道，再用 /wx models 和 /wx model 编号选择模型。各模型继续自己的活动会话，上下文不会自动互通。",
    },
    {
      question: "通过第三方中转访问 Claude 安全吗？",
      answer:
        "取决于该中转是否可信：你的消息与 Key 都会经过它。选择时看它是否加密存储 Key、是否公开说明转发路径。若在意，请使用 Anthropic 官方地址。",
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
  updatedAt: "2026-10-24",
};
