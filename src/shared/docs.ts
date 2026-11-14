export const DOCS_INDEX_UPDATED_AT = "2026-11-14";
export const DOCS_TITLE = "微信 AI 教程与文档";
export const DOCS_DESCRIPTION =
  "微伴 Wechatai 使用文档：配置自己的模型 API，通过微信 ClawBot 连接 AI，按需使用联网问答、生图、角色扮演、个人助理、云端助手小薇和消息提醒，并了解会员与 credits 计费。";

export const DOC_TUTORIALS = [
  {
    slug: "wechat-ai-assistant",
    updatedAt: "2026-11-14",
    navTitle: "小薇：免部署的 AI 助手",
    title: "不想部署 OpenClaw？在微信使用云端 AI 助手小薇",
    description:
      "不想安装 OpenClaw、购买服务器或维护运行设备？用微伴云端助手小薇，在微信交代任务、处理文件和生成文档。跟着 Markdown 转 Word 示例完成配置、发送附件与接收结果；需要 Plus 和自备模型 API Key。",
    category: "实操教程",
    group: "tutorials",
    requirement: "需要 Plus 和模型 API Key",
    minutes: 4,
    image: "/images/plugins/xiaowei.webp",
    imageAlt: "小薇，微伴云端助手",
    outcome: "不用安装或维护 Agent，在微信交代任务、接收文件。",
  },
  {
    slug: "deepseek-in-wechat",
    updatedAt: "2026-11-14",
    title: "如何在微信里使用 DeepSeek",
    description:
      "通过微伴把自己的 DeepSeek API 接入微信：配置渠道与模型、扫码连接、发送第一条消息，再按需用 DS Chat 配置独立搜索服务。",
    category: "实操教程",
    group: "tutorials",
    navTitle: "在微信里使用 DeepSeek",
    requirement: "基础聊天适用 Free 用户",
    minutes: 3,
    image: "/images/channels/deepseek.png",
    imageAlt: "DeepSeek",
    outcome: "把熟悉的模型，放进每天打开的聊天框。",
  },
  {
    slug: "multiple-openclaw-in-wechat",
    updatedAt: "2026-11-14",
    navTitle: "连接多个 OpenClaw",
    title: "如何在微信里使用多个 OpenClaw",
    description:
      "将不同电脑上的 OpenClaw 或同一实例的多个 Agent 接入微信，用独立快捷名切换工作与生活助手，接收定时任务和后台结果。",
    category: "实操教程",
    group: "tutorials",
    requirement: "需要 Plus 会员",
    minutes: 4,
    image: "/images/plugins/openclaw-brand.webp",
    imageAlt: "OpenClaw 插件",
    outcome: "添加两组配置，用不同快捷名选择助手。",
  },
  {
    slug: "hermes-in-wechat",
    updatedAt: "2026-11-14",
    navTitle: "在微信里使用 Hermes",
    title: "如何在微信里使用 Hermes",
    description:
      "把已有的 Hermes Agent 接入微信：复制连接命令、在运行设备执行，再从微信发消息并接收后台结果。附连接与微信对话示意、费用说明和常见问题。",
    category: "实操教程",
    group: "tutorials",
    requirement: "Free 可配置 1 个插件",
    minutes: 3,
    image: "/images/plugins/hermes-brand.webp",
    imageAlt: "Hermes 插件",
    outcome: "连接已有的 Hermes，在微信里发消息、收结果。",
  },
] as const;

