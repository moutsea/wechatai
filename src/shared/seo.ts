import { INFO_PAGES, INFO_PAGE_UPDATED_AT, SITE_MAINTAINER, type InfoPageKind } from "./site-info";
import { EN_SITE_INFO_PAGES } from "./i18n/en/site-info";
import {
  DOC_ARTICLES,
  DOCS_TITLE,
  DOCS_DESCRIPTION,
  DOCS_INDEX_UPDATED_AT,
  docPath,
  findDocArticle,
} from "./docs";
import { SEO_PATHS, findSeoPage, type SeoPage } from "./seo-pages";
import { FAQ_DOC_SECTIONS, faqAnswerText, type FaqDocSection } from "./faq-doc";
import { EN_DOC_ARTICLES, EN_DOCS_DESCRIPTION, EN_DOCS_TITLE } from "./i18n/en/docs";
import { EN_DOC_CONTENT, EN_FAQ_SECTIONS } from "./i18n/en/data/docs-content-en";
import { BILLING_OFFERS, FREE_PLAN_AMOUNT_CENTS } from "./billing-offers";
import { landingFaq } from "./landing-faq";
import { homeCopyFor, pricingCopyFor } from "./i18n/copy";
import { seoCopy as seoCopyKo } from "./i18n/ko/copy/seo";
import { seoCopy as seoCopyJa } from "./i18n/ja/copy/seo";
import { homeCopy as homeCopyJa } from "./i18n/ja/copy/home";
import { pricingCopy as pricingCopyJa } from "./i18n/ja/copy/pricing";
import { seoCopy as seoCopyPt } from "./i18n/pt/copy/seo";
import { pricingPageFor } from "./seo-content/pricing";
import { PLUGIN_LIMITS } from "./plugin-access";
import { WECHAT_LINK_LIMITS } from "./wechat-links";
import { MUSE_FAQ } from "./muse-faq";
import {
  DEFAULT_LOCALE,
  hasRegisteredTranslation,
  LOCALE_DEFINITIONS,
  localizedPath,
  normalizePath,
  registeredTranslation,
  registeredTranslationsForPath,
  splitLocalePath,
  type Locale,
  type RegisteredTranslation,
} from "./i18n";

// Public search URLs always use the production domain, including local builds.
export const SITE_URL = "https://wechatai.app";
export const SITE_NAME = "微伴 Wechatai";

