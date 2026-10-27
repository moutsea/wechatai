import { INFO_PAGES, INFO_PAGE_UPDATED_AT, type InfoPageKind } from "./site-info";
import {
  DOC_ARTICLES,
  DOCS_TITLE,
  DOCS_DESCRIPTION,
  DOCS_UPDATED_AT,
  docPath,
  findDocArticle,
} from "./docs";
import { SEO_PATHS, findSeoPage, type SeoPage } from "./seo-pages";
import { FAQ_DOC_SECTIONS, faqAnswerText } from "./faq-doc";
import { BILLING_OFFERS } from "./billing";
import { LANDING_FAQ } from "./landing-faq";
import { PLUGIN_LIMITS } from "./plugin-access";
import { WECHAT_LINK_LIMITS } from "./wechat-links";

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
  ...SEO_PATHS,
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
  ...[
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
  ].map((section) => `/app${section}`),
];

const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const APPLICATION_ID = `${SITE_URL}/#application`;

/**
 * 官方账号只列能核实的：GitHub 仓库地址来自 `package.json` 的 repository 与
 * README 的「反馈问题」链接。仓库内没有真实的 X / 小红书 / 微博官方账号，
 * 所以不编造；以后有官方账号再往这里加。
 */
const OFFICIAL_PROFILES = ["https://github.com/moutsea/wechatai"];

/**
 * `/developers/*` 三页不走 `SEO_PAGES` 的内容表：正文分别来自 `openclaw-docs.ts`、
 * `hermes-docs.ts` 与 `plugin-docs.ts`，这几个模块没有导出更新日期。这里的 `updatedAt`
 * 和 `HOME_UPDATED_AT` / `DOCS_UPDATED_AT` / `INFO_PAGE_UPDATED_AT` 是同一套做法：
 * 取该页正文模块与其渲染组件最近一次改动的日期，手动维护，绝不用构建时间冒充内容更新。
 * 三个页面都是 2026-10-24：plugin-docs.ts 与 openclaw-guide.tsx（同时渲染 OpenClaw 与
 * Hermes 两页）在这一天改动。
 */
const DEVELOPER_PAGES = {
  "/developers/plugins": {
    title: "插件协议开发文档：API、JSON Schema 与示例",
    name: "插件协议与开发文档",
    description:
      "Wechatai 插件协议 V1：调用与结果格式、计量、权限边界。公开 Markdown、JSON API 与 JSON Schema，方便 AI agent 辅助开发。第三方执行与代码上传尚未开放。",
    updatedAt: "2026-10-24",
  },
  "/developers/openclaw": {
    title: "OpenClaw 微信接入：定时任务与后台推送",
    name: "OpenClaw 接入指南",
    description:
      "通过 Wechatai Channel 将自己的 OpenClaw Agent 接入微信。配置教程、会话隔离、定时任务与主动推送，以及供 AI agent 阅读的协议说明。",
    updatedAt: "2026-10-24",
  },
  "/developers/hermes": {
    title: "Hermes 微信接入：定时任务与后台推送",
    name: "Hermes 接入指南",
    description:
      "通过 Wechatai Channel 将自己的 Hermes Agent 接入微信。配置教程、会话隔离、定时任务与主动推送，以及供 AI agent 阅读的协议说明。",
    updatedAt: "2026-10-24",
  },
} as const;
type DeveloperPagePath = keyof typeof DEVELOPER_PAGES;

function findDeveloperPage(path: string) {
  return Object.hasOwn(DEVELOPER_PAGES, path)
    ? DEVELOPER_PAGES[path as DeveloperPagePath]
    : undefined;
}

/** Organization 只写这一处：logo 与 sameAs 不会因为某个分支漏改而不一致。 */
function organizationNode() {
  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: SITE_NAME,
    alternateName: ["Wechatai", "微伴"],
    url: `${SITE_URL}/`,
    // 站内唯一的方形品牌资源是 favicon.svg（64×64 矢量）；og-image.png 是 1200×630 横幅，不能当 logo。
    logo: {
      "@type": "ImageObject",
      url: `${SITE_URL}/favicon.svg`,
      contentUrl: `${SITE_URL}/favicon.svg`,
      width: 64,
      height: 64,
      caption: SITE_NAME,
    },
    sameAs: [...OFFICIAL_PROFILES],
  };
}