export const DOC_GUIDES = [
  {
    slug: "getting-started",
    updatedAt: "2026-11-14",
    seoTitle: "微信 AI 使用指南：配置 AI 渠道并扫码连接",
    title: "使用指南",
    description:
      "四部分入门微伴：了解工作原理、填写 API Key 同步模型、通过微信 ClawBot 扫码连接，再按需启用生图、角色扮演或云端助手小薇。附配置与微信连接示意图。",
    category: "开始使用",
    group: "start",
    requirement: "需微信 ClawBot 入口",
    minutes: 3,
    outcome: "了解工作原理，完成模型配置、微信连接，再按需启用插件。",
  },
  {
    slug: "channels-models",
    updatedAt: "2026-11-14",
    seoTitle: "微信 AI 渠道与模型：API Key 与输入输出设置",
    title: "渠道与模型",
    description:
      "了解微伴渠道与模型的区别，填写服务商 API Key、同步并测试模型，调整提示词与输入输出上限，再在微信切换使用。附配置示意。",
    category: "开始使用",
    group: "start",
    minutes: 4,
    outcome: "填入 API Key，同步并测试模型，再到微信开始使用。",
  },
  {
    slug: "model-providers",
    updatedAt: "2026-11-14",
    seoTitle: "支持的模型服务商：DeepSeek、KimiSeek 与第三方 API",
    title: "支持的模型服务商",
    description:
      "查看微伴支持的 DeepSeek、硅基流动、OpenAI、Anthropic 等模型服务商，了解 KimiSeek 一键导入及兼容 OpenAI、Anthropic 协议的第三方渠道配置。",
    category: "开始使用",
    group: "start",
    minutes: 2,
    outcome: "选择模型服务商，准备 API Key，或通过 KimiSeek 一键导入渠道。",
  },
  {
    slug: "wechat-connection",
    updatedAt: "2026-11-14",
    seoTitle: "连接微信：扫码绑定 AI 与管理多个链接",
    title: "连接微信",
    description:
      "跟随界面示意获取二维码、在手机微信 ClawBot 扫码确认，再发送帮助命令验证连接。附多链接管理与常见故障排查。",
    category: "开始使用",
    group: "start",
    minutes: 2,
    outcome: "获取二维码，扫码确认，发一条消息验证连接。",
  },
  {
    slug: "commands",
    updatedAt: "2026-11-14",
    seoTitle: "微信命令速查：切换 AI 模型、插件与会话",
    title: "微信命令速查",
    description:
      "查询微伴微信命令：切换模型和插件、新建会话、清理上下文与查看 credits。区分免费控制命令、计费的 @ 调用及 OpenClaw、Hermes 原生命令。",
    category: "日常功能",
    group: "daily",
    minutes: 3,
    outcome: "记不住命令时，回到这里查一下。",
  },
  {
    slug: "sessions",
    updatedAt: "2026-11-14",
    seoTitle: "微信 AI 会话与上下文：新建、切换与自动摘要",
    title: "会话与上下文",
    description:
      "在微伴新建、切换和清理微信 AI 会话，区分重置上下文与删除聊天记录，了解自动摘要、输入上限和 Plus 网页记录功能。",
    category: "日常功能",
    group: "daily",
    minutes: 4,
    outcome: "不同话题分开聊，需要时再接着上次的内容。",
  },
  {
    slug: "attachments",
    updatedAt: "2026-11-14",
    seoTitle: "微信 AI 图片、文件与语音使用教程",
    title: "图片、文件与语音",
    description:
      "在微信向微伴发送图片、PDF、Word 或文本文件，再补充处理要求；了解 Plus 附件限制、微信语音转写，以及用小薇转换文件和失败后的重试方法。",
    category: "日常功能",
    group: "daily",
    requirement: "图片与文件需要 Plus",
    minutes: 2,
    outcome: "先发附件，再告诉 AI 你想让它做什么。",
  },
  {
    slug: "credits",
    updatedAt: "2026-11-14",
    seoTitle: "微伴会员与 credits：额度、计费与邀请奖励",
    title: "会员与 credits",
    description:
      "了解微伴 credits 与模型 API 余额的区别，对比 Free 与 Plus 权益，通过算例查看文字和图片计费，以及每日赠送、充值、负余额和邀请奖励规则。",
    category: "日常功能",
    group: "daily",
    minutes: 3,
    outcome: "选好套餐，看懂扣费，知道额度不够时怎么补充。",
  },
  {
    slug: "faq",
    updatedAt: "2026-11-14",
    seoTitle: "微信 AI 常见问题：连接、模型和插件排查",
    title: "常见问题",
    description: "排查微信连接、模型调用和插件问题，了解聊天数据、隐私和会员到期后的变化。",
    category: "日常功能",
    group: "daily",
    minutes: 3,
    outcome: "连不上、没有回复或模型不对，可以从这里开始排查。",
  },
  {
    slug: "cloud-agent",
    updatedAt: "2026-11-14",
    seoTitle: "小薇 · 云端助手：在微信处理文件与任务",
    title: "小薇 · 云端助手",
    description:
      "小薇是微伴的云端 Agent 助手，无需安装，可在微信提交文件处理、文档转换等任务。了解模型配置、附件发送、进度查询与结果下载；需要 Plus 和自备模型 API Key。",
    category: "插件",
    group: "plugins",
    requirement: "需要 Plus 且云端服务已开放",
    minutes: 4,
    outcome: "在微信交代任务、处理文件，在任务页查看进度与结果。",
    image: "/images/plugins/xiaowei.webp",
    imageAlt: "小薇，微伴云端助手",
  },
  {
    slug: "ds-chat",
    updatedAt: "2026-11-14",
    seoTitle: "DS Chat 联网问答：在微信配置模型与搜索 API",
    title: "DS Chat 联网问答",
    description:
      "用微伴 DS Chat 插件在微信联网问答、查询信息与来源。学习配置自己的回答模型和搜索 API，了解搜索范围、调用命令与费用；Free 可配置 1 个插件。",
    category: "插件",
    group: "plugins",
    requirement: "Free 可配置 1 个插件",
    minutes: 3,
    outcome: "给回答模型接入搜索服务，在微信查询信息与来源。",
    image: "/images/plugins/ds-chat-brand.webp",
    imageAlt: "DS Chat 插件",
  },
  {
    slug: "image-generation",
    updatedAt: "2026-11-14",
    seoTitle: "微信 AI 生图教程：模型配置、提示词与图片保存",
    title: "AI 生图",
    description:
      "通过微伴 AI 生图插件，把自己的生图 API 接入微信。学习配置模型、描述画面与比例、接收和保存图片，并了解每次生成的 credits 与服务商费用。",
    category: "插件",
    group: "plugins",
    requirement: "Free 可配置 1 个插件",
    minutes: 2,
    outcome: "配置自己的生图服务，在微信里描述想画的内容。",
  },
  {
    slug: "roleplay",
    updatedAt: "2026-11-14",
    seoTitle: "微信 AI 角色扮演教程：角色卡与世界书怎么用",
    title: "角色扮演",
    description:
      "用微伴在微信与 AI 角色聊天、共同续写故事。从内置角色开始，学习导入 V2 角色卡、配置世界书和延续剧情；需要自备模型 API，Free 可配置 1 个插件。",
    category: "插件",
    group: "plugins",
    requirement: "Free 可配置 1 个插件",
    minutes: 4,
    outcome: "从聊天搭子到互动故事，选一个角色，让下一幕由你续写。",
  },
  {
    slug: "personal-assistant",
    updatedAt: "2026-11-14",
    seoTitle: "微信个人助理：记事、记账、待办与定时提醒",
    title: "个人助理",
    description:
      "配置微伴个人助理，在微信记事、记账、管理待办和设置定时提醒，在网页查看与导出记录。了解模型要求、记录共享和微信回复窗口限制；Free 也能使用。",
    category: "插件",
    group: "plugins",
    requirement: "Free 可配置 1 个插件",
    minutes: 3,
    outcome: "随手记下事情和开销，把需要提醒的事交给助理。",
  },
  {
    slug: "notifications",
    updatedAt: "2026-11-14",
    seoTitle: "微信消息提醒 Webhook：订单、告警与任务推送",
    title: "消息提醒",
    description:
      "通过微伴消息提醒 Webhook，把订单、告警和脚本结果推送到微信。学习生成专属 Token、发送 HTTP 请求、查询投递和重试；无需模型 API，推送不扣 credits。",
    category: "插件",
    group: "plugins",
    requirement: "Free 可配置 1 个插件 · 不扣 credits",
    minutes: 3,
    outcome: "用一条 HTTP 请求，把重要消息送到微信。",
  },
] as const;

