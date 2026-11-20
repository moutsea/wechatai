import type { SeoPage } from "../../seo-pages";
import type { TranslationPage } from "../index";
import { CLOUD_AGENT_COST_NOTE_EN, OWN_API_COST_NOTE_EN } from "./copy/t4-notes";

const content: SeoPage = {
  path: "/wechat-ai-privacy",
  kind: "article",
  title: "WeChat AI privacy: chat history, API keys, and deletion",
  description:
    "Three questions matter most when using AI in WeChat: where the key is stored, where the conversation is stored, and whether it can really be deleted. This page covers Wechatai's practices and limits on all three, and states that it is not affiliated with WeChat or Tencent.",
  eyebrow: "Privacy and data",
  h1: "WeChat AI privacy: three paths explained",
  lede: "\"Who can see my chat history\" has no one-sentence answer. It is much clearer when split into three paths: the key, the conversation content, and the model call.",
  answer:
    "Wechatai is not officially affiliated with WeChat, Tencent, or any model provider. A bring-your-own API key is stored encrypted on the server, and the API never returns the secret. Requests with your own model go to the provider you configured; Xiaowei tasks are sent to the operator's AGT service and the model provider you choose. Platform chat and cloud task bodies can be cleared, while assistant records must be deleted separately; deleting on the platform does not delete copies or memory at WeChat, the model provider, or AGT.",
  primaryKeyword: "WeChat AI privacy",
  secondaryKeywords: [
    "where WeChat AI chat history is stored",
    "can an API key leak",
    "is Wechatai safe",
  ],
  highlights: [
    "Keys are encrypted and never returned by the API",
    "Clearing the platform is not remote deletion",
    "No official affiliation with WeChat or Tencent",
  ],
  sections: [
    {
      id: "affiliation",
      title: "First, this is not an official WeChat feature",
      body: `Wechatai is a third-party service, **officially unaffiliated with WeChat, Tencent, or any model provider**, and is not endorsed by them.

The AI contact you see in WeChat comes from WeChat's own ClawBot plugin channel: WeChat provides the channel, but the service you bind decides who answers behind it. So:

- Wechatai does not read your contacts, friend list, or Moments, and has no API permission to do so.
- WeChat still stores messages under its own rules; that does not change because you use Wechatai.
- The conversation records you see on the Wechatai website are Wechatai's own copy, independent of WeChat's.

In other words, any claim to be an "official WeChat AI assistant" implying internal permissions deserves a question mark.`,
    },
    {
      id: "apikey",
      title: "API keys: encrypted at rest, never returned by the API",
      body: `Bringing your own API key means the secret passes through this site. Specifically:

1. After submission, the key and WeChat connection credentials are **encrypted at rest on the server** (AES-GCM, with the key derived from the deployment's \`ENCRYPTION_KEY\` and bound to the purpose as associated data).
2. Public interfaces such as the channel list and plugin settings **return only whether it is configured** (\`hasKey: true/false\`), never the secret, and pages always show a mask.
3. Model calls decrypt on the server and forward to the provider address you entered, without going through the browser.
4. Deleting a channel or plugin deletes the corresponding credentials.

Two things must be acknowledged: this is not end-to-end encryption, and the server can obtain the plaintext key at the moment of forwarding, so the trust basis is the service provider itself. Also, once the key falls into someone else's hands, the bill is yours: set a separate spending limit for this key and do not reuse your main account's key.

For the three protocols and how to enter them, see [WeChat AI with your own API key](/bring-your-own-api-key).`,
    },
    {
      id: "records",
      title: "Where chat records live and how to delete them",
      body: `Conversation messages, conversation summaries, and notes and to-dos in the personal assistant are stored under **your own account**, not mixed with other accounts.

The scope of each cleanup action:

| Action | Actual effect |
| --- | --- |
| Clear one conversation's chat | Deletes messages, summaries, and related cloud task bodies, keeping the conversation; deleting the conversation also removes it |
| Delete all conversation records | Clears all messages, summaries, conversations, and cloud task bodies in one action under My account in the workspace; assistant records must be deleted separately |
| Close the account | Submit a request via [contact us](/contact); conversations, plugin configuration, and assistant records under the account are deleted together, while necessary order and security records may be retained as required by law |

Several easy misunderstandings:

- **Clearing a chat does not clear assistant records.** Notes, ledgers, and to-dos belong to plugin configuration; delete the plugin, delete entries inside it, or export CSV and then delete.
- **The free plan cannot see web history**, but that only means there is no web entry, not that the data does not exist; view it from WeChat when needed.
- Attachments are temporary and stored for about 15 minutes for the model to read; platform-generated image links are usually kept for 30 days.
- Deleting platform records **does not delete WeChat-side chat history**, and does not delete request content retained in the model provider's logs; handle those two in their respective products.
- Clearing or deleting the conversation that owns a cloud task clears the relevant task input and results in Wechatai; settled bills remain, and a late callback does not restore the body. AGT execution history and memory are not deleted by platform cleanup, and cloud conversations in the same account may share memory; request remote retention and deletion by [contacting us](/contact).

The full set of deletion entries and data scope is in the [privacy policy](/privacy).`,
    },
    {
      id: "model-calls",
      title: "Where model calls go and who can see the content",
      body: `This is the most important path: **your conversation content is sent to the model provider**, because the model must read it to answer.

- Requests with your own model go from this site's server to the provider address you entered (OpenAI-compatible, Anthropic, or a relay you run).
- Xiaowei tasks are sent to the operator's AGT service and the model provider you choose; the selected model's channel configuration and key are synced to AGT encrypted for execution, and operator credentials are not issued to users.
- ${OWN_API_COST_NOTE_EN} ${CLOUD_AGENT_COST_NOTE_EN}
- How the provider stores data, for how long, and whether it is used for training depends on **its** policy and your account settings, and this site cannot change that for you. For sensitive content, read the provider's data terms first.
- This site currently does not use chat content to train its own models.

Likewise, when connecting an agent such as OpenClaw or Hermes, the models and tools are yours to configure, and the risk follows the services you connect.`,
    },
    {
      id: "checklist",
      title: "An actionable privacy self-check",
      body: `Spend three minutes on this before use:

1. Was this API key created separately, and does it have a spending limit?
2. What are your model provider's data retention and training policies?
3. Does the conversation contain anything that should not appear in third-party logs, such as passwords, ID numbers, or other people's private information?
4. Do you know where to clear chats and how, and that it does not clear assistant records, AGT history, or memory?
5. Have you downloaded images or files you need to keep?

What this site does is described in the [privacy policy](/privacy) and [terms of service](/terms): infrastructure runs on Cloudflare and payments use Stripe. The site records public page visits and selected key actions such as homepage buttons, quick sign-in, configuration, and payment; analytics do not store raw IP addresses, User-Agent strings, full URLs, or chat content, daily visitors are distinguished by a hash that changes each day, and verification and successful-payment events use a separately keyed deduplication identifier. Analytics are retained for 180 days and respect DNT/GPC; the privacy policy lists the exact events and fields. Operational and security logs still record request time, IP address, and browser information. Account bans and platform rules are a different kind of risk; see [can using AI in WeChat get my account banned](/wechat-ai-ban-risk).`,
    },
  ],
  faq: [
    {
      question: "Is Wechatai related to WeChat or Tencent?",
      answer:
        "No. Wechatai is a third-party service officially unaffiliated with WeChat, Tencent, or model providers; it connects through the official WeChat Plugins → WeChat ClawBot channel but is not itself a WeChat feature.",
    },
    {
      question: "Can my API key leak?",
      answer:
        "The key is stored encrypted on the server, public interfaces return only whether it is configured and never the key, and pages always show a mask. This is not end-to-end encryption, though: the server can obtain plaintext while forwarding, so create a dedicated key and set a spending limit.",
    },
    {
      question: "Where are chat records stored, and can they be fully deleted?",
      answer:
        "Platform messages, conversation summaries, and cloud task bodies can be cleared, and assistant records must be deleted separately; clearing a conversation keeps the conversation itself. Platform deletion does not delete WeChat-side records, model provider logs, or AGT execution history and memory. Contact us for remote retention and deletion requests.",
    },
    {
      question: "Does Wechatai train models on my chats?",
      answer:
        "It currently does not use chat content to train its own models. The model provider is the part to watch: request content is sent to it, and how it is used depends on its policy and your account settings, which this site cannot control.",
    },
    {
      question: "Do model fees pass through Wechatai?",
      answer: `${OWN_API_COST_NOTE_EN} ${CLOUD_AGENT_COST_NOTE_EN}`,
    },
  ],
  related: [
    { label: "Privacy policy", href: "/privacy" },
    { label: "Terms of service", href: "/terms" },
    { label: "WeChat AI with your own API key", href: "/bring-your-own-api-key" },
    { label: "Xiaowei data and deletion boundaries", href: "/docs/cloud-agent#data" },
    { label: "Can using AI in WeChat get my account banned?", href: "/wechat-ai-ban-risk" },
    { label: "FAQ (docs)", href: "/docs/faq" },
  ],
  updatedAt: "2026-11-12",
};

export default [
  {
    path: "/wechat-ai-privacy",
    title: "WeChat AI Privacy: Keys, Records, Deletion | Wechatai",
    description: content.description,
    updatedAt: "2026-11-20",
    content,
  },
] satisfies readonly TranslationPage[];
