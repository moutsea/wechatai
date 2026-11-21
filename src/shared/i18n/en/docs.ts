import type { DocArticle, DocSlug } from "../../docs";
import type { TranslationPage } from "../index";

/**
 * English documentation metadata.
 *
 * The default export is the registration list consumed by `shared/i18n/load`.
 * The named exports carry the fields the docs UI and JSON-LD need, so the page
 * body, navigation and structured data cannot drift from the published paths.
 */
const UPDATED_AT = "2026-11-20";
const BRAND = "Wechatai";

export const EN_DOCS_INDEX_UPDATED_AT = UPDATED_AT;
export const EN_DOCS_TITLE = "WeChat AI tutorials and documentation";
export const EN_DOCS_DESCRIPTION =
  "Wechatai documentation: configure your own model API, connect AI through WeChat ClawBot, and use web-connected answers, image generation, roleplay, the personal assistant, the cloud assistant Xiaowei and notifications. Learn how membership and credits work.";

export const EN_DOC_GROUPS = [
  { id: "start", title: "Getting started" },
  { id: "daily", title: "Everyday features" },
  { id: "plugins", title: "Plugins" },
  { id: "tutorials", title: "Hands-on tutorials" },
] as const;

export interface EnglishDocArticle extends Omit<DocArticle, "slug"> {
  slug: DocSlug;
  path: string;
  /** ISO date of the English translation; drives the sitemap lastmod. */
  updatedAt: string;
}

