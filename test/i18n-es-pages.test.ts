import { afterEach, describe, expect, it } from "vitest";
import {
  clearRegisteredTranslations,
  registerTranslations,
  type TranslationPage,
} from "../src/shared/i18n";
import { getPageSeo, pageLastModified, renderSeoHead, renderSitemap } from "../src/shared/seo";
import { SEO_PAGES } from "../src/shared/seo-pages";
import esPages from "../src/shared/i18n/es/pages";
import esWechatAi from "../src/shared/i18n/es/wechat-ai";
import esWechatBot from "../src/shared/i18n/es/wechat-bot";
import esWechatDeepseek from "../src/shared/i18n/es/wechat-deepseek";
import enPages from "../src/shared/i18n/en/pages";
import enWechatAi from "../src/shared/i18n/en/wechat-ai";
import enWechatDeepseek from "../src/shared/i18n/en/wechat-deepseek";

const esTranslations: readonly TranslationPage[] = [
  ...esPages,
  ...esWechatAi,
  ...esWechatBot,
  ...esWechatDeepseek,
];
const enTranslations: readonly TranslationPage[] = [...enPages, ...enWechatAi, ...enWechatDeepseek];

afterEach(() => clearRegisteredTranslations());

describe("Spanish translations", () => {
  it("registers exactly the five marketing pages", () => {
    expect(esTranslations.map((page) => page.path).sort()).toEqual([
      "/",
      "/pricing",
      "/wechat-ai",
      "/wechat-bot",
      "/wechat-deepseek",
    ]);
    for (const translation of esTranslations) {
      expect(translation.title, translation.path).toMatch(/\| Wechatai$/);
      expect(translation.updatedAt, translation.path).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(JSON.stringify(translation), translation.path).not.toMatch(/\p{Script=Han}/u);
    }
    for (const translation of esWechatAi.concat(esWechatBot, esWechatDeepseek)) {
      expect(translation.content, translation.path).toBeDefined();
      expect(translation.content?.path, translation.path).toBe(translation.path);
    }
  });

  it("serves Spanish metadata, canonical and the full hreflang group", () => {
    registerTranslations("en", enTranslations, "T9 fixture");
    registerTranslations("es", esTranslations, "T9 fixture");
    for (const path of ["/", "/pricing", "/wechat-ai", "/wechat-deepseek"]) {
      const esPath = path === "/" ? "/es" : `/es${path}`;
      const seo = getPageSeo(esPath);
      expect(seo.indexable, esPath).toBe(true);
      expect(seo.canonical, esPath).toBe(`https://wechatai.app${esPath}`);
      expect(seo.htmlLang, esPath).toBe("es");
      expect(seo.ogLocale, esPath).toBe("es_ES");
      expect(seo.alternates, esPath).toEqual([
        { hreflang: "zh-CN", href: `https://wechatai.app${path}` },
        { hreflang: "en", href: `https://wechatai.app/en${path === "/" ? "" : path}` },
        { hreflang: "es", href: `https://wechatai.app${esPath}` },
        { hreflang: "x-default", href: `https://wechatai.app${path}` },
      ]);
      const head = renderSeoHead(seo);
      expect(head, esPath).toContain('og:locale" content="es_ES"');
      expect(head, esPath).toContain(`rel="canonical" href="https://wechatai.app${esPath}"`);
      expect(head, esPath).toContain(`hreflang="es" href="https://wechatai.app${esPath}"`);
      expect(head, esPath).toContain(`hreflang="x-default" href="https://wechatai.app${path}"`);
    }
    // The Chinese and English pages point back at the Spanish translation.
    expect(getPageSeo("/wechat-ai").alternates).toContainEqual({
      hreflang: "es",
      href: "https://wechatai.app/es/wechat-ai",
    });
    expect(getPageSeo("/en/wechat-ai").alternates).toContainEqual({
      hreflang: "es",
      href: "https://wechatai.app/es/wechat-ai",
    });
  });

  it("publishes reciprocal Chinese, English, Japanese, Spanish and Portuguese WeChat bot pages", async () => {
    // Load production discovery only here; the other cases own their registry fixtures.
    await import("../src/shared/i18n/load");
    const pages = [
      { hreflang: "zh-CN", href: "https://wechatai.app/wechat-bot" },
      { hreflang: "en", href: "https://wechatai.app/en/wechat-bot" },
      { hreflang: "ja-JP", href: "https://wechatai.app/ja/wechat-bot" },
      { hreflang: "ko-KR", href: "https://wechatai.app/ko/wechat-bot" },
      { hreflang: "es", href: "https://wechatai.app/es/wechat-bot" },
      { hreflang: "pt-BR", href: "https://wechatai.app/pt/wechat-bot" },
    ];
    for (const { href } of pages) {
      const seo = getPageSeo(new URL(href).pathname);
      expect(seo.indexable, href).toBe(true);
      expect(seo.canonical, href).toBe(href);
      expect(seo.alternates, href).toEqual([
        ...pages,
        { hreflang: "x-default", href: pages[0].href },
      ]);
    }
  });

  it("keeps page-owned JSON-LD and prices aligned with the Spanish page", () => {
    registerTranslations("es", esTranslations, "T9 fixture");
    const page = esWechatAi[0]!;
    const graph = (getPageSeo("/es/wechat-ai").structuredData?.["@graph"] ?? []) as Array<
      Record<string, unknown>
    >;
    expect(graph.find((node) => node["@type"] === "WebPage")).toMatchObject({
      name: page.content?.h1,
      description: page.description,
      inLanguage: "es",
      url: "https://wechatai.app/es/wechat-ai",
    });
    expect(graph).toContainEqual({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: "https://wechatai.app/es" },
        {
          "@type": "ListItem",
          position: 2,
          name: page.content?.title,
          item: "https://wechatai.app/es/wechat-ai",
        },
      ],
    });
    const faq = graph.find((node) => node["@type"] === "FAQPage") as {
      mainEntity: Array<{ name: string }>;
    };
    expect(faq.mainEntity.map((item) => item.name)).toEqual(
      page.content?.faq.map((item) => item.question),
    );

    const pricing = getPageSeo("/es/pricing").structuredData?.["@graph"] as Array<
      Record<string, unknown>
    >;
    const service = pricing.find((node) => node["@type"] === "Service") as {
      name: string;
      offers: Array<{ name: string; price: number; priceCurrency: string }>;
    };
    expect(service.name).toBe("Wechatai Gratis y Plus");
    expect(service.offers.map((offer) => offer.name)).toEqual([
      "Gratis",
      "Plus mensual",
      "Plus anual",
    ]);
    for (const offer of service.offers) {
      expect(offer.priceCurrency).toBe("CNY");
    }
    expect(service.offers.map((offer) => offer.price)).toEqual([0, 9.9, 88]);
  });

  it("adds exactly five URLs to the sitemap without touching existing entries", () => {
    const before = renderSitemap();
    const beforeEntries = new Map(
      before
        .split("\n")
        .filter((line) => line.includes("<loc>"))
        .map((line) => [line.match(/<loc>(.*?)<\/loc>/)![1]!, line]),
    );
    registerTranslations("es", esTranslations, "T9 fixture");
    const after = renderSitemap();
    const afterLines = after.split("\n").filter((line) => line.includes("<loc>"));
    const added = afterLines.filter(
      (line) => !beforeEntries.has(line.match(/<loc>(.*?)<\/loc>/)![1]!),
    );
    expect(added).toHaveLength(5);
    for (const path of [
      "/es",
      "/es/pricing",
      "/es/wechat-ai",
      "/es/wechat-bot",
      "/es/wechat-deepseek",
    ]) {
      expect(after, path).toContain(`<loc>https://wechatai.app${path}</loc>`);
      expect(pageLastModified(path), path).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    for (const [url, line] of beforeEntries) {
      expect(after, url).toContain(line);
    }
  });

  it("does not publish unregistered Spanish docs or landing pages", () => {
    registerTranslations("es", esTranslations, "T9 fixture");
    for (const path of ["/es/docs", "/es/docs/getting-started", "/es/wechat-muse", "/es/compare"]) {
      const seo = getPageSeo(path);
      expect(seo.indexable, path).toBe(false);
      expect(seo.canonical, path).toBeUndefined();
      expect(renderSeoHead(seo), path).not.toContain("hreflang");
      expect(renderSeoHead(seo), path).toContain("noindex");
    }
    expect(renderSitemap()).not.toContain("/es/docs");
  });

  it("keeps the Spanish landing pages within the public SEO paths", () => {
    for (const translation of esTranslations) {
      expect(
        SEO_PAGES.some((page) => page.path === translation.path) ||
          translation.path === "/" ||
          translation.path === "/pricing",
        translation.path,
      ).toBe(true);
    }
  });
});
