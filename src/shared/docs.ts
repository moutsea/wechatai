export const DOCS_UPDATED_AT = "2026-10-10";
export const DOCS_TITLE = "微信 AI 教程与文档";
export const DOCS_DESCRIPTION =
  "微伴 Wechatai 使用文档：配置模型、连接微信、管理会话和 credits。附 DeepSeek、多个 OpenClaw 与 Hermes 接入教程，以及联网问答、生图和个人助理说明。";

export const DOC_TUTORIALS = [
  {
    slug: "deepseek-in-wechat",
    title: "如何在微信里使用 DeepSeek",
    description:
      "从 API Key、渠道和模型配置到扫码连接微信，手把手使用 DeepSeek 聊天，并了解如何通过 DS Chat 增加按需联网搜索。",
    category: "实操教程",
    group: "tutorials",
    navTitle: "在微信里使用 DeepSeek",
    requirement: "基础聊天适用 Free 用户",
    minutes: 5,
    image: "/images/channels/deepseek.png",
    imageAlt: "DeepSeek",
    outcome: "把熟悉的模型，放进每天打开的聊天框。",
  },
  {
    slug: "multiple-openclaw-in-wechat",
    navTitle: "连接多个 OpenClaw",
    title: "如何在微信里使用多个 OpenClaw",
    description:
      "将不同电脑上的 OpenClaw 或同一实例的多个 Agent 接入微信，用独立快捷名切换工作与生活助手，接收定时任务和后台结果。",
    category: "实操教程",
    group: "tutorials",
    requirement: "需要 Plus 会员",
    minutes: 5,
    image: "/images/plugins/openclaw-brand.webp",
    imageAlt: "OpenClaw 插件",
    outcome: "添加两组配置，用不同快捷名选择助手。",
  },
  {
    slug: "hermes-in-wechat",
    navTitle: "在微信里使用 Hermes",
    title: "如何在微信里使用 Hermes",
    description:
      "把已有的 Hermes Agent 接入微信：生成连接命令、在本机执行、从微信发消息，并设置后台结果推送。附配置截图和常见问题。",
    category: "实操教程",
    group: "tutorials",
    requirement: "需要 Plus 会员",
    minutes: 4,
    image: "/images/plugins/hermes-brand.webp",
    imageAlt: "Hermes 插件",
    outcome: "连接已有的 Hermes，在微信里发消息、收结果。",
  },
] as const;

