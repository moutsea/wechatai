import type { SeoPage } from "../../seo-pages";
import type { TranslationPage } from "../index";
import { CLOUD_AGENT_COST_NOTE_EN } from "./copy/t4-notes";

const content: SeoPage = {
  path: "/wechat-bot",
  kind: "comparison",
  title: "How to build a WeChat bot: three routes and their risks",
  description:
    "There are three ways to build a WeChat bot: a personal-account protocol bot, a WeCom self-built app, and the WeChat ClawBot plugin. This guide compares their use cases and account risks and explains what the Wechatai route can and cannot do.",
  eyebrow: "WeChat bot",
  h1: "How to build a WeChat bot: choose the right route first",
  lede: "The search term \"WeChat bot\" mixes three very different things: a bot that auto-replies to friends, an app for companies, and an AI assistant inside the official plugin channel. Pick the wrong route and every tutorial that follows is wasted.",
  answer:
    "There are three routes for a WeChat bot. The first uses a protocol or client injection on a personal account to auto-reply; it is a third-party tool, violates platform rules, and risks a ban, so this site does not recommend it. The second creates a self-built app in WeCom for internal use, where messages travel through WeCom rather than personal WeChat. The third authorizes a service through WeChat Settings → Plugins → WeChat ClawBot, which is the official entry Wechatai uses.",
  primaryKeyword: "WeChat bot",
  secondaryKeywords: ["WeChat AI bot", "WeChat auto reply AI", "how to build a WeChat bot"],
  highlights: [
    "Separate the three routes first",
    "No dodging the personal-account protocol risk",
    "Wechatai uses the official ClawBot entry",
  ],
  sections: [
    {
      id: "routes",
      title: "Three routes in one table",
      body: `| Route | Who it suits | What it needs | Main limit |
| --- | --- | --- | --- |
| Personal-account protocol bot | People who want to auto-reply to friends or send bulk messages | A third-party tool, usually requiring account credentials | Non-official client, violates platform rules, ban risk |
| WeCom self-built app | Company or team alerts and office scenarios | WeCom admin rights, app and callback configuration | Organization-facing; messages stay inside WeCom, not personal WeChat |
| WeChat ClawBot plugin | Individuals who want AI in their own WeChat | A platform that provides server-side AI | One-to-one chat only, and the platform must support ClawBot access |

The question is not which route is stronger but which one stays within the rules. Each is covered below.`,
    },
    {
      id: "protocol-bot",
      title: "Personal-account protocol bot: auto-replies, and possibly a ban",
      body: `These tools usually log in by simulating the WeChat client (commonly called the iPad protocol or PC protocol) or by injecting code into the WeChat client to send, receive, and auto-reply.

It can indeed do "friend sends a message, bot answers", and that is exactly the problem: the [Tencent WeChat Software License and Service Agreement](https://oper.my-qcloud.com/cgi-bin/readtemplate?lang=zh_CN&s=default&t=weixin_agreement) explicitly restricts logging in to or operating WeChat with third-party software, plugins, or add-ons not developed or authorized by Tencent. Tencent support's definition of add-ons also includes emulators and non-official multi-instance clients.

The consequence is not "a ban for certain" but **the platform holds full discretion**: it may restrict some features or ban the account outright, with no promise of a warning first. More practically, these tools usually require handing account credentials to a third party, which creates its own account-security problem.

This site does not provide operating instructions for this route and does not recommend running such tools on a personal account. The risk mechanics, penalty levels, and a self-check list are in [can using AI in WeChat get my account banned](/wechat-ai-ban-risk).`,
    },
    {
      id: "wecom",
      title: "WeCom self-built app: for organizations, not personal WeChat",
      body: `If the need is "internal company notifications and Q&A", the proper approach is a **WeCom self-built app**: an admin creates the app in the admin console, configures the callback URL and trusted domain for receiving messages, and the server verifies the signature before sending and receiving.

Its boundary is clear:

- Messages travel inside **WeCom**, not your personal WeChat. Using it to auto-reply to personal friends is not this route.
- It requires WeCom admin rights, so an individual cannot enable it alone.
- Conversations with external WeChat customers involve capabilities and permissions such as customer contact, with higher configuration and compliance requirements.

It suits internal assistants, alert bots, approvals, and knowledge Q&A; it is not a replacement for a personal WeChat AI assistant.`,
    },
    {
      id: "clawbot",
      title: "WeChat ClawBot plugin: the official entry for individuals",
      body: `WeChat opened a channel for AI: under Me → Settings, in the Features group, open Plugins → WeChat ClawBot and scan to bind a service that provides AI. An AI contact then appears in WeChat.

- The channel itself does not provide a model; the bound service answers.
- No WeChat client modification and no simulated protocol login.
- The binding belongs to the WeChat account, so changing phones keeps it, while changing WeChat accounts requires scanning again.

Wechatai uses this route: configure your own model API key and text model, then bind with the WeChat ClawBot QR code. To use the available Plus cloud assistant Xiaowei, add and enable the plugin, then send \`/use shortcut\` to enter it. Without a separately assigned model it follows the ordinary model selected for that WeChat account, and after entering the plugin it continues the last ordinary model; assign a fixed model in the plugin when needed. **There is no way to bypass ClawBot**, and an ordinary scan cannot replace the binding flow inside the plugin. Full steps are in [how to use the WeChat ClawBot plugin](/wechat-clawbot).`,
    },
    {
      id: "scope",
      title: "What Wechatai can and cannot do",
      body: `| Can | Cannot |
| --- | --- |
| Chat in a ClawBot one-to-one conversation and switch models and plugins | Use group chats or provide a group-chat switch |
| Web Q&A, AI image generation, roleplay, personal assistant, notifications | Auto-reply to your WeChat friends or handle socializing for you |
| Connect OpenClaw or Hermes agents on your machine | Read contacts or scrape friend lists |
| Bind up to 10 WeChat links on Plus | Add friends automatically, send bulk messages, or act on Moments |

Wechatai is a relay and plugin platform that connects models and agents to WeChat. With your own API, model fees are paid separately to your API provider; text is charged by weighted tokens. Free includes 100 credits per day, 1 WeChat link, and 1 plugin; Plus is ¥9.9/month or ¥88/year.

${CLOUD_AGENT_COST_NOTE_EN} Configuration is covered in the [Xiaowei guide](/docs/cloud-agent).`,
    },
    {
      id: "risk",
      title: "Risk boundary: the official entry is not zero risk",
      body: `Using the official ClawBot entry means no client modification and no protocol simulation, so that class of risk does not exist. But it **does not exempt account behavior management**: an account that also sends marketing bulk messages, uses add-ons, or runs non-official multi-instance clients can still be actioned by the platform.

Another often-ignored risk is the supply chain: if you connect an agent that can execute tools, instructions inside third-party skills or plugins can cause trouble, and that risk is unrelated to AI itself.

The test can be reduced to one sentence: **is the entry official, and does the account behave like a normal user?** When both hold, the risk is not fundamentally different from everyday WeChat use; no third-party service can guarantee an account will never be restricted.`,
    },
  ],
  faq: [
    {
      question: "Is there a free WeChat bot?",
      answer:
        "Yes. Wechatai Free charges nothing, grants 100 credits per day, and binds 1 WeChat link and 1 plugin through the ClawBot plugin channel. With your own model, API calls are paid separately to the model provider, a second bill independent of credits. Xiaowei requires Plus and an enabled service.",
    },
    {
      question: "Can a personal-account WeChat bot get banned?",
      answer:
        "There is a ban risk. A personal-account protocol bot needs a simulated client or injected code, which is a third-party tool explicitly restricted by the platform. The platform has discretion, may restrict features or ban the account, and does not promise a warning first; this site does not recommend it.",
    },
    {
      question: "Can a WeCom self-built app auto-reply to personal WeChat friends?",
      answer:
        "It cannot replace personal WeChat. Messages in a WeCom self-built app travel inside WeCom and require an admin to configure it; conversations with external WeChat customers need additional customer-contact permissions and do not serve personal auto-replies to friends.",
    },
    {
      question: "Does Wechatai support group chats?",
      answer:
        "Not currently. Wechatai handles only your one-to-one messages with WeChat ClawBot and has no group-chat switch; @shortcut is plugin invocation syntax inside a one-to-one chat, not a group feature.",
    },
    {
      question: "Does a Wechatai bot need a client or a computer left on?",
      answer:
        "Ordinary conversation and built-in plugins do not. Configure your own API key, scan to bind WeChat, and use it; model calls happen on the server. Only when connecting an agent such as OpenClaw or Hermes that runs on your machine does that device need to stay online.",
    },
  ],
  related: [
    { label: "Can using AI in WeChat get my account banned?", href: "/wechat-ai-ban-risk" },
    { label: "Compare the ways to use AI in WeChat", href: "/wechat-ai-options" },
    { label: "How to use the WeChat ClawBot plugin", href: "/wechat-clawbot" },
    { label: "Connect WeChat (docs)", href: "/docs/getting-started" },
    { label: "Pricing and free quota", href: "/pricing" },
  ],
  updatedAt: "2026-11-12",
};

export default [
  {
    path: "/wechat-bot",
    title: "How to Build a WeChat Bot: Three Routes | Wechatai",
    description: content.description,
    updatedAt: "2026-11-20",
    content,
  },
] satisfies readonly TranslationPage[];
