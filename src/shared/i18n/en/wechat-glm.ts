import type { SeoPage } from "../../seo-pages";
import type { TranslationPage } from "../index";

const content: SeoPage = {
  path: "/wechat-glm",
  kind: "tutorial",
  title: "Connect GLM to WeChat through a SiliconFlow channel",
  description:
    "Connect Zhipu GLM to WeChat: create a key at SiliconFlow, sync models through a Wechatai preset channel, verify the full model ID, test the connection, and bind ClawBot by QR code. Includes fees and troubleshooting.",
  eyebrow: "GLM × WeChat",
  h1: "Connect GLM to WeChat through SiliconFlow",
  lede: "GLM is a model family and WeChat is a channel; between them you still need a usable model channel. Fill a SiliconFlow key into a Wechatai preset and the two ends connect.",
  answer:
    "To use GLM in WeChat, add a SiliconFlow channel in Wechatai, enter the SiliconFlow API key, sync the available models, select the GLM model ID your account can actually call, test the connection, and bind through the WeChat ClawBot QR code. The SiliconFlow preset fills in the protocol and endpoint; model availability, permissions, and prices follow the SiliconFlow console.",
  primaryKeyword: "connect GLM to WeChat",
  secondaryKeywords: [
    "use GLM in WeChat",
    "Zhipu GLM WeChat",
    "SiliconFlow GLM",
    "GLM WeChat bot",
    "GLM WeChat tutorial",
  ],
  highlights: [
    "SiliconFlow preset channel",
    "Verify the full model ID",
    "Switch models as needed",
  ],
  sections: [
    {
      id: "two-layers",
      title: "Model, channel, and WeChat are three things",
      body: `Connecting GLM to WeChat involves three roles:

- **GLM**: Zhipu's model family, which determines conversation, reasoning, and tool-calling behavior. The exact model depends on what your account can call.
- **SiliconFlow**: the model channel, offering an OpenAI Chat Completions compatible interface. You create the key there, and it settles model fees against your account.
- **Wechatai and WeChat ClawBot**: Wechatai stores the channel configuration, forwards messages, and meters credits; on the WeChat side you still bind through ClawBot, and Wechatai cannot open that entry for you.

If any layer is missing, the symptom is "no reply in WeChat". Confirm the WeChat entry first, then that the channel tests successfully, and only then investigate chat settings.`,
    },
    {
      id: "setup",
      title: "Setup: from key to first message",
      body: `1. **Create a key.** In the SiliconFlow console, create an API key, confirm the account status, and note the full GLM model ID you intend to use.
2. **Add a channel.** Open [Channels & models](/app/channels), click Add channel, and select SiliconFlow as the provider. The preset fills in the OpenAI Chat Completions protocol and platform endpoint, so you do not assemble the path yourself.
3. **Save and sync.** Paste the key and click Save and fetch models. After a successful sync, check the text model list; if the target model is absent, click Fetch available models to retry.
4. **Add the model manually.** If it is still missing, click Add model and enter the full model ID from the SiliconFlow docs. Then set input and output limits and verify with the lightning icon, Test connection.
5. **Bind WeChat.** After the test passes, open Connect WeChat and generate a QR code, then scan from WeChat Settings → Features → Plugins → WeChat ClawBot → Scan. After binding, send \`/wx status\` to confirm the current channel and model. If they do not match, use \`/wx channels\` to list channel numbers and \`/wx channel <number>\` to select one, then \`/wx models\` to list model numbers and \`/wx model <number>\` to select one. Once the channel and model are correct, send "Hello".

Testing the connection and chatting both consume Wechatai credits, and SiliconFlow may bill for calls. For text chat only, leave web access, image generation, and attachment plugins unconfigured for now.`,
    },
    {
      id: "model-check",
      title: "Whether a model works is decided by the test",
      body: `GLM models differ in context length, tool calling, and vision. Do not infer from the family name:

- **Use the full model ID.** Copy it from the SiliconFlow console and mind the version, date suffix, and casing. Entering only "GLM" does not identify a model.
- **Permissions and balance.** A model shown in the console is not necessarily callable with the current key. When the test fails, check permissions, balance, and the model name against the error.
- **Test capabilities separately.** To use tool calling, test with a plugin that clearly requires an action; image input needs Plus and a model with vision. A successful text test does not prove the other capabilities.
- **Keep the preset protocol.** This tutorial uses OpenAI Chat Completions. When troubleshooting, restore the SiliconFlow preset before testing the connection.

This site does not hard-code a GLM model list or unit prices, because the platform changes availability, naming, and billing. The page can confirm the configuration path and the verification method.`,
    },
    {
      id: "cost-diagnose",
      title: "Two bills and common failures",
      body: `Check fees as two separate bills:

- **Model fees.** SiliconFlow settles against your account, the selected GLM model, and actual tokens; unit prices follow the console bill.
- **Relay fees.** Wechatai charges credits for actual input and output tokens, and switching models changes consumption because reply length and context change.
- **Do not mix balances.** The SiliconFlow account balance is not Wechatai credits; topping up one does not refill the other.

| Symptom | Check first | Action |
| --- | --- | --- |
| Saving the channel fails | Whether the key is complete and the account is usable | Copy the key again, trim whitespace, and confirm the account status |
| No GLM models appear | Sync result and account permissions | Click Fetch available models; if still missing, add the model ID manually |
| The connection test fails | Model ID, balance, protocol | Check each against the error and restore the preset protocol |
| WeChat does not reply | Binding state, current channel and model | Test the connection in Wechatai first, then check \`/wx status\` |
| Long text is cut off | Input and output limits and message length | Adjust the model limits and send material in parts |

Switch models with \`/wx models\` to list numbers and \`/wx model <number>\` to select; switch channels with \`/wx channels\` first. Old sessions are kept, but context does not move to the new model automatically.`,
    },
  ],
  faq: [
    {
      question: "Does using GLM in WeChat require SiliconFlow?",
      answer:
        "This page uses SiliconFlow as the example. If you already have a Zhipu open-platform key, choose the Zhipu GLM preset when adding a channel, enter your key, and check the model ID against Zhipu's docs. WeChat binding is the same on both paths, and each platform settles its own fees.",
    },
    {
      question: "What is the difference between a GLM API key and Wechatai credits?",
      answer:
        "The API key is used to make model requests to SiliconFlow or Zhipu, and that platform settles model fees against your account; Wechatai credits meter message relay by actual input and output tokens. The model provider and Wechatai meter and reconcile separately; when the daily Wechatai allowance is enough, no top-up is needed.",
    },
    {
      question: "What if the target GLM model is missing after syncing?",
      answer:
        "Click Fetch available models to retry. If it is still missing, check which models and permissions the account has in the SiliconFlow console, then click Add model and enter the full model ID. Do not substitute a similar name; a mismatched model ID fails immediately.",
    },
    {
      question: "Can GLM read images or files?",
      answer:
        "Attachments need Plus, and images also require the selected model to support vision; files are limited by format and text extraction. GLM models differ, so test with a clear image or a text-extractable PDF rather than inferring from the family name.",
    },
    {
      question: "Can I switch to Qwen or Kimi after setup?",
      answer:
        "Yes. They are different channels or models and can coexist in the account. Use /wx channels to list channel numbers and switch, then /wx models and /wx model <number> to choose a model. Each model keeps its own active session, and context does not transfer automatically.",
    },
  ],
  related: [
    { label: "Which models WeChat ClawBot supports", href: "/wechat-clawbot-models" },
    { label: "Using Qwen in WeChat", href: "/wechat-qwen" },
    { label: "Using Kimi in WeChat", href: "/wechat-kimi" },
    { label: "Model providers and access methods", href: "/docs/model-providers" },
    { label: "Channel and model configuration", href: "/docs/channels-models" },
    { label: "Pricing and free quota", href: "/pricing" },
  ],
  updatedAt: "2026-11-18",
};

export default [
  {
    path: "/wechat-glm",
    title: "Connect GLM to WeChat via SiliconFlow | Wechatai",
    description: content.description,
    updatedAt: "2026-11-20",
    content,
  },
] satisfies readonly TranslationPage[];
