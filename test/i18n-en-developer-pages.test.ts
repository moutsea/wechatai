import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  clearRegisteredTranslations,
  registerTranslations,
  registeredTranslation,
} from "../src/shared/i18n";
import developerPages, {
  DEVELOPER_PAGES_EN,
} from "../src/shared/i18n/en/developer-pages";
import {
  MUSE_FAQ_EN,
  hermesGuideEn,
  museGuideEn,
  openClawGuideEn,
} from "../src/shared/i18n/en/data/developer-content-en";
import { pluginProtocolSectionsEn } from "../src/shared/i18n/en/data/plugin-protocol-en";
import {
  protocolExamples,
  protocolLinks,
  protocolMarkdown,
  protocolSections,
} from "../src/shared/plugin-docs";
import { getPageSeo, pageLastModified, renderSitemap } from "../src/shared/seo";
import { localizedHref } from "../src/client/locale";

const paths = ["/developers/plugins", "/developers/openclaw", "/developers/hermes", "/developers/muse"];

beforeAll(() => {
  registerTranslations("en", developerPages, "T6B fixture");
});

afterAll(() => clearRegisteredTranslations());

describe("English developer pages", () => {
  it("registers exactly the four developer pages with English-only metadata", () => {
    expect(developerPages.map((page) => page.path).sort()).toEqual([...paths].sort());
    for (const path of paths) {
      const page = registeredTranslation("en", path);
      expect(page, path).toBeDefined();
      expect(page?.title, path).toMatch(/\| Wechatai$/);
      expect(page?.description.length, path).toBeGreaterThan(80);
      expect(JSON.stringify(page), path).not.toMatch(/\p{Script=Han}/u);
      expect(page?.content, path).toBeUndefined();
      expect(page?.updatedAt, path).toBe("2026-11-22");
    }
  });

  it("serves each developer page with an English canonical, hreflang group and JSON-LD", () => {
    for (const path of paths) {
      const englishPath = `/en${path}`;
      const seo = getPageSeo(englishPath);
      const expected = DEVELOPER_PAGES_EN[path as keyof typeof DEVELOPER_PAGES_EN];
      expect(seo.indexable, englishPath).toBe(true);
      expect(seo.canonical, englishPath).toBe(`https://wechatai.app${englishPath}`);
      expect(seo.title, englishPath).toBe(expected.title);
      expect(seo.description, englishPath).toBe(expected.description);
      expect(seo.htmlLang, englishPath).toBe("en");
      expect(seo.ogLocale, englishPath).toBe("en_US");
      expect(seo.alternates, englishPath).toEqual([
        { hreflang: "zh-CN", href: `https://wechatai.app${path}` },
        { hreflang: "en", href: `https://wechatai.app${englishPath}` },
        { hreflang: "x-default", href: `https://wechatai.app${path}` },
      ]);
      expect(seo.title, englishPath).not.toMatch(/\p{Script=Han}/u);
      expect(seo.description, englishPath).not.toMatch(/\p{Script=Han}/u);

      const graph = (seo.structuredData?.["@graph"] ?? []) as Array<Record<string, unknown>>;
      const page = graph.find(
        (node) => node["@type"] === "WebPage" || node["@type"] === "Article",
      ) as Record<string, unknown>;
      expect(page, englishPath).toMatchObject({
        url: `https://wechatai.app${englishPath}`,
        description: expected.description,
        inLanguage: "en",
      });
      expect(page?.name ?? page?.headline, englishPath).toBe(expected.name);
      expect(
        JSON.stringify({ name: page.name ?? page.headline, description: page.description }),
      ).not.toMatch(/\p{Script=Han}/u);
      expect(graph).toContainEqual({
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://wechatai.app/" },
          {
            "@type": "ListItem",
            position: 2,
            name: expected.name,
            item: `https://wechatai.app${englishPath}`,
          },
        ],
      });
      expect(pageLastModified(englishPath), englishPath).toBe("2026-11-22");
    }
  });

  it("keeps the Chinese developer pages and their JSON-LD on the source copy", () => {
    for (const path of paths) {
      const seo = getPageSeo(path);
      expect(seo.canonical, path).toBe(`https://wechatai.app${path}`);
      expect(seo.indexable, path).toBe(true);
      expect(JSON.stringify(seo.structuredData), path).toMatch(/\p{Script=Han}/u);
      expect(seo.alternates, path).toHaveLength(3);
    }
  });

  it("publishes the English Muse article and FAQ from the same English answers", () => {
    const seo = getPageSeo("/en/developers/muse");
    const graph = (seo.structuredData?.["@graph"] ?? []) as Array<Record<string, unknown>>;
    const article = graph.find((node) => node["@type"] === "Article");
    const faq = graph.find((node) => node["@type"] === "FAQPage") as
      | { mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }> }
      | undefined;
    expect(seo.ogType).toBe("article");
    expect(article?.url).toBe("https://wechatai.app/en/developers/muse");
    expect(article?.headline).toBe("Muse connection guide");
    expect(faq?.mainEntity).toHaveLength(MUSE_FAQ_EN.length);
    expect(faq?.mainEntity).toEqual(
      MUSE_FAQ_EN.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    );
    for (const item of MUSE_FAQ_EN) {
      expect(museGuideEn).toContain(`### ${item.question}`);
      expect(museGuideEn).toContain(item.answer);
    }
  });

  it("documents Muse reply images, billing and upload order", () => {
    expect(museGuideEn).toContain("up to 4 PNG, JPEG or WebP images");
    expect(museGuideEn).toContain("WeChat receives the text first and then the images");
    expect(museGuideEn).toContain("Each reply image costs 5 credits");
    expect(museGuideEn).toContain("Images and files sent to Muse");
    expect(museGuideEn).not.toContain("does not carry images");
    expect(museGuideEn).toContain("PUT /api/muse/uploads?job={jobId}&runner={runnerId}");
    expect(museGuideEn).toContain("8 upload attempts per task");
    expect(museGuideEn).toContain("event's `images` array in delivery order");
    expect(museGuideEn).toContain("connector version 1.1.0; older versions return text only");
  });

  it("adds exactly four English URLs to the sitemap", () => {
    const sitemap = renderSitemap();
    const englishUrls = [...sitemap.matchAll(/<loc>(https:\/\/wechatai\.app\/en\/[^<]+)<\/loc>/g)].map(
      ([, url]) => url,
    );
    expect(englishUrls.sort()).toEqual(paths.map((path) => `https://wechatai.app/en${path}`).sort());
    expect(sitemap).toContain(
      `<loc>https://wechatai.app/en/developers/muse</loc><lastmod>2026-11-22</lastmod>`,
    );
  });

  it("keeps unregistered developer URLs as real 404s", () => {
    expect(getPageSeo("/en/developers/notifications").indexable).toBe(false);
    expect(getPageSeo("/en/developers/plugins.md").indexable).toBe(false);
  });

  it("keeps the Chinese protocol source and machine-readable document byte-identical", () => {
    expect(protocolMarkdown).toContain("## 给 AI agent 的起点");
    expect(protocolMarkdown).toContain("## 最小适配示例");
    expect(protocolSections.map((section) => section.id)).toContain("quickstart");
    expect(protocolSections).toHaveLength(15);
  });

  it("translates every protocol section while preserving anchors, commands and examples", () => {
    expect(pluginProtocolSectionsEn.map((section) => section.id)).toEqual(
      protocolSections.map((section) => section.id),
    );
    expect(pluginProtocolSectionsEn).toHaveLength(15);
    const english = pluginProtocolSectionsEn.map((section) => section.markdown).join("\n");
    for (const example of [
      protocolExamples.manifest,
      protocolExamples.invocation,
      protocolExamples.result,
    ]) {
      expect(english, "example JSON").toContain(JSON.stringify(example, null, 2));
    }
    for (const command of [
      `curl -fsSL ${protocolLinks.markdown} -o wechatai-plugin-protocol.md`,
      `curl -fsSL ${protocolLinks.api} -o wechatai-plugin-protocol.json`,
      `curl -fsSL ${protocolLinks.schema} -o wechatai-plugin-schema.json`,
      "cl100k_base@gpt-tokenizer-4.0.0",
      "export async function execute(invocation, callYourTool)",
    ]) {
      expect(english, command).toContain(command);
    }
    expect(english).toContain("Protocol 1.0");
    expect(english).not.toMatch(/^## 给 AI agent 的起点/m);
    expect(pluginProtocolSectionsEn[0].title).toBe("Start here for AI agents");
    expect(pluginProtocolSectionsEn[3].title).toBe("Responsibility and identity");
  });

  it("localizes only links whose exact target is registered", () => {
    registerTranslations(
      "en",
      [
        {
          path: "/docs",
          title: "Docs | Wechatai",
          description: "Product documentation.",
          updatedAt: "2026-11-22",
        },
      ],
      "T6B docs fixture",
    );
    expect(localizedHref("en", "/developers/muse")).toBe("/en/developers/muse");
    expect(localizedHref("en", "/developers/muse?from=protocol#billing")).toBe(
      "/en/developers/muse?from=protocol#billing",
    );
    expect(localizedHref("en", "/docs")).toBe("/en/docs");
    expect(localizedHref("en", "/developers/plugins.md")).toBe("/developers/plugins.md");
    expect(localizedHref("en", "/wechat-muse")).toBe("/wechat-muse");
    expect(localizedHref("zh-CN", "/developers/muse")).toBe("/developers/muse");
  });

  it("keeps the guide facts and commands aligned with the Chinese sources", () => {
    for (const guide of [openClawGuideEn, hermesGuideEn, museGuideEn]) {
      expect(guide.startsWith("# ")).toBe(true);
      expect(guide).not.toContain("TODO");
      expect(guide.length).toBeGreaterThan(1_000);
    }
    for (const command of ["/use claw", "/use hermes", "/use muse", "/wx new", "/wx reset"]) {
      expect([openClawGuideEn, hermesGuideEn, museGuideEn].join("\n"), command).toContain(command);
    }
    for (const limit of ["5,000 input tokens = 1 credit", "×8"]) {
      expect(openClawGuideEn, limit).toContain(limit);
      expect(hermesGuideEn, limit).toContain(limit);
      expect(museGuideEn, limit).toContain(limit);
    }
    expect(openClawGuideEn).toContain("2026.6.10");
    expect(openClawGuideEn).toContain("Node.js 22.19");
    expect(hermesGuideEn).toContain("v0.21.6");
    expect(museGuideEn).toContain("Python 3.10+");
  });
});
