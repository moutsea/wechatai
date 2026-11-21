import type { SeoPage } from "../../seo-pages";
import type { TranslationPage } from "../index";

const content: SeoPage = {
  path: "/wechat-claude",
  kind: "tutorial",
  title: "Connect Claude to WeChat Without Installing Claude Code",
  description:
    "Connect Claude to WeChat without Claude Code or a bridge service. Enter one API key using the Anthropic Messages protocol, scan a QR code, and chat in WeChat.",
  eyebrow: "Claude × WeChat",
  h1: "Connect Claude to WeChat: the path that skips the bridge",
  lede: "Using Claude in WeChat is often described as requiring a bridge for Claude Code. If you only need a conversation in WeChat, calling the API directly is a shorter path.",
  answer:
    "There are two ways to use Claude in WeChat: bridge Claude Code, which needs an always-on machine and maintenance, or connect Claude's API key directly through the Anthropic Messages protocol, which only needs a QR scan and no always-on computer. The latter provides model chat only: it does not read local files, run commands, or use your Claude chat subscription quota.",
  primaryKeyword: "connect Claude to WeChat",
  secondaryKeywords: [
    "use Claude in WeChat",
    "Claude WeChat bot",
    "Claude API WeChat",
    "WeChat Claude tutorial",
  ],
  highlights: [
    "No Claude Code required",
    "Direct Anthropic Messages protocol",
    "Check tools and vision per model",
  ],
  sections: [
    {
      id: "two-roads",
      title: "Bridging Claude Code and calling the API are different things",
      body: `The bridge approach runs Claude Code on your own device and uses a bridge program to forward WeChat messages. It needs the device to stay online and requires maintaining Claude Code and the bridge; when the device shuts down or sleeps, new tasks cannot be handled.

The second approach is often overlooked: Claude offers an API, and one key using the **Anthropic Messages protocol** connects the model to WeChat. The model runs on the server, independent of whether your computer is online.

The difference in one sentence: **a bridge connects a tool to WeChat; a direct API connects the model to WeChat.** If you need Claude to read and write local files or run commands, the bridge is the meaningful choice. For conversation, summaries, and code snippets, the direct API is enough and simpler.

> Note: the Claude Code CLI can sign in through a supported Claude subscription or use an Anthropic Console API key, which is billed by API usage and does not require a separate subscription. A Claude chat subscription does not include separate API quota; Wechatai needs your own API key to call Claude. See the [official Claude Code documentation](https://code.claude.com/docs/en/overview) for sign-in options.`,
    },
    {
      id: "why-claude",
      title: "What Claude suits: check four conditions first",
      body: `Claude is a family of models, not one fixed capability. Whether it suits your task depends on the specific model and account permissions. Check these four conditions before configuring:

- **Context length**: to read a long document in one go, check that model ID's context window and maximum output against your input limit. Input is still limited by Wechatai configuration and the model window; split by chapter when needed.
- **Local files and commands**: reading or writing local files and running commands require an online agent or tool environment with the right permissions (for example, a bridged Claude Code). An ordinary API conversation has no local file access and only sends the text and attachments you enter in WeChat.
- **Image and file input**: attachments require Plus; only image input requires vision. TXT, DOCX, and text-extractable PDFs are parsed to text first and do not require a vision model; scanned PDFs need OCR first. See [Images, files, and voice](/docs/attachments) for file types and size limits.
- **Cost and account permissions**: billed at the provider's public unit price for that model ID and your token usage, with Wechatai credits separate. Whether your account can use the model is decided by the console. Without your own usage and quote, we cannot say whether Claude costs more or less than another model.

After checking, if the task really needs long context or code reading, configure Claude as a model to switch to on demand. Which model to use for everyday Q&A depends on the unit prices you checked and your own test results; there is no default that holds for every account.

To switch: use \`/wx models\` to see numbers, then \`/wx model <number>\` to switch to Claude. If Claude is in another channel, send \`/wx channels\` first, then \`/wx channel <number>\`. Each model continues its own most recent active session, or creates one. Old chat history is kept, but context is not handed to Claude automatically; send the material again after switching.`,
    },
    {
      id: "config",
      title: "Setup steps",
      body: `1. **Create a key**: create an API key in the Anthropic console and confirm the available models and balance.
2. **Add a channel**: open [Channels & models](/app/channels), click Add channel, choose Claude (Anthropic) as the provider, and enter the API key; the protocol and official endpoint are filled in. For a third-party channel, choose Custom (third-party channel / other protocol) and enter the protocol, Base URL, and secret from the provider's docs.
3. **Confirm the text model**: a new preset channel tries to import models automatically. Check the text model list on the channel card; for a custom channel, click Fetch available models. If fetching fails or the needed model is missing, click Add model and enter the model ID from the provider docs.
4. **Set limits and test**: use the edit button on the model row to set input and output limits, then click the lightning icon, Test connection. The system sends a fixed test request with no message from you; a successful test deducts credits normally, and the upstream API may also bill.
5. **Scan to bind WeChat**: once the model works, open Connect WeChat and generate a QR code. In WeChat, open Settings, go to the Features group, then Plugins → WeChat ClawBot → Scan, scan, and confirm.
6. **Verify**: send “Hello,” then use \`/wx status\` to confirm the current model.

The official preset uses the Anthropic Messages protocol. Third-party channels may offer different compatible interfaces; choose the protocol from their docs and check the actual request endpoint preview on the page. A failed model fetch does not mean the channel was not saved; add the model manually and test.`,
    },
    {
      id: "long-context",
      title: "Practical advice for long documents",
      body: `When handling long documents in WeChat, the bottleneck is often the input method, not the model:

- **Turn the material into usable input first**: send a document as a file (see [Images, files, and voice](/docs/attachments) for limits; Plus required). A screenshot can only be read if the chosen model supports image input; a text-only model cannot read it, so convert it to text first.
- **Feed it in parts**: pasting too much at once hits the input limit. Send it chapter by chapter and let context accumulate in the same session.
- **Specify the output format**: “Use three heading levels and a bullet list, no more than 500 words” is much more useful than “summarize.”
- **Use sessions**: send \`/wx new\` to start a separate session for each document so tasks do not mix.

If you do this often, consider raising the output limit; long output costs more credits (output counts at 8× weight). The calculation is explained in [Membership and credits](/docs/credits).`,
    },
    {
      id: "cost",
      title: "How to calculate costs: two separate bills",
      body: `The exact amount depends on the model ID you choose, the provider's current price list, and the input/output ratio. Rather than give a multiplier, here is a structure you can verify:

- **Model fees**: billed by Anthropic (or its authorized channel) at that model's token prices, based on the provider bill. Chinese long documents usually have far more input than output.
- **Relay fees**: Wechatai charges credits for the input and output tokens it actually meters. The same volume uses the same rate regardless of model brand. After switching models, reply length and history context may change, so actual consumption changes too.
- **Output costs more**: for every model, output counts at 8× weight in credits, so long answers consume faster than long questions.
- **How to reconcile**: export the key's usage and bill from the provider console, compare with the message log in WeChat, and add the two costs separately.

When comparing costs, check both the provider unit price and actual input/output volume. Start with the [cost estimate](/pricing#estimate), enter the prices you found and expected usage, then decide from actual consumption whether to make it your default. Without your own usage and quote, this site does not claim Claude is more or less expensive than another model.`,
    },
  ],
  faq: [
    {
      question: "Do I need Claude Code to use Claude in WeChat?",
      answer:
        "No. Use a Claude API key through the Anthropic Messages protocol. Of the two paths compared here, only the bridge has local file and command access; that also needs an online agent or tool environment. An ordinary API conversation only handles the text and attachments you send.",
    },
    {
      question: "Can a Claude subscription be used as an API?",
      answer:
        "No. Claude subscriptions (Pro/Max) are for chat clients and Claude Code. The API is a separately billed product; create a key and add credit in the console.",
    },
    {
      question: "Can I send images to Claude in WeChat?",
      answer:
        "It depends on whether the specific model supports image input: attachments require Plus, and the chosen model ID must support vision, otherwise it errors or ignores the image. Voice needs WeChat transcription to text; without transcription, send text. Test with one image; do not infer from the brand.",
    },
    {
      question: "Can Claude and DeepSeek be configured at the same time?",
      answer:
        "Yes. Configure their channels and models separately, use /wx channels to see channel numbers and /wx channel <number> to switch, then /wx models and /wx model <number> to choose a model. Each model continues its own active session and context is not shared automatically.",
    },
    {
      question: "Is it safe to access Claude through a third-party relay?",
      answer:
        "It depends on whether the relay is trustworthy and whether the provider terms and your local rules allow it: your messages and key pass through it. Look for encrypted key storage and public information about the forwarding path and operating entity. If that matters, use Anthropic's official endpoint; this site does not recommend using any relay to evade regional restrictions or provider rules.",
    },
  ],
  related: [
    { label: "Which models WeChat ClawBot supports", href: "/wechat-clawbot-models" },
    { label: "Using DeepSeek in WeChat", href: "/wechat-deepseek" },
    { label: "Using GPT in WeChat", href: "/wechat-gpt" },
    { label: "WeChat AI with your own API key", href: "/bring-your-own-api-key" },
    { label: "Channels and model configuration", href: "/docs/channels-models" },
    { label: "Pricing and free quota", href: "/pricing" },
  ],
  updatedAt: "2026-11-10",
};

export default [
  {
    path: "/wechat-claude",
    title: "Connect Claude to WeChat Without Claude Code | Wechatai",
    description: content.description,
    updatedAt: "2026-11-20",
    content,
  },
] satisfies readonly TranslationPage[];
