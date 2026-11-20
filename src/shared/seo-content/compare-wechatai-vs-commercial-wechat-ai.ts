import type { SeoPage } from "../seo-pages";
import { DAILY_CREDIT_DEFAULTS, IMAGE_CREDITS } from "../credits";
import { PLUS_MONTHLY_YUAN, PLUS_YEARLY_YUAN } from "../pricing-copy";

export const wechataiVsCommercialPage: SeoPage = {
  path: "/compare/wechatai-vs-commercial-wechat-ai",
  kind: "comparison",
  title: "微伴 vs 商业微信 AI 平台：Key 与费用归属",
  description:
    "对比微伴与商业微信 AI 平台：是否要自备 API Key、模型能否自选、群聊与设备要求、费用怎么算。对方未公开的字段明确留空，不编造报价。",
  eyebrow: "微伴 × 商业平台",
  h1: "微伴 vs 商业微信 AI 平台：费用和模型归谁管",
  lede: "商业平台把模型与中转打包，注册即用；微伴可接入自选模型或已有 Agent。选哪边，取决于你想省配置还是想自主选择模型。",
  answer:
    `商业微信 AI 平台通常代管模型与计费，按平台积分或套餐收费，模型范围受平台上架列表限制。微伴普通聊天和小薇需自备模型 API Key；接入已有 OpenClaw 沿用 Agent 的模型配置，无需另配微伴模型渠道。使用云 API 才涉及服务商费用，本地推理不产生模型 API 费。微伴的文字按输入与输出用量计 credits，生图每张另计 ${IMAGE_CREDITS} credits。想少配置、接受平台报价，选商业平台；想自选模型、分别核对中转费和云 API 费，可考虑微伴。`,
  primaryKeyword: "微伴 商业微信AI平台 对比",
  secondaryKeywords: [
    "微信AI平台哪个好",
    "商业微信AI 收费",
    "微伴和商业平台区别",
    "微信AI 自备Key 还是买套餐",
  ],
  highlights: ["费用归属逐项拆开", "不虚构竞品报价", "迁移成本单独说明"],
  comparison: {
    title: "五项事实对照",
    columns: ["维度", "微伴 Wechatai", "商业微信 AI 平台"],
    rows: [
      {
        label: "价格",
        values: [
          `Free 每天 ${DAILY_CREDIT_DEFAULTS.free} credits；Plus ¥${PLUS_MONTHLY_YUAN}/月或 ¥${PLUS_YEARLY_YUAN}/年；模型 API 费用另付服务商`,
          "平台积分或套餐，按所选平台报价",
        ],
      },
      {
        label: "是否需自备 Key",
        values: [
          "普通聊天和小薇需要模型 API Key；接入已有 OpenClaw 沿用 Agent 的模型配置，无需微伴模型渠道",
          "一般不需要（平台代管）",
        ],
      },
      {
        label: "是否支持群聊",
        values: ["不支持，仅 ClawBot 单聊", null],
      },
      {
        label: "是否需设备在线",
        values: ["普通模型聊天不需要；接入自建 Agent 时需要", null],
      },
      {
        label: "是否需自行部署",
        values: [
          "普通聊天无需自行部署；自建 OpenClaw 或 Hermes 由用户自行部署和维护；接入已有托管 Muse 需配置 hook，但无需自行部署",
          null,
        ],
      },
    ],
    note:
      "标记为「—」的字段没有找到可公开核实的来源，不代表对方不支持；不同商业平台差异很大，价格与能力以你所选平台的当前说明为准。",
  },
  sections: [
    {
      id: "two-models",
      title: "两种收费结构：打包报价 vs 两笔账单",
      body: `商业平台通常把模型调用、中转和界面打包成积分或套餐：注册后按平台规则扣积分，用户不需要自己开模型服务商，也不容易把模型成本与平台服务费拆开核对。

微伴的普通聊天和小薇使用你提供的模型 API Key，云 API 费用另付服务商。接入已有 OpenClaw 不用重复配置模型渠道：Agent 本地推理没有模型 API 费，调用云 API 则按服务商规则计费。微伴的文字按输入（含历史上下文）和输出用量计 credits，生图每张另计 ${IMAGE_CREDITS} credits，描述文字另计。

两种结构没有绝对优劣。用量稳定、希望一张账单解决的人，可能更适合商业平台；要按模型分别核算成本、或需要随时换模型的人，更适合自带 Key 的中转。`,
    },
    {
      id: "five-facts",
      title: "五项事实：Key、模型、群聊、设备与部署",
      body: `商业平台一般代管模型配置，用户不接触 Key；微伴普通聊天和小薇需自备模型 API Key。接入已有 OpenClaw 沿用 Agent 的模型配置，无需另配微伴模型渠道。使用云 API 才涉及服务商费用，本地推理不产生模型 API 费。

**模型范围**也不同：商业平台受其上架列表限制，想用的模型没接入就只能等；微伴支持兼容协议的模型，但具体可用性仍取决于服务商与账号权限。

群聊、设备在线与部署在不同商业平台之间差异很大，本站没有逐个平台核实，因此表中留空。「—」不代表不支持或不需要；如果这些条件会影响选型，请查目标平台的当前文档。`,
    },
    {
      id: "cost",
      title: "怎么比价格才不误导",
      body: `比较时要用同一模型、同等用量和相同时间范围。商业平台的积分与人民币之间可能有一层换算，套餐还可能包含有效期、并发或功能限制；只看「送多少积分」无法判断实际单价。

微伴 Free 每天 ${DAILY_CREDIT_DEFAULTS.free} credits，Plus 为 ¥${PLUS_MONTHLY_YUAN}/月或 ¥${PLUS_YEARLY_YUAN}/年。使用云模型 API 时，费用另付服务商；接入已有 OpenClaw 使用本地推理时，没有这笔 API 费用。credits 不包含模型费用，也不是固定提问次数。

可以用[费用估算器](/pricing#estimate)先算自己的微伴成本，再拿商业平台的同用量报价对照。对方没有公开单价时，注明「报价未知」，不要用猜测填表。`,
    },
    {
      id: "when-commercial",
      title: "什么情况下商业平台更省事",
      body: `这些情况可以优先考虑商业平台：

- 完全不想接触 API Key、服务商账户与模型配置。
- 接受平台给定的模型列表，不要求随时换模型。
- 希望界面、客服、计费都在一个产品里解决。
- 用量较小，套餐赠送额度已经覆盖日常使用。

选择前仍要核对：积分是否过期、超额怎么计费、是否限制并发或附件、聊天记录与插件配置能否导出。省心是真实的收益，但迁移成本也要提前看清。`,
    },
    {
      id: "when-wechatai",
      title: "什么情况下微伴更合适",
      body: `有下面这些需求时，可以考虑微伴：

- **模型自选**：要固定某个模型，或按任务在不同模型间切换。
- **账单透明**：模型费与服务费分开，能按服务商账单核对。
- **凭据可撤销**：微伴服务端会加密保存你提供的 Key，并用它代你调用配置的模型服务。你可删除微伴中的渠道，也可在服务商后台撤销 Key。如果不能接受微伴保存凭据，托管聊天不适合你。
- **插件与 Agent**：需要 DS Chat、生图、角色卡、个人助理，或把自建 Agent 接进微信。

边界同样要接受：微伴只支持 ClawBot 单聊，不支持群聊；普通聊天不需要设备常开，接入自建 Agent 后仍需要在线设备。微伴不提供模型额度；使用云模型 API 时，费用另付服务商。`,
    },
    {
      id: "migration",
      title: "从商业平台迁移前要确认的三件事",
      body: `**第一，聊天记录与配置能否带走。** 多数平台不会自动迁移历史对话、插件配置和绑定关系；换平台通常要在新方案里重建。

**第二，微信绑定是否受影响。** 不同平台使用的通道与绑定方式可能不同，切换前先确认新方案支持你账号当前可用的入口，避免停掉旧平台后无法接入。

**第三，费用何时停止。** 取消订阅、积分过期与模型 Key 删除是三条不同的操作；先处理旧平台的自动续费，再停用 Key，避免产生意外扣费。

如果只是担心迁移麻烦，可以先并行使用一段时间，把常用模型与插件在新方案里配好，再决定是否停用旧平台。`,
    },
  ],
  faq: [
    {
      question: "商业微信 AI 平台一般怎么收费？",
      answer:
        "常见做法是把模型调用与平台服务打包成积分或套餐，按平台规则扣减。具体单价、赠送额度、有效期与超额规则因平台而异，本站不写未经核实的统一报价。",
    },
    {
      question: "微伴比商业平台便宜吗？",
      answer:
        "不能直接这样比较。微伴收 credits，使用云模型 API 时费用另付服务商；接入已有 OpenClaw 使用本地推理时没有模型 API 费，仍有运行成本。商业平台通常把模型和服务费用打包。应按同等用量核对套餐与有效期后再比较。",
    },
    {
      question: "商业平台需要自己准备 API Key 吗？",
      answer:
        "多数商业平台由平台代管模型配置，用户一般不需要提供 Key；也有平台允许自带 Key，具体以所选平台说明为准。微伴普通聊天和小薇需自备模型 API Key；接入已有 OpenClaw 沿用 Agent 的模型配置，无需另配微伴模型渠道。使用云 API 才涉及服务商费用，本地推理不产生模型 API 费。",
    },
    {
      question: "微伴支持群聊吗？",
      answer:
        "不支持。微伴只处理你与微信 ClawBot 的单聊消息，没有群聊开关。商业平台的群聊能力因平台而异，本站没有逐个核实，不写成统一结论。",
    },
    {
      question: "从商业平台换到微伴，聊天记录会保留吗？",
      answer:
        "不会自动迁移。聊天记录、插件配置和绑定关系通常留在原平台。换到微伴后需重新绑定微信；用普通聊天或小薇时配置模型渠道，接入已有 OpenClaw 则沿用 Agent 的模型配置。建议先并行使用，确认新方案可用后再停用旧平台。",
    },
  ],
  related: [
    { label: "微信接入 Muse 托管助理", href: "/wechat-muse" },
    { label: "微信 AI 的几种接入方案对比", href: "/wechat-ai-options" },
    { label: "全部对比", href: "/compare" },
    { label: "微伴 vs 微信官方内置 AI", href: "/compare/wechatai-vs-wechat-official-ai" },
    { label: "微伴 vs 自建 OpenClaw", href: "/compare/wechatai-vs-openclaw" },
    { label: "自带 API Key 的微信 AI", href: "/bring-your-own-api-key" },
    { label: "微信 AI：把你的大模型接进微信", href: "/wechat-ai" },
    { label: "价格与免费额度", href: "/pricing" },
  ],
  updatedAt: "2026-11-19",
};
