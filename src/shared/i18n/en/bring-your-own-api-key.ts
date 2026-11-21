import type { SeoPage } from "../../seo-pages";
import type { TranslationPage } from "../index";

const content: SeoPage = {
  path: "/bring-your-own-api-key",
  kind: "comparison",
  title: "WeChat AI with your own API key: no token markup",
  description:
    "Connect AI to WeChat with your own API key: model fees go to the provider you choose, and relay fees are separate. This guide covers BYOK setup, key storage, and how to compare total cost.",
  eyebrow: "Bring your own key",
  h1: "Connect AI to WeChat with your own API key",
  lede: "With your own API key, model fees go to the provider you choose, while Wechatai relay fees are calculated separately. Whether that saves money depends on actual usage and on the quotes for the alternatives.",
  answer:
    "Bring your own key (BYOK) means the platform does not supply model quota: you enter an API key issued by your model provider, and the platform forwards WeChat messages. Wechatai works this way. Model fees follow the chosen provider's price list and bill, while the relay portion is charged in credits by actual metered usage; the two charges are reconciled separately.",
  primaryKeyword: "WeChat with your own API key",
  secondaryKeywords: [
    "BYOK WeChat bot",
    "WeChat AI without buying tokens",
    "connect your own model to WeChat",
    "BYOK WeChat AI",
  ],
  highlights: [
    "Model fees go straight to the provider",
    "Change providers without changing tools",
    "Keys are encrypted and can be deleted anytime",
  ],
  sections: [
    {
      id: "why",
      title: "What BYOK changes about fees and responsibilities",
      body: `Platform services usually bundle the model and the service into one quote. With your own key, you manage the model provider account and the relay fee is calculated separately. Either structure requires checking total spend; the model unit price alone is not enough.

The main differences with your own key are:

1. **Model fees are settled separately.** You pay according to the provider you chose, while Wechatai membership or credit spend is counted on top. When you use a third-party service, check that service's own quote too.
2. **The model is replaceable.** You can configure another provider, verify its protocol, endpoint, and model ID, test it, and switch without rebinding WeChat.
3. **The bill is auditable.** Check model usage against the provider's bill, then review Wechatai credit consumption, confirming the two charges separately.

The trade-off is clear: you sign up with the provider, manage the key, and carry the provider's balance and rate limits. BYOK is a fit only if you accept those three responsibilities.`,
    },
    {
      id: "four-questions",
      title: "Four questions to ask before deciding",
      body: `Any service that claims to support your own key deserves these four checks:

**1. Where is the key stored?**
On the server, and it should be encrypted. Wechatai encrypts the key at rest and binds decryption to the account context, so a single ciphertext pulled from the database cannot be used on its own. If a platform says "the key only lives in your browser", it probably calls the model directly from the browser, which limits what it can do.

**2. Whose network carries the request?**
Bringing your own key does not mean requests leave from your phone. Wechatai sends on the server: your message passes through Wechatai to the model provider. The provider therefore sees Wechatai's egress IP, not yours. If that matters, self-host instead.

**3. Who pays, and can you verify it?**
Model fees go to the provider, relay fees to the platform; the two are separate. Wechatai charges text by weighted tokens, image generation at 5 credits per image plus the description text, and the rate does not change with the model brand. The [pricing page](/pricing) documents the full calculation.

**4. Can you leave with your data?**
The key can be deleted at any time. Wechatai is an MIT-licensed open-source project: the code is public, and you can deploy it to your own Cloudflare account.`,
    },
    {
      id: "compare",
      title: "How the two paths actually differ",
      body: `| Dimension | Platform sells tokens | Bring your own key (Wechatai) |
| --- | --- | --- |
| Getting started | Sign up and use | Need a provider account and key first |
| Fee settlement | Platform plan or credit quote, usually bundling model and service | Model fees follow the chosen provider; relay fees separate |
| Switching models | Only what the platform supports | Any compatible protocol, switch anytime |
| Vendor lock-in | Strong | Weak |
| Bill audit | Platform credits only | Itemized provider dashboard |
| Usage ceilings | Set by the platform | Wechatai credit balance, per-request limits, provider balance and rate limits |
| Best for | People who do not want to configure anything | People already using APIs who care about cost and control |

**Credits and model fees are different things.** Text chat consumes credits by weighted input and output tokens; a low model unit price does not guarantee a lower total. Compare with the same model, the same input and output volume, and include Wechatai membership or credit spend.

Even when the model provider still has balance, new paid requests pause when the Wechatai credit balance is zero or negative. Each request must also stay within the configured input, output, and credit limits; see [membership and credits](/docs/credits).`,
    },
    {
      id: "how",
      title: "Connecting your own key to WeChat",
      body: `About five minutes end to end:

1. **Get a key from the provider.** Sign in to the model provider's console, create an API key, and confirm the account balance and available models. For a third-party service, also get its Base URL and protocol.
2. **Add a channel.** Open [Channels & models](/app/channels), click Add channel, choose the provider, and enter the API key. A preset fills in the endpoint and protocol; for a third-party endpoint, choose Custom (third-party channel / other protocol) and enter the connection details. Models are configured separately after the channel is saved.
3. **Confirm the text model.** A new preset channel tries to import models automatically; for a custom channel, click Fetch available models. Check the text model list on the channel card. If the model is missing, click Add model and enter the model ID from the provider docs.
4. **Test the connection.** Click the lightning icon, Test connection, on the text model row. The system sends a fixed test request; you do not type a message. A normal test deducts credits, and the upstream API may bill as well.
5. **Scan to connect WeChat.** Once the model is configured and tested, open Connect WeChat and generate a QR code. In WeChat, open Settings, go to the Features group, then Plugins → WeChat ClawBot → Scan, scan, and confirm.
6. **Verify in WeChat.** Send "Hello", then send \`/wx status\` to confirm the current model and \`/wx balance\` to see credits.

If fetching models fails, the channel may still be saved; add the model manually from the provider docs instead of recreating the channel. When troubleshooting, test the specific model's connection first, then check the WeChat link and the current model. See the [usage guide](/docs/getting-started).`,
    },
    {
      id: "fit",
      title: "When not to bring your own key",
      body: `To be honest: this path is not for everyone.

- **You just want to click and use it.** Signing up with a provider, managing balance, and handling rate limits is extra work for many people. A platform service is simpler.
- **Your usage is tiny and irregular.** If you ask a few dozen questions a month, the provider's minimum top-up may cost more than platform pay-as-you-go.
- **You need team sharing and cost allocation.** A own-key setup is naturally a personal account model; one key shared by several people is hard to audit. Wechatai supports multiple WeChat links per account (10 on Plus), but it remains a personal tool.
- **You need compliant procurement and invoices.** For company purchasing, follow the provider's and platform's formal processes.

Having an API key or knowing your usage helps with setup and estimates, but it does not by itself show which option is cheaper. Use the [cost estimator](/pricing#estimate) to work out model and credit usage, then compare provider fees plus Wechatai membership or credit spend against the alternative's quote at the same volume; check cache discounts, plans, and daily allowances as well.`,
    },
  ],
  faq: [
    {
      question: "What does bringing your own API key mean?",
      answer:
        "It means you obtain an API key from a model provider (for example DeepSeek, Anthropic, OpenAI, or a third party with a compatible protocol) and enter it into the tool. The tool does not supply model quota; it relays messages, and the provider charges model fees according to its official price list.",
    },
    {
      question: "Is it cheaper without buying tokens?",
      answer:
        "Not necessarily. For the same model and the same input and output volume, add the provider's model fees to Wechatai membership or credit spend, then compare that total with the alternative's quote. Cache discounts, plans, and daily allowances also affect the result; already having an API key does not mean a lower total cost.",
    },
    {
      question: "Is my API key safe on your servers?",
      answer:
        "Keys are stored encrypted and decrypted only with the account context; plaintext does not appear in logs or pages. The key is used only to make requests to your model provider on your behalf, and you can delete it at any time. If the key must never leave your device, self-host instead.",
    },
    {
      question: "Can I connect my own model service?",
      answer:
        "Yes, if your service exposes an endpoint compatible with OpenAI Chat Completions, OpenAI Responses, or Anthropic Messages. The endpoint must use a public HTTPS domain on the default port (443).",
    },
    {
      question: "Does bringing your own key make an account ban more likely?",
      answer:
        "Ban risk comes mainly from the access method (reverse-engineered protocols, client injection), not from whether you bring your own key. Wechatai uses the official plugin channel with QR authorization and does not inject code into the client. No third-party integration can guarantee immunity from account risk controls.",
    },
  ],
  related: [
    { label: "Compare the ways to use AI in WeChat", href: "/wechat-ai-options" },
    { label: "Which models WeChat ClawBot supports", href: "/wechat-clawbot-models" },
    { label: "Can using AI in WeChat get my account banned?", href: "/wechat-ai-ban-risk" },
    { label: "Pricing and free quota", href: "/pricing" },
    { label: "Channel and model configuration (docs)", href: "/docs/channels-models" },
    { label: "Membership and credits (docs)", href: "/docs/credits" },
    { label: "Plugin protocol and open source", href: "/developers/plugins" },
  ],
  updatedAt: "2026-11-10",
};

export default [
  {
    path: "/bring-your-own-api-key",
    title: "WeChat AI With Your Own API Key | Wechatai",
    description: content.description,
    updatedAt: "2026-11-20",
    content,
  },
] satisfies readonly TranslationPage[];