/** 最小可用的 SoftwareApplication 引用；完整定义（含 offers）只在首页出现一次。 */
function softwareApplicationRef() {
  return {
    "@type": "SoftwareApplication",
    "@id": APPLICATION_ID,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    applicationCategory: "CommunicationApplication",
  };
}

/**
 * 价格与免费额度都取自执行侧的单一事实源：Plus 价格来自 `billing.ts` 的
 * `BILLING_OFFERS`（单位是分），免费版额度来自 `PLUGIN_LIMITS` / `WECHAT_LINK_LIMITS`。
 * 调整价格只改 billing.ts，这里不出现任何写死的金额。
 * credits 加油包是加购项而不是软件本身的订阅，因此没有放进 offers。
 */
function softwareApplicationOffers() {
  const plans = BILLING_OFFERS.filter((offer) => offer.kind === "plus").map((offer) => {
    const price = offer.amount / 100;
    return {
      "@type": "Offer",
      name: offer.name,
      url: `${SITE_URL}/pricing`,
      price,
      priceCurrency: "CNY",
      availability: "https://schema.org/InStock",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price,
        priceCurrency: "CNY",
        billingDuration: offer.interval === "month" ? "P1M" : "P1Y",
        billingIncrement: 1,
      },
    };
  });
  return [
    {
      "@type": "Offer",
      name: "免费版",
      url: `${SITE_URL}/`,
      price: 0,
      priceCurrency: "CNY",
      availability: "https://schema.org/InStock",
      description: `每天赠送 credits，可绑定 ${WECHAT_LINK_LIMITS.free} 个微信链接和 ${PLUGIN_LIMITS.free} 个插件。`,
    },
    ...plans,
  ];
}

/** BreadcrumbList 的唯一生成入口：位置按顺序算，省得每个分支手写 position。 */
function breadcrumbList(entries: ReadonlyArray<{ name: string; item: string }>) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: entries.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: entry.item,
    })),
  };
}

export interface PageSeo {
  title: string;
  description: string;
  indexable: boolean;
  canonical?: string;
  ogType?: "website" | "article";
  structuredData?: Record<string, unknown>;
}

/**
 * Landing pages share one schema shape: a WebPage (or Article for guides), the
 * breadcrumb trail and, when present, the FAQ block. Keeping it in one builder
 * stops the eight pages from drifting apart as they are edited.
 */
function seoLandingPage(page: SeoPage): PageSeo {
  const canonical = `${SITE_URL}${page.path}`;
  const isArticle = page.kind === "article";
  const publisher = organizationNode();
  const webPage = isArticle
    ? {
        "@type": "Article",
        "@id": `${canonical}#article`,
        url: canonical,
        mainEntityOfPage: canonical,
        headline: page.h1,
        description: page.description,
        inLanguage: "zh-CN",
        image: SOCIAL_IMAGE,
        datePublished: page.updatedAt,
        dateModified: page.updatedAt,
        author: { "@type": "Organization", name: "微伴团队", url: `${SITE_URL}/` },
        publisher,
      }
    : {
        "@type": "WebPage",
        "@id": `${canonical}#webpage`,
        url: canonical,
        name: page.h1,
        description: page.description,
        inLanguage: "zh-CN",
        about: softwareApplicationRef(),
        publisher,
      };
  return {
    title: `${page.title} | ${SITE_NAME}`,
    description: page.description,
    indexable: true,
    canonical,
    ogType: isArticle ? "article" : "website",
    structuredData: {
      "@context": "https://schema.org",
      "@graph": [
        webPage,
        breadcrumbList([
          { name: "首页", item: `${SITE_URL}/` },
          { name: page.title, item: canonical },
        ]),
        ...(page.faq.length
          ? [
              {
                "@type": "FAQPage",
                "@id": `${canonical}#faq`,
                mainEntity: page.faq.map((item) => ({
                  "@type": "Question",
                  name: item.question,
                  acceptedAnswer: { "@type": "Answer", text: item.answer },
                })),
              },
            ]
          : []),
      ],
    },
  };
}

