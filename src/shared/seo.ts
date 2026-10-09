// Public search URLs always use the production domain, including local builds.
export const SITE_URL = "https://wechatai.app";
export const SITE_NAME = "微伴 Wechatai";
export const SOCIAL_IMAGE = `${SITE_URL}/og-image.png`;
export const PUBLIC_PATHS = [
  "/",
  "/guide",
  "/developers/plugins",
  "/developers/openclaw",
  "/developers/hermes",
] as const;
export const PRIVATE_PATHS = [
  "/login",
  "/register",
  ...["/app", "/demo"].flatMap((base) =>
    [
      "",
      "/channels",
      "/assistants",
      "/plugins",
      "/wechat",
      "/sessions",
      "/billing",
      "/credits",
      "/invite",
    ].map((section) => `${base}${section}`),
  ),
];

export interface PageSeo {
  title: string;
  description: string;
  indexable: boolean;
  canonical?: string;
  structuredData?: Record<string, unknown>;
}

export function getPageSeo(pathname: string): PageSeo {
  const path = pathname.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
  if (path === "/developers/openclaw" || path === "/developers/hermes") {
    const agent = path.endsWith("hermes") ? "Hermes" : "OpenClaw";
    return {
      title: `${agent} 微信接入：定时任务与后台推送 | Wechatai`,
      description: `通过 Wechatai Channel 将自己的 ${agent} Agent 接入微信。配置教程、会话隔离、定时任务与主动推送，以及供 AI agent 阅读的协议说明。`,
      indexable: true,
      canonical: `${SITE_URL}${path}`,
      structuredData: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: `${agent} 接入指南`,
        url: `${SITE_URL}${path}`,
      },
    };
  }
  if (path === "/" || path === "/guide" || path === "/developers/plugins") {
    const isHome = path === "/";
    const isPluginDocs = path === "/developers/plugins";
    const canonical = `${SITE_URL}${isHome ? "/" : path}`;
    const title = isHome
      ? "WeChat AI · 微信 AI 自定义大模型聊天 | 微伴 Wechatai"
      : isPluginDocs
        ? "插件协议与开发文档：API、JSON Schema 与接入示例 | Wechatai"
        : "微信 AI 使用指南：连接模型与聊天命令 | Wechatai";
    const description = isHome
      ? "微伴 Wechatai，让你在微信里使用自定义大模型。自带 API Key 和服务地址，支持 OpenAI Chat Completions、Responses 与 Anthropic Messages，切换模型、管理会话，每日赠送 credits。AI in WeChat，从自己的模型开始。"
      : isPluginDocs
        ? "Wechatai 插件协议 V1：调用与结果格式、平台计量、权限边界和适配器示例。提供公开 Markdown、JSON API 与 JSON Schema，方便 AI agent 辅助开发。第三方执行与代码上传尚未开放。"
        : "如何在微信里使用 AI？微伴 WeChat AI 使用指南：配置 API Key 与大模型渠道、扫码连接微信、切换模型、新建和管理聊天会话，查看微信命令速查及 credits 说明。";
    return {
      title,
      description,
      indexable: true,
      canonical,
      structuredData: {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebSite",
            "@id": `${SITE_URL}/#website`,
            url: `${SITE_URL}/`,
            name: SITE_NAME,
            alternateName: ["Wechatai", "微伴"],
            inLanguage: "zh-CN",
          },
          {
            "@type": "WebPage",
            "@id": `${canonical}#webpage`,
            url: canonical,
            name: title,
            description,
            inLanguage: "zh-CN",
            isPartOf: { "@id": `${SITE_URL}/#website` },
            ...(isHome ? { about: { "@id": `${SITE_URL}/#application` } } : {}),
          },
          ...(isHome
            ? [
                {
                  "@type": "SoftwareApplication",
                  "@id": `${SITE_URL}/#application`,
                  name: SITE_NAME,
                  url: `${SITE_URL}/`,
                  description,
                  applicationCategory: "CommunicationApplication",
                  operatingSystem: "Web",
                  image: SOCIAL_IMAGE,
                  featureList: [
                    "使用自己的 API Key 与模型服务地址",
                    "在微信中切换大模型并管理聊天会话",
                    "支持 OpenAI Chat Completions、Responses 与 Anthropic Messages",
                  ],
                },
              ]
            : []),
        ],
      },
    };
  }
  const label =
    path === "/login"
      ? "登录"
      : path === "/register"
        ? "注册"
        : path === "/app" || path.startsWith("/app/")
          ? "工作台"
          : path === "/demo" || path.startsWith("/demo/")
            ? "工作台演示"
            : "页面未找到";
  return {
    title: `${label} | ${SITE_NAME}`,
    description: "微伴 Wechatai 个人微信 AI 工作台。",
    indexable: false,
  };
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );
}

export function serializeStructuredData(data: Record<string, unknown>) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

// The same metadata renders into the initial HTML and follows client navigation.
export function renderSeoHead(seo: PageSeo) {
  const meta = (name: string, content: string, property = false) =>
    `<meta ${property ? "property" : "name"}="${name}" content="${escapeHtml(content)}" data-seo />`;
  return [
    `<title data-seo>${escapeHtml(seo.title)}</title>`,
    meta("description", seo.description),
    meta("robots", seo.indexable ? "index, follow, max-image-preview:large" : "noindex, follow"),
    ...(seo.canonical
      ? [`<link rel="canonical" href="${escapeHtml(seo.canonical)}" data-seo />`]
      : []),
    ...(seo.indexable
      ? [
          meta("og:type", "website", true),
          meta("og:site_name", SITE_NAME, true),
          meta("og:locale", "zh_CN", true),
          meta("og:title", seo.title, true),
          meta("og:description", seo.description, true),
          meta("og:url", seo.canonical!, true),
          meta("og:image", SOCIAL_IMAGE, true),
          meta("og:image:width", "1200", true),
          meta("og:image:height", "630", true),
          meta("og:image:alt", "微伴 Wechatai：在微信里，与自选大模型对话。", true),
          meta("twitter:card", "summary_large_image"),
          meta("twitter:title", seo.title),
          meta("twitter:description", seo.description),
          meta("twitter:image", SOCIAL_IMAGE),
          meta("twitter:image:alt", "微伴 Wechatai：在微信里，与自选大模型对话。"),
        ]
      : []),
    ...(seo.structuredData
      ? [
          `<script type="application/ld+json" data-seo>${serializeStructuredData(seo.structuredData)}</script>`,
        ]
      : []),
  ].join("\n    ");
}

export function replaceSeoHead(html: string, seo: PageSeo) {
  const marker = /<!-- SEO:START -->[\s\S]*?<!-- SEO:END -->/;
  if (!marker.test(html)) throw new Error("Missing SEO head markers in HTML template");
  return html.replace(
    marker,
    () => `<!-- SEO:START -->\n    ${renderSeoHead(seo)}\n    <!-- SEO:END -->`,
  );
}

export function renderSitemap() {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PUBLIC_PATHS.map((path) => `  <url><loc>${SITE_URL}${path}</loc></url>`).join("\n")}\n</urlset>\n`;
}
