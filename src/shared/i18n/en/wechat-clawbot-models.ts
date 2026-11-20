import type { SeoPage } from "../../seo-pages";
import type { TranslationPage } from "../index";

const CLOUD_AGENT_COST_NOTE =
  "Xiaowei is available to Plus members once the operator enables it. It uses the text model you configured in Wechatai, and model API fees are paid to the provider separately. The platform charges credits for the task input and final reply text, and each returned image costs 5 credits; non-image files are not charged extra. Execution count is separately limited.";

const content: SeoPage = {
  path: "/wechat-clawbot-models",
  kind: "product",
  title: "Which Models Does WeChat ClawBot Support? Channels vs. Models",
  description:
    "ClawBot does not provide a model or an API key. Which models work depends on what you bind. This page covers the three protocols, common combinations, switching models, and why simulated tests differ from real provider tests.",
  eyebrow: "ClawBot × models",
  h1: "Which models does WeChat ClawBot support?",
  lede: "People searching this question usually want a model list. The real answer: ClawBot has no list. It is a channel, and the model lives on the end you bind.",
  answer:
    "ClawBot has no built-in model and does not provide an API key. Which models it “supports” depends on the service you bind: a bring-your-own-key relay can use models that speak OpenAI Chat Completions, OpenAI Responses, or Anthropic Messages; a packaged agent is limited by that agent's own support.",
  primaryKeyword: "which models does WeChat ClawBot support",
  secondaryKeywords: [
    "WeChat ClawBot models",
    "can ClawBot use GPT",
    "does ClawBot need my own API",
    "WeChat ClawBot DeepSeek",
  ],
  highlights: [
    "Channel and model are two layers",
    "Three protocol adapters, each feature checked",
    "Switch models without rebinding",
  ],
  sections: [
    {
      id: "two-layers",
      title: "Why there is no single answer",
      body: `Answers differ because “which models does ClawBot support” is really two questions:

- **About the channel**: does the ClawBot link itself restrict models? Almost not at all. It forwards messages and attachments; it does not parse model brands or decide model capabilities.
- **About the service you bind**: which models does that service support? That depends on which protocols it implements, whose key it accepts, and which models are enabled for the account.

So the right question is: **which models does the end I am binding support?** On Wechatai's side, the answer is: adapters for three protocols; models and features still need testing.

This also explains a common confusion. One tutorial says “ClawBot supports GPT-4o, Claude, and DeepSeek,” another says “it only supports one vendor.” Both can be right; they describe their own bound services, not ClawBot itself.`,
    },
    {
      id: "protocols",
      title: "Three protocols, chosen by the provider's API",
      body: `When adding a channel, choosing a provider fills in the protocol and endpoint. For third-party endpoints or a different protocol, choose Custom (third-party channel / other protocol) and fill it in from the provider's docs:

| Protocol | Typical targets | Notes |
| --- | --- | --- |
| OpenAI Chat Completions | Services that declare compatibility, such as DeepSeek, Moonshot, and Zhipu | Many compatible implementations; follow the paths and fields listed by the provider |
| OpenAI Responses | The official OpenAI API and some compatible proxy services | Text and tool calls need verification per model; provider built-in tools are not enabled automatically |
| Anthropic Messages | The official Claude API and compatible implementations | Requests use \`/v1/messages\` and the \`x-api-key\` header; check model capabilities against official docs |

The check is simple: open your API provider's docs and see whether its example is \`/v1/chat/completions\`, \`/v1/responses\`, or \`/v1/messages\`. They map to the table above. The wrong protocol is the most common cause of “configured but no reply.”

For field differences between the three protocols and input/output limit settings, see [Channels and models](/docs/channels-models).`,
    },
    {
      id: "compatibility",
      title: "Feature compatibility: confirm chat first, then test what you need",
      body: `Wechatai adapts the three protocols below. **The adapters are tested against simulated APIs; that does not mean every provider has been tested or that your account has been verified.** Test with your own key to see whether a specific model works. Implementation checked: 2026-11-09.

| Capability | Chat Completions | Responses | Anthropic Messages | Conditions and failure handling |
| --- | --- | --- | --- | --- |
| Ordinary text chat | Adapter covered by simulated API tests | Adapter covered by simulated API tests | Adapter covered by simulated API tests | Needs a valid key, correct model ID, and balance; test the connection first |
| Plugin tool calls | Adapter covered by simulated API tests | Adapter covered by simulated API tests | Adapter covered by simulated API tests | The native tool flow needs upstream support for tool fields; when DS Chat is first explicitly refused tools, it can try a JSON-action compatibility flow and still really performs the search or reading; check other plugins against their own requirements |
| Image / file input | Assembly covered by simulated API tests | Assembly covered by simulated API tests | Assembly covered by simulated API tests | Requires Plus; images also need model vision, and files are limited by format and parsing |
| Web search | Configure through DS Chat | Configure through DS Chat | Configure through DS Chat | Requires a separate search service; an ordinary model does not go online just because the protocol matches |
| AI images | Separate plugin | Separate plugin | Separate plugin | Uses the images/generations API and a supported image model; not a capability the chat protocol provides |
| WeChat voice | Treated as text when WeChat includes transcription | Same | Same | Without transcription, send text; there is no AI voice reply |
| Any third-party / self-hosted model | Not individually tested | Not individually tested | Not individually tested | A compatibility claim does not guarantee every parameter; confirm the service endpoint is reachable from the public internet |

**Confirm usability in three steps.** Test connection and chat consume credits, and the upstream API may also bill; see [cost estimate](/pricing#estimate) first.

1. **Test connection**: open [Channels & models](/app/channels), find the text model, and click the lightning icon, Test connection. On failure, check the key, model ID, and balance using the error; field details are in the [configuration docs](/docs/channels-models).
2. **Send one message in WeChat**: after connecting WeChat, send “Hello, introduce yourself in one sentence” and confirm a reply. Use \`/wx status\` to check the configured model; do not trust the model's self-introduction as proof of its version. If you only need text chat, stop here.
3. **Test other features as needed**: for web access, first configure DS Chat's search API, then ask a question that needs current information and open the sources to check dates and content. For images or files, Plus users can send a clear image and a text-extractable PDF, then ask the model to restate the content; images also require model vision. Users who only chat in text do not need to upgrade to test attachments. Format and size limits are in [attachments](/docs/attachments).`,
      details: {
        summary: "Advanced troubleshooting: record test conditions and results",
        body: `When a problem is hard to reproduce or you need to compare providers, add this information:

- **Configuration and time**: record the provider, protocol, full model ID, test time, and the actual request endpoint preview shown on the page; also confirm the account has permission for that model.
- **Where it fails**: record the results of test connection, WeChat text, web access, and attachments separately, and keep the error messages. When DS Chat's first request is explicitly refused for tool calls, it can try the JSON-action compatibility flow; do not infer that other plugins support this approach.
- **Cost**: when reconciling, compare the provider's usage and bill with Wechatai's credit details, recording the two costs separately.
- **Reporting**: include the fewest steps that reproduce the problem and the error message, with API keys, phone numbers, QR codes, and private chat content removed. One success only means the model completed that test under that configuration; it does not mean other accounts or features will work.

Implementation references: [protocol and model constraint tests](https://github.com/moutsea/wechatai/blob/main/test/model-compatibility.test.ts), [tool-call tests](https://github.com/moutsea/wechatai/blob/main/test/llm-tools.test.ts), and [attachment tests](https://github.com/moutsea/wechatai/blob/main/test/attachments.test.ts). These tests use simulated APIs and cover request construction, parsing, and error handling. They cannot verify a real provider's network, rate limits, billing, tool-call quality, or image recognition, and they do not enable a provider's client-side built-in tools. Public source code is not an independent security audit.`,
      },
    },
    {
      id: "combinations",
      title: "Common combinations: choose by task, not by brand ranking",
      body: `Connected to WeChat, differences come from the model ID you choose, account permissions, and plugin configuration. Here is how to choose by task conditions that you can verify, not by “which brand is better”:

- **Only Chinese everyday conversation on a budget**: check the provider's input/output prices for each model ID and run your real usage through the [cost estimate](/pricing#estimate), then configure a cheap model that supports text chat. See [Using DeepSeek in WeChat](/wechat-deepseek).
- **Reading long documents or editing code**: check the candidate model's context window and maximum output, and confirm your input limit fits the material. Local files or commands require agent bridging; an API chat cannot do it. See [Using Claude in WeChat](/wechat-claude).
- **Tool calls or external services**: check the plugin's requirements first, then verify real execution. The native tool flow needs model support for the corresponding fields; when DS Chat is first told tools are unsupported, it can try the JSON-action compatibility flow, but the model must still return valid actions. Protocol compatibility does not mean provider built-in tools work. See [Using GPT in WeChat](/wechat-gpt).
- **Image input**: requires Plus attachments and a model with vision. Test with one image; do not infer from the brand.
- **An existing self-hosted or relay service**: any service compatible with one of the three protocols works, which suits teams with a gateway or private deployment; the endpoint must be publicly reachable.

A safe approach is **two models by task**: one that you calculated to be cost-effective for everyday text, another for long documents or complex tasks. Use \`/wx models\` to see numbers, then \`/wx model <number>\` to switch. Old chat history is kept, but the current context is not automatically handed to the other model.`,
    },
    {
      id: "switch",
      title: "How to switch models, and what happens",
      body: `Checking status, listing models, and switching models are three different actions:

- **Check the current model or plugin**: \`/wx status\`.
- **List model numbers in the current channel**: \`/wx models\`.
- **Switch the normal model**: \`/wx model <number>\`, for example \`/wx model 2\`.
- **Switch channels**: send \`/wx channels\` to see numbers, then \`/wx channel <number>\`; once in that channel, list and choose models.

Switching the normal model enters the **target model's most recent active session**, or creates one. Old sessions and chat history are kept, but the current context is not carried over automatically; resend the material in the target session. To start a blank conversation with the target model, send \`/wx new\`.

If you were in a plugin, switching the normal model **leaves plugin mode** and does not change the model configured for plugin replies. To return to a plugin, use \`/wx plugins\` to see aliases, then \`/use <alias>\`.

These switch commands do not consume credits and do not require rebinding WeChat. After switching, use \`/wx status\` to confirm the current state.

For the full command list, see the [WeChat command reference](/docs/commands).`,
    },
    {
      id: "cost",
      title: "Who gets paid: the real decision behind the model question",
      body: `This is the real decision behind “which models does ClawBot support”; who gets your money differs completely by model:

- **A platform that sells tokens**: you pay the platform, and the platform pays the model provider. Convenient, but you usually cannot audit upstream unit prices per request, and switching providers is limited by what the platform supports.
- **Bring your own API key**: you pay the model provider directly under its official price list; Wechatai charges only credits for message relay metering. Transparent, and you can switch to a provider whose prices and availability you have checked.

Wechatai's ordinary model chat and the optional [Xiaowei](/docs/cloud-agent) both use the model and API key you configure. ${CLOUD_AGENT_COST_NOTE}`,
    },
  ],
  faq: [
    {
      question: "Does ClawBot include a model?",
      answer:
        "No. ClawBot is the WeChat-side access channel and only passes messages. The model comes from the service you bind, so “which models ClawBot supports” depends on which protocols that end implements.",
    },
    {
      question: "Do I need to buy my own API key to use ClawBot?",
      answer:
        "It depends on the service you bind. With a bring-your-own-key relay, you first open an account with the model provider and get a key. With a platform service, the platform usually collects model fees and you do not buy a separate key.",
    },
    {
      question: "Can I connect multiple models at the same time?",
      answer:
        "Yes. Use /wx models to see model numbers in the current channel, then /wx model <number> to switch. Across channels, use /wx channels and /wx channel <number>. Switching does not require rebinding WeChat, but you enter the target model's own session and context is not shared automatically.",
    },
    {
      question: "Does ClawBot support locally deployed models?",
      answer:
        "As long as the model exposes an HTTP interface compatible with one of the three protocols, it can be connected. Note that a local model needs a publicly reachable address; Wechatai cannot reach a LAN-only address.",
    },
    {
      question: "Does switching models charge credits again?",
      answer:
        "Switching itself does not consume credits. Text chat is metered by weighted token, and the rate does not change with the model brand; AI images cost 5 credits each with prompt text billed separately. Model usage is charged separately by your API provider.",
    },
  ],
  related: [
    { label: "How the WeChat ClawBot plugin works", href: "/wechat-clawbot" },
    { label: "WeChat AI with your own API key", href: "/bring-your-own-api-key" },
    { label: "Channels and model configuration (docs)", href: "/docs/channels-models" },
    { label: "Using DeepSeek in WeChat", href: "/wechat-deepseek" },
    { label: "Using Claude in WeChat", href: "/wechat-claude" },
    { label: "Using Kimi in WeChat", href: "/wechat-kimi" },
    { label: "Using Qwen in WeChat", href: "/wechat-qwen" },
    { label: "Using GLM in WeChat", href: "/wechat-glm" },
    { label: "Pricing and free quota", href: "/pricing" },
  ],
  updatedAt: "2026-11-18",
};

export default [
  {
    path: "/wechat-clawbot-models",
    title: "Which Models Does WeChat ClawBot Support? | Wechatai",
    description: content.description,
    updatedAt: "2026-11-20",
    content,
  },
] satisfies readonly TranslationPage[];