const articles: readonly Omit<EnglishDocArticle, "path">[] = [
  {
    slug: "getting-started",
    updatedAt: UPDATED_AT,
    seoTitle: "WeChat AI guide: configure a model and connect by QR code",
    title: "Getting started",
    description:
      "Four steps into Wechatai: see how it works, add a provider API key and sync models, scan the QR code with WeChat ClawBot, then enable image generation, roleplay or the cloud assistant as needed. Includes configuration and WeChat connection diagrams.",
    category: "Getting started",
    group: "start",
    requirement: "Requires the WeChat ClawBot entry",
    minutes: 3,
    outcome:
      "Understand how it works, configure a model, connect WeChat, then enable plugins as needed.",
  },
  {
    slug: "channels-models",
    updatedAt: UPDATED_AT,
    seoTitle: "WeChat AI channels and models: API keys, input and output limits",
    title: "Channels and models",
    description:
      "Learn the difference between a channel and a model in Wechatai, add a provider API key, sync and test models, adjust the prompt and input/output limits, then switch models in WeChat. Includes configuration diagrams.",
    category: "Getting started",
    group: "start",
    minutes: 4,
    outcome: "Add an API key, sync and test a model, then start using it in WeChat.",
  },
  {
    slug: "model-providers",
    updatedAt: UPDATED_AT,
    seoTitle: "Supported model providers: DeepSeek, KimiSeek and third-party APIs",
    title: "Supported model providers",
    description:
      "See the model providers Wechatai supports, including DeepSeek, SiliconFlow, OpenAI and Anthropic, plus KimiSeek one-click import and third-party channels compatible with the OpenAI or Anthropic protocols.",
    category: "Getting started",
    group: "start",
    minutes: 2,
    outcome: "Choose a model provider, prepare an API key, or import a channel with KimiSeek.",
  },
  {
    slug: "wechat-connection",
    updatedAt: UPDATED_AT,
    seoTitle: "Connect WeChat: scan to bind AI and manage multiple links",
    title: "Connect WeChat",
    description:
      "Follow the interface walkthrough to get a QR code, confirm it in WeChat ClawBot on your phone, then send a help command to verify the connection. Includes multiple-link management and troubleshooting.",
    category: "Getting started",
    group: "start",
    minutes: 2,
    outcome: "Get a QR code, confirm it on your phone, and verify the connection with one message.",
  },
  {
    slug: "commands",
    updatedAt: UPDATED_AT,
    seoTitle: "WeChat command reference: switch models, plugins and sessions",
    title: "WeChat command reference",
    description:
      "Wechatai WeChat commands: check status, switch models and plugins, create sessions, clear context and view credits. Covers free control commands, metered @ calls, and native OpenClaw and Hermes commands.",
    category: "Everyday features",
    group: "daily",
    minutes: 3,
    outcome: "When you forget a command, come back here to look it up.",
  },
  {
    slug: "sessions",
    updatedAt: UPDATED_AT,
    seoTitle: "WeChat AI sessions and context: new, switch and automatic summaries",
    title: "Sessions and context",
    description:
      "Create, switch and clean up WeChat AI sessions in Wechatai; distinguish resetting context from deleting chat history; and learn about automatic summaries, input limits and Plus web history.",
    category: "Everyday features",
    group: "daily",
    minutes: 5,
    outcome: "Keep topics separate, then pick up an earlier thread when you need it.",
  },
  {
    slug: "attachments",
    updatedAt: UPDATED_AT,
    seoTitle: "WeChat AI images, files and voice guide",
    title: "Images, files and voice",
    description:
      "Send images, PDFs, Word documents or text files to Wechatai in WeChat, then add your instructions. Learn Plus attachment limits, WeChat voice transcription, cloud assistant file conversion and how to retry after a failure.",
    category: "Everyday features",
    group: "daily",
    requirement: "Plus required for images and files",
    minutes: 5,
    outcome: "Send the attachment first, then tell the AI what to do with it.",
  },
  {
    slug: "credits",
    updatedAt: UPDATED_AT,
    seoTitle: "Wechatai membership and credits: allowance, billing and referral rewards",
    title: "Membership and credits",
    description:
      "Understand the difference between Wechatai credits and model API balances, compare Free and Plus, see text and image billing examples, and learn the rules for daily grants, top-ups, negative balances and referral rewards.",
    category: "Everyday features",
    group: "daily",
    minutes: 3,
    outcome: "Pick a plan, understand charges, and know how to top up when credits run low.",
  },
  {
    slug: "faq",
    updatedAt: UPDATED_AT,
    seoTitle: "WeChat AI FAQ: connection, model and plugin troubleshooting",
    title: "FAQ",
    description:
      "Troubleshoot WeChat connections, model calls and plugins, and learn how chat data, privacy and membership expiry work.",
    category: "Everyday features",
    group: "daily",
    minutes: 5,
    outcome: "If it will not connect, will not reply or uses the wrong model, start here.",
  },
  {
    slug: "cloud-agent",
    updatedAt: UPDATED_AT,
    seoTitle: "Xiaowei cloud assistant: files and tasks in WeChat",
    title: "Xiaowei · Cloud assistant",
    description:
      "Xiaowei is Wechatai's cloud Agent assistant. No install is needed: submit file-processing and document-conversion tasks from WeChat. Learn model setup, sending attachments, checking progress and downloading results; Plus and your own model API key are required.",
    category: "Plugins",
    group: "plugins",
    requirement: "Plus and cloud service availability required",
    minutes: 4,
    outcome:
      "Assign tasks and process files in WeChat, then check progress and results on the tasks page.",
    image: "/images/plugins/xiaowei.webp",
    imageAlt: "Xiaowei, the Wechatai cloud assistant",
  },
  {
    slug: "ds-chat",
    updatedAt: UPDATED_AT,
    seoTitle: "DS Chat web answers: configure models and search APIs in WeChat",
    title: "DS Chat web answers",
    description:
      "Use the Wechatai DS Chat plugin for web-connected answers, information and sources in WeChat. Configure your own answer model and search API, and learn about search scope, commands and costs; Free supports one plugin.",
    category: "Plugins",
    group: "plugins",
    requirement: "Free supports one plugin",
    minutes: 5,
    outcome:
      "Connect a search service to your answer model and look up information and sources in WeChat.",
    image: "/images/plugins/ds-chat-brand.webp",
    imageAlt: "DS Chat plugin",
  },
  {
    slug: "image-generation",
    updatedAt: UPDATED_AT,
    seoTitle: "WeChat AI image generation: model setup, prompts and saving images",
    title: "AI image generation",
    description:
      "Connect your own image-generation API to WeChat with the Wechatai AI image plugin. Configure a model, describe the image and aspect ratio, receive and save images, and understand per-image credits and provider charges.",
    category: "Plugins",
    group: "plugins",
    requirement: "Free supports one plugin",
    minutes: 5,
    outcome: "Configure your own image service and describe what you want to see in WeChat.",
  },
  {
    slug: "roleplay",
    updatedAt: UPDATED_AT,
    seoTitle: "WeChat AI roleplay: character cards and world books",
    title: "Roleplay",
    description:
      "Chat with AI characters and co-write stories in WeChat with Wechatai. Start with built-in characters, import V2 character cards, configure world books and continue a plot; bring your own model API, and Free supports one plugin.",
    category: "Plugins",
    group: "plugins",
    requirement: "Free supports one plugin",
    minutes: 4,
    outcome:
      "From a chat companion to an interactive story—pick a character and write the next scene.",
  },
  {
    slug: "personal-assistant",
    updatedAt: UPDATED_AT,
    seoTitle: "WeChat personal assistant: notes, expenses, to-dos and reminders",
    title: "Personal assistant",
    description:
      "Set up the Wechatai personal assistant to take notes, track expenses, manage to-dos and schedule reminders in WeChat, then view or export records on the web. Learn about model requirements, record sharing and WeChat reply-window limits; Free is supported.",
    category: "Plugins",
    group: "plugins",
    requirement: "Free supports one plugin",
    minutes: 3,
    outcome: "Jot down tasks and spending, and let the assistant handle reminders.",
  },
  {
    slug: "notifications",
    updatedAt: UPDATED_AT,
    seoTitle: "WeChat notification webhook: orders, alerts and build results",
    title: "Notifications",
    description:
      "Push orders, alerts and script results to WeChat with the Wechatai notification webhook. Learn to generate a dedicated token, send HTTP requests, check delivery and retry; no model API is needed, and pushes cost no credits.",
    category: "Plugins",
    group: "plugins",
    requirement: "Free supports one plugin · no credits charged",
    minutes: 3,
    outcome: "Send important messages to WeChat with a single HTTP request.",
  },
  {
    slug: "wechat-ai-assistant",
    updatedAt: UPDATED_AT,
    title: "No OpenClaw deployment? Use Xiaowei, the cloud AI assistant, in WeChat",
    navTitle: "Xiaowei: a cloud AI assistant",
    description:
      "No OpenClaw install, server or always-on device? Use Xiaowei, Wechatai's cloud assistant, to assign tasks, process files and generate documents in WeChat. Follow the Markdown-to-Word example through setup, sending an attachment and receiving the result; Plus and your own model API key are required.",
    category: "Hands-on tutorials",
    group: "tutorials",
    requirement: "Plus and a model API key required",
    minutes: 4,
    outcome: "Assign tasks and receive files in WeChat without installing or maintaining an Agent.",
    image: "/images/plugins/xiaowei.webp",
    imageAlt: "Xiaowei, the Wechatai cloud assistant",
  },
  {
    slug: "deepseek-in-wechat",
    updatedAt: UPDATED_AT,
    title: "How to use DeepSeek in WeChat",
    navTitle: "Use DeepSeek in WeChat",
    description:
      "Connect your own DeepSeek API to WeChat with Wechatai: configure a channel and model, scan to connect, send your first message, then optionally set up a separate search service with DS Chat.",
    category: "Hands-on tutorials",
    group: "tutorials",
    requirement: "Basic chat available on Free",
    minutes: 3,
    outcome: "Put a familiar model into the chat app you already open every day.",
    image: "/images/channels/deepseek.png",
    imageAlt: "DeepSeek",
  },
  {
    slug: "multiple-openclaw-in-wechat",
    updatedAt: UPDATED_AT,
    navTitle: "Connect multiple OpenClaw agents",
    title: "How to use multiple OpenClaw agents in WeChat",
    description:
      "Connect OpenClaw instances on different computers, or multiple Agents in the same instance, to WeChat and switch between work and personal assistants with separate shortcut names. Receive scheduled tasks and background results.",
    category: "Hands-on tutorials",
    group: "tutorials",
    requirement: "Plus membership required",
    minutes: 4,
    outcome: "Add two configurations and choose an assistant by shortcut name.",
    image: "/images/plugins/openclaw-brand.webp",
    imageAlt: "OpenClaw plugin",
  },
  {
    slug: "hermes-in-wechat",
    updatedAt: UPDATED_AT,
    navTitle: "Use Hermes in WeChat",
    title: "How to use Hermes in WeChat",
    description:
      "Connect an existing Hermes Agent to WeChat: copy the connection command, run it on the host, then send messages from WeChat and receive background results. Includes connection and WeChat conversation diagrams, cost notes and FAQ.",
    category: "Hands-on tutorials",
    group: "tutorials",
    requirement: "Free supports one plugin",
    minutes: 3,
    outcome: "Connect an existing Hermes and exchange messages and results in WeChat.",
    image: "/images/plugins/hermes-brand.webp",
    imageAlt: "Hermes plugin",
  },
];

export const EN_DOC_ARTICLES: readonly EnglishDocArticle[] = articles.map((article) => ({
  ...article,
  path: `/docs/${article.slug}`,
}));

const translatedPages: readonly TranslationPage[] = [
  {
    path: "/docs",
    title: `${EN_DOCS_TITLE} | ${BRAND}`,
    description: EN_DOCS_DESCRIPTION,
    updatedAt: EN_DOCS_INDEX_UPDATED_AT,
  },
  ...EN_DOC_ARTICLES.map((article) => ({
    path: article.path,
    title: `${article.seoTitle ?? article.title} | ${BRAND}`,
    description: article.description,
    updatedAt: article.updatedAt,
  })),
];

export default translatedPages;

export function findEnglishDocArticle(slug: string | undefined): EnglishDocArticle | undefined {
  return EN_DOC_ARTICLES.find((article) => article.slug === slug);
}
