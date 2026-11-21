import type { SeoPage } from "../../seo-pages";
import type { TranslationPage } from "../index";
import { CLOUD_AGENT_COST_NOTE_EN } from "./copy/t4-notes";

const content: SeoPage = {
  path: "/wechat-ai-options",
  kind: "comparison",
  title: "Choosing a WeChat AI bot: four approaches compared",
  description:
    "There are four ways to use AI in WeChat: built-in, commercial platform, self-hosted open source, and BYOK relay. This guide compares setup cost, fees, control, and account risk so you can rule out the wrong fit.",
  eyebrow: "Options compared",
  h1: "Choosing WeChat AI: the real trade-offs of four approaches",
  lede: "The answer to \"which WeChat AI bot is best\" depends on where you are willing to pay: money, time, or control over your data.",
  answer:
    "There are roughly four ways to use AI in WeChat: the built-in capabilities (zero setup, but the model cannot be changed), a commercial platform (low effort, but credit-based and limited to the platform's models), self-hosting an open-source project (customizable, requires operations, and account risk depends on the access method), and a relay service with your own API key (choose the model, separate the bills, no operations for ordinary chat). When you connect a self-hosted agent through a relay, you still maintain the agent.",
  primaryKeyword: "WeChat AI bot comparison",
  secondaryKeywords: [
    "best WeChat AI bot",
    "WeChat AI bot pricing",
    "free WeChat AI bot",
    "WeChat AI options compared",
  ],
  highlights: [
    "Four approaches compared item by item",
    "Where account risk actually comes from",
    "A direct recommendation by need",
  ],
  sections: [
    {
      id: "four",
      title: "Four approaches in one table",
      body: `| Dimension | Built-in | Commercial platform | Self-hosted open source | BYOK relay |
| --- | --- | --- | --- | --- |
| Getting started | None | Low | High | Low |
| Needs your own API key | No | Usually no | Local inference (such as Ollama) needs no real provider credentials; cloud APIs use a key or account as the provider requires | Wechatai ordinary chat and Xiaowei need a model API key; connecting an existing OpenClaw keeps the agent's model configuration, with no Wechatai model channel needed |
| Model choice | Not selectable | Within the platform list | Unrestricted | Any compatible protocol |
| Fee structure | Free quota and pricing follow the corresponding feature's documentation | Platform credit or plan quote | Runtime and maintenance cost; local inference has no model API fee; cloud APIs bill under the provider's rules | Relay fee; with cloud APIs, model fees are paid separately to the provider |
| Who sees the data | WeChat and related services | WeChat, the platform, and the model provider | WeChat, your self-hosted service, and the configured model or tool services | WeChat, the relay service, and the configured model or tool services |
| Device must stay online | Not verified | Not verified | The device running the agent must stay online | Ordinary model chat does not need your device online; a self-hosted agent does |
| Customizability | None | Low | High (code changes) | Medium (plugins and configuration) |
| Access method and rules | Provided by WeChat | Check the channel the platform uses | Check the channel the project uses | Check the channel the service uses; Wechatai uses ClawBot |

Commercial platforms usually bundle model and service fees into one quote; with your own key you reconcile the provider bill and the relay fee separately. Self-hosting also requires accounting for runtime cost and maintenance time; a free quota only reduces the cash outlay, not the need to count it. Compare total cost with the same model, the same volume, and the same time period.`,
    },
    {
      id: "official",
      title: "Built-in: enough, but not replaceable",
      body: `WeChat itself provides several AI capabilities, such as chat-history search, input suggestions, and an open platform for developers. WeChat provides and maintains them, so you do not deploy an access service. The available scope, free quota, pricing, and usage rules follow the corresponding WeChat feature documentation.

The limit is clear: **the platform decides the model, and you cannot switch to your own**; the capability boundary is fixed, with no plugins, no personal agents, and no control over how context is stored. If you only ask an occasional question, the built-in capability may be enough and a third-party route is unnecessary.

Three signals usually mean you need a third-party option: you want a specific model, you need plugins and agents, or you need results pushed to WeChat. Any one of them is beyond the built-in capability.`,
    },
    {
      id: "platform",
      title: "Commercial platform: low effort, bounded by plans and support",
      body: `These platforms package model, relay, and interface into one product. You sign up and use it, often with a batch of sign-up credits and credit-based billing.

The advantages are real: no provider account, no key management, and customer support. The drawbacks are equally real:

- **Models are limited by the platform.** You can use only what it lists, and new models arrive when the platform adds them.
- **Pricing is opaque.** Credits sit between you and the currency, and model cost is bundled with the service fee, which makes verification hard.
- **Migration cost.** Chat history, plugin configuration, and bindings live on the platform; switching means starting over.

Whether it pays off requires checking the plan and overage prices against your usage, then comparing total spend with the alternatives; the time needed to configure and maintain those alternatives also counts.`,
    },
    {
      id: "selfhost",
      title: "Self-hosted open source: control, at an operations cost",
      body: `Open-source projects such as CowAgent (formerly chatgpt-on-wechat) and Wechatai let you change code, connect your own database, and add custom logic.

The price is often underestimated:

- **An always-on machine.** Shut it down and you are offline; a cloud host is a recurring cost.
- **Ongoing operations.** Process supervision, dependency upgrades, and log triage are yours to handle.
- **The access method must be verified.** Self-hosting does not automatically mean a non-official protocol. CowAgent currently connects through the official WeChat API with a QR scan, and the open-source Wechatai also uses the WeChat ClawBot channel. Judge other projects by their actual interface and usage rules; being open source alone does not determine risk.

CowAgent's WeChat setup is documented in its [project docs](https://docs.cowagent.ai/channels/weixin). Self-hosting mainly suits people who need deep customization and are willing to maintain the service; whether to deploy yourself and which WeChat channel to use are two separate choices.`,
    },
    {
      id: "byok",
      title: "BYOK relay: splitting the two bills",
      body: `This approach only relays: you enter your own API key, the platform forwards WeChat messages to the model, and the answer comes back to WeChat.

- **Model freedom.** You can switch models without changing tools if the endpoint is compatible with OpenAI Chat Completions, OpenAI Responses, or Anthropic Messages. The endpoint must use a public HTTPS domain on the default port (443).
- **Transparent fees.** Model fees go to the model provider; Wechatai charges text by weighted tokens, adds 5 credits per generated image plus the description text, and keeps the two bills separate.
- **No operations for ordinary model chat.** Scan, bind, and use it. When connecting OpenClaw or Hermes, you still run and maintain the agent yourself.
- **The trade-off.** You sign up with the provider and manage the key, and messages pass through the relay service.

Wechatai's bring-your-own-key access belongs to this group and does not promise free models. Wechatai also offers the optional [Xiaowei](/docs/cloud-agent): ${CLOUD_AGENT_COST_NOTE_EN}

No third-party integration can guarantee immunity from risk controls. Self-hosting lets you manage the relay service and storage (the code is MIT open source), but WeChat messages still pass through WeChat, and cloud models or external tools still receive the related content. Self-hosting does not mean data never passes through a third party.`,
    },
    {
      id: "risk",
      title: "Access method and account usage rules",
      body: `When judging an option, verify **the access channel and the usage behavior** together. Model brand, open source, and hosting do not by themselves describe account risk:

- **Official channels.** The ClawBot plugin, official accounts, and WeCom each have their own interfaces and rules; both self-hosted projects and hosted services can use them.
- **Reverse-engineered protocols.** These simulate the client protocol, and the implementation must be checked against platform rules.
- **Client injection / hooks.** These change client behavior and should be distinguished from official plugin authorization.

Wechatai uses the official WeChat ClawBot plugin channel and does not modify the WeChat client. Other services may use the same channel, so scanning alone does not establish the protocol. You still follow platform rules, and no third-party option can guarantee an account will never be restricted.`,
    },
    {
      id: "choose",
      title: "How to choose: match your situation",
      body: `- **Only an occasional question** → use the built-in capability; do not over-engineer.
- **Do not want to touch API keys and will pay for convenience** → choose a platform that supplies models and manages API configuration, and check its models and fees first.
- **Want to change code, manage storage and tools yourself, and can operate a service** → self-host open source; data flow still depends on the models and external services you connect.
- **Already have an API key and want to switch models and see every charge** → a BYOK relay, which is [Wechatai](/wechat-ai); for background text tasks, run the available Plus cloud assistant Xiaowei on that model.
- **Need both automation and WeChat pushes** → run an agent on your machine and connect it to WeChat; see [connecting an agent to WeChat](/wechat-agent).

A common combination is **BYOK relay for everyday conversation and a local agent for tool-using automation**, sharing one WeChat link and switching with \`/use\`.`,
    },
  ],
  faq: [
    {
      question: "Is there a free WeChat AI bot?",
      answer:
        "Some options offer free features or quota, but the coverage differs. The built-in capability's scope, free quota, and pricing follow the corresponding WeChat feature documentation; commercial platforms require checking sign-up credits and the rules after they run out. Wechatai Free grants 100 credits per day toward relay fees, not model fees; model fees and free quota follow the chosen provider's rules.",
    },
    {
      question: "How do WeChat AI bots usually charge?",
      answer: `Commercial platforms usually bundle model and service fees into credits or a plan; BYOK services usually bill model fees and relay fees separately, with the exact rules in the chosen service's quote. Wechatai charges text by weighted tokens, 5 credits per generated image plus the description text; with your own API, fees are paid separately to the provider. ${CLOUD_AGENT_COST_NOTE_EN}`,
    },
    {
      question: "Can a third-party AI bot get my account banned?",
      answer:
        "It depends on the access method and usage behavior. Self-hosted projects and hosted services can both use official channels, so product type alone is not enough. Check the interface the service uses and the platform rules; scanning does not identify the protocol, and no third-party service can guarantee an account will never be restricted.",
    },
    {
      question: "Can I move from a commercial platform to a BYOK option?",
      answer:
        "Yes, and it works the same day, but chat history and plugin configuration do not migrate automatically. Run both for a while, rebuild your common configuration in the new option, and then decide whether to stop the old platform.",
    },
    {
      question: "Can I use self-hosting and a hosted service at the same time?",
      answer:
        "Yes. A common pattern is everyday Q&A through the cloud relay, which is always available, and tasks that read local files or run commands through a local agent, sharing one WeChat link and switching with /use.",
    },
  ],
  related: [
    { label: "Connect a hosted Muse assistant to WeChat", href: "/wechat-muse" },
    { label: "All comparisons", href: "/compare" },
    { label: "Wechatai vs the built-in WeChat AI", href: "/compare/wechatai-vs-wechat-official-ai" },
    { label: "Wechatai vs self-hosted OpenClaw", href: "/compare/wechatai-vs-openclaw" },
    { label: "Wechatai vs commercial WeChat AI platforms", href: "/compare/wechatai-vs-commercial-wechat-ai" },
    { label: "WeChat AI with your own API key", href: "/bring-your-own-api-key" },
    { label: "How to use the WeChat ClawBot plugin", href: "/wechat-clawbot" },
    { label: "Which models WeChat ClawBot supports", href: "/wechat-clawbot-models" },
    { label: "Can using AI in WeChat get my account banned?", href: "/wechat-ai-ban-risk" },
    { label: "How to build a WeChat bot: choose the route first", href: "/wechat-bot" },
    { label: "Connect an agent to WeChat", href: "/wechat-agent" },
    { label: "Pricing and free quota", href: "/pricing" },
    { label: "WeChat AI FAQ (docs)", href: "/docs/faq" },
  ],
  updatedAt: "2026-11-19",
};

export default [
  {
    path: "/wechat-ai-options",
    title: "WeChat AI Bot: Four Approaches Compared | Wechatai",
    description: content.description,
    updatedAt: "2026-11-20",
    content,
  },
] satisfies readonly TranslationPage[];
