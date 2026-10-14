import { INFO_PAGES, POLICY_UPDATED_AT } from "./site-info";
import {
  DOC_ARTICLES,
  DOCS_TITLE,
  DOCS_DESCRIPTION,
  DOCS_UPDATED_AT,
  docPath,
  findDocArticle,
} from "./docs";

// Public search URLs always use the production domain, including local builds.
export const SITE_URL = "https://wechatai.app";
export const SITE_NAME = "微伴 Wechatai";
// Update only when the actual homepage content changes, never on every build.
const HOME_UPDATED_AT = "2026-10-12";
export const SOCIAL_IMAGE = `${SITE_URL}/og-image.png`;
export const PUBLIC_PATHS = [
  "/",
  "/docs",
  ...DOC_ARTICLES.map((article) => docPath(article.slug)),
  "/developers/plugins",
  "/developers/openclaw",
  "/developers/hermes",
  ...Object.values(INFO_PAGES).map((page) => page.path),
] as const;
export const LEGACY_PATHS = ["/guide"] as const;
export const PRIVATE_PATHS = [
  "/app/admin",
  "/login",
  "/register",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
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
      "/notices",
    ].map((section) => `${base}${section}`),
  ),
];

export interface PageSeo {
  title: string;
  description: string;
  indexable: boolean;
  canonical?: string;
  ogType?: "website" | "article";
  structuredData?: Record<string, unknown>;
}

export function getPageSeo(pathname: string): PageSeo {
  const path = pathname.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
  // Production redirects this route at the edge. The fallback HTML has the
  // destination canonical without a conflicting noindex instruction.
  if (path === "/guide") return getPageSeo("/docs/getting-started");
  const article = path.startsWith("/docs/") ? findDocArticle(path.slice(6)) : undefined;
  if (path === "/docs" || article) {
    const canonical = `${SITE_URL}${path}`;
    const title = article?.title ?? DOCS_TITLE;
    const description = article?.description ?? DOCS_DESCRIPTION;
    const breadcrumbs = [
      { "@type": "ListItem", position: 1, name: "首页", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "文档", item: `${SITE_URL}/docs` },
      ...(article ? [{ "@type": "ListItem", position: 3, name: title, item: canonical }] : []),
    ];
    return {
      title: `${article?.seoTitle ?? title} | ${SITE_NAME}`,
      description,
      indexable: true,
      canonical,
      ogType: article ? "article" : "website",
      structuredData: {
        "@context": "https://schema.org",
        "@graph": [
          article
            ? {
                "@type": "Article",
                "@id": `${canonical}#article`,
                url: canonical,
                mainEntityOfPage: canonical,
                headline: title,
                description,
                inLanguage: "zh-CN",
                image: SOCIAL_IMAGE,
                datePublished: DOCS_UPDATED_AT,
                dateModified: DOCS_UPDATED_AT,
                author: { "@type": "Organization", name: "微伴团队", url: `${SITE_URL}/` },
                publisher: {
                  "@type": "Organization",
                  "@id": `${SITE_URL}/#organization`,
                  name: SITE_NAME,
                  url: `${SITE_URL}/`,
                },
                articleSection: article.category,
                isPartOf: { "@id": `${SITE_URL}/docs` },
              }
            : {
                "@type": "CollectionPage",
                "@id": canonical,
                url: canonical,
                name: title,
                description,
                inLanguage: "zh-CN",
                mainEntity: {
                  "@type": "ItemList",
                  itemListElement: DOC_ARTICLES.map((item, index) => ({
                    "@type": "ListItem",
                    position: index + 1,
                    name: item.title,
                    url: `${SITE_URL}${docPath(item.slug)}`,
                  })),
                },
              },
          { "@type": "BreadcrumbList", itemListElement: breadcrumbs },
        ],
      },
    };
  }
  const info = Object.values(INFO_PAGES).find((page) => page.path === path);
  if (info) {
    const canonical = `${SITE_URL}${path}`;
    return {
      title: `${info.title} | ${SITE_NAME}`,
      description: info.description,
      indexable: true,
      canonical,
      structuredData: {
        "@context": "https://schema.org",
        "@type": path === "/contact" ? "ContactPage" : "WebPage",
        name: info.title,
        description: info.description,
        url: canonical,
        inLanguage: "zh-CN",
      },
    };
  }
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
  if (path === "/" || path === "/developers/plugins") {
    const isHome = path === "/";
    const canonical = `${SITE_URL}${isHome ? "/" : path}`;
    const title = isHome
      ? "WeChat AI · 微信 AI：把你的 AI 接入微信 | 微伴 Wechatai"
      : "插件协议与开发文档：API、JSON Schema 与接入示例 | Wechatai";
    const description = isHome
      ? "微伴 Wechatai，把你的 AI 接入微信。用自己的 API Key 连接 DeepSeek、Claude、GPT 等模型，也可接入 OpenClaw 与 Hermes。微信内切换模型、管理会话，每日赠送 credits，支持免费开始。"
      : "Wechatai 插件协议 V1：调用与结果格式、平台计量、权限边界和适配器示例。提供公开 Markdown、JSON API 与 JSON Schema，方便 AI agent 辅助开发。第三方执行与代码上传尚未开放。";
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
                  "@type": "Organization",
                  "@id": `${SITE_URL}/#organization`,
                  name: SITE_NAME,
                  alternateName: ["Wechatai", "微伴"],
                  url: `${SITE_URL}/`,
                },
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
                    "连接自己的 OpenClaw 和 Hermes Agent",
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
        : path === "/verify-email"
          ? "验证邮箱"
          : path === "/forgot-password"
            ? "找回密码"
            : path === "/reset-password"
              ? "重设密码"
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
          meta("og:type", seo.ogType ?? "website", true),
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

export function pageLastModified(path: string): string | undefined {
  if (path === "/") return HOME_UPDATED_AT;
  if (path === "/docs" || DOC_ARTICLES.some((article) => docPath(article.slug) === path))
    return DOCS_UPDATED_AT;
  if (Object.values(INFO_PAGES).some((page) => page.path === path)) return POLICY_UPDATED_AT;
  // Omit unknown dates rather than presenting the build time as a content update.
  return undefined;
}

export function renderSitemap() {
  const entries = PUBLIC_PATHS.map((path) => {
    const modified = pageLastModified(path);
    return `  <url><loc>${SITE_URL}${path}</loc>${modified ? `<lastmod>${modified}</lastmod>` : ""}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
}