export const DOC_GUIDES = [
  {
    slug: "getting-started",
    seoTitle: "微信 AI 使用指南：三步连接自己的模型",
    title: "使用指南",
    description: "第一次使用微伴：添加自己的模型服务、扫码连接微信，开始 AI 对话。",
    category: "开始使用",
    group: "start",
    minutes: 3,
    outcome: "从添加模型到微信聊天，先把第一条消息发出去。",
  },
  {
    slug: "channels-models",
    seoTitle: "微信 AI 渠道与模型配置：API Key 与输入输出设置",
    title: "渠道与模型",
    description:
      "配置 API Key、Base URL 和模型 ID，导入可用模型，设置输入输出上限，在微信切换模型。",
    category: "开始使用",
    group: "start",
    minutes: 4,
    outcome: "一个渠道可以添加多个模型，每个模型有自己的设置。",
  },
  {
    slug: "wechat-connection",
    seoTitle: "连接微信：扫码绑定 AI 与管理多个链接",
    title: "连接微信",
    description: "创建微信链接、扫码绑定、切换当前模型，以及管理多个微信链接和重新连接。",
    category: "开始使用",
    group: "start",
    minutes: 2,
    outcome: "扫码连接后，在微信里找到对应对话，就可以开始提问。",
  },
  {
    slug: "commands",
    seoTitle: "微信命令速查：切换 AI 模型、插件与会话",
    title: "微信命令速查",
    description: "微伴微信命令一览：查看状态、切换渠道和插件、新建会话、清理上下文与查询 credits。",
    category: "日常功能",
    group: "daily",
    minutes: 3,
    outcome: "记不住命令时，回到这里查一下。",
  },
  {
    slug: "sessions",
    seoTitle: "微信 AI 会话与上下文：新建、切换与自动摘要",
    title: "会话与上下文",
    description: "新建、切换、归档和清理微信 AI 会话，了解自动摘要、上下文上限与网页聊天记录。",
    category: "日常功能",
    group: "daily",
    minutes: 4,
    outcome: "不同话题分开聊，需要时再接着上次的内容。",
  },
  {
    slug: "attachments",
    seoTitle: "微信 AI 图片、文件与语音使用教程",
    title: "图片、文件与语音",
    description:
      "先发送多张图片或 PDF、Word、文本文件，再用文字或语音说明要求；了解附件格式和大小限制。",
    category: "日常功能",
    group: "daily",
    requirement: "附件需要 Plus 会员",
    minutes: 2,
    outcome: "先发附件，再告诉 AI 你想让它做什么。",
  },
  {
    slug: "credits",
    seoTitle: "微伴会员与 credits：微信 AI 额度、计费与邀请奖励",
    title: "会员与 credits",
    description:
      "了解 Free 与 Plus 会员区别、token 和图片计费、每日赠送、购买 credits 与邀请奖励。",
    category: "日常功能",
    group: "daily",
    minutes: 4,
    outcome: "模型服务商的 API 费用与微伴 credits 分开计算。",
  },
  {
    slug: "faq",
    seoTitle: "微信 AI 常见问题：连接、模型和插件排查",
    title: "常见问题",
    description: "排查微信连接、模型调用和插件问题，了解聊天数据、隐私和会员到期后的变化。",
    category: "日常功能",
    group: "daily",
    minutes: 3,
    outcome: "连不上、没有回复或模型不对，可以从这里开始排查。",
  },
  {
    slug: "ds-chat",
    seoTitle: "DS Chat 联网问答：在微信配置模型与搜索 API",
    title: "DS Chat 联网问答",
    description:
      "配置自己的回答模型和搜索 API，在微信中使用 DS Chat，并通过快捷名进入、切换或单次调用插件。",
    category: "插件",
    group: "plugins",
    requirement: "需要 Plus 会员",
    minutes: 3,
    outcome: "基于 DeepSeek Harness 开源项目开发，模型和搜索服务都由你选择。",
    image: "/images/plugins/ds-chat-brand.webp",
    imageAlt: "DS Chat 插件",
  },
  {
    slug: "image-generation",
    seoTitle: "AI 生图：在微信使用自己的画图模型",
    title: "AI 生图",
    description: "接入自己的生图 API，通过微信提示词生成图片，设置画面比例并查看生图计费。",
    category: "插件",
    group: "plugins",
    requirement: "需要 Plus 会员",
    minutes: 2,
    outcome: "配置自己的生图服务，在微信里描述想画的内容。",
  },
  {
    slug: "roleplay",
    seoTitle: "微信 AI 角色扮演：角色卡、人设与剧情记忆",
    title: "角色扮演",
    description: "选择原创角色或导入角色卡，自定义人设、世界书和剧情记忆，在微信里继续角色对话。",
    category: "插件",
    group: "plugins",
    requirement: "需要 Plus 会员",
    minutes: 4,
    outcome: "设定角色、关系和故事开场，聊一段属于你的剧情。",
  },
  {
    slug: "personal-assistant",
    seoTitle: "微信个人助理：记事、记账、待办与定时提醒",
    title: "个人助理",
    description: "在微信里记事、记账、管理待办和设置定时提醒，并在网页查看、修改和导出个人记录。",
    category: "插件",
    group: "plugins",
    requirement: "需要 Plus 会员",
    minutes: 4,
    outcome: "随手记下事情和开销，把需要提醒的事交给助理。",
  },
  {
    slug: "notifications",
    seoTitle: "微信消息提醒 Webhook：HTTP 推送订单、告警与任务结果",
    title: "消息提醒",
    description: "配置专属 Token，通过 HTTP Webhook 将文字通知推送到微信，查询投递结果和处理重试。",
    category: "插件",
    group: "plugins",
    requirement: "需要 Plus 会员 · 不扣 credits",
    minutes: 4,
    outcome: "用一条 HTTP 请求，把重要消息送到微信。",
  },
] as const;

export const DOC_ARTICLES = [...DOC_GUIDES, ...DOC_TUTORIALS] as const;
export type DocSlug = (typeof DOC_ARTICLES)[number]["slug"];
export interface DocArticle {
  slug: DocSlug;
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
