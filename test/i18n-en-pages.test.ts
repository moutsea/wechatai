import { afterEach, describe, expect, it } from "vitest";
import {
  clearRegisteredTranslations,
  registerTranslations,
  type TranslationPage,
} from "../src/shared/i18n";
import { localizedHref } from "../src/client/locale";
import { getPageSeo, renderSeoHead, renderSitemap } from "../src/shared/seo";
import { SEO_PAGES } from "../src/shared/seo-pages";
import wechatAi from "../src/shared/i18n/en/wechat-ai";
import wechatClawbot from "../src/shared/i18n/en/wechat-clawbot";
import wechatClawbotModels from "../src/shared/i18n/en/wechat-clawbot-models";
import wechatDeepseek from "../src/shared/i18n/en/wechat-deepseek";
import wechatClaude from "../src/shared/i18n/en/wechat-claude";
import wechatGpt from "../src/shared/i18n/en/wechat-gpt";
import wechatKimi from "../src/shared/i18n/en/wechat-kimi";
import wechatQwen from "../src/shared/i18n/en/wechat-qwen";

const pages: readonly (readonly TranslationPage[])[] = [
  wechatAi,
  wechatClawbot,
  wechatClawbotModels,
  wechatDeepseek,
  wechatClaude,
  wechatGpt,
  wechatKimi,
  wechatQwen,
];

const translations = pages.flat();
const paths = translations.map((page) => page.path);

afterEach(() => clearRegisteredTranslations());

describe("English model landing pages", () => {
  it("registers exactly the eight model pages with complete content", () => {
    expect(paths.sort()).toEqual([
      "/wechat-ai",
      "/wechat-claude",
      "/wechat-clawbot",
      "/wechat-clawbot-models",
      "/wechat-deepseek",
      "/wechat-gpt",
      "/wechat-kimi",
      "/wechat-qwen",
    ]);
    for (const translation of translations) {
      const source = SEO_PAGES.find((page) => page.path === translation.path);
      expect(source, translation.path).toBeDefined();
      expect(translation.content, translation.path).toBeDefined();
      expect(translation.content?.path).toBe(translation.path);
      expect(translation.content?.sections.length).toBeGreaterThan(0);
      expect(translation.content?.faq.length).toBeGreaterThan(0);
      expect(translation.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // A translation must not ship Chinese prose; commands and brands are Latin.
      expect(JSON.stringify(translation), translation.path).not.toMatch(/\p{Script=Han}/u);
    }
  });

  it("serves each page with English metadata, body, breadcrumbs, and FAQ schema", () => {
    registerTranslations("en", translations, "T3 fixture");
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
      const webPage = graph.find((node) => node["@type"] === "WebPage");
      expect(webPage, path).toMatchObject({
        name: translation.content?.h1,
        description: translation.description,
        inLanguage: "en",
        url: `https://wechatai.app${path}`,
      });
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
      expect(graph).toContainEqual({
        "@type": "FAQPage",
        "@id": `https://wechatai.app${path}#faq`,
        mainEntity: translation.content?.faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      });

      expect(renderSeoHead(seo), path).toContain('hreflang="x-default"');
    }
  });

  it("adds only the eight URLs to the sitemap", () => {
    const before = renderSitemap();
    registerTranslations("en", translations, "T3 fixture");
    const after = renderSitemap();
    const added = after
      .split("\n")
      .filter((line) => line.includes(`<loc>https://wechatai.app/en/`) && !before.includes(line));
    expect(added).toHaveLength(8);
    for (const path of paths) {
      expect(after, path).toContain(`<loc>https://wechatai.app/en${path}</loc>`);
    }
  });

  it("keeps unregistered model pages out of the English site", () => {
    registerTranslations("en", translations, "T3 fixture");
    expect(getPageSeo("/en/wechat-glm").indexable).toBe(false);
    expect(getPageSeo("/en/wechat-ai-options").indexable).toBe(false);
  });

  it("localizes only links whose page has a registered translation", () => {
    registerTranslations("en", translations, "T3 fixture");
    expect(localizedHref("en", "/wechat-claude")).toBe("/en/wechat-claude");
    expect(localizedHref("en", "/wechat-claude?from=guide#long-context")).toBe(
      "/en/wechat-claude?from=guide#long-context",
    );
    expect(localizedHref("en", "/wechat-glm#estimate")).toBe("/wechat-glm#estimate");
    expect(localizedHref("en", "/docs/commands")).toBe("/docs/commands");
    expect(localizedHref("zh-CN", "/wechat-claude")).toBe("/wechat-claude");
  });
});
