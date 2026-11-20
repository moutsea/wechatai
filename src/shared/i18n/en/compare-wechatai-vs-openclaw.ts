import type { SeoPage } from "../../seo-pages";
import type { TranslationPage } from "../index";
import { DAILY_CREDIT_DEFAULTS } from "../../credits";
import { PLUS_MONTHLY_YUAN, PLUS_YEARLY_YUAN } from "../../pricing-copy";

const content: SeoPage = {
  path: "/compare/wechatai-vs-openclaw",
  kind: "comparison",
  title: "Wechatai vs self-hosted OpenClaw: runtime, upkeep, and cost",
  description:
    "Compare Wechatai hosted chat with a self-hosted OpenClaw: whether you need your own key, whether a device stays on, deployment, group chat, and fees. Fields that cannot be stated are left blank and noted; no data is invented.",
  eyebrow: "Wechatai × OpenClaw",
  h1: "Wechatai vs self-hosted OpenClaw: count runtime and upkeep as cost",
  lede: "Everyday conversation can run on Wechatai hosted chat. Once the operator enables the service, Plus members can use cloud Xiaowei to turn sent material into Word documents without deploying anything. Consider self-hosted OpenClaw when you need local files, local commands, or custom tools.",
  answer:
    "Wechatai hosts ordinary model chat, so your device need not stay on; the platform bills credits and model API fees are separate. Self-hosted OpenClaw must be deployed and its device kept online; a local model costs only runtime and maintenance, while a cloud API adds provider fees. Wechatai does not host the OpenClaw process; consider self-hosting OpenClaw when you need local files, local commands, or custom tools.",
  primaryKeyword: "Wechatai vs OpenClaw",
  secondaryKeywords: [
    "self-hosted OpenClaw WeChat",
    "difference between Wechatai and OpenClaw",
    "does OpenClaw need a computer always on",
    "WeChat agent hosted or self-hosted",
  ],
  highlights: [
    "Hosted and self-hosted compared item by item",
    "Missing fields marked explicitly",
    "Upkeep is not counted as zero",
  ],
  comparison: {
    title: "Five facts compared",
    columns: ["Dimension", "Wechatai", "Self-hosted OpenClaw, direct"],
    rows: [
      {
        label: "Price",
        values: [
          `Free ${DAILY_CREDIT_DEFAULTS.free} credits per day; Plus ¥${PLUS_MONTHLY_YUAN}/month or ¥${PLUS_YEARLY_YUAN}/year; model API fees are paid separately to the provider`,
          "Local inference incurs no model API fee; cloud APIs bill under the provider's rules. Both routes include device or hosting and maintenance cost; open-source software is used under its project license",
        ],
      },
      {
        label: "Needs your own key",
        values: [
          "Ordinary chat and Xiaowei need a model API key; connecting an existing OpenClaw keeps the agent's model configuration, with no Wechatai model channel needed",
          "Local Ollama needs no real provider credentials; cloud APIs use a key or account as the provider requires",
        ],
      },
      {
        label: "Supports group chat",
        values: ["No, ClawBot one-to-one only", null],
      },
      {
        label: "Requires an online device",
        values: ["Not for ordinary model chat; yes when connecting a self-hosted agent", "Yes, the device running the agent must stay online"],
      },
      {
        label: "Requires self-deployment",
        values: [
          "No for ordinary chat; self-hosted OpenClaw or Hermes is deployed and maintained by the user; connecting an existing hosted Muse requires hook configuration but no self-deployment",
          "Yes, install, configure, and maintain it yourself",
        ],
      },
    ],
    note:
      "Fields marked with \"—\" have no publicly verifiable source; this does not mean the other side lacks support. Prices, licenses, and availability follow the project's and provider's current public documentation.",
  },
  sections: [
    {
      id: "hosted-vs-selfhosted",
      title: "First: the division between hosted chat and a self-hosted agent",
      body: `Wechatai ordinary model chat runs on Wechatai servers: you enter a key, scan to bind, and the relay forwards WeChat messages to the model, with no computer kept on. It does not host OpenClaw and does not run commands on your machine on your behalf.

Self-hosted OpenClaw is the opposite: the agent process, tools, file access, and runtime all live with you. WeChat is only the entry, and tasks stop when the device shuts down or sleeps; for continuous availability, deploy to an always-on computer or server.

Everyday Q&A can use Wechatai hosted chat. Once the operator enables the service, Plus members can use [cloud Xiaowei](/docs/wechat-ai-assistant) to turn sent material into Word documents without deploying anything. Consider a self-hosted agent when you need local files, local commands, or custom tools. Hosted chat and a self-hosted agent can share one WeChat link and switch by command; see [connect an agent to WeChat](/wechat-agent).`,
    },
    {
      id: "five-facts",
      title: "Five facts: key, deployment, device, group chat",
      body: `The most underestimated is **device online time**. Wechatai ordinary chat does not need your computer always on; self-hosted OpenClaw needs a continuously running environment, and a local computer, cloud host, or managed server all count as cost.

**Deployment** also counts: installing the runtime, configuring models and tools, handling dependency upgrades, reading logs, and setting up process supervision are ongoing investment. Wechatai only relays and does not maintain OpenClaw for you.

**Your own key** depends on where the model runs: Wechatai ordinary chat requires the model provider's API key; a self-hosted OpenClaw running a [local Ollama](https://docs.openclaw.ai/providers/ollama/setup) model needs no real provider credentials, while a cloud API is configured with a key or account as the provider requires. No unified public statement was found for group chat, so the table leaves it blank; it must not be read as "unsupported".`,
    },
    {
      id: "cost",
      title: "Cost is more than model fees: list the device and upkeep",
      body: `Self-hosting always involves a device or cloud host plus maintenance time. A local model incurs no model API fee, but hardware, electricity, bandwidth, and operations time are still costs; with a cloud API, model calls are billed by the provider. Comparing only the model token unit price misses runtime and maintenance.

Wechatai costs credits plus model fees: Free grants ${DAILY_CREDIT_DEFAULTS.free} credits per day, Plus is ¥${PLUS_MONTHLY_YUAN}/month or ¥${PLUS_YEARLY_YUAN}/year, and model calls are paid separately to the provider. Credits offset relay fees only and do not make models free.

In the [cost estimator](/pricing#estimate), enter input and output tokens per turn and turns per day, and the tool estimates Wechatai credit usage; enter the provider's input and output unit prices to estimate model API fees. When comparing, add device and maintenance costs on the self-hosted side; provider fees apply only when using a cloud API.`,
    },
    {
      id: "when-hosted",
      title: "When Wechatai alone is enough",
      body: `When these conditions hold, self-hosted OpenClaw is usually overkill:

- You mainly ask questions, write, translate, and organize pasted text in WeChat.
- You do not need to read or write local files, run commands, or call self-hosted tools.
- You do not want to maintain an agent process, dependencies, and logs.
- You want text replies from the model even when your device is off.

For these needs, Wechatai hosted ordinary chat is enough; confirm WeChat has the ClawBot entry, then configure it per the [ClawBot binding guide](/wechat-clawbot). Note that Wechatai supports one-to-one chat only, not group chat.`,
    },
    {
      id: "when-openclaw",
      title: "When self-hosted OpenClaw is worth it",
      body: `Hosted chat is not enough when you need:

- **Local files and commands.** Let the agent read project files, run scripts, and process material on your machine.
- **A custom toolchain.** Connect your own API, database, or internal systems.
- **A controlled runtime.** Decide the model, dependency versions, logs, and where data lives.
- **Scheduled and background tasks.** A process that stays online to execute, rather than one question and one answer.

The price is that you own availability: device sleep, a crashed process, or a failed dependency upgrade all leave WeChat with no response. If you already have OpenClaw and want to connect it to the Wechatai channel, configure it per the [OpenClaw guide](/developers/openclaw); you still run the agent yourself.`,
    },
    {
      id: "together",
      title: "They can be used together; it is not either-or",
      body: `A common setup keeps Wechatai hosted chat as the default entry and switches to self-hosted OpenClaw when you need local files, local commands, or custom tools. Everyday Q&A does not depend on your device.

Before switching, confirm which model each side uses, whether context is shared, and where to look for logs when something fails. A failed reply from a self-hosted agent is not executed by Wechatai, and the platform does not host the agent process; making the responsibility boundary explicit matters more than comparing prices alone. Multi-agent setup is in [connecting multiple OpenClaw instances in WeChat](/docs/multiple-openclaw-in-wechat).`,
    },
  ],
  faq: [
    {
      question: "Are Wechatai and OpenClaw substitutes?",
      answer:
        "Not exactly. Wechatai provides hosted ordinary model chat and ClawBot access; OpenClaw is a self-hosted agent you run yourself. For everyday Q&A, use Wechatai; for local files, commands, and custom tools, self-host OpenClaw.",
    },
    {
      question: "Does OpenClaw require a computer kept on?",
      answer:
        "The device running the agent must stay online, or WeChat receives no results. It can be an always-on computer, cloud host, or server; shutdown, sleep, or a process exit makes tasks unavailable. Wechatai does not host the OpenClaw process.",
    },
    {
      question: "Can Wechatai deploy OpenClaw for me?",
      answer:
        "No. Wechatai provides the channel and configuration docs, but installation, running, upgrades, and troubleshooting are yours. See the OpenClaw guide; the platform does not manage your agent device.",
    },
    {
      question: "Does self-hosted OpenClaw still cost Wechatai credits?",
      answer:
        "A direct OpenClaw connection that does not pass through Wechatai incurs no Wechatai credits. A local Ollama model incurs no model API fee but still has runtime and maintenance cost; cloud APIs bill under the provider's rules. If you connect through the Wechatai channel, Wechatai credits are calculated separately under the current pricing page.",
    },
    {
      question: "Do both support group chats?",
      answer:
        "Wechatai handles only one-to-one messages with WeChat ClawBot and does not support group chat. OpenClaw's group-chat capability depends on the specific integration and project implementation; this site found no unified, verifiable statement, so it is not marked as supported or unsupported.",
    },
  ],
  related: [
    { label: "Connect a hosted Muse assistant to WeChat", href: "/wechat-muse" },
    { label: "Connect an agent to WeChat", href: "/wechat-agent" },
    { label: "OpenClaw guide", href: "/developers/openclaw" },
    { label: "Wechatai vs the built-in WeChat AI", href: "/compare/wechatai-vs-wechat-official-ai" },
    { label: "Wechatai vs commercial WeChat AI platforms", href: "/compare/wechatai-vs-commercial-wechat-ai" },
    { label: "WeChat AI options compared", href: "/wechat-ai-options" },
    { label: "Pricing and free quota", href: "/pricing" },
  ],
  updatedAt: "2026-11-19",
};

export default [
  {
    path: "/compare/wechatai-vs-openclaw",
    title: "Wechatai vs Self-Hosted OpenClaw | Wechatai",
    description: content.description,
    updatedAt: "2026-11-20",
    content,
  },
] satisfies readonly TranslationPage[];
