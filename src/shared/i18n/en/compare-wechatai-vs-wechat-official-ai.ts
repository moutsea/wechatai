import type { SeoPage } from "../../seo-pages";
import type { TranslationPage } from "../index";
import { DAILY_CREDIT_DEFAULTS } from "../../credits";
import { PLUS_MONTHLY_YUAN, PLUS_YEARLY_YUAN } from "../../pricing-copy";

const content: SeoPage = {
  path: "/compare/wechatai-vs-wechat-official-ai",
  kind: "comparison",
  title: "Wechatai vs the built-in WeChat AI: capabilities and fees",
  description:
    "Compare Wechatai with the built-in WeChat AI: whether you need your own API key, whether models can be changed, group chat, always-on devices, and how fees work. Missing fields are marked explicitly; no competitor data is guessed.",
  eyebrow: "Wechatai × built-in WeChat AI",
  h1: "Wechatai vs the built-in WeChat AI: first decide which capability you need",
  lede: "The built-in option wins on zero setup; Wechatai wins on model choice and plugins. They are not the same layer of service, so rule out by whether you can change models and whether you need your own agent, then compare prices.",
  answer:
    "The built-in WeChat AI model cannot be replaced, and its capabilities, quota, and pricing follow the corresponding WeChat feature documentation. Wechatai is a third-party ClawBot one-to-one chat service billed in platform credits. Ordinary chat and Xiaowei need your own model API key; connecting an existing OpenClaw keeps the agent's model configuration and needs no separate Wechatai model channel. Only cloud APIs involve provider fees, while local inference incurs no model API fee. If you only want WeChat's basic Q&A, the built-in option is simpler; if you need a specific model, plugins, or a self-hosted agent, consider Wechatai.",
  primaryKeyword: "Wechatai vs built-in WeChat AI",
  secondaryKeywords: [
    "built-in WeChat AI vs third party",
    "can the built-in WeChat AI change models",
    "is Wechatai worth using",
    "does the built-in WeChat AI charge",
  ],
  highlights: [
    "Five facts compared item by item",
    "Missing fields marked explicitly",
    "Prices share the site's pricing source",
  ],
  comparison: {
    title: "Five facts compared",
    columns: ["Dimension", "Wechatai", "Built-in WeChat AI"],
    rows: [
      {
        label: "Price",
        values: [
          `Free ${DAILY_CREDIT_DEFAULTS.free} credits per day; Plus ¥${PLUS_MONTHLY_YUAN}/month or ¥${PLUS_YEARLY_YUAN}/year; model API fees are paid separately to the provider`,
          "Follows the corresponding WeChat feature documentation",
        ],
      },
      {
        label: "Needs your own key",
        values: [
          "Ordinary chat and Xiaowei need a model API key; connecting an existing OpenClaw keeps the agent's model configuration, with no Wechatai model channel needed",
          "No",
        ],
      },
      {
        label: "Supports group chat",
        values: ["No, ClawBot one-to-one only", null],
      },
      {
        label: "Requires an online device",
        values: ["Not for ordinary model chat; yes when connecting a self-hosted agent", null],
      },
      {
        label: "Requires self-deployment",
        values: [
          "No for ordinary chat; self-hosted OpenClaw or Hermes is deployed and maintained by the user; connecting an existing hosted Muse requires hook configuration but no self-deployment",
          null,
        ],
      },
    ],
    note:
      "Fields marked with \"—\" have no publicly verifiable source; this does not mean the other side lacks support. Prices and availability follow the other side's current public documentation.",
  },
  sections: [
    {
      id: "not-same-layer",
      title: "First: one is a WeChat capability, the other a third-party integration",
      body: `The built-in WeChat AI is a capability WeChat itself provides; WeChat maintains its entry, availability, free quota, and pricing. Users do not prepare a model key and cannot switch to another vendor's model. It covers "an occasional question", but the platform sets the capability boundary.

Wechatai is an independent third-party service that can connect a chosen model API or an existing agent to WeChat ClawBot one-to-one chat. It does not supply model quota and is not affiliated with WeChat; before signing up, still confirm that the account has the ClawBot entry. The two are not interchangeable versions of one product; when comparing, first check whether your need falls within the built-in capabilities.

If you have not chosen a route yet, see [WeChat AI options compared](/wechat-ai-options), then return here to check the differences between the built-in option and Wechatai.`,
    },
    {
      id: "five-facts",
      title: "Five facts: key, model, group chat, device, deployment",
      body: `The built-in option needs no API key; WeChat manages the model and quota. Wechatai ordinary chat and Xiaowei need your own model API key; connecting an existing OpenClaw keeps the agent's model configuration and needs no separate Wechatai model channel. Only cloud APIs involve provider fees, while local inference incurs no model API fee.

The second difference is **whether the model can change**. The built-in option cannot replace its model; Wechatai supports models compatible with OpenAI Chat Completions, OpenAI Responses, and Anthropic Messages, with availability depending on the model provider and account permissions you choose.

For group chat, device online requirements, and deployment, no unified, citable public statement was found for the built-in side, so the table leaves them blank. "—" does not mean unsupported or unnecessary; if these conditions affect your choice, check the current documentation for the corresponding WeChat feature.`,
    },
    {
      id: "price",
      title: "How fees work: split the two bills first",
      body: `Wechatai charges credits by message text volume, and cloud model API calls are paid separately to the provider. Free grants ${DAILY_CREDIT_DEFAULTS.free} credits per day, and Plus is ¥${PLUS_MONTHLY_YUAN}/month or ¥${PLUS_YEARLY_YUAN}/year; the grant does not include model fees. Rules and examples are in [pricing and free quota](/pricing).

The built-in option's charges and free quota follow the corresponding WeChat feature documentation; this page does not state unverifiable figures. Do not compare Wechatai Free credits directly with "official free": credits offset relay fees only, not the provider's API fees.

In the [cost estimator](/pricing#estimate), enter input and output tokens per turn and turns per day, and the tool estimates Wechatai credit usage. Enter the provider's input and output unit prices to estimate model API fees, then compare with WeChat's current documentation. Without a common basis, this page does not promise which side is cheaper.`,
    },
    {
      id: "official-enough",
      title: "When the built-in option is enough",
      body: `When these conditions hold, the built-in option is usually sufficient and a third-party integration is unnecessary:

- You only occasionally ask questions or make simple summaries in WeChat and do not require a specific model.
- You do not need plugins, web search, image generation, or your own agent.
- You do not need results pushed proactively to WeChat or to manage chat context and storage yourself.
- You accept that WeChat adjusts capabilities and quota and do not want to maintain API keys and bills.

Official capabilities also change; check the current entry and pricing shown in WeChat. Old screenshots in third-party articles are not a current promise.`,
    },
    {
      id: "choose-wechatai",
      title: "When to choose Wechatai",
      body: `Consider Wechatai for a chosen model or an existing agent when any of these needs appears:

- **A specific model.** You need to stay on one model or switch among several.
- **Plugins and tools.** You need DS Chat web access, image generation, character cards, the personal assistant, and similar plugin capabilities.
- **A self-hosted agent.** You want to connect OpenClaw, Hermes, or a similar agent to WeChat; Wechatai provides the channel, but you still run and maintain the agent process.
- **Controllable billing.** You want model fees and platform fees reconciled separately and the key in your own hands.

With Wechatai ordinary chat and Xiaowei, you manage the model key and provider balance; connecting only an existing OpenClaw needs no separate Wechatai model channel. Wechatai supports ClawBot one-to-one chat only, not group chat; ordinary chat needs no always-on device, while a self-hosted agent still needs an online runtime.`,
    },
    {
      id: "misconceptions",
      title: "Three common misconceptions",
      body: `**Misconception one: Wechatai is an official WeChat product.** It is not. Wechatai is an independently maintained third-party integration service, officially unaffiliated with WeChat or Tencent, and does not represent WeChat's position.

**Misconception two: free credits mean free models.** They do not. Credits offset only Wechatai's relay fees; cloud model APIs are billed separately by the provider.

**Misconception three: using a third party guarantees a ban.** That conclusion does not follow. Account risk depends on the specific access channel and usage behavior, not on an official/third-party binary. Wechatai uses the official WeChat ClawBot plugin channel and does not modify the client; you still follow platform rules, and no third-party service can guarantee an account will never be restricted. See [can using AI in WeChat get my account banned](/wechat-ai-ban-risk).`,
    },
  ],
  faq: [
    {
      question: "Are Wechatai and the built-in WeChat AI the same product?",
      answer:
        "No. The built-in WeChat AI is provided by WeChat; Wechatai is an independent third-party ClawBot one-to-one chat service, officially unaffiliated with WeChat or Tencent. Ordinary chat and Xiaowei need your own model API key; connecting an existing OpenClaw keeps the agent's model configuration and needs no separate Wechatai model channel. Only cloud APIs involve provider fees, while local inference incurs no model API fee.",
    },
    {
      question: "Can Wechatai change models while the built-in option cannot?",
      answer:
        "Wechatai can connect models that follow a compatible protocol, with the exact range depending on the provider and account permissions; the built-in WeChat AI model is decided by the platform and cannot be replaced by users. If official capabilities change, follow WeChat's current feature documentation.",
    },
    {
      question: "Does the built-in WeChat AI charge?",
      answer:
        "The official capability may include a free quota or charge by feature; follow the corresponding WeChat feature documentation. This site does not state unverifiable fixed amounts or treat old quotes in third-party articles as current prices.",
    },
    {
      question: "Is the Wechatai free plan enough?",
      answer: `Free grants ${DAILY_CREDIT_DEFAULTS.free} credits per day toward Wechatai relay fees; cloud model API calls are paid separately to the provider. Whether it is enough depends on message length, model output, and history context; use the estimator on the pricing page with your own usage.`,
    },
    {
      question: "Can the built-in option connect my own agent or plugins?",
      answer:
        "The built-in capability boundary is set by WeChat; it cannot replace models or connect your own agent under a third-party plugin protocol. For those capabilities, choose a relay service that supports the relevant agent or plugins and verify its channel and the platform rules.",
    },
  ],
  related: [
    { label: "Connect a hosted Muse assistant to WeChat", href: "/wechat-muse" },
    { label: "WeChat AI options compared", href: "/wechat-ai-options" },
    { label: "Wechatai vs self-hosted OpenClaw", href: "/compare/wechatai-vs-openclaw" },
    { label: "Wechatai vs commercial WeChat AI platforms", href: "/compare/wechatai-vs-commercial-wechat-ai" },
    { label: "WeChat AI with your own API key", href: "/bring-your-own-api-key" },
    { label: "WeChat AI: connect your model to WeChat", href: "/wechat-ai" },
    { label: "Pricing and free quota", href: "/pricing" },
  ],
  updatedAt: "2026-11-19",
};

export default [
  {
    path: "/compare/wechatai-vs-wechat-official-ai",
    title: "Wechatai vs the Built-in WeChat AI | Wechatai",
    description: content.description,
    updatedAt: "2026-11-20",
    content,
  },
] satisfies readonly TranslationPage[];
