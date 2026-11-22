import { afterEach, describe, expect, it } from "vitest";
import {
  clearRegisteredTranslations,
  publishedTranslations,
  registerTranslations,
  type TranslationPage,
} from "../src/shared/i18n";
import { localizedHref } from "../src/client/locale";
import {
  getPageSeo,
  pageLastModified,
  publishedLocalizedPaths,
  renderSeoHead,
  renderSitemap,
} from "../src/shared/seo";
import { SEO_PAGES } from "../src/shared/seo-pages";
import { pricingPageFor } from "../src/shared/seo-content/pricing";
import ptPages from "../src/shared/i18n/pt/pages";
import wechatAi from "../src/shared/i18n/pt/wechat-ai";
import wechatBot from "../src/shared/i18n/pt/wechat-bot";
import wechatDeepseek from "../src/shared/i18n/pt/wechat-deepseek";

const translations: readonly TranslationPage[] = [
  ...ptPages,
  ...wechatAi,
  ...wechatBot,
  ...wechatDeepseek,
];
const expectedPaths = ["/", "/pricing", "/wechat-ai", "/wechat-bot", "/wechat-deepseek"];

afterEach(() => clearRegisteredTranslations());

describe("Brazilian Portuguese translations", () => {
  it("registers exactly the five approved paths with complete, Chinese-free copy", () => {
    expect(translations.map((page) => page.path).sort()).toEqual([...expectedPaths].sort());
    for (const translation of translations) {
      if (translation.path === "/") {
        expect(translation.content, translation.path).toBeUndefined();
      } else {
        const source = SEO_PAGES.find((page) => page.path === translation.path);
        expect(source, translation.path).toBeDefined();
        if (translation.path === "/pricing") {
          expect(translation.content, translation.path).toBeUndefined();
        } else {
          expect(translation.content, translation.path).toBeDefined();
          expect(translation.content?.path).toBe(translation.path);
          expect(translation.content?.sections.length, translation.path).toBeGreaterThan(0);
          expect(translation.content?.faq.length, translation.path).toBeGreaterThan(0);
          expect(translation.description, translation.path).toBe(translation.content?.description);
        }
      }
      expect(translation.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Commands, model names and brands stay as-is; prose must not ship Chinese.
      expect(JSON.stringify(translation), translation.path).not.toMatch(/\p{Script=Han}/u);
    }
  });

  it("serves pt-BR metadata, self canonical, cross-links, breadcrumbs and FAQ schema", () => {
    registerTranslations("pt", translations, "T10 fixture");
    for (const translation of translations) {
      const path = `/pt${translation.path === "/" ? "" : translation.path}`;
      const seo = getPageSeo(path);
      expect(seo.indexable, path).toBe(true);
      expect(seo.canonical, path).toBe(`https://wechatai.app${path}`);
      expect(seo.htmlLang, path).toBe("pt-BR");
      expect(seo.ogLocale, path).toBe("pt_BR");
      expect(seo.title, path).toBe(translation.title);
      expect(seo.description, path).toBe(translation.description);
      expect(seo.alternates, path).toEqual([
        { hreflang: "zh-CN", href: `https://wechatai.app${translation.path}` },
        { hreflang: "pt-BR", href: `https://wechatai.app${path}` },
        { hreflang: "x-default", href: `https://wechatai.app${translation.path}` },
      ]);
      expect(renderSeoHead(seo), path).toContain('hreflang="x-default"');

      const graph = (seo.structuredData?.["@graph"] ?? []) as Array<Record<string, unknown>>;
      const webPage = graph.find(
        (node) => node["@type"] === "WebPage" || node["@type"] === "Article",
      );
      expect(webPage, path).toMatchObject({
        description: translation.description,
        inLanguage: "pt-BR",
        url: `https://wechatai.app${path}`,
      });
      expect(webPage?.name ?? webPage?.headline, path).not.toMatch(/\p{Script=Han}/u);
      if (translation.path !== "/") {
        expect(graph).toContainEqual({
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Início",
              item: "https://wechatai.app/pt",
            },
            {
              "@type": "ListItem",
              position: 2,
              name:
                translation.content?.title ??
                (translation.path === "/pricing" ? pricingPageFor("pt").title : seo.title),
              item: `https://wechatai.app${path}`,
            },
          ],
        });
      }
      if (translation.content) {
        expect(graph).toContainEqual({
          "@type": "FAQPage",
          "@id": `https://wechatai.app${path}#faq`,
          mainEntity: translation.content.faq.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: item.answer },
          })),
        });
      }
    }
  });

  it("keeps the pricing page JSON-LD in Portuguese and aligned with the visible plans", () => {
    registerTranslations("pt", translations, "T10 fixture");
    const seo = getPageSeo("/pt/pricing");
    const graph = seo.structuredData?.["@graph"] as Array<Record<string, unknown>>;
    const service = graph.find((node) => node["@type"] === "Service")!;
    expect(service.name).toBe("Wechatai Free e Plus");
    expect(service.serviceType).toBe("Serviço de integração de IA ao WeChat");
    const offers = service.offers as Array<Record<string, unknown>>;
    expect(offers.map((offer) => [offer.name, offer.price])).toEqual([
      ["Free", 0],
      ["Plus Mensal", 9.9],
      ["Plus Anual", 88],
    ]);
    const home = getPageSeo("/pt");
    const homeGraph = home.structuredData?.["@graph"] as Array<Record<string, unknown>>;
    const application = homeGraph.find(
      (node) => node["@type"] === "SoftwareApplication",
    ) as Record<string, unknown>;
    expect(application.featureList).toContain(
      "Use sua própria API key e endpoint de modelo",
    );
  });

  it("adds exactly the five Portuguese URLs to the sitemap and keeps existing lastmods", () => {
    const before = renderSitemap();
    registerTranslations("pt", translations, "T10 fixture");
    const after = renderSitemap();
    const beforeLines = new Set(before.split("\n"));
    const added = after.split("\n").filter((line) => line.includes("<url>") && !beforeLines.has(line));
    const addedPaths = added
      .map((line) => /<loc>https:\/\/wechatai\.app([^<]*)<\/loc>/.exec(line)?.[1])
      .sort();
    expect(addedPaths).toEqual(["/pt", "/pt/pricing", "/pt/wechat-ai", "/pt/wechat-bot", "/pt/wechat-deepseek"]);
    for (const line of before.split("\n").filter((value) => value.includes("<url>"))) {
      expect(after, line).toContain(line);
    }
    for (const path of addedPaths) {
      expect(after, path).toContain(
        `<loc>https://wechatai.app${path}</loc><lastmod>2026-11-21</lastmod>`,
      );
    }
    expect(pageLastModified("/pt/wechat-ai")).toBe("2026-11-21");
    expect(publishedLocalizedPaths().sort()).toEqual(
      ["/pt", "/pt/pricing", "/pt/wechat-ai", "/pt/wechat-bot", "/pt/wechat-deepseek"].sort(),
    );
  });

  it("keeps unregistered Portuguese pages out and localizes only registered links", () => {
    registerTranslations("pt", translations, "T10 fixture");
    for (const path of ["/pt/docs", "/pt/wechat-claude", "/pt/guide"]) {
      const seo = getPageSeo(path);
      expect(seo.indexable, path).toBe(false);
      expect(seo.canonical, path).toBeUndefined();
    }
    expect(renderSitemap()).not.toContain("https://wechatai.app/pt/docs");
    expect(localizedHref("pt", "/pricing")).toBe("/pt/pricing");
    expect(localizedHref("pt", "/pricing?interval=year#plan-year")).toBe(
      "/pt/pricing?interval=year#plan-year",
    );
    expect(localizedHref("pt", "/wechat-ai#cost")).toBe("/pt/wechat-ai#cost");
    expect(localizedHref("pt", "/wechat-claude")).toBe("/wechat-claude");
    expect(localizedHref("pt", "/docs/commands")).toBe("/docs/commands");
    expect(localizedHref("zh-CN", "/pricing")).toBe("/pricing");
  });

  it("discovers exactly the five Portuguese modules through the locale loader", async () => {
    clearRegisteredTranslations();
    // Dynamic on purpose: this case exercises the discovery boundary itself. A
    // static import would register every locale before the isolated cases above.
    await import("../src/shared/i18n/load");
    const ptPaths = publishedTranslations()
      .filter((translation) => translation.locale === "pt")
      .map((translation) => translation.path)
      .sort();
    expect(ptPaths).toEqual([...expectedPaths].sort());
  });
});
