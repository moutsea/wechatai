import { afterEach, describe, expect, it } from "vitest";
import {
  clearRegisteredTranslations,
  registerTranslations,
  translatedHref,
  type TranslationPage,
} from "../src/shared/i18n";
import { getPageSeo, renderSeoHead, renderSitemap } from "../src/shared/seo";
import { SEO_PAGES } from "../src/shared/seo-pages";
import byok from "../src/shared/i18n/en/bring-your-own-api-key";
import wechatAgent from "../src/shared/i18n/en/wechat-agent";
import wechatOptions from "../src/shared/i18n/en/wechat-ai-options";
import wechatBot from "../src/shared/i18n/en/wechat-bot";
import wechatGlm from "../src/shared/i18n/en/wechat-glm";
import wechatMuse from "../src/shared/i18n/en/wechat-muse";
import wechatBanRisk from "../src/shared/i18n/en/wechat-ai-ban-risk";
import wechatPrivacy from "../src/shared/i18n/en/wechat-ai-privacy";
import wechatImage from "../src/shared/i18n/en/wechat-ai-image";
import wechatPartner from "../src/shared/i18n/en/wechat-ai-partner";
import wechatCharacterCard from "../src/shared/i18n/en/wechat-character-card";
import compareOfficial from "../src/shared/i18n/en/compare-wechatai-vs-wechat-official-ai";
import compareOpenclaw from "../src/shared/i18n/en/compare-wechatai-vs-openclaw";
import compareCommercial from "../src/shared/i18n/en/compare-wechatai-vs-commercial-wechat-ai";

const modules: readonly (readonly TranslationPage[])[] = [
  byok,
  wechatAgent,
  wechatOptions,
  wechatBot,
  wechatGlm,
  wechatMuse,
  wechatBanRisk,
  wechatPrivacy,
  wechatImage,
  wechatPartner,
  wechatCharacterCard,
  compareOfficial,
  compareOpenclaw,
  compareCommercial,
];

const translations = modules.flat();
const paths = translations.map((page) => page.path);
const EXPECTED_PATHS = [
  "/bring-your-own-api-key",
  "/wechat-agent",
  "/wechat-ai-options",
  "/wechat-bot",
  "/wechat-glm",
  "/wechat-muse",
  "/wechat-ai-ban-risk",
  "/wechat-ai-privacy",
  "/wechat-ai-image",
  "/wechat-ai-partner",
  "/wechat-character-card",
  "/compare/wechatai-vs-wechat-official-ai",
  "/compare/wechatai-vs-openclaw",
  "/compare/wechatai-vs-commercial-wechat-ai",
];
const COMPARE_PATHS = [
  "/compare/wechatai-vs-wechat-official-ai",
  "/compare/wechatai-vs-openclaw",
  "/compare/wechatai-vs-commercial-wechat-ai",
];
const HAN = /\p{Script=Han}/u;

function englishText(page: TranslationPage): string {
  const content = page.content!;
  return JSON.stringify({
    eyebrow: content.eyebrow,
    h1: content.h1,
    lede: content.lede,
    answer: content.answer,
    primaryKeyword: content.primaryKeyword,
    secondaryKeywords: content.secondaryKeywords,
    highlights: content.highlights,
    sections: content.sections,
    faq: content.faq,
    related: content.related,
    steps: content.steps,
    stepsSummary: content.stepsSummary,
    ctaLabel: content.ctaLabel,
    secondaryCta: content.secondaryCta,
    comparison: content.comparison,
  });
}

afterEach(() => clearRegisteredTranslations());

