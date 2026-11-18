import type { SeoPage } from "../seo-pages";

export const wechatKimiPage: SeoPage = {
  path: "/wechat-kimi",
  kind: "tutorial",
  title: "微信接入 Kimi：用 KimiSeek 一键导入",
  description:
    "想在微信里用 Kimi？通过微伴的 KimiSeek 一键导入关联账号，自动导入渠道和模型，再扫码绑定微信。文内说明导入步骤、模型核对与两笔费用。",
  eyebrow: "Kimi × 微信",
  h1: "微信接入 Kimi：从 KimiSeek 一键导入开始",
  lede: "不必先找 API Key，也不用自己搭桥接。关联 KimiSeek 后，微伴会导入渠道并尝试同步模型，剩下的是核对模型和绑定微信。",
  answer:
    "在微信里使用 Kimi，可以在微伴的「渠道与模型」里选择 KimiSeek 一键导入：完成账号关联后，系统自动导入渠道并尝试同步模型，无需手动填写 API Key。确认所需模型已导入后，再通过微信 ClawBot 扫码绑定即可在单聊中使用。模型费用由 KimiSeek 按其账单结算，微伴 credits 单独计量。",
  primaryKeyword: "微信 接入 Kimi",
  secondaryKeywords: [
    "微信 使用 kimi",
    "kimi 微信 机器人",
    "kimiseek 一键导入",
    "kimi api 微信",
    "微信 kimi 教程",
  ],
  highlights: ["KimiSeek 一键导入", "无需手动填写 Key", "模型列表以同步结果为准"],
  sections: [
    {
      id: "kimi-and-kimiseek",
      title: "Kimi 是模型，KimiSeek 是导入渠道",
      body: `Kimi 是月之暗面的模型系列；KimiSeek 是微伴提供的一键关联入口，负责把渠道配置和模型列表带进来。两者不是同一个东西：

- **Kimi** 决定对话能力、上下文和可用功能，具体型号以你账号实际可调用的列表为准。
- **KimiSeek** 负责关联账号、导入渠道与同步模型。关联完成后，微伴里出现的是一个普通渠道，后续可以像其他渠道一样查看、测试和切换模型。

把 Kimi 接进微信，实际要做的是：先让微伴拿到一个可用的 Kimi 渠道，再把微伴连接到微信。KimiSeek 一键导入只是把第一步变短，不会替你开通微信入口，也不能绕过 ClawBot 的扫码绑定。`,
    },
    {
      id: "import-steps",
      title: "三步完成导入与绑定",
      body: `1. **发起关联**：打开[渠道与模型](/app/channels)，点击「添加渠道」，再点击「服务商」旁的 **kimiseek 一键导入**。按新打开的页面提示完成 KimiSeek 账号关联。
2. **核对模型**：回到微伴渠道页，系统会自动导入渠道并尝试同步模型。检查所需 Kimi 模型是否在文本模型列表中；若没有，先点「获取可用模型」，仍缺失时按 KimiSeek 的文档手动添加模型 ID。
3. **测试并绑定微信**：通过模型行的闪电图标「测试连接」，确认能返回结果；再进入连接微信生成二维码，从微信「设置 → 功能 → 插件 → 微信 ClawBot → 扫一扫」完成绑定。

测试连接会消耗微伴 credits，上游也可能计费。绑定后先发 \`/wx status\` 核对当前渠道与模型。不匹配时，用 \`/wx channels\` 查看渠道编号、用 \`/wx channel 编号\` 选渠道，再用 \`/wx models\` 查看模型编号、用 \`/wx model 编号\` 选模型。确认渠道与模型正确后，再发一句「你好」；文字聊天不必先配置搜索、生图或其他插件。`,
    },
    {
      id: "models-and-cost",
      title: "模型要自己核对，费用分两笔",
      body: `一键导入解决的是配置，不是可用性承诺：

- **模型是否可用**：取决于 KimiSeek 账户状态、导入结果和具体模型。页面不会预置一份固定清单，因为同步结果会随账号和平台调整；以「获取可用模型」返回的列表和你实际的测试结果为准。
- **模型费用**：由 KimiSeek 按其账户与账单结算。充值金额和计费口径以 KimiSeek 页面为准，微伴不代收模型费用。
- **中转费用**：微伴按实际计量的输入、输出 tokens 收取 credits，与所选模型品牌无关。两笔费用分开核对，不能把 credits 余额当成模型余额。
- **关联动作**：仅关联账号不会产生模型调用，也不扣微伴 credits；实际发消息或测试连接才会计量。

没有你的真实用量和 KimiSeek 报价，无法判断 Kimi 是否比别的模型更便宜。需要估算时，用 [费用估算](/pricing#estimate) 填入查到的单价和预计用量，再与账单对照。`,
    },
    {
      id: "diagnose",
      title: "导入后不回复，按顺序排查",
      body: `| 现象 | 先检查 | 处理 |
| --- | --- | --- |
| 渠道里没有模型 | 同步是否完成、账户是否有可用模型 | 点「获取可用模型」；仍为空则按 KimiSeek 文档手动添加模型 ID |
| 测试连接失败 | Key、模型 ID、账户余额 | 按错误提示逐项核对；不要用模型自我介绍判断型号 |
| 微信发消息没有回复 | 当前渠道与模型、微信绑定状态 | 先用测试连接确认微伴侧可用，再发 \`/wx status\` 查看当前配置 |
| 回复很快中断 | 输入输出上限、消息长度 | 在模型设置里调整上限；长材料分段发送 |

如果微信里找不到 ClawBot 入口，绑定这一步无法完成，微伴也没有绕过方法。先用[接入条件检查](/wechat-clawbot)确认入口，再决定是否继续配置。

换模型时，先用 \`/wx models\` 查看当前渠道的模型编号，再用 \`/wx model 编号\` 切换；跨渠道先发 \`/wx channels\` 查看编号。旧会话记录保留，但上下文不会自动转到新模型。`,
    },
  ],
  faq: [
    {
      question: "用 KimiSeek 导入 Kimi，还需要自己准备 API Key 吗？",
      answer:
        "不需要手动填写。完成 KimiSeek 账号关联后，微伴会自动导入渠道并尝试同步模型。若同步结果缺少所需模型，可以点「获取可用模型」，仍缺失时按 KimiSeek 文档手动添加模型 ID，再测试连接。",
    },
    {
      question: "KimiSeek 一键导入会直接扣费吗？",
      answer:
        "关联账号本身不会发起模型调用，也不扣微伴 credits。实际费用分两笔：模型调用由 KimiSeek 按其账户与账单结算；微伴按实际输入、输出 tokens 收取 credits。充值或购买前请在 KimiSeek 页面确认金额与计费口径。",
    },
    {
      question: "导入后模型列表是空的怎么办？",
      answer:
        "先确认关联已完成，再点「获取可用模型」重试。仍为空时，可能是账户没有该模型权限或平台未返回列表，按 KimiSeek 的文档确认模型 ID 后手动添加，并用「测试连接」验证。不要凭模型名称猜测可用性。",
    },
    {
      question: "已经在用 Kimi 官方 API，还能接进微信吗？",
      answer:
        "可以。添加渠道时选择「Kimi（月之暗面）」预设，填入自己的 API Key，保存后同步或手动添加模型，再测试连接并扫码绑定微信。这条路径不经过 KimiSeek，模型费用直接由月之暗面按你的账户结算。",
    },
    {
      question: "Kimi 能和 Claude、GPT 同时配置吗？",
      answer:
        "能。它们可以是同一账号下的不同渠道或模型。先用 /wx channels 查看渠道编号并切换，再用 /wx models 和 /wx model 编号选择模型。各模型继续自己的活动会话，旧记录保留但上下文不会自动互通。",
    },
  ],
  related: [
    { label: "微信 ClawBot 支持哪些模型", href: "/wechat-clawbot-models" },
    { label: "在微信里使用通义千问", href: "/wechat-qwen" },
    { label: "在微信里使用 GLM", href: "/wechat-glm" },
    { label: "自带 API Key 的微信 AI", href: "/bring-your-own-api-key" },
    { label: "模型服务商与接入方式", href: "/docs/model-providers" },
    { label: "渠道与模型配置", href: "/docs/channels-models" },
  ],
  updatedAt: "2026-11-18",
};
