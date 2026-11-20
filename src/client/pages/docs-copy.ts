import type { Locale } from "../../shared/i18n";

export interface DocsCopy {
  kicker: string;
  indexTitle: string;
  indexIntro: string;
  indexLede: string;
  startStrong: string;
  startSmall: string;
  quickTitle: string;
  quickLinks: readonly { slug: string; title: string; text: string }[];
  tutorialsTitle: string;
  tutorialsIntroBefore: string;
  tutorialsIntroLink: string;
  tutorialsIntroAfter: string;
  allDocsTitle: string;
  allDocsLede: string;
  helpBefore: string;
  helpFaq: string;
  helpMiddle: string;
  helpContact: string;
  navAria: string;
  searchPlaceholder: string;
  searchAria: string;
  emptyResult: (query: string) => string;
  overview: string;
  museTitle: string;
  developerDocs: string;
  tocTitle: string;
  tocAria: string;
  skipToContent: string;
  mobileNav: string;
  overviewFallback: string;
  breadcrumbAria: string;
  breadcrumbHome: string;
  breadcrumbDocs: string;
  breadcrumbOverview: string;
  minutes: (minutes: number) => string;
  updated: string;
  previous: string;
  next: string;
  adjacentAria: string;
  viewLarge: (alt: string) => string;
  viewLargeLabel: string;
  newTab: string;
  tableAria: string;
  externalLinkSuffix: string;
}

const zh: DocsCopy = {
  kicker: "微伴使用文档",
  indexTitle: "在微信里，用好你的 AI。",
  indexIntro: "从第一次连接，到模型、插件与会话管理。按步骤上手，或直接查找需要的功能。",
  indexLede:
    "文档按「开始使用 → 日常功能 → 插件 → 实操教程」组织。第一次使用，先确认手机微信有 ClawBot 入口，再准备模型 API Key，跟着使用指南完成配置和扫码；已经连上微信，可以直接查命令、会话、附件与 credits。下面的摘要都来自各文档的现有说明，方便先判断该打开哪一篇。",
  startStrong: "第一次使用？从这里开始",
  startSmall: "添加模型 → 扫码连接 → 发出第一条消息",
  quickTitle: "常用功能",
  quickLinks: [
    { slug: "commands", title: "微信命令速查", text: "查看状态、切换模型和插件" },
    { slug: "sessions", title: "会话与上下文", text: "管理话题、记录和长对话" },
    { slug: "attachments", title: "图片、文件与语音", text: "先发附件，再补充要求" },
    { slug: "credits", title: "会员与 credits", text: "了解额度、计费和邀请奖励" },
  ],
  tutorialsTitle: "跟着教程配置",
  tutorialsIntroBefore: "想在微信里用 DeepSeek？先看",
  tutorialsIntroLink: "接入条件与费用说明",
  tutorialsIntroAfter: "，准备好 Key 后跟着下方教程完成配置。",
  allDocsTitle: "按主题浏览全部文档",
  allDocsLede: "每篇附一句话摘要；具体步骤、限制与报错处理以文档内正文为准。",
  helpBefore: "遇到问题？先看看",
  helpFaq: "常见问题",
  helpMiddle: "，也可以",
  helpContact: "联系我们。",
  navAria: "文档导航",
  searchPlaceholder: "搜索文档",
  searchAria: "搜索文档",
  emptyResult: (query) => `没有匹配「${query}」的文档，可以试试「渠道」或「插件」。`,
  overview: "文档概览",
  museTitle: "Muse 接入指南",
  developerDocs: "插件开发文档",
  tocTitle: "本文目录",
  tocAria: "本文目录",
  skipToContent: "跳到正文",
  mobileNav: "文档导航",
  overviewFallback: "文档概览",
  breadcrumbAria: "面包屑导航",
  breadcrumbHome: "首页",
  breadcrumbDocs: "文档",
  breadcrumbOverview: "概览",
  minutes: (minutes) => `约 ${minutes} 分钟`,
  updated: "更新于",
  previous: "上一篇",
  next: "下一篇",
  adjacentAria: "相邻文档",
  viewLarge: (alt) => `查看大图：${alt}（新窗口打开）`,
  viewLargeLabel: "查看大图",
  newTab: "（新窗口打开）",
  tableAria: "配置与命令对照表",
  externalLinkSuffix: "（新窗口打开）",
};

const en: DocsCopy = {
  kicker: "Wechatai documentation",
  indexTitle: "Put your AI to work in WeChat.",
  indexIntro:
    "From the first connection to models, plugins and session management. Follow the steps, or jump straight to the feature you need.",
  indexLede:
    "The documentation is organized as Getting started → Everyday features → Plugins → Hands-on tutorials. On your first visit, confirm phone WeChat has the ClawBot entry, prepare a model API key, then follow the getting-started guide through configuration and scanning. If WeChat is already connected, look up commands, sessions, attachments and credits directly. Each summary below comes from the article itself, so you can decide which one to open.",
  startStrong: "First time here? Start here",
  startSmall: "Add a model → scan to connect → send your first message",
  quickTitle: "Common tasks",
  quickLinks: [
    {
      slug: "commands",
      title: "WeChat command reference",
      text: "Check status, switch models and plugins",
    },
    {
      slug: "sessions",
      title: "Sessions and context",
      text: "Manage topics, records and long chats",
    },
    {
      slug: "attachments",
      title: "Images, files and voice",
      text: "Send the attachment, then the request",
    },
    {
      slug: "credits",
      title: "Membership and credits",
      text: "Allowance, billing and referral rewards",
    },
  ],
  tutorialsTitle: "Follow a tutorial",
  tutorialsIntroBefore: "Want to use DeepSeek in WeChat? Read the",
  tutorialsIntroLink: "requirements and costs",
  tutorialsIntroAfter: " first, then follow a tutorial below once you have a key.",
  allDocsTitle: "Browse all documentation by topic",
  allDocsLede:
    "Each entry has a one-line summary. The article is authoritative for exact steps, limits and error handling.",
  helpBefore: "Stuck? Start with",
  helpFaq: "the FAQ",
  helpMiddle: ", or",
  helpContact: "contact us.",
  navAria: "Documentation navigation",
  searchPlaceholder: "Search documentation",
  searchAria: "Search documentation",
  emptyResult: (query) => `No documents match “${query}”. Try “channel” or “plugin” instead.`,
  overview: "Documentation overview",
  museTitle: "Muse connection guide",
  developerDocs: "Plugin developer docs",
  tocTitle: "On this page",
  tocAria: "On this page",
  skipToContent: "Skip to content",
  mobileNav: "Documentation navigation",
  overviewFallback: "Documentation overview",
  breadcrumbAria: "Breadcrumb",
  breadcrumbHome: "Home",
  breadcrumbDocs: "Documentation",
  breadcrumbOverview: "Overview",
  minutes: (minutes) => `About ${minutes} min`,
  updated: "Updated",
  previous: "Previous",
  next: "Next",
  adjacentAria: "Adjacent documents",
  viewLarge: (alt) => `View full size: ${alt} (opens in a new tab)`,
  viewLargeLabel: "View full size",
  newTab: "(opens in a new tab)",
  tableAria: "Configuration and command reference table",
  externalLinkSuffix: "(opens in a new tab)",
};

export function docsCopy(locale: Locale): DocsCopy {
  return locale === "en" ? en : zh;
}
