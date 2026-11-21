import type { SeoPage } from "../../seo-pages";
import type { TranslationPage } from "../index";

const content: SeoPage = {
  path: "/wechat-qwen",
  kind: "tutorial",
  title: "Connect Qwen to WeChat: SiliconFlow Channel Tutorial",
  description:
    "Connect Qwen to WeChat: create a SiliconFlow key, sync models through Wechatai's preset channel, test the connection, and bind WeChat. Includes model ID checks, billing, and no-reply fixes.",
  eyebrow: "Qwen × WeChat",
  h1: "Connect Qwen to WeChat with a SiliconFlow channel",
  lede: "If you already have a SiliconFlow account, Qwen does not need a separate service. Enter one key, sync available models, test them, and scan to bind WeChat.",
  answer:
    "To use Qwen in WeChat, add a SiliconFlow channel in Wechatai, enter your SiliconFlow API key, save, sync available models, then bind WeChat ClawBot by QR scan. SiliconFlow uses an OpenAI Chat Completions-compatible interface, and the preset fills in the protocol and endpoint. Whether a specific Qwen model is callable depends on your account permissions and the model list the platform returns.",
  primaryKeyword: "connect Qwen to WeChat",
  secondaryKeywords: [
    "use Qwen in WeChat",
    "Qwen WeChat bot",
    "SiliconFlow WeChat",
    "Qwen WeChat API",
    "WeChat Qwen tutorial",
  ],
  highlights: [
    "One SiliconFlow key",
    "Preset protocol and endpoint",
    "Confirm with Test connection first",
  ],
  sections: [
    {
      id: "prerequisites",
      title: "Three things to prepare first",
      body: `This path does not require a server, but it has three conditions:

- **WeChat-side entry**: your phone's WeChat needs the ClawBot plugin entry and must be able to complete QR binding. Without the entry, even a successful model setup cannot chat in WeChat; see the [access requirements check](/wechat-clawbot).
- **SiliconFlow account and key**: create an API key in the SiliconFlow console and confirm the account is usable. The key is a provider credential, not your WeChat password or Wechatai password.
- **A specific model ID**: Qwen is a model family, not one fixed model. First check in the SiliconFlow console which Qwen models your account can call, and note the full model ID to compare later.

Wechatai has no built-in models and does not provide a universal API key. The channel stores your own SiliconFlow key, and model fees from calls settle with SiliconFlow under your account.`,
    },
    {
      id: "configure",
      title: "Configure and bind WeChat in four steps",
      body: `1. **Add a channel**: open [Channels & models](/app/channels), click Add channel, and choose SiliconFlow as the provider. The protocol is filled as OpenAI Chat Completions and the endpoint as SiliconFlow's API address.
2. **Save and sync models**: enter the SiliconFlow API key and click Save and fetch models. Saving does not buy model quota for you; the sync result depends on the key's permissions and what the platform returns.
3. **Add and test the model**: find the Qwen model you need in the text model list. If the list is empty or the target model is missing, click Fetch available models first; if it is still missing, click Add model and enter the full model ID from SiliconFlow docs. Then set input and output limits and click the lightning icon, Test connection.
4. **Scan to bind WeChat**: once the test returns normally, open Connect WeChat, generate a QR code, and scan it from WeChat → Settings → Features → Plugins → WeChat ClawBot → Scan. After binding, send \`/wx status\` to check the current channel and model. If they do not match, use \`/wx channels\` to see channel numbers and \`/wx channel <number>\` to choose one, then \`/wx models\` to see model numbers and \`/wx model <number>\` to choose a model. Once correct, send “Hello.”

Test connection and real chat both consume Wechatai credits, and SiliconFlow may bill per call. If you only need text conversation, you do not need to configure web access or files first.`,
    },
    {
      id: "model-id",
      title: "Do not guess model IDs from marketing names",
      body: `The most common connection failure is not WeChat but the wrong model name or permission:

- **Trust the console**: model names may carry version, date, or capitalization differences across platforms. Copy the full model ID from the SiliconFlow console; do not enter only a family name such as “Qwen.”
- **Account permissions**: seeing a model in the console does not guarantee your key can call it; trust the actual test. On failure, read the model name and permission details in the error.
- **Keep the preset protocol**: this tutorial uses OpenAI Chat Completions. When troubleshooting, restore the SiliconFlow preset first, then test the connection.
- **Keep the preset endpoint**: only change the custom Base URL when necessary; an extra or missing path segment can cause a 404.

This site does not hard-code a Qwen model list because the platform changes availability and naming. What the page can define is the setup path: preset channel, full model ID, Test connection.`,
    },
    {
      id: "cost-and-switch",
      title: "Who bills what, and switching models",
      body: `After connecting WeChat, there are still two bills:

- **Model fees**: settled by SiliconFlow under your account, chosen model, and actual tokens; unit prices follow the console bill.
- **Relay fees**: Wechatai charges credits for the input and output tokens it actually meters. Switching Qwen versions changes reply length and history context, so actual consumption changes too.
- **How to reconcile**: export the key's usage from the SiliconFlow console and compare it with the WeChat message log; view Wechatai credits separately in the account details. Without your real usage and quote, we cannot say which version is more cost-effective.

To switch models, use \`/wx models\` to see numbers in the current channel, then \`/wx model <number>\`. To move to another channel, send \`/wx channels\` to see numbers, then \`/wx channel <number>\`. Old sessions are kept, but the current context is not carried over; resend the material in the target session.`,
    },
  ],
  faq: [
    {
      question: "Does using Qwen in WeChat always require SiliconFlow?",
      answer:
        "No. This page uses SiliconFlow as an example because one key can call many models the platform offers. The Qwen (Alibaba Cloud Model Studio) preset fills in the Beijing endpoint. Enter your own API key and save the channel, then sync available models or add a model manually. For another region or a dedicated endpoint, choose Custom first and enter the endpoint from the provider documentation.",
    },
    {
      question: "Are the SiliconFlow key and Wechatai credits the same thing?",
      answer:
        "No. The SiliconFlow key is used to send requests to the model platform, and model fees settle with SiliconFlow under your account; Wechatai credits meter message relay by actual input and output tokens. The model provider and Wechatai meter and reconcile separately; if the daily Wechatai grant is enough, no top-up is needed.",
    },
    {
      question: "What if no Qwen model appears after saving the channel?",
      answer:
        "Click Fetch available models to sync again. If it is still missing, check which models and permissions the account has in the SiliconFlow console, then click Add model and enter the full model ID manually. An empty model list does not mean the key is invalid; treat the save result and model sync result separately.",
    },
    {
      question: "How do I confirm I connected Qwen and not another model?",
      answer:
        "Use /wx status to see the current channel and model configuration; do not judge the model by its self-introduction. A model may call itself a brand or version, but that is generated text. Trust the model ID saved on the channels page and the test connection result.",
    },
    {
      question: "Does Qwen support sending images or files?",
      answer:
        "Attachments require Plus; only image input requires the chosen model to support vision. PDFs, DOCX, and text files with extractable content are parsed to text first and do not need a vision model. Vision differs across Qwen versions; test with one clear image and do not infer from the family name. Plain text chat does not need these conditions.",
    },
  ],
  related: [
    { label: "Which models WeChat ClawBot supports", href: "/wechat-clawbot-models" },
    { label: "Using Kimi in WeChat", href: "/wechat-kimi" },
    { label: "Using GLM in WeChat", href: "/wechat-glm" },
    { label: "Model providers and connection methods", href: "/docs/model-providers" },
    { label: "Channels and model configuration", href: "/docs/channels-models" },
    { label: "Pricing and free quota", href: "/pricing" },
  ],
  updatedAt: "2026-11-18",
};

export default [
  {
    path: "/wechat-qwen",
    title: "Connect Qwen to WeChat: SiliconFlow Tutorial | Wechatai",
    description: content.description,
    updatedAt: "2026-11-20",
    content,
  },
] satisfies readonly TranslationPage[];
