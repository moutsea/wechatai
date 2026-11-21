import { afterEach, describe, expect, it } from "vitest";
import {
  clearRegisteredTranslations,
  registerTranslations,
  type TranslationPage,
} from "../src/shared/i18n";
import { localizedHref } from "../src/client/locale";
import { getPageSeo, renderSeoHead, renderSitemap } from "../src/shared/seo";
import { SEO_PAGES } from "../src/shared/seo-pages";
import wechatAi from "../src/shared/i18n/ja/wechat-ai";
import wechatBot from "../src/shared/i18n/ja/wechat-bot";
import wechatDeepseek from "../src/shared/i18n/ja/wechat-deepseek";

const pages: readonly (readonly TranslationPage[])[] = [wechatAi, wechatBot, wechatDeepseek];

const translations = pages.flat();
const paths = translations.map((page) => page.path);

afterEach(() => clearRegisteredTranslations());

describe("Japanese landing pages", () => {
  it("registers exactly the three landing pages with complete content", () => {
    expect(paths.sort()).toEqual(["/wechat-ai", "/wechat-bot", "/wechat-deepseek"]);
    for (const translation of translations) {
      const source = SEO_PAGES.find((page) => page.path === translation.path);
      expect(source, translation.path).toBeDefined();
      expect(translation.content, translation.path).toBeDefined();
      expect(translation.content?.path).toBe(translation.path);
      expect(translation.content?.sections.length).toBeGreaterThan(0);
      expect(translation.content?.faq.length).toBeGreaterThan(0);
      expect(translation.content?.description).toBe(translation.description);
      expect(translation.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Chinese source prose must not survive; Chinese-only words are the signal.
      expect(JSON.stringify(translation), translation.path).not.toMatch(
        /微信|免费|价格|常见问题|微伴|插件|扫码|额度/g,
      );
    }
  });

  it("keeps commands, brands and page-specific structure verbatim", () => {
    const ai = wechatAi[0].content!;
    expect(ai.steps?.map((step) => step.title)).toHaveLength(3);
    expect(JSON.stringify(ai)).toContain("/wx models");
    expect(JSON.stringify(ai)).toContain("/use");
    const deepseek = wechatDeepseek[0].content!;
    expect(deepseek.ctaHref).toBe("/docs/deepseek-in-wechat");
    expect(JSON.stringify(deepseek)).toContain("OpenAI Chat Completions");
    const bot = wechatBot[0].content!;
    expect(bot.kind).toBe("comparison");
    expect(JSON.stringify(bot)).toContain("/use ショートカット名");
  });

  it("serves each page with Japanese metadata, body, breadcrumbs and FAQ schema", () => {
    registerTranslations(
      "ja",
      [
        { path: "/", title: "Wechatai", description: "ホーム", updatedAt: "2026-11-21" },
        ...translations,
      ],
      "T7 fixture",
    );
    for (const translation of translations) {
      const path = `/ja${translation.path}`;
      const seo = getPageSeo(path);
      expect(seo.indexable, path).toBe(true);
      expect(seo.canonical, path).toBe(`https://wechatai.app${path}`);
      expect(seo.htmlLang, path).toBe("ja-JP");
      expect(seo.ogLocale, path).toBe("ja_JP");
      expect(seo.title, path).toBe(translation.title);
      expect(seo.description, path).toBe(translation.description);
      expect(seo.alternates, path).toEqual([
        { hreflang: "zh-CN", href: `https://wechatai.app${translation.path}` },
        { hreflang: "ja-JP", href: `https://wechatai.app${path}` },
        { hreflang: "x-default", href: `https://wechatai.app${translation.path}` },
      ]);

      const graph = (seo.structuredData?.["@graph"] ?? []) as Array<Record<string, unknown>>;
      expect(graph.find((node) => node["@type"] === "WebPage"), path).toMatchObject({
        name: translation.content?.h1,
        description: translation.description,
        inLanguage: "ja-JP",
        url: `https://wechatai.app${path}`,
      });
      expect(graph).toContainEqual({
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "ホーム", item: "https://wechatai.app/ja" },
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

  it("adds only the three URLs to the sitemap", () => {
    const before = renderSitemap();
    registerTranslations("ja", translations, "T7 fixture");
    const after = renderSitemap();
    const added = after
      .split("\n")
      .filter((line) => line.includes(`<loc>https://wechatai.app/ja/`) && !before.includes(line));
    expect(added).toHaveLength(3);
    for (const path of paths) {
      expect(after, path).toContain(`<loc>https://wechatai.app/ja${path}</loc>`);
    }
  });

  it("keeps unregistered Japanese pages out of the site", () => {
    registerTranslations("ja", translations, "T7 fixture");
    expect(getPageSeo("/ja/wechat-glm").indexable).toBe(false);
    expect(getPageSeo("/ja/docs").indexable).toBe(false);
  });

  it("localizes only links whose page has a registered translation", () => {
    registerTranslations("ja", translations, "T7 fixture");
    expect(localizedHref("ja", "/wechat-bot")).toBe("/ja/wechat-bot");
    expect(localizedHref("ja", "/wechat-ai#cost")).toBe("/ja/wechat-ai#cost");
    expect(localizedHref("ja", "/wechat-claude?from=guide#long-context")).toBe(
      "/wechat-claude?from=guide#long-context",
    );
    expect(localizedHref("ja", "/docs/commands")).toBe("/docs/commands");
    expect(localizedHref("zh-CN", "/wechat-bot")).toBe("/wechat-bot");
  });
});