export const DOC_ARTICLES = [...DOC_GUIDES, ...DOC_TUTORIALS] as const;
export type DocSlug = (typeof DOC_ARTICLES)[number]["slug"];
export interface DocArticle {
  slug: DocSlug;
  /** Actual content update, independent of the documentation index. */
  updatedAt: string;
  title: string;
  navTitle?: string;
  seoTitle?: string;
  description: string;
  category: string;
  group: "start" | "daily" | "plugins" | "tutorials";
  requirement?: string;
  minutes: number;
  outcome: string;
  image?: string;
  imageAlt?: string;
}
export const DOC_GROUPS = [
  { id: "start", title: "开始使用" },
  { id: "daily", title: "日常功能" },
  { id: "plugins", title: "插件" },
  { id: "tutorials", title: "实操教程" },
] as const;
export const docPath = (slug: DocSlug) => `/docs/${slug}`;
export const findDocArticle = (slug: string | undefined): DocArticle | undefined =>
  DOC_ARTICLES.find((article) => article.slug === slug);

// Hashes never reach the server. Resolve legacy section links in the browser.
export const LEGACY_GUIDE_SECTIONS: Record<string, DocSlug> = {
  start: "getting-started",
  models: "channels-models",
  plugins: "ds-chat",
  roleplay: "roleplay",
  personal: "personal-assistant",
  commands: "commands",
  sessions: "sessions",
  credits: "credits",
  faq: "faq",
};
export function legacyGuideDestination(hash: string) {
  const section = hash.replace(/^#/, "");
  return docPath(
    Object.hasOwn(LEGACY_GUIDE_SECTIONS, section)
      ? LEGACY_GUIDE_SECTIONS[section]
      : "getting-started",
  );
}

// Browsers carry the old fragment through the HTTP 301. Native sections on the
// new guide (such as #start) must still scroll normally instead of redirecting.
export function guideSectionRedirect(pathname: string, hash: string): string | null {
  if (pathname.replace(/\/+$/, "") !== "/docs/getting-started") return null;
  const section = hash.replace(/^#/, "");
  if (!Object.hasOwn(LEGACY_GUIDE_SECTIONS, section)) return null;
  const target = legacyGuideDestination(hash);
  return target === "/docs/getting-started" ? null : target;
}
