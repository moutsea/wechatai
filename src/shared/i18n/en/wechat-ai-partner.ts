import type { SeoPage } from "../../seo-pages";
import type { TranslationPage } from "../index";

const content: SeoPage = {
  path: "/wechat-ai-partner",
  kind: "product",
  title: "A WeChat AI companion in your everyday chat",
  description:
    "A WeChat AI companion puts a large model in your WeChat chat box for writing, learning, fitness check-ins, and venting, through three built-in plugins: personal assistant, notifications, and roleplay. It is not a social product and has no community.",
  eyebrow: "WeChat AI companion",
  h1: "A WeChat AI companion: the regular in your chat box",
  lede: "The key word is not AI but regular: the same conversation, the same model, ready to continue where you left off every day. That matters more than a feature list in deciding whether it actually gets used.",
  answer:
    "A WeChat AI companion is the practice of connecting a large model to WeChat so it becomes a fixed conversation partner in your daily chat box. Wechatai connects the model through your own API key and the WeChat ClawBot plugin; the built-in personal assistant, notifications, and roleplay cover notes and reminders, scheduled pushes, and character conversations. It is not a social product, has no community, and does not read your contacts.",
  primaryKeyword: "WeChat AI companion",
  secondaryKeywords: [
    "WeChat AI buddy",
    "WeChat chat companion",
    "AI in WeChat",
    "how to use an AI companion",
  ],
  highlights: [
    "A model in your everyday chat box",
    "Three built-in plugins for daily scenarios",
    "No community and no contact access",
  ],
  sections: [
    {
      id: "what",
      title: "First, a companion is a usage pattern, not a product category",
      body: `"WeChat AI companion" is not the official name of a feature; it describes a way of using one: put a model in the chat box you open every day and keep talking to it in the same conversation.

- It means the same thing as a WeChat AI assistant, but emphasizes a long-term daily relationship rather than one-off tool calls.
- It is **not a social product**. No stranger community, no matching, no feed; you talk to a model you configured.
- It **does not read your contacts, friend list, or anyone else's chat history**. Wechatai handles only your one-to-one messages with WeChat ClawBot.

To understand the connection methods first, see [WeChat AI assistant](/wechat-ai); to compare built-in, commercial, self-hosted, and BYOK options, see [options compared](/wechat-ai-options).`,
    },
    {
      id: "scenarios",
      title: "Four common scenarios and the plugin each uses",
      body: `| Scenario | Built-in plugin | How to start in WeChat |
| --- | --- | --- |
| Writing: revise, title, polish | Ordinary model chat | Send the paragraph and add "make it more conversational" |
| Learning: explain concepts, generate exercises | Ordinary model chat; DS Chat when you need sources | "Explain it so a high-school student understands", or \`@ds look up...\` |
| Fitness check-ins, to-dos, expenses | Personal assistant | "Note: 40 squats today", "Remind me to submit the documents at 9 tomorrow" |
| Venting, companionship, a fixed persona | Roleplay | \`/use shortcut\` to enter the character, then talk normally |

These scenarios need different configuration: ordinary chat depends only on a channel and model; the personal assistant needs a model that supports tool calls; roleplay can use a built-in character or your own persona or character card; DS Chat also needs a search service.

Plugin slots are limited: Free includes 100 credits per day, 1 WeChat link, and 1 plugin, so it is better to get one common scenario working first; Plus is ¥9.9/month or ¥88/year with unlimited plugins, which allows several at once.`,
    },
    {
      id: "plugins",
      title: "Configuring the three built-in plugins so they are actually used daily",
      body: `**Personal assistant:** notes, expenses, to-dos, and reminders in one plugin. It needs a model that supports tool calls; set the default currency and the WeChat link that receives reminders on the web, and save a shortcut name such as "assistant". Reminders use Beijing time and support one-time, daily, and weekly repeats; a reminder firing does not call the model or consume credits. Records belong to this plugin configuration, up to 10,000 per configuration, and clearing the chat does not clear them.

**Notifications:** a webhook entry, not a conversation. After configuring a dedicated token, one HTTP request pushes text to WeChat, and the push consumes no credits. It suits server alerts, orders, and script results, not chatting.

**Roleplay:** for long conversations with a fixed persona. Start from a built-in original character or import a character card; each character can bind a different model and switch by shortcut in WeChat. The persona, opening line, and world book are stored in the plugin configuration; see [roleplay](/docs/roleplay).

The personal assistant and roleplay are invoked by shortcut: \`/use shortcut\` enters, \`/exit\` returns to the ordinary model, and \`@shortcut content\` calls once. Notifications are triggered by an HTTP request to the server, need no \`/use\`, and do not switch the current model or plugin.`,
    },
    {
      id: "setup",
      title: "From sign-up to the first message: four steps",
      body: `1. Sign up and sign in ([register](/register)). No client installation and no always-on computer.
2. Add a provider under [channels and models](/app/channels), enter your API key, confirm the text model list on the channel card, then click the lightning icon, Test connection, on the model row. The test makes a real request and is billed normally.
3. Open Connect WeChat and generate a QR code, then bind from WeChat Me → Settings, under the Features group, via Plugins → WeChat ClawBot → Scan. If the entry is missing, check the WeChat version and account rollout first; Wechatai has no way to bypass ClawBot binding.
4. Send "Hello" in WeChat, then send \`/wx status\` to confirm the current model. Once replies work, configure plugins for the scenarios above.

Full field descriptions are in the [usage guide](/docs/getting-started), and configuration details are in [channels and models](/docs/channels-models).`,
    },
    {
      id: "limits",
      title: "What it cannot do, stated up front",
      body: `- **Ordinary chat is user-initiated.** Personal-assistant reminders and notification webhooks can push proactively, but they are still limited by a valid connection and WeChat's 24-hour reply window after recent interaction.
- **No group chats.** It handles only one-to-one messages with WeChat ClawBot and has no group switch.
- **It does not take over friend messages.** It will not reply to your friends' WeChat for you or read their chat history.
- **No community and no matching.** The companion is a model you configured, not a real person on a platform.
- **Your own API is billed separately.** With your own model, this site charges relay credits, and your API provider charges model calls; the two bills are separate.
- **Free has usage limits.** 100 credits per day, 1 WeChat link, 1 plugin. If the allowance runs out, wait for the next day's grant or buy credits; more connections and plugin slots need Plus, and buying credits does not increase them.

The boundary between access methods and account risk is covered in [can using AI in WeChat get my account banned](/wechat-ai-ban-risk).`,
    },
  ],
  faq: [
    {
      question: "Is a WeChat AI companion free?",
      answer:
        "You can use Free: 100 credits per day, 1 WeChat link, and 1 plugin. How many uses that covers depends on input, replies, and history length; model API fees are charged by your own provider and calculated separately from Wechatai credits.",
    },
    {
      question: "Will it message me proactively?",
      answer:
        "Ordinary chat is user-initiated. Personal-assistant reminders and notification webhooks can push proactively, requiring a valid connection and WeChat's 24-hour reply window after recent interaction. Reminders fire on Beijing time, and the push itself does not call the model or consume credits; unbinding WeChat or deleting the plugin configuration stops the related reminders.",
    },
    {
      question: "Can it read my contacts and friends' chats?",
      answer:
        "No. Wechatai handles only your one-to-one messages with WeChat ClawBot, does not read contacts, and does not take over conversations with friends. There is no authorization such as read friend list on the site.",
    },
    {
      question: "What is the difference between a companion and roleplay?",
      answer:
        "Companion is a general term; the chat partner can be an ordinary model or a character with a defined persona. The roleplay plugin handles the fixed persona, opening line, and world book; for casual chat, the ordinary model is enough and does not need a plugin slot.",
    },
    {
      question: "Does a WeChat AI companion require a computer left on?",
      answer:
        "No. Ordinary conversation and the built-in plugins run on the server, so closing WeChat on your phone does not stop the next session. Only connecting an agent such as OpenClaw or Hermes that runs on your machine depends on that device staying online.",
    },
  ],
  related: [
    { label: "WeChat AI assistant: connect your own model", href: "/wechat-ai" },
    { label: "Using roleplay in WeChat", href: "/docs/roleplay" },
    { label: "WeChat AI with your own API key", href: "/bring-your-own-api-key" },
    { label: "WeChat AI options compared", href: "/wechat-ai-options" },
    { label: "Pricing and free quota", href: "/pricing" },
  ],
  updatedAt: "2026-11-14",
};

export default [
  {
    path: "/wechat-ai-partner",
    title: "A WeChat AI Companion in Everyday Chat | Wechatai",
    description: content.description,
    updatedAt: "2026-11-20",
    content,
  },
] satisfies readonly TranslationPage[];