/**
 * `/docs/faq` 的 FAQPage 节点。问答正文与页面共用 `FAQ_DOC_SECTIONS`，
 * 答案在这里被还原成纯文本（Markdown 链接标记原样输出会被当成乱码）。
 */
function faqPageNode(canonical: string) {
  return {
    "@type": "FAQPage",
    "@id": `${canonical}#faq`,
    mainEntity: FAQ_DOC_SECTIONS.map((section) => ({
      "@type": "Question",
      name: section.title,
      acceptedAnswer: {
        "@type": "Answer",
        text: faqAnswerText(section.body),
      },
    })),
  };
}

export function getPageSeo(pathname: string): PageSeo {
  const path = pathname.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
  // Production redirects this route at the edge. The fallback HTML has the
  // destination canonical without a conflicting noindex instruction.
  if (path === "/guide") return getPageSeo("/docs/getting-started");
  const landing = findSeoPage(path);
  if (landing) return seoLandingPage(landing);
  const article = path.startsWith("/docs/") ? findDocArticle(path.slice(6)) : undefined;
  if (path === "/docs" || article) {
    const canonical = `${SITE_URL}${path}`;
    const title = article?.title ?? DOCS_TITLE;
    const description = article?.description ?? DOCS_DESCRIPTION;
    const breadcrumbs = [
      { name: "首页", item: `${SITE_URL}/` },
      { name: "文档", item: `${SITE_URL}/docs` },
      ...(article ? [{ name: title, item: canonical }] : []),
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
                publisher: organizationNode(),
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
          breadcrumbList(breadcrumbs),
          ...(article?.slug === "faq" ? [faqPageNode(canonical)] : []),
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
  const developer = findDeveloperPage(path);
  if (developer) {
    const canonical = `${SITE_URL}${path}`;
    return {
      title: `${developer.title} | ${SITE_NAME}`,
      description: developer.description,
      indexable: true,
      canonical,
      structuredData: {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebPage",
            "@id": `${canonical}#webpage`,
            url: canonical,
            name: developer.name,
            description: developer.description,
            inLanguage: "zh-CN",
            dateModified: developer.updatedAt,
            about: softwareApplicationRef(),
            publisher: organizationNode(),
          },
          // 站内没有 /developers 索引页（只有三个子路由），中间层给 item 会指向 404，
          // 因此与 landing 页一样用两级：首页 → 当前页。
          breadcrumbList([
            { name: "首页", item: `${SITE_URL}/` },
            { name: developer.name, item: canonical },
          ]),
        ],
      },
    };
  }
  if (path === "/") {
    const canonical = `${SITE_URL}/`;
    const title = `WeChat AI · 微信 AI：把你的 AI 接入微信 | ${SITE_NAME}`;
    const description =
      "微伴 Wechatai 把 AI 接入微信：用自己 API Key 连接 DeepSeek、Claude、GPT，也接 OpenClaw 与 Hermes；微信内切换模型、管理会话，每日赠送 credits，免费开始。";
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
            about: { "@id": APPLICATION_ID },
          },
          organizationNode(),
          {
            ...softwareApplicationRef(),
            description,
            operatingSystem: "Web",
            image: SOCIAL_IMAGE,
            featureList: [
              "使用自己的 API Key 与模型服务地址",
              "在微信中切换大模型并管理聊天会话",
              "支持 OpenAI Chat Completions、Responses 与 Anthropic Messages",
              "连接自己的 OpenClaw 和 Hermes Agent",
            ],
            offers: softwareApplicationOffers(),
          },
          // 首页折叠问答的 FAQPage 节点，条目与页面上渲染的 `LANDING_FAQ` 同源。
          {
            "@type": "FAQPage",
            "@id": `${canonical}#faq`,
            mainEntity: LANDING_FAQ.map((item) => ({
              "@type": "Question",
              name: item.question,
              acceptedAnswer: { "@type": "Answer", text: item.answer },
            })),
          },
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
  const landing = findSeoPage(path);
  if (landing) return landing.updatedAt;
  const developer = findDeveloperPage(path);
  if (developer) return developer.updatedAt;
  const infoKind = (Object.keys(INFO_PAGES) as InfoPageKind[]).find(
    (kind) => INFO_PAGES[kind].path === path,
  );
  if (infoKind) return INFO_PAGE_UPDATED_AT[infoKind];
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
