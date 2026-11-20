import type { SeoPage } from "../../seo-pages";
import type { TranslationPage } from "../index";

const content: SeoPage = {
  path: "/wechat-gpt",
  kind: "tutorial",
  title: "Connect GPT to WeChat Without Deploying an Open-Source Project",
  description:
    "Use GPT in WeChat by deploying an open-source project such as CowAgent (formerly chatgpt-on-wechat), or let Wechatai relay messages. This guide covers bring-your-own-key setup and QR binding.",
  eyebrow: "GPT × WeChat",
  h1: "Connect GPT to WeChat: skip the deployment",
  lede: "You can run your own WeChat integration service or let Wechatai host it. Choose based on whether you need to change code and maintain a service.",
  answer:
    "There are two common ways to connect GPT to WeChat: deploy an open-source project such as CowAgent (formerly chatgpt-on-wechat), or configure an API key from a model provider in Wechatai and let it relay messages. Wechatai binds through the WeChat ClawBot plugin by QR scan; self-hosted projects follow their own docs. The main difference is who deploys and maintains the service. Hosted relay only handles the messages and attachments you send in WeChat; it is not a local agent and does not use ChatGPT subscription quota. Model calls are billed separately through your API key.",
  primaryKeyword: "connect GPT to WeChat",
  secondaryKeywords: [
    "how to connect ChatGPT to WeChat",
    "ChatGPT WeChat bot",
    "chatgpt-on-wechat alternative",
    "OpenAI API WeChat",
    "use GPT API in WeChat",
    "GPT WeChat assistant",
  ],
  highlights: [
    "No deployment and no server",
    "Chat Completions and Responses protocols",
    "Works with self-hosted or third-party endpoints",
  ],
  sections: [
    {
      id: "two-ways",
      title: "Self-hosting vs. Wechatai hosted chat",
      body: `| | Self-hosted CowAgent (formerly chatgpt-on-wechat) | Wechatai hosted ordinary chat |
| --- | --- | --- |
| Needs a server | Yes (cloud host or always-on computer) | No |
| Needs operations knowledge | Yes (process supervision, upgrades, logs) | No |
| WeChat connection | Configure per the project docs; verify whether it uses an official channel | Official WeChat ClawBot plugin channel with QR authorization |
| Preparation | Install the project, configure the model and WeChat channel | Configure channel and model, scan to bind |
| Control | High; you can change code | Medium; adjustable at the configuration level |

Self-hosting suits people who need to change code, connect their own database, or add tools, and who can maintain processes, upgrades, and logs. Wechatai hosted chat removes that deployment work while you still choose the model provider and manage the API balance.

Which WeChat connection CowAgent uses is defined by its [project connection docs](https://docs.cowagent.ai/channels/weixin). **Self-hosting does not automatically mean a non-official protocol, and QR scanning is not exclusive to hosted services.** Evaluate the access channel, customizability, and maintenance responsibility separately; do not infer account risk from “self-hosted” or “hosted” alone.`,
    },
    {
      id: "key",
      title: "Two practical questions about OpenAI keys",
      body: `**First, where does the key come from?** The official OpenAI API has regional access restrictions. Use an approach that follows provider terms and your local rules: direct official access where available, a forwarding service explicitly authorized by the provider, or another vendor that offers an OpenAI-compatible API. Do not obtain a key by evading regional restrictions or violating provider terms; this site does not offer such methods and does not promise that models are directly reachable in restricted regions.

**Second, which protocol?** Wechatai supports two OpenAI chat APIs:

- **Chat Completions** (\`/v1/chat/completions\`): more compatible implementations; fields follow that provider's docs.
- **Responses** (\`/v1/responses\`): OpenAI's newer API. Wechatai calls it statelessly: it builds \`input\` itself, sends only Wechatai-defined tools, and requests with \`store: false\`. Protocol compatibility only means the request format matches; it **does not mean** you can use the provider's built-in search, code execution, or other tools from its own client, or that your account has those permissions.

With the official OpenAI service, choose OpenAI as the provider and Wechatai prefills the Responses protocol and official endpoint. With a third-party endpoint or another protocol, choose Custom (third-party channel / other protocol), enter the protocol and Base URL from the provider docs, and check the actual request endpoint preview on the page.

> Note: model fees are always settled by your API provider; Wechatai does not resell tokens. Available models, rate limits, tools, and vision depend on the provider's documentation for that model ID and your account's actual permissions.`,
    },
    {
      id: "steps",
      title: "Setup steps",
      body: `1. **Get an API key**: create a key in the model provider's console and confirm the available models and balance. For a third-party service, also note its Base URL and protocol.
2. **Add a channel**: open [Channels & models](/app/channels) and click Add channel. For the official service, choose OpenAI and enter the API key; for a third-party endpoint, choose Custom (third-party channel / other protocol), enter the channel name, protocol, Base URL, and API key, then save.
3. **Confirm the text model**: a new provider preset channel tries to import models automatically. Check the text model list on the channel card. For a custom channel, click Fetch available models; if that fails or the model is missing, click Add model and enter the model ID from the provider docs.
4. **Test the connection**: once a text model exists, click the lightning icon, Test connection, on its row. The system sends a fixed test request with no message from you; the test consumes a small number of credits and may incur upstream API fees.
5. **Scan to bind WeChat**: once the model works, generate a QR code under Connect WeChat. In WeChat, open Settings, go to the Features group, then Plugins → WeChat ClawBot → Scan, scan, and confirm.
6. **Verify in WeChat**: send “Hello,” then use \`/wx status\` to see the current model and \`/wx balance\` to see credits.

A failed model-list fetch does not mean the channel was not saved, and does not necessarily mean the model cannot be called; add a model the provider confirms and test the connection. If the test errors, check the key, endpoint, protocol, model ID, and balance. If the test succeeds but WeChat does not reply, check the WeChat link state and the model currently in use.`,
    },
    {
      id: "extras",
      title: "What the plugins add after setup (independent of model brand)",
      body: `These capabilities come from Wechatai plugins. Availability depends on plugin configuration and whether the chosen model supports the corresponding request; they are not automatic because you use GPT:

- **Web Q&A**: after you configure your own search API, DS Chat lets the model decide whether to search or read pages, or answer directly. Entering the plugin does not mean every reply was verified online.
- **Image generation**: the AI images plugin uses a separate image model you configure and generates from a prompt sent in WeChat; the capability comes from the image model, not the chat model.
- **Agent connection**: agents such as OpenClaw and Hermes can connect to WeChat and push task results into the chat. They run on your own device and are configured separately from the chat model.
- **Notification pushes**: your service sends orders, alerts, and task results to WeChat over HTTP webhooks; these pushes do not consume credits.
- **Tool calls**: the native tool flow requires the model to support the protocol's tools field. When DS Chat first receives a clear “tools unsupported” response, it can try the JSON-action compatibility flow, with Wechatai performing the search or web reading. If the model keeps returning unparsable actions, or tries to go online without obtaining any usable source, it reports an error. After obtaining some material, it may return an answer with a warning even if a later request fails; having sources does not mean the material is sufficient or the conclusion correct, so verify. This compatibility path does not mean other plugins support a no-native-tools mode.

First send \`/wx plugins\` to see configured aliases, then \`/use <alias>\` to switch plugins (for example, \`/use ds\`). Send \`/exit\` to return to normal chat. These are shortcut aliases, not plugin display names. For the full list, see [WeChat AI](/wechat-ai#what-you-can-do).`,
    },
    {
      id: "compare",
      title: "GPT, Claude, or DeepSeek: compare by conditions",
      body: `There is no “best model” that holds for every account, only whether a model satisfies your task conditions. Compare item by item instead of ranking brands:

| Check | What to confirm | How to verify |
| --- | --- | --- |
| Task type | Text chat only, or tool calls, images, and long documents | List the tasks and read each model's capability docs |
| Model ID and protocol | Specific model, context and output limits, supported protocols | Provider docs plus the model ID in the channel; for Wechatai's compatibility boundary, see the [ClawBot models page](/wechat-clawbot-models#compatibility) |
| Account permissions | Whether your key has the model, rate limits, and billing enabled | Provider console and bill |
| Images and files | Images need vision; files are text-extracted first; attachments need Plus | Test with an image and a text-extractable file separately; read errors on failure |
| Cost | Input/output unit prices and your actual usage | Provider price list plus [cost estimate](/pricing#estimate) |

After checking, configure different models by task. Use \`/wx models\` to see model numbers in the current channel, then \`/wx model <number>\` to switch. Across channels, use \`/wx channels\` to see numbers, then \`/wx channel <number>\`.

Switching continues the target model's most recent active session, or creates one. Old sessions are kept, but the current context is not carried to the new model; provide the material again in the target session.

For the full trade-offs, see [WeChat AI connection options](/wechat-ai-options).`,
    },
  ],
  faq: [
    {
      question: "Does connecting GPT to WeChat require deploying an open-source project?",
      answer:
        "No. Deploying CowAgent (formerly chatgpt-on-wechat) or a similar project suits people who need to change code and manage the service themselves. If you only want to chat in WeChat, Wechatai can host message relay without your own server. Wechatai uses the WeChat ClawBot plugin entry; self-hosted projects follow their own docs, and both should be checked for whether they use an official channel.",
    },
    {
      question: "Can I connect GPT without an OpenAI account?",
      answer:
        "You can connect through a provider that actually offers GPT, but you need that provider's account, API key, and model permissions, and must follow its terms and local rules. OpenAI protocol compatibility only means the interface format matches, not that GPT is provided; if you only want AI in WeChat, you can also choose DeepSeek, Kimi, or another model. With your own gateway, confirm the upstream offers the model and enter the protocol, endpoint, and model ID from the gateway docs.",
    },
    {
      question: "Which is more likely to get an account banned, self-hosting or a hosted service?",
      answer:
        "You cannot judge by self-hosted vs. hosted alone. Wechatai connects through the WeChat ClawBot plugin entry; a self-hosted project's interface must be checked against its docs and actual configuration, and other approaches depend on whether they modify the client and on platform rules. Scanning does not mean every service uses the same protocol, and no third-party service can guarantee an account will never be restricted.",
    },
    {
      question: "Can GPT answers include web search?",
      answer:
        "Yes. Configure DS Chat's answer model and your own search API, and the model searches or reads pages as needed, or may answer directly. Entering DS Chat does not mean every request goes online; ordinary model chat does not automatically enable DS Chat's search.",
    },
    {
      question: "Can one key be used for WeChat and other tools at the same time?",
      answer:
        "Yes, but usage is billed together and is harder to attribute. Create separate keys by purpose so problems are easier to locate and keys can be revoked independently.",
    },
  ],
  related: [
    { label: "Using Claude in WeChat", href: "/wechat-claude" },
    { label: "Using DeepSeek in WeChat", href: "/wechat-deepseek" },
    { label: "Which models WeChat ClawBot supports", href: "/wechat-clawbot-models" },
    { label: "Can using AI in WeChat get my account banned?", href: "/wechat-ai-ban-risk" },
    { label: "WeChat AI with your own API key", href: "/bring-your-own-api-key" },
    { label: "Channels and model configuration", href: "/docs/channels-models" },
    { label: "Pricing and free quota", href: "/pricing" },
  ],
  updatedAt: "2026-11-10",
};

export default [
  {
    path: "/wechat-gpt",
    title: "Connect GPT to WeChat Without Deployment | Wechatai",
    description: content.description,
    updatedAt: "2026-11-20",
    content,
  },
] satisfies readonly TranslationPage[];
