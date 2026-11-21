import type { SeoPage } from "../../seo-pages";
import type { TranslationPage } from "../index";

const content: SeoPage = {
  path: "/wechat-clawbot",
  kind: "tutorial",
  title: "How to Use the WeChat ClawBot Plugin: Binding, Entry, and No Replies",
  description:
    "The WeChat ClawBot plugin is WeChat's open channel for AI services. This guide covers where it lives, how to bind by scanning, what to do when the entry is missing, and how to troubleshoot no replies after binding.",
  eyebrow: "ClawBot plugin",
  h1: "WeChat ClawBot plugin: entry, binding, and no-reply troubleshooting",
  lede: "ClawBot is a door WeChat opened for AI, but it is not AI itself and does not provide models. Once you separate those layers, binding and troubleshooting become much simpler.",
  answer:
    "Generate a QR code on Wechatai's WeChat connections page, scan it from WeChat → Me → Settings → Plugins → WeChat ClawBot → Scan, then send /wx help in the matching chat to verify the connection. Scanning needs no model or API key. Ordinary chat needs a channel and text model; users with an existing Muse, OpenClaw, or Hermes agent, or notification-only users, can configure directly on the Plugins page.",
  primaryKeyword: "WeChat ClawBot",
  secondaryKeywords: [
    "how to use WeChat ClawBot",
    "WeChat ClawBot plugin",
    "bind WeChat ClawBot",
    "WeChat ClawBot entry missing",
    "WeChat ClawBot not replying",
  ],
  highlights: [
    "Separate the channel from the model",
    "Binding takes about 30 seconds",
    "Five no-reply causes you can check yourself",
  ],
  steps: [
    {
      title: "Get a connection QR code",
      text: "Open the WeChat connections page in the Wechatai workspace and generate your QR code. Scanning does not require a configured model.",
    },
    {
      title: "Scan to bind",
      text: "In WeChat, open Me → Settings, go to the Features group, then Plugins → WeChat ClawBot → Scan, scan the QR code from Wechatai, and confirm.",
    },
    {
      title: "Verify the connection",
      text: "Send /wx help in the newly bound WeChat chat. Once you receive the help reply, configure ordinary chat, an existing agent, or notifications as needed.",
    },
  ],
  sections: [
    {
      id: "what",
      title: "What ClawBot is, and what it is not",
      body: `In one sentence: **ClawBot is the door, not the furniture in the room.**

- It is an **access channel provided by WeChat**. It hands WeChat messages to an AI service and brings the result back.
- It **does not provide a model** and has no API key of its own. Whatever model the service you bind uses is the model you get in WeChat.
- It is **not WeChat's built-in AI assistant**. WeChat's own AI features (chat-history search, input suggestions) are a separate system unrelated to ClawBot, and the two do not conflict.

If you miss this distinction, you get the common confusion: “I bound ClawBot, so why does it know nothing?” ClawBot itself knows nothing; the service behind it answers you.`,
    },
    {
      id: "entry",
      title: "What to do when the ClawBot entry is missing",
      body: `If you cannot find the ClawBot entry, check these three things in order:

1. **The rollout is still gradual**: ClawBot is enabled in batches. On the same WeChat version, some accounts have the entry and others do not. Phone model and registration date matter little; this is account-level rollout.
2. **WeChat is out of date**: check for updates under Me → Settings → About WeChat, then fully quit and reopen WeChat after updating.
3. **The path is wrong**: open WeChat → Me → Settings, go to the Features group, then Plugins → WeChat ClawBot, and use Scan there.

If the entry is still missing, first confirm your WeChat version and whether the feature has been enabled for your account. **Wechatai also connects through WeChat ClawBot**; there is no separate binding that bypasses the plugin entry. An ordinary Scan cannot replace the plugin binding flow in this guide. For details, see [Getting started](/docs/getting-started).`,
    },
    {
      id: "bind",
      title: "The full scan-to-bind flow",
      body: `1. Sign in to Wechatai and generate a QR code on the WeChat connections page.
2. In WeChat, open Me → Settings, go to the Features group, then Plugins → WeChat ClawBot → Scan, scan the code, and confirm authorization.
3. Wait until Wechatai shows the connection as online, then send \`/wx help\` in the matching WeChat chat. A help reply means messages can flow both ways.

Next, choose by purpose:

- **Ordinary model chat**: under Channels & models, choose a provider, enter the API key, and select a text model, then send “Hello” in WeChat. Test connection on the model row makes a normally billed request. See [Channels and models](/docs/channels-models).
- **Existing agent**: go to Plugins, add Muse, OpenClaw, or Hermes, generate the matching connection instruction, and complete pairing. See [Connecting agents to WeChat](/wechat-agent).
- **Notifications only**: add the Notifications plugin, choose the receiving WeChat profile, generate a dedicated token, and send your first push following the [notifications guide](/docs/notifications).`,
    },
    {
      id: "no-reply",
      title: "Bound but not replying: troubleshoot in this order",
      body: `Work from the link closest to you downward; do not reinstall first:

| Symptom | Most likely cause | What to do |
| --- | --- | --- |
| No messages for more than 24 hours; proactive reminders or background results not delivered | The reply window may have expired | Send a message in the matching WeChat chat to refresh the reply window |
| Message sent, but it waits forever | The server never received it, or the model request timed out | Resend a shorter message; send \`/wx status\` to check the link state |
| A “quota exhausted” style message | Credits are used up | Send \`/wx balance\` to check, then wait for the next daily grant or top up |
| An error from the model provider | Invalid API key, insufficient balance, or wrong model name | Check the key, endpoint, and model name in channel settings |
| Only some messages get no reply | Attachments or very long text hit a limit | Attachments require Plus; split long text and resend |
| No reaction at all | The WeChat link is offline | Generate a new QR code and bind again; check whether another login displaced it |

**The 24-hour window mainly affects proactive pushes or delayed replies after a long period without interaction.** The WeChat ClawBot detail page states that replies must be delivered within 24 hours of your message. Sending a new message in the matching WeChat chat refreshes the reply window; expired tasks are not guaranteed to be resent.

**If even a brand-new message gets no reply, do not blame the window.** Continue checking whether Wechatai received the message, the WeChat connection state, and whether the model request or agent is running. An expired window alone does not require rebinding; only an invalid authorization requires scanning again.

Troubleshoot in a **direct chat** with WeChat ClawBot. Wechatai does not support group chats and has no group-chat switch. First use \`/wx balance\` to check credits and \`/wx status\` to confirm the current model or plugin, then test the model connection on the channels page. For the full command list, see the [WeChat command reference](/docs/commands).`,
    },
    {
      id: "safety",
      title: "Will my account be banned? The short answer",
      body: `Risk depends on the connection method; “open-source self-hosted” or “managed service” alone does not settle it. Official channels, reverse-engineered protocols, and hook injection are three different things and sit in different places under platform rules.

Wechatai connects through the **official WeChat ClawBot plugin channel with QR authorization**. It does not inject code into the client or modify your WeChat app. But no third-party service can guarantee an account will never be restricted; enforcement belongs to the platform, not the service provider.

For connection methods, enforcement rules, Skill supply-chain risk, and a self-check list, see [Can using AI in WeChat get my account banned?](/wechat-ai-ban-risk).`,
    },
  ],
  faq: [
    {
      question: "Is the WeChat ClawBot plugin free?",
      answer:
        "ClawBot itself is a channel provided by WeChat and does not charge users for models. But the channel still needs a service that provides AI, and that service decides its own costs: token-selling platforms charge by usage, while bring-your-own-key setups settle with your own API provider.",
    },
    {
      question: "Can I connect Wechatai without the ClawBot entry?",
      answer:
        "Wechatai currently connects through the WeChat ClawBot plugin and has no binding method that bypasses this entry. First check your WeChat version and whether the feature is enabled for your account, then connect through Settings → Plugins → WeChat ClawBot → Scan.",
    },
    {
      question: "It never replies after binding. Is my account banned?",
      answer:
        "In most cases, no. First check whether the link is online, whether credits are exhausted, whether the API key is valid, and whether the model name is correct. A ban usually shows up as an account-level warning, not as a single silent chat.",
    },
    {
      question: "Can a ClawBot connection through Wechatai be used in group chats?",
      answer:
        "Not currently. Wechatai only handles direct messages between you and WeChat ClawBot and has no group-chat switch. Ask questions or use commands in a direct chat; @plugin-alias is also a direct-chat invocation, not a group feature.",
    },
    {
      question: "Do I need to rebind after changing phones or WeChat accounts?",
      answer:
        "The binding lives on the WeChat account side. Changing phones does not matter; changing WeChat accounts requires scanning again. Signing in to the same WeChat account on multiple devices does not cause duplicate charges.",
    },
  ],
  related: [
    { label: "Connect a Muse hosted assistant to WeChat", href: "/wechat-muse" },
    { label: "Which models ClawBot supports", href: "/wechat-clawbot-models" },
    { label: "WeChat AI with your own API key", href: "/bring-your-own-api-key" },
    { label: "Compare WeChat AI connection options", href: "/wechat-ai-options" },
    { label: "Connecting WeChat (docs)", href: "/docs/wechat-connection" },
    { label: "WeChat command reference", href: "/docs/commands" },
    { label: "Troubleshooting FAQ", href: "/docs/faq" },
  ],
  updatedAt: "2026-11-19",
};

export default [
  {
    path: "/wechat-clawbot",
    title: "WeChat ClawBot Plugin: Binding, Entry, and No-Reply Fixes | Wechatai",
    description: content.description,
    updatedAt: "2026-11-20",
    content,
  },
] satisfies readonly TranslationPage[];
