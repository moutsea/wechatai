import type { SeoPage } from "../../seo-pages";
import type { TranslationPage } from "../index";

const content: SeoPage = {
  path: "/wechat-kimi",
  kind: "tutorial",
  title: "Connect Kimi to WeChat with KimiSeek One-Click Import",
  description:
    "Use Kimi in WeChat: link your account through Wechatai's KimiSeek import to bring in the channel and models, then scan to bind WeChat. Setup, model checks, and the two separate bills.",
  eyebrow: "Kimi × WeChat",
  h1: "Connect Kimi to WeChat: start with KimiSeek one-click import",
  lede: "You do not need to find an API key first or build a bridge. After linking KimiSeek, Wechatai imports the channel and tries to sync models; what remains is checking the model and binding WeChat.",
  answer:
    "To use Kimi in WeChat, choose KimiSeek one-click import under Channels & models in Wechatai. After linking the account, the system imports the channel and tries to sync models, with no manual API key entry. Once the needed model is imported, scan through WeChat ClawBot to bind and use it in a direct chat. KimiSeek bills model usage under its own account, while Wechatai credits are metered separately.",
  primaryKeyword: "connect Kimi to WeChat",
  secondaryKeywords: [
    "use Kimi in WeChat",
    "Kimi WeChat bot",
    "KimiSeek one-click import",
    "Kimi API WeChat",
    "WeChat Kimi tutorial",
  ],
  highlights: [
    "KimiSeek one-click import",
    "No manual key entry",
    "The synced model list is authoritative",
  ],
  sections: [
    {
      id: "kimi-and-kimiseek",
      title: "Kimi is the model; KimiSeek is the import channel",
      body: `Kimi is Moonshot AI's model family; KimiSeek is the one-click linking entry provided by Wechatai that brings in the channel configuration and model list. They are not the same thing:

- **Kimi** determines conversation ability, context, and available features; the specific models are those your account can actually call.
- **KimiSeek** links the account, imports the channel, and syncs models. After linking, what appears in Wechatai is an ordinary channel that you can inspect, test, and switch models in like any other.

Connecting Kimi to WeChat really means: first give Wechatai a usable Kimi channel, then connect Wechatai to WeChat. KimiSeek one-click import shortens only the first step; it does not open the WeChat entry for you and cannot bypass ClawBot's QR binding.`,
    },
    {
      id: "import-steps",
      title: "Import and bind in three steps",
      body: `1. **Start linking**: open [Channels & models](/app/channels), click Add channel, then click **kimiseek one-click import** next to Provider. Follow the prompts on the new page to link the KimiSeek account.
2. **Check the model**: return to the Wechatai channels page. The system imports the channel automatically and tries to sync models. Check whether the needed Kimi model appears in the text model list. If not, click Fetch available models first; if it is still missing, add the model ID manually following KimiSeek's docs.
3. **Test and bind WeChat**: click the lightning icon, Test connection, on the model row and confirm it returns a result. Then open Connect WeChat, generate a QR code, and bind through WeChat → Settings → Features → Plugins → WeChat ClawBot → Scan.

Test connection consumes Wechatai credits and may incur upstream billing. After binding, send \`/wx status\` to check the current channel and model. If they do not match, use \`/wx channels\` to see channel numbers and \`/wx channel <number>\` to choose one, then \`/wx models\` to see model numbers and \`/wx model <number>\` to choose a model. Once the channel and model are correct, send “Hello”; text chat does not require search, image generation, or other plugins.`,
    },
    {
      id: "models-and-cost",
      title: "Verify models yourself; costs split into two bills",
      body: `One-click import solves configuration, not an availability promise:

- **Whether a model works**: depends on the KimiSeek account state, import result, and specific model. The page does not ship a fixed list because the synced result changes with the account and platform; trust the Fetch available models result and your own test.
- **Model fees**: settled by KimiSeek under its account and bill. Top-up amounts and billing rules follow KimiSeek's page; Wechatai does not collect model fees.
- **Relay fees**: Wechatai charges credits for the input and output tokens it actually meters, independent of the model brand. Reconcile the two bills separately; do not treat the credits balance as the model balance.
- **Linking**: linking an account alone makes no model call and consumes no Wechatai credits; only sending a message or testing a connection is metered.

Without your real usage and a KimiSeek quote, we cannot say whether Kimi is cheaper than another model. To estimate, enter the prices you found and expected usage in the [cost estimate](/pricing#estimate), then compare with the bill.`,
    },
    {
      id: "diagnose",
      title: "No reply after import: check in order",
      body: `| Symptom | Check first | What to do |
| --- | --- | --- |
| No models in the channel | Whether sync finished and the account has models | Click Fetch available models; if still empty, add the model ID manually per KimiSeek docs |
| Test connection fails | Key, model ID, account balance | Check each item against the error; do not judge the model by its self-introduction |
| WeChat message gets no reply | Current channel and model, WeChat binding state | Confirm the Wechatai side with Test connection, then send \`/wx status\` to see the current configuration |
| Reply cuts off quickly | Input/output limits, message length | Adjust limits in model settings; send long material in parts |

If the ClawBot entry is missing in WeChat, the binding step cannot be completed and Wechatai has no bypass. Use the [access requirements check](/wechat-clawbot) first, then decide whether to continue.

To switch models, use \`/wx models\` to see model numbers in the current channel, then \`/wx model <number>\`. Across channels, send \`/wx channels\` first. Old session records are kept, but context does not move to the new model automatically.`,
    },
  ],
  faq: [
    {
      question: "Do I still need my own API key when importing Kimi through KimiSeek?",
      answer:
        "No manual entry is needed. After linking the KimiSeek account, Wechatai imports the channel and tries to sync models. If the needed model is missing, click Fetch available models; if it is still missing, add the model ID manually per KimiSeek docs and test the connection.",
    },
    {
      question: "Does KimiSeek one-click import charge immediately?",
      answer:
        "Linking an account does not make a model call and consumes no Wechatai credits. When you use a model, KimiSeek and Wechatai meter separately: model fees follow the KimiSeek bill, while Wechatai deducts credits for actual input and output tokens. If the daily Wechatai grant is enough, you do not need to top up.",
    },
    {
      question: "What if the model list is empty after import?",
      answer:
        "Confirm the link completed, then click Fetch available models to retry. If it is still empty, the account may lack permission for that model or the platform may not return a list; confirm the model ID in KimiSeek's docs, add it manually, and verify with Test connection. Do not guess availability from the model name.",
    },
    {
      question: "I already use the official Kimi API. Can I still connect it to WeChat?",
      answer:
        "Yes. When adding a channel, choose the Kimi (Moonshot AI) preset, enter your API key, save, sync or add a model manually, then test the connection and scan to bind WeChat. This path does not use KimiSeek; model fees settle directly with Moonshot AI under your account.",
    },
    {
      question: "Can Kimi be configured alongside Claude and GPT?",
      answer:
        "Yes. They can be different channels or models under the same account. Use /wx channels to see channel numbers and switch, then /wx models and /wx model <number> to choose a model. Each model continues its own active session; old records are kept but context is not shared automatically.",
    },
  ],
  related: [
    { label: "Which models WeChat ClawBot supports", href: "/wechat-clawbot-models" },
    { label: "Using Qwen in WeChat", href: "/wechat-qwen" },
    { label: "Using GLM in WeChat", href: "/wechat-glm" },
    { label: "WeChat AI with your own API key", href: "/bring-your-own-api-key" },
    { label: "Model providers and connection methods", href: "/docs/model-providers" },
    { label: "Channels and model configuration", href: "/docs/channels-models" },
  ],
  updatedAt: "2026-11-18",
};

export default [
  {
    path: "/wechat-kimi",
    title: "Connect Kimi to WeChat with KimiSeek Import | Wechatai",
    description: content.description,
    updatedAt: "2026-11-20",
    content,
  },
] satisfies readonly TranslationPage[];