// Update only when the actual homepage content changes, never on every build.
const HOME_UPDATED_AT = "2026-11-14";
export const SOCIAL_IMAGE = `${SITE_URL}/og-image.png`;
export const PUBLIC_PATHS = [
  "/",
  "/docs",
  ...DOC_ARTICLES.map((article) => docPath(article.slug)),
  ...SEO_PATHS,
  "/developers/plugins",
  "/developers/openclaw",
  "/developers/hermes",
  "/developers/muse",
  ...Object.values(INFO_PAGES).map((page) => page.path),
] as const;
export const LEGACY_PATHS = ["/guide"] as const;
const publicPathSet = new Set<string>(PUBLIC_PATHS);
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
    "/tasks",
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
 * `/developers/*` 页面不走 `SEO_PAGES` 的内容表：正文分别来自 `openclaw-docs.ts`、
 * `hermes-docs.ts`、`muse-docs.ts` 与 `plugin-docs.ts`，这几个模块没有导出更新日期。
 * 这里的 `updatedAt` 和 `HOME_UPDATED_AT` / `DOCS_INDEX_UPDATED_AT` / `INFO_PAGE_UPDATED_AT`
 * 一样手动维护：取该页正文模块与其渲染组件最近一次改动的日期，绝不用构建时间冒充内容更新。
 * Muse 指南有可见的问答段落，因此额外发布 Article 与 FAQPage；问题与答案来自同一份
 * `MUSE_FAQ`，指南 Markdown 也由它生成。
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
  "/developers/muse": {
    title: "Muse 微信接入：托管助理与消息回复",
    name: "Muse 接入指南",
    description:
      "将已有 Muse 托管助理通过 hook 连接到微伴，在微信发送文字任务、接收最终回复和授权的主动通知。",
    updatedAt: "2026-11-19",
    article: true,
    faq: MUSE_FAQ,
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
function organizationNode(locale: Locale = DEFAULT_LOCALE) {
  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: SITE_NAME,
    alternateName: ["Wechatai", "微伴"],
    url: `${SITE_URL}/`,
    description:
      locale === "en"
        ? "An independently maintained service that connects AI models and agents to one-to-one WeChat ClawBot chats. It is not officially affiliated with Tencent or WeChat."
        : locale === "ja"
          ? seoCopyJa.organizationDescription
          : locale === "pt"
            ? seoCopyPt.organizationDescription
            : locale === "es"
              ? "Servicio mantenido de forma independiente que conecta modelos de IA y agentes con chats individuales de WeChat ClawBot. No está afiliado oficialmente a Tencent ni a WeChat."
            : locale === "ko"
              ? seoCopyKo.organizationDescription
              : "独立维护的微信 ClawBot 单聊模型与 Agent 接入服务，与腾讯微信无官方关联。",
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

function maintainerNode() {
  return {
    "@type": "Person",
    "@id": `${SITE_URL}/contact#maintainer`,
    name: SITE_MAINTAINER.name,
    url: SITE_MAINTAINER.profile,
    sameAs: [SITE_MAINTAINER.website],
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
 * 价格取自 `billing-offers.ts`（单位是分），免费版额度来自
 * `PLUGIN_LIMITS` / `WECHAT_LINK_LIMITS`。
 * credits 加油包是加购项而不是软件本身的订阅，因此没有放进 offers。
 */
function softwareApplicationOffers(locale: Locale = DEFAULT_LOCALE) {
  const english = locale === "en";
  const japanese = locale === "ja";
  const korean = locale === "ko";
  const portuguese = locale === "pt";
  const spanish = locale === "es";
  const copy =
    japanese || korean || portuguese || spanish ? pricingCopyFor(locale)?.plans : undefined;
  const plans = BILLING_OFFERS.filter((offer) => offer.kind === "plus").map((offer) => {
    const price = offer.amount / 100;
    const name = offer.interval === "year" ? "Plus Yearly" : "Plus Monthly";
    const localizedName = english ? name : copy?.offerName(offer.interval) ?? offer.name;
    return {
      "@type": "Offer",
      name: localizedName,
      url: `${SITE_URL}${korean || portuguese || spanish ? localizedPath(locale, "/pricing") : "/pricing"}`,
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
  const freePrice = FREE_PLAN_AMOUNT_CENTS / 100;
  return [
    {
      "@type": "Offer",
      name: english ? "Free" : copy?.free.name ?? "免费版",
      url: `${SITE_URL}${korean || portuguese || spanish ? localizedPath(locale, "/") : "/"}`,
      price: freePrice,
      priceCurrency: "CNY",
      availability: "https://schema.org/InStock",
      description: english
        ? `Includes daily credits, ${WECHAT_LINK_LIMITS.free} WeChat connection, and ${PLUGIN_LIMITS.free} plugin configuration.`
        : japanese
          ? pricingCopyJa.seo.freeOfferDescription
          : portuguese
            ? seoCopyPt.freeOfferDescription(WECHAT_LINK_LIMITS.free, PLUGIN_LIMITS.free)
            : spanish
              ? `Incluye créditos diarios, ${WECHAT_LINK_LIMITS.free} conexión de WeChat y ${PLUGIN_LIMITS.free} configuración de plugin.`
            : korean
              ? seoCopyKo.freeOfferDescription(WECHAT_LINK_LIMITS.free, PLUGIN_LIMITS.free)
              : `每天赠送 credits，可绑定 ${WECHAT_LINK_LIMITS.free} 个微信链接和 ${PLUGIN_LIMITS.free} 个插件。`,
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: freePrice,
        priceCurrency: "CNY",
      },
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

export interface PageAlternate {
  hreflang: string;
  href: string;
}

export interface PageSeo {
  title: string;
  description: string;
  indexable: boolean;
  canonical?: string;
  ogType?: "website" | "article";
  structuredData?: Record<string, unknown>;
  /** HTML `lang`; defaults to the Chinese source locale. */
  htmlLang?: string;
  /** `og:locale`; defaults to the Chinese source locale. */
  ogLocale?: string;
  /** Present only for page groups with at least one registered translation. */
  alternates?: readonly PageAlternate[];
}

/**
 * Landing pages share one schema shape: a WebPage (or Article for guides), the
 * breadcrumb trail and, when present, the FAQ block. Keeping it in one builder
 * stops the eight pages from drifting apart as they are edited.
 */
function seoLandingPage(
  page: SeoPage,
  canonical: string,
  htmlLang: string,
  locale: Locale = DEFAULT_LOCALE,
): PageSeo {
  const english = locale === "en";
  const japanese = locale === "ja";
  const korean = locale === "ko";
  const portuguese = locale === "pt";
  const spanish = locale === "es";
  const isArticle = page.kind === "article";
  const publisher = organizationNode(locale);
  const webPage = isArticle
    ? {
        "@type": "Article",
        "@id": `${canonical}#article`,
        url: canonical,
        mainEntityOfPage: canonical,
        headline: page.h1,
        description: page.description,
        inLanguage: htmlLang,
        image: SOCIAL_IMAGE,
        dateModified: page.updatedAt,
        author: {
          "@id": ORGANIZATION_ID,
          "@type": "Organization",
          name: SITE_NAME,
          url: `${SITE_URL}/`,
        },
        publisher,
      }
    : {
        "@type": "WebPage",
        "@id": `${canonical}#webpage`,
        url: canonical,
        name: page.h1,
        description: page.description,
        inLanguage: htmlLang,
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
        ...(page.kind === "pricing"
          ? [
              {
                "@type": "Service",
                "@id": `${SITE_URL}${page.path}#plans`,
                name: english
                  ? "Wechatai Free and Plus"
                  : japanese
                    ? pricingCopyJa.seo.serviceName
                    : portuguese
                      ? seoCopyPt.serviceName
                      : spanish
                        ? "Wechatai Gratis y Plus"
                      : korean
                        ? seoCopyKo.serviceName
                        : `${SITE_NAME} 免费版与 Plus`,
                serviceType: english
                  ? "WeChat AI integration service"
                  : japanese
                    ? pricingCopyJa.seo.serviceType
                    : portuguese
                      ? seoCopyPt.serviceType
                      : spanish
                        ? "Servicio de integración de IA con WeChat"
                      : korean
                        ? seoCopyKo.serviceType
                        : "微信 AI 接入服务",
                provider: { "@id": ORGANIZATION_ID },
                offers: softwareApplicationOffers(locale),
              },
            ]
          : []),
        breadcrumbList([
          {
            name: pricingCopyFor(locale)?.page.home ?? "首页",
            item: `${SITE_URL}${hasRegisteredTranslation(locale, "/") ? localizedPath(locale, "/") : "/"}`,
          },
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
function faqPageNode(canonical: string, sections: readonly FaqDocSection[] = FAQ_DOC_SECTIONS) {
  return {
    "@type": "FAQPage",
    "@id": `${canonical}#faq`,
    mainEntity: sections.map((section) => ({
      "@type": "Question",
      name: section.title,
      acceptedAnswer: {
        "@type": "Answer",
        text: faqAnswerText(section.body),
      },
    })),
  };
}

function basePageSeo(path: string, locale: Locale = DEFAULT_LOCALE): PageSeo {
  // Production redirects this route at the edge. The fallback HTML has the
  // destination canonical without a conflicting noindex instruction.
  if (path === "/guide") return getPageSeo("/docs/getting-started");
  const canonical = `${SITE_URL}${locale === DEFAULT_LOCALE ? path : localizedPath(locale, path)}`;
  const { htmlLang } = LOCALE_DEFINITIONS[locale];
  const landing = findSeoPage(path);
  if (landing)
    return seoLandingPage(
      path === "/pricing" ? pricingPageFor(locale) : landing,
      canonical,
      htmlLang,
      locale,
    );
  const englishDocs = locale === "en";
  const article = path.startsWith("/docs/") ? findDocArticle(path.slice(6)) : undefined;
  const englishArticle = englishDocs
    ? EN_DOC_ARTICLES.find((item) => item.path === path)
    : undefined;
  const docEntry = englishDocs ? englishArticle : article;
  if (path === "/docs" || docEntry) {
    const title = docEntry?.title ?? (englishDocs ? EN_DOCS_TITLE : DOCS_TITLE);
    const description =
      docEntry?.description ?? (englishDocs ? EN_DOCS_DESCRIPTION : DOCS_DESCRIPTION);
    const docsIndex = `${SITE_URL}${localizedPath(locale, "/docs")}`;
    const breadcrumbs = [
      { name: englishDocs ? "Home" : "首页", item: `${SITE_URL}/` },
      { name: englishDocs ? "Documentation" : "文档", item: docEntry ? docsIndex : canonical },
      ...(docEntry ? [{ name: title, item: canonical }] : []),
    ];
    const sections =
      englishDocs && docEntry
        ? EN_DOC_CONTENT[docEntry.slug as keyof typeof EN_DOC_CONTENT].sections
        : undefined;
    return {
      title: `${docEntry?.seoTitle ?? title} | ${englishDocs ? "Wechatai" : SITE_NAME}`,
      description,
      indexable: true,
      canonical,
      ogType: docEntry ? "article" : "website",
      structuredData: {
        "@context": "https://schema.org",
        "@graph": [
          docEntry
            ? {
                "@type": "Article",
                "@id": `${canonical}#article`,
                url: canonical,
                mainEntityOfPage: canonical,
                headline: docEntry.seoTitle ?? title,
                description,
                inLanguage: htmlLang,
                image: SOCIAL_IMAGE,
                dateModified: docEntry.updatedAt,
                author: {
                  "@id": ORGANIZATION_ID,
                  "@type": "Organization",
                  name: SITE_NAME,
                  url: `${SITE_URL}/`,
                },
                publisher: organizationNode(),
                articleSection: docEntry.category,
                isPartOf: { "@id": docsIndex },
                ...(sections
                  ? {
                      hasPart: sections.map((section) => ({
                        "@type": "WebPageElement",
                        name: section.title,
                        url: `${canonical}#${section.id}`,
                      })),
                    }
                  : {}),
              }
            : {
                "@type": "CollectionPage",
                "@id": canonical,
                url: canonical,
                name: title,
                description,
                inLanguage: htmlLang,
                mainEntity: {
                  "@type": "ItemList",
                  itemListElement: (englishDocs ? EN_DOC_ARTICLES : DOC_ARTICLES).map(
                    (item, index) => ({
                      "@type": "ListItem",
                      position: index + 1,
                      name: item.title,
                      url: `${SITE_URL}${localizedPath(locale, docPath(item.slug))}`,
                    }),
                  ),
                },
              },
          breadcrumbList(breadcrumbs),
          ...(docEntry?.slug === "faq"
            ? [faqPageNode(canonical, englishDocs ? EN_FAQ_SECTIONS : FAQ_DOC_SECTIONS)]
            : []),
        ],
      },
    };
  }
  const infoKind = (Object.keys(INFO_PAGES) as InfoPageKind[]).find(
    (kind) => INFO_PAGES[kind].path === path,
  );
  const info = infoKind ? INFO_PAGES[infoKind] : undefined;
  if (info && infoKind) {
    // The visible English page and its registration own the page name and
    // summary; Chinese remains the source for the unprefixed routes. Keep the
    // ContactPage structure and entity IDs exactly as they are.
    const localized = locale === "en" ? EN_SITE_INFO_PAGES[infoKind] : undefined;
    const name = localized?.name ?? info.title;
    const description = localized?.description ?? info.description;
    return {
      title: `${name} | ${localized ? "Wechatai" : SITE_NAME}`,
      description,
      indexable: true,
      canonical,
      structuredData: {
        "@context": "https://schema.org",
        "@type": path === "/contact" ? "ContactPage" : "WebPage",
        name,
        description,
        url: canonical,
        inLanguage: htmlLang,
        ...(path === "/contact"
          ? { about: softwareApplicationRef(), mainEntity: maintainerNode() }
          : {}),
      },
    };
  }
  const developer = findDeveloperPage(path);
  if (developer) {
    const isArticle = "article" in developer && developer.article === true;
    const faq = "faq" in developer ? developer.faq : undefined;
    return {
      title: `${developer.title} | ${SITE_NAME}`,
      description: developer.description,
      indexable: true,
      canonical,
      ogType: isArticle ? "article" : "website",
      structuredData: {
        "@context": "https://schema.org",
        "@graph": [
          isArticle
            ? {
                "@type": "Article",
                "@id": `${canonical}#article`,
                url: canonical,
                mainEntityOfPage: canonical,
                headline: developer.name,
                description: developer.description,
                inLanguage: htmlLang,
                image: SOCIAL_IMAGE,
                dateModified: developer.updatedAt,
                author: {
                  "@id": ORGANIZATION_ID,
                  "@type": "Organization",
                  name: SITE_NAME,
                  url: `${SITE_URL}/`,
                },
                publisher: organizationNode(),
              }
            : {
                "@type": "WebPage",
                "@id": `${canonical}#webpage`,
                url: canonical,
                name: developer.name,
                description: developer.description,
                inLanguage: htmlLang,
                dateModified: developer.updatedAt,
                about: softwareApplicationRef(),
                publisher: organizationNode(),
              },
          // 站内没有 /developers 索引页（只有子路由），中间层给 item 会指向 404，
          // 因此与 landing 页一样用两级：首页 → 当前页。
          breadcrumbList([
            { name: "首页", item: `${SITE_URL}/` },
            { name: developer.name, item: canonical },
          ]),
          ...(faq?.length
            ? [
                {
                  "@type": "FAQPage",
                  "@id": `${canonical}#faq`,
                  mainEntity: faq.map((item) => ({
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
  if (path === "/") {
    const english = locale === "en";
    const portuguese = locale === "pt";
    const copy = homeCopyFor(locale);
    const title =
      copy?.seo.title ?? `微信 AI 接入：DeepSeek、Claude、GPT 与 Agent | ${SITE_NAME}`;
    const description =
      copy?.seo.description ??
      "微伴 Wechatai 把模型和 Agent 接入微信：DeepSeek、Claude、GPT 聊天，AI 生图，连接 Muse、Hermes、OpenClaw，Plus 云端助手小薇处理文件与任务。免费开始，自备模型 API Key，费用另付服务商。";
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
            inLanguage: htmlLang,
            isPartOf: { "@id": `${SITE_URL}/#website` },
            about: { "@id": APPLICATION_ID },
          },
          organizationNode(locale),
          {
            ...softwareApplicationRef(),
            description,
            operatingSystem: "Web",
            image: SOCIAL_IMAGE,
            maintainer: maintainerNode(),
            featureList:
              locale === "ko"
                ? seoCopyKo.featureList
                : english
                ? [
                    "Use your own API key and model endpoint",
                    "Switch models and manage conversations in WeChat",
                    "Supports OpenAI Chat Completions, Responses, and Anthropic Messages",
                    "Connect existing Muse, Hermes, and OpenClaw agents",
                    "Configure an image model to generate and receive AI images in WeChat",
                    "Customize characters and storylines with the role-play plugin",
                    "Plus cloud assistant Xiaowei handles files, creates documents, and runs tasks; requires a text model",
                  ]
                : locale === "ja"
                  ? homeCopyJa.seo.featureList
                  : portuguese
                    ? seoCopyPt.featureList
                    : locale === "es"
                      ? [
                          "Usa tu propia clave de API y endpoint de modelo",
                          "Cambia de modelo y gestiona conversaciones en WeChat",
                          "Compatible con OpenAI Chat Completions, Responses y Anthropic Messages",
                          "Conecta agentes existentes de Muse, Hermes y OpenClaw",
                          "Configura un modelo de imagen para generar y recibir imágenes con IA en WeChat",
                          "Personaliza personajes e historias con el plugin de juego de rol",
                          "El asistente en la nube Plus Xiaowei procesa archivos, crea documentos y ejecuta tareas; requiere un modelo de texto",
                        ]
                    : [
                        "使用自己的 API Key 与模型服务地址",
                        "在微信中切换大模型并管理聊天会话",
                        "支持 OpenAI Chat Completions、Responses 与 Anthropic Messages",
                        "连接已有 Muse、Hermes 和 OpenClaw Agent",
                        "配置图片模型，在微信生成并接收 AI 图片",
                        "通过角色扮演插件自定义人设与剧情",
                        "Plus 云端助手小薇处理文件、生成文档与执行任务，需配置文本模型",
                      ],
            offers: softwareApplicationOffers(locale),
          },
          // 首页折叠问答的 FAQPage 节点，条目与页面上渲染的问答同源。
          {
            "@type": "FAQPage",
            "@id": `${canonical}#faq`,
            mainEntity: landingFaq(locale).map((item) => ({
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

function notFoundPageSeo(): PageSeo {
  return {
    title: `页面未找到 | ${SITE_NAME}`,
    description: "微伴 Wechatai 个人微信 AI 工作台。",
    indexable: false,
  };
}

/**
 * One page group lists every published language, including itself, plus an
 * x-default that points at the unprefixed Chinese source.
 */
function pageAlternates(path: string): PageAlternate[] {
  const locales = [
    DEFAULT_LOCALE,
    ...registeredTranslationsForPath(path).map((page) => page.locale),
  ];
  if (locales.length < 2) return [];
  return [
    ...locales.map((locale) => ({
      hreflang: LOCALE_DEFINITIONS[locale].htmlLang,
      href: `${SITE_URL}${localizedPath(locale, path)}`,
    })),
    { hreflang: "x-default", href: `${SITE_URL}${localizedPath(DEFAULT_LOCALE, path)}` },
  ];
}

function withAlternates(seo: PageSeo, path: string): PageSeo {
  if (!seo.indexable) return seo;
  const alternates = pageAlternates(path);
  return alternates.length ? { ...seo, alternates } : seo;
}

function translatedPageSeo(path: string, translation: RegisteredTranslation): PageSeo {
  const { locale, title, description, content } = translation;
  const { htmlLang, ogLocale } = LOCALE_DEFINITIONS[locale];
  const canonical = `${SITE_URL}${localizedPath(locale, path)}`;
  // A complete translation feeds the same builder as the Chinese page, so the
  // visible body and page-owned JSON-LD cannot drift apart.
  const base = content
    ? seoLandingPage(content, canonical, htmlLang, locale)
    : basePageSeo(path, locale);
  if (!base.indexable) return notFoundPageSeo();
  return {
    ...base,
    title,
    description,
    htmlLang,
    ogLocale,
    alternates: pageAlternates(path),
  };
}

/**
 * `locale` is authoritative for unprefixed paths. A locale prefix in the URL is
 * always resolved first so `/en/pricing` can never fall back to the Chinese page
 * while no English translation is registered.
 */
export function getPageSeo(pathname: string, locale: Locale = DEFAULT_LOCALE): PageSeo {
  const normalized = normalizePath(pathname);
  const split = splitLocalePath(normalized);
  if (split) {
    const translation = registeredTranslation(split.locale, split.path);
    if (!translation || !publicPathSet.has(split.path)) return notFoundPageSeo();
    return translatedPageSeo(split.path, translation);
  }
  if (locale !== DEFAULT_LOCALE) {
    const translation = registeredTranslation(locale, normalized);
    if (!translation || !publicPathSet.has(normalized)) return notFoundPageSeo();
    return translatedPageSeo(normalized, translation);
  }
  return withAlternates(basePageSeo(normalized), normalized);
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
  const defaultLocale = LOCALE_DEFINITIONS[DEFAULT_LOCALE];
  const imageLang = seo.htmlLang ?? defaultLocale.htmlLang;
  const imageAlt =
    imageLang === "en"
      ? "Wechatai: chat with the models you choose in WeChat."
      : imageLang === LOCALE_DEFINITIONS.ja.htmlLang
        ? seoCopyJa.imageAlt
        : imageLang === LOCALE_DEFINITIONS.ko.htmlLang
          ? seoCopyKo.imageAlt
          : imageLang === LOCALE_DEFINITIONS.pt.htmlLang
            ? seoCopyPt.imageAlt
            : imageLang === LOCALE_DEFINITIONS.es.htmlLang
              ? "Wechatai: chatea en WeChat con los modelos que elijas."
            : "微伴 Wechatai：在微信里，与自选大模型对话。";
  return [
    `<title data-seo>${escapeHtml(seo.title)}</title>`,
    meta("description", seo.description),
    meta("robots", seo.indexable ? "index, follow, max-image-preview:large" : "noindex, follow"),
    ...(seo.canonical
      ? [`<link rel="canonical" href="${escapeHtml(seo.canonical)}" data-seo />`]
      : []),
    ...(seo.alternates?.map(
      (alternate) =>
        `<link rel="alternate" hreflang="${escapeHtml(alternate.hreflang)}" href="${escapeHtml(alternate.href)}" data-seo />`,
    ) ?? []),
    ...(seo.indexable
      ? [
          meta("og:type", seo.ogType ?? "website", true),
          meta("og:site_name", SITE_NAME, true),
          meta("og:locale", seo.ogLocale ?? defaultLocale.ogLocale, true),
          meta("og:title", seo.title, true),
          meta("og:description", seo.description, true),
          meta("og:url", seo.canonical!, true),
          meta("og:image", SOCIAL_IMAGE, true),
          meta("og:image:width", "1200", true),
          meta("og:image:height", "630", true),
          meta("og:image:alt", imageAlt, true),
          meta("twitter:card", "summary_large_image"),
          meta("twitter:title", seo.title),
          meta("twitter:description", seo.description),
          meta("twitter:image", SOCIAL_IMAGE),
          meta("twitter:image:alt", imageAlt),
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
  const htmlLang = seo.htmlLang ?? LOCALE_DEFINITIONS[DEFAULT_LOCALE].htmlLang;
  const withLang = html.replace(/<html lang="[^"]*">/, `<html lang="${htmlLang}">`);
  return withLang.replace(
    marker,
    () => `<!-- SEO:START -->\n    ${renderSeoHead(seo)}\n    <!-- SEO:END -->`,
  );
}

export function pageLastModified(pathname: string): string | undefined {
  const path = normalizePath(pathname);
  const split = splitLocalePath(path);
  if (split) return registeredTranslation(split.locale, split.path)?.updatedAt;
  if (path === "/") return HOME_UPDATED_AT;
  if (path === "/docs") return DOCS_INDEX_UPDATED_AT;
  const article = path.startsWith("/docs/") ? findDocArticle(path.slice(6)) : undefined;
  if (article) return article.updatedAt;
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

/** Every registered translation that belongs to a known public Chinese page. */
export function publishedLocalizedPaths(): string[] {
  return PUBLIC_PATHS.flatMap((path) =>
    registeredTranslationsForPath(path).map((translation) =>
      localizedPath(translation.locale, path),
    ),
  );
}

export function renderSitemap() {
  const entries = PUBLIC_PATHS.flatMap((path) => {
    const modified = pageLastModified(path);
    return [
      `  <url><loc>${SITE_URL}${path}</loc>${modified ? `<lastmod>${modified}</lastmod>` : ""}</url>`,
      ...registeredTranslationsForPath(path).map(
        (translation) =>
          `  <url><loc>${SITE_URL}${localizedPath(translation.locale, path)}</loc><lastmod>${translation.updatedAt}</lastmod></url>`,
      ),
    ];
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
}
