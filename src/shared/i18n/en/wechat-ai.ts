import type { SeoPage } from "../../seo-pages";
import type { TranslationPage } from "../index";

const OWN_API_COST_NOTE =
  "When you use your own model, search, or image API, you pay the provider separately; this is not included in Wechatai membership or credits.";

const CLOUD_AGENT_COST_NOTE =
  "Xiaowei is available to Plus members once the operator enables it. It uses the text model you configured in Wechatai, and model API fees are paid to the provider separately. The platform charges credits for the task input and final reply text, and each returned image costs 5 credits; non-image files are not charged extra. Execution count is separately limited.";

const content: SeoPage = {
  path: "/wechat-ai",
  kind: "product",
  title: "WeChat AI: Connect Your Own LLM to WeChat Chat",
  description:
    "WeChat AI means using an LLM directly in WeChat. Bring your own API key to Wechatai. When enabled by the operator, the Plus cloud assistant Xiaowei uses your own model, consumes credits, and limits task runs.",
  eyebrow: "WeChat AI",
  h1: "WeChat AI: bring your own model into WeChat chat",
  lede: "No app switching, and no copying questions into a web page. Connect a model with your own API key; when you need background tasks, check on the Plugins page whether the Plus cloud assistant Xiaowei is available. It follows the WeChat profile's normal model by default and can also be set separately.",
  answer: `WeChat AI means calling a large language model directly inside WeChat for Q&A, writing, translation, image generation, and task handling. Wechatai supports bring-your-own API keys and also offers the cloud assistant Xiaowei. ${OWN_API_COST_NOTE}${CLOUD_AGENT_COST_NOTE}`,
  primaryKeyword: "WeChat AI",
  secondaryKeywords: [
    "WeChat AI assistant",
    "connect AI to WeChat",
    "use ChatGPT in WeChat",
    "WeChat AI bot",
    "call an LLM from WeChat",
  ],
  highlights: [
    "Bring your own API key, with transparent costs",
    "Switch between multiple models in one WeChat",
    "Six built-in everyday plugins",
  ],
  steps: [
    {
      title: "Set up your own API: register and add a channel",
      text: "Choose a provider and enter its API key, confirm that a text model was imported or add one manually, then click Test connection on the model row. Use the Custom entry for third-party endpoints.",
    },
    {
      title: "Scan the QR code to connect WeChat",
      text: "After the channel and text model are configured, generate a QR code. In WeChat, open Settings, go to the Features group, then Plugins → WeChat ClawBot → Scan to bind.",
    },
    {
      title: "Send a message",
      text: "Ask a question in the chat. Use /wx models to list model numbers, /wx model <number> to switch, and /wx status to check the current state.",
    },
  ],
  sections: [
    {
      id: "what",
      title: "“WeChat AI” usually means three different things",
      body: `Search results for “WeChat AI” often mix three things. Separate them first so you know which one you need:

- **AI built into WeChat**: lightweight features such as chat-history search and input suggestions. WeChat decides the model and quota, and you cannot replace it with your own.
- **AI inside an official account or mini program**: you ask inside that account or mini program, cannot leave that window, and cannot carry the context elsewhere.
- **A model connected to WeChat chat**: the AI becomes a WeChat contact you use like a friend. You can switch models, keep context, and attach plugins. Wechatai does the third.

The main difference between the third option and an AIGC tool is the entry point. A tool asks you to open a web page, sign in, and paste the question. Once connected to WeChat, WeChat itself is the entry point: forwarding text, taking a photo, or sending a voice message can all become input.`,
    },
    {
      id: "how-it-works",
      title: "How Wechatai connects a model to WeChat",
      body: `Wechatai is not a model vendor and does not resell tokens. When you use your own API, it does three things:

1. **Holds your key**: choose a provider and enter the API key when adding a channel, then import or add a model. Presets fill in the endpoint and protocol; third-party endpoints can be configured through Custom. Wechatai forwards requests according to the channel protocol.
2. **Receives WeChat messages**: the WeChat ClawBot plugin turns messages into model requests and sends replies back to the chat window.
3. **Adds what only WeChat needs**: session management, commands, plugins, reminder pushes, and credit metering.

With this path, model quality depends on the model you choose. Your API provider charges model usage; Wechatai charges credits for text by weighted token, AI images cost 5 credits each with prompt text billed separately, and the two bills are settled separately.

${CLOUD_AGENT_COST_NOTE}First configure a usable text model and API key under Channels & models, then enable Xiaowei where it is available. Without a separately assigned model, it follows the normal model selected for that WeChat profile and keeps using the last normal model after entering the plugin; assign a fixed model in the plugin when needed. For setup and usage, see the [Xiaowei guide](/docs/cloud-agent).`,
    },
    {
      id: "what-you-can-do",
      title: "What you can do after connecting WeChat",
      body: `Beyond ordinary Q&A, Wechatai includes several high-frequency scenarios that you can switch between with commands in WeChat:

| Plugin | What it does | Who it suits |
| --- | --- | --- |
| DS Chat | The model searches or reads the web on demand, using your own search API | People who need current information |
| AI images | Generates images with your own image model | People making assets or illustrations |
| Roleplay | Character cards, personas, and story memory | Writing and casual chat |
| Personal assistant | Notes, expenses, to-dos, and scheduled reminders | Everyday management |
| OpenClaw / Hermes | Connects your own agent to WeChat | Automation and task runs |
| Notifications | Pushes HTTP webhooks into WeChat | Orders, alerts, and task results |

DS Chat can also answer directly; entering the plugin does not mean every reply has been verified online.

First send \`/wx plugins\` to see configured aliases, then send \`/use <alias>\` to enter or switch plugins (for example, \`/use ds\`). These are shortcut aliases, not the plugin display names. Send \`/exit\` to return to normal chat, and \`/wx status\` to check the current state. Each plugin has its own page in the [usage docs](/docs). Notifications receive pushes over HTTP and do not require entering chat mode.`,
    },
    {
      id: "models",
      title: "Which models can you connect",
      body: `Any provider that offers one of the three protocols above can be connected. Common choices include:

- **DeepSeek**: low cost and strong Chinese, a mainstay for everyday Q&A and writing. See [Using DeepSeek in WeChat](/docs/deepseek-in-wechat) for setup.
- **Claude**: steadier long-document understanding and code reading, useful for long files.
- **GPT series**: the broadest ecosystem, with mature plugin and tool-calling support.
- **Self-hosted or relay services**: anything compatible with the protocols above, including your own gateway.

One WeChat link can hold several models. Use \`/wx models\` to see model numbers in the current channel, then \`/wx model <number>\` to switch. Across channels, send \`/wx channels\` first, then \`/wx channel <number>\`. Switching does not require rebinding, but you enter the target model's own session. You can also bind multiple WeChat links at once (Plus supports 10) to keep work and personal accounts separate.`,
    },
    {
      id: "cost",
      title: "How costs work",
      body: `With your own API, costs split into two parts:

- **Wechatai credits**: text costs 1 credit per 5,000 weighted tokens, with output counted at 8× weight; AI images cost 5 credits each, with prompt text billed separately. The free plan includes 100 credits per day, and Plus includes 1,000 per day.
- **Model API fees**: charged by your API provider under its own price list. Wechatai does not handle or mark up these fees.

${CLOUD_AGENT_COST_NOTE}

Notification pushes do not consume credits. Attachments (images and files) require Plus. For current prices and quotas, see [Pricing](/pricing) and [Membership and credits](/docs/credits).`,
    },
    {
      id: "fit",
      title: "When it fits, and when it does not",
      body: `**It fits if**: you already use a model API and want it available in WeChat; you do not want many apps on your phone; you want small tools (notes, reminders, image generation) behind one entry point; or you want to call your own agent remotely from WeChat.

**Check first**: when you need background execution, check the cloud availability status on the Plugins page. Cloud tasks follow the WeChat profile's normal model by default and can also be set separately. Cloud tasks require Plus, still consume credits, and are limited in execution count; they are not an unlimited free model. Teams that need enterprise compliance audits and data isolation should use a formal enterprise procurement process; this site is a personal-use tool.

Wechatai is an MIT-licensed open-source project with public code, and you can also self-host it.`,
    },
  ],
  faq: [
    {
      question: "Is WeChat AI an official WeChat feature?",
      answer:
        "No. Official WeChat AI refers to built-in features such as chat-history search and input suggestions. Wechatai is a third-party service that connects your own model to WeChat chat through the WeChat ClawBot plugin. It does not interfere with the official features.",
    },
    {
      question: "Do I need my own API key to use AI in WeChat?",
      answer: `Ordinary model chat requires an API key from a model provider, entered into Wechatai's channel settings. ${CLOUD_AGENT_COST_NOTE}See the Xiaowei guide for the full setup.`,
    },
    {
      question: "How many models can one WeChat profile use at once?",
      answer:
        "One WeChat link can contain multiple channels and models. Use /wx models to see numbers, then /wx model <number> to switch. Across channels, use /wx channels and /wx channel <number> first. The free plan can bind 1 WeChat link; Plus can bind 10.",
    },
    {
      question: "Does chat context carry over after switching models?",
      answer:
        "Old sessions and chat history are kept, but switching takes you to the target model's most recent active session, or creates one. The current context is not automatically handed over. If you were in a plugin, you also leave plugin mode. To start a blank session with the target model, send /wx new; to reset the current session context, send /wx reset.",
    },
    {
      question: "Is the free quota enough for everyday use?",
      answer:
        "The free plan includes 100 credits per day, roughly tens of thousands of tokens of Q&A, usually enough for personal everyday questions. Output counts at 8× weight, so long generations consume faster. If it is not enough, buy credit packs as needed or upgrade to Plus.",
    },
    {
      question: "Can I still use the AI when my phone is not nearby?",
      answer:
        "Yes. Model calls run on the server. Only agents connected to your own device (such as OpenClaw or Hermes) depend on that device being online. Ordinary Q&A, image generation, and assistant plugins do not depend on your phone's connection.",
    },
  ],
  related: [
    { label: "Using DeepSeek in WeChat", href: "/wechat-deepseek" },
    { label: "Using GPT in WeChat", href: "/wechat-gpt" },
    { label: "How the WeChat ClawBot plugin works", href: "/wechat-clawbot" },
    { label: "Can using AI in WeChat get my account banned?", href: "/wechat-ai-ban-risk" },
    { label: "WeChat AI with your own API key", href: "/bring-your-own-api-key" },
    { label: "Compare connection options", href: "/wechat-ai-options" },
    { label: "Pricing and free quota", href: "/pricing" },
    { label: "Getting started", href: "/docs/getting-started" },
    { label: "WeChat command reference", href: "/docs/commands" },
  ],
  updatedAt: "2026-11-12",
};

export default [
  {
    path: "/wechat-ai",
    title: "WeChat AI: Connect Your Own LLM to WeChat | Wechatai",
    description: content.description,
    updatedAt: "2026-11-20",
    content,
  },
] satisfies readonly TranslationPage[];