describe("English remaining landing pages", () => {
  it("registers exactly the fourteen T4 pages with complete content", () => {
    expect([...paths].sort()).toEqual([...EXPECTED_PATHS].sort());
    expect(new Set(paths).size).toBe(14);
    expect(paths).not.toContain("/pricing");
    for (const translation of translations) {
      const source = SEO_PAGES.find((page) => page.path === translation.path);
      expect(source, translation.path).toBeDefined();
      expect(translation.content, translation.path).toBeDefined();
      expect(translation.content?.path).toBe(translation.path);
      expect(translation.content?.description).toBe(translation.description);
      expect(translation.content?.sections.length).toBe(source?.sections.length);
      expect(translation.content?.faq.length).toBe(source?.faq.length);
      expect(translation.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(englishText(translation), translation.path).not.toMatch(HAN);
    }
  });

  it("keeps executable commands verbatim and related destinations unchanged", () => {
    for (const translation of translations) {
      const source = SEO_PAGES.find((page) => page.path === translation.path)!;
      expect(
        translation.content?.commands?.map((item) => item.command),
        translation.path,
      ).toEqual(source.commands?.map((item) => item.command));
      expect(
        translation.content?.related.map((link) => link.href),
        translation.path,
      ).toEqual(source.related.map((link) => link.href));
    }
  });

  it("keeps every comparison row, null cell, and note", () => {
    for (const path of COMPARE_PATHS) {
      const source = SEO_PAGES.find((page) => page.path === path)!;
      const translated = translations.find((page) => page.path === path)!.content!;
      expect(source.comparison, path).toBeDefined();
      expect(translated.comparison, path).toBeDefined();
      expect(translated.comparison!.columns).toHaveLength(source.comparison!.columns.length);
      expect(translated.comparison!.rows).toHaveLength(source.comparison!.rows.length);
      source.comparison!.rows.forEach((row, index) => {
        const other = translated.comparison!.rows[index];
        expect(other.values, `${path} row ${row.label}`).toHaveLength(row.values.length);
        expect(
          other.values.map((value) => value === null),
          `${path} row ${row.label}`,
        ).toEqual(row.values.map((value) => value === null));
      });
      expect(translated.comparison!.note.trim(), path).not.toBe("");
    }
  });

  it("serves each page with English metadata, canonical, hreflang, and page-owned JSON-LD", () => {
    registerTranslations("en", translations, "T4 fixture");
    for (const translation of translations) {
      const path = `/en${translation.path}`;
      const seo = getPageSeo(path);
      expect(seo.indexable, path).toBe(true);
      expect(seo.canonical, path).toBe(`https://wechatai.app${path}`);
      expect(seo.htmlLang, path).toBe("en");
      expect(seo.ogLocale, path).toBe("en_US");
      expect(seo.title, path).toBe(translation.title);
      expect(seo.description, path).toBe(translation.description);
      expect(seo.alternates, path).toEqual([
        { hreflang: "zh-CN", href: `https://wechatai.app${translation.path}` },
        { hreflang: "en", href: `https://wechatai.app${path}` },
        { hreflang: "x-default", href: `https://wechatai.app${translation.path}` },
      ]);

      const graph = (seo.structuredData?.["@graph"] ?? []) as Array<Record<string, unknown>>;
      expect(graph).toContainEqual({
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://wechatai.app/" },
          {
            "@type": "ListItem",
            position: 2,
            name: translation.content?.title,
            item: `https://wechatai.app${path}`,
          },
        ],
      });
      const faq = graph.find((node) => node["@type"] === "FAQPage");
      expect(faq, path).toBeDefined();
      expect(faq?.mainEntity).toHaveLength(translation.content!.faq.length);
      expect(renderSeoHead(seo), path).toContain('hreflang="x-default"');
    }
  });

  it("adds only the fourteen T4 URLs to the sitemap", () => {
    const before = renderSitemap();
    registerTranslations("en", translations, "T4 fixture");
    const after = renderSitemap();
    const added = after
      .split("\n")
      .filter((line) => line.includes("<loc>https://wechatai.app/en/") && !before.includes(line));
    expect(added).toHaveLength(14);
    for (const path of paths) {
      expect(after, path).toContain(`<loc>https://wechatai.app/en${path}</loc>`);
    }
  });

  it("leaves unregistered English paths and the Chinese sources unchanged", () => {
    registerTranslations("en", translations, "T4 fixture");
    expect(getPageSeo("/en/terms").indexable).toBe(false);
    expect(getPageSeo("/en/pricing").indexable).toBe(false);
    for (const path of paths) {
      const seo = getPageSeo(path);
      expect(seo.canonical, path).toBe(`https://wechatai.app${path}`);
      expect(seo.alternates, path).toContainEqual({
        hreflang: "en",
        href: `https://wechatai.app/en${path}`,
      });
      expect(seo.alternates, path).toContainEqual({
        hreflang: "x-default",
        href: `https://wechatai.app${path}`,
      });
    }
    expect(translatedHref("en", "/pricing#estimate")).toBe("/pricing#estimate");
    expect(translatedHref("en", "/docs/credits")).toBe("/docs/credits");
    expect(translatedHref("zh-CN", "/wechat-muse")).toBe("/wechat-muse");
  });
});
