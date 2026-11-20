import type { SeoPage } from "../../seo-pages";
import type { TranslationPage } from "../index";
import { DAILY_CREDIT_DEFAULTS, IMAGE_CREDITS } from "../../credits";
import { PLUS_MONTHLY_YUAN, PLUS_YEARLY_YUAN } from "../../pricing-copy";

const content: SeoPage = {
  path: "/compare/wechatai-vs-commercial-wechat-ai",
  kind: "comparison",
  title: "Wechatai vs commercial WeChat AI platforms: keys and fees",
  description:
    "Compare Wechatai with commercial WeChat AI platforms: whether you need your own API key, whether models are selectable, group chat and device requirements, and how fees work. Fields the other side does not publish are left blank; no quotes are invented.",
  eyebrow: "Wechatai × commercial platforms",
  h1: "Wechatai vs commercial WeChat AI platforms: who controls fees and models",
  lede: "Commercial platforms bundle the model and the relay, ready after sign-up; Wechatai connects a chosen model or an existing agent. Which side fits depends on whether you want to save configuration or choose your own model.",
  answer:
    `Commercial WeChat AI platforms usually manage the model and billing, charging by platform credits or a plan and limiting models to what the platform lists. Wechatai ordinary chat and Xiaowei need your own model API key; connecting an existing OpenClaw keeps the agent's model configuration and needs no separate Wechatai model channel. Only cloud APIs involve provider fees, while local inference incurs no model API fee. Wechatai meters text credits by input and output usage and adds ${IMAGE_CREDITS} credits per generated image. Choose a commercial platform for less configuration and an accepted platform quote; consider Wechatai to choose models and reconcile relay and cloud API fees separately.`,
  primaryKeyword: "Wechatai vs commercial WeChat AI platforms",
  secondaryKeywords: [
    "which WeChat AI platform is best",
    "commercial WeChat AI pricing",
    "difference between Wechatai and commercial platforms",
    "WeChat AI BYOK or plan",
  ],
  highlights: [
    "Who pays for what, item by item",
    "No invented competitor quotes",
    "Migration cost explained separately",
  ],
  comparison: {
    title: "Five facts compared",
    columns: ["Dimension", "Wechatai", "Commercial WeChat AI platform"],
    rows: [
      {
        label: "Price",
        values: [
          `Free ${DAILY_CREDIT_DEFAULTS.free} credits per day; Plus ¥${PLUS_MONTHLY_YUAN}/month or ¥${PLUS_YEARLY_YUAN}/year; model API fees are paid separately to the provider`,
          "Platform credits or a plan, priced by the chosen platform",
        ],
      },
      {
        label: "Needs your own key",
        values: [
          "Ordinary chat and Xiaowei need a model API key; connecting an existing OpenClaw keeps the agent's model configuration, with no Wechatai model channel needed",
          "Usually no (managed by the platform)",
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
      "Fields marked with \"—\" have no publicly verifiable source; this does not mean the other side lacks support. Commercial platforms differ widely; prices and capabilities follow the current documentation of the platform you choose.",
  },
  sections: [
    {
      id: "two-models",
      title: "Two fee structures: a bundled quote versus two bills",
      body: `Commercial platforms usually bundle model calls, relay, and interface into credits or a plan: after sign-up, credits are deducted under platform rules, and users do not open a model provider account and cannot easily separate model cost from the platform service fee.

Wechatai ordinary chat and Xiaowei use the model API key you provide, with cloud API fees paid separately to the provider. Connecting an existing OpenClaw needs no duplicate model channel: local inference in the agent has no model API fee, while cloud API calls bill under the provider's rules. Wechatai meters text credits by input (including history context) and output usage, adds ${IMAGE_CREDITS} credits per generated image, and counts the description text separately.

Neither structure is inherently better. Stable usage and a single bill may favor a commercial platform; per-model cost accounting or frequent model changes favor a BYOK relay.`,
    },
    {
      id: "five-facts",
      title: "Five facts: key, model, group chat, device, deployment",
      body: `Commercial platforms generally manage the model configuration, so users do not touch a key; Wechatai ordinary chat and Xiaowei need your own model API key. Connecting an existing OpenClaw keeps the agent's model configuration and needs no separate Wechatai model channel. Only cloud APIs involve provider fees, while local inference incurs no model API fee.

**Model range** also differs: commercial platforms are limited to what they list, and an unlisted model means waiting; Wechatai supports models with a compatible protocol, but actual availability still depends on the provider and account permissions.

Group chat, device online requirements, and deployment differ widely among commercial platforms, and this site has not verified each one, so the table leaves them blank. "—" does not mean unsupported or unnecessary; if these conditions affect your choice, check the target platform's current documentation.`,
    },
    {
      id: "cost",
      title: "How to compare prices without misleading",
      body: `Compare with the same model, the same volume, and the same time period. A commercial platform may put a conversion layer between credits and yuan, and a plan may carry validity, concurrency, or feature limits; "how many credits are included" alone does not reveal the effective unit price.

Wechatai Free grants ${DAILY_CREDIT_DEFAULTS.free} credits per day, and Plus is ¥${PLUS_MONTHLY_YUAN}/month or ¥${PLUS_YEARLY_YUAN}/year. Cloud model APIs are paid separately to the provider; connecting an existing OpenClaw with local inference has no such API fee. Credits do not include model fees and are not a fixed number of questions.

Use the [cost estimator](/pricing#estimate) to calculate your Wechatai cost first, then compare it with the commercial platform's quote at the same usage. When the other side does not publish a unit price, mark it "quote unknown" rather than guessing.`,
    },
    {
      id: "when-commercial",
      title: "When a commercial platform is less work",
      body: `These cases favor a commercial platform:

- You do not want to touch API keys, provider accounts, or model configuration at all.
- You accept the platform's model list and do not need to switch models at will.
- You want the interface, support, and billing solved in one product.
- Your usage is small and the plan's included quota covers everyday use.

Still verify before choosing: whether credits expire, how overage is billed, whether concurrency or attachments are limited, and whether chat history and plugin configuration can be exported. Less effort is a real benefit, but migration cost should be understood in advance.`,
    },
    {
      id: "when-wechatai",
      title: "When Wechatai fits better",
      body: `Consider Wechatai when you need:

- **Model choice.** Stay on one model or switch among models by task.
- **A transparent bill.** Model fees and service fees are separate and can be checked against provider bills.
- **Revocable credentials.** Wechatai stores your key encrypted on the server and uses it to call the configured model service on your behalf. You can delete the channel in Wechatai or revoke the key in the provider console. If you cannot accept Wechatai storing credentials, hosted chat is not for you.
- **Plugins and agents.** DS Chat, image generation, character cards, the personal assistant, or connecting a self-hosted agent to WeChat.

The boundaries are also part of the deal: Wechatai supports ClawBot one-to-one chat only, not group chat; ordinary chat needs no always-on device, while a self-hosted agent still needs one online. Wechatai does not supply model quota; cloud model APIs are paid separately to the provider.`,
    },
    {
      id: "migration",
      title: "Three things to confirm before migrating from a commercial platform",
      body: `**One, whether chat history and configuration can leave.** Most platforms do not migrate past conversations, plugin configuration, and bindings automatically; switching usually means rebuilding in the new option.

**Two, whether WeChat binding is affected.** Different platforms may use different channels and binding methods. Confirm the new option supports the entry currently available to your account before shutting off the old platform, so you are not left unable to connect.

**Three, when charges stop.** Cancelling a subscription, credit expiry, and deleting a model key are three different actions; handle the old platform's auto-renewal first, then disable the key, to avoid unexpected charges.

If migration is the only concern, run both in parallel for a while, configure your common models and plugins in the new option, and then decide whether to stop the old platform.`,
    },
  ],
  faq: [
    {
      question: "How do commercial WeChat AI platforms usually charge?",
      answer:
        "They commonly bundle model calls and platform service into credits or a plan deducted under platform rules. Unit prices, included quota, validity, and overage rules vary by platform, and this site does not state an unverified common quote.",
    },
    {
      question: "Is Wechatai cheaper than a commercial platform?",
      answer:
        "It cannot be compared that directly. Wechatai charges credits, and cloud model APIs are paid separately to the provider; connecting an existing OpenClaw with local inference has no model API fee but still has runtime cost. Commercial platforms usually bundle model and service fees. Compare plans and validity at the same usage.",
    },
    {
      question: "Do commercial platforms require your own API key?",
      answer:
        "Most commercial platforms manage the model configuration and generally do not require users to provide a key; some also allow BYOK, so follow the chosen platform's documentation. Wechatai ordinary chat and Xiaowei need your own model API key; connecting an existing OpenClaw keeps the agent's model configuration and needs no separate Wechatai model channel. Only cloud APIs involve provider fees, while local inference incurs no model API fee.",
    },
    {
      question: "Does Wechatai support group chat?",
      answer:
        "No. Wechatai handles only your one-to-one messages with WeChat ClawBot and has no group-chat switch. Commercial platforms' group-chat capabilities vary, and this site has not verified each one, so it does not state a general conclusion.",
    },
    {
      question: "Will chat history be kept when moving from a commercial platform to Wechatai?",
      answer:
        "It does not migrate automatically. Chat history, plugin configuration, and bindings usually stay on the old platform. After moving, rebind WeChat; configure a model channel for ordinary chat or Xiaowei, and keep the agent's model configuration when connecting an existing OpenClaw. Run both in parallel first and stop the old platform once the new option works.",
    },
  ],
  related: [
    { label: "Connect a hosted Muse assistant to WeChat", href: "/wechat-muse" },
    { label: "WeChat AI options compared", href: "/wechat-ai-options" },
    { label: "Wechatai vs the built-in WeChat AI", href: "/compare/wechatai-vs-wechat-official-ai" },
    { label: "Wechatai vs self-hosted OpenClaw", href: "/compare/wechatai-vs-openclaw" },
    { label: "WeChat AI with your own API key", href: "/bring-your-own-api-key" },
    { label: "WeChat AI: connect your model to WeChat", href: "/wechat-ai" },
    { label: "Pricing and free quota", href: "/pricing" },
  ],
  updatedAt: "2026-11-19",
};

export default [
  {
    path: "/compare/wechatai-vs-commercial-wechat-ai",
    title: "Wechatai vs Commercial WeChat AI Platforms | Wechatai",
    description: content.description,
    updatedAt: "2026-11-20",
    content,
  },
] satisfies readonly TranslationPage[];
