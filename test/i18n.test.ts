import { afterEach, describe, expect, it } from "vitest";
import {
  clearRegisteredTranslations,
  publishedTranslations,
  registerTranslations,
} from "../src/shared/i18n";
import {
  getPageSeo,
  pageLastModified,
  publishedLocalizedPaths,
  renderSeoHead,
  renderSitemap,
  replaceSeoHead,
} from "../src/shared/seo";

const sample = {
  path: "/pricing",
  title: "Pricing | Wechatai",
  description: "Plans for every WeChat AI workflow.",
  updatedAt: "2026-11-20",
};

afterEach(() => clearRegisteredTranslations());

describe("translation registry", () => {
  it("publishes nothing while the registry is empty", () => {
    expect(publishedTranslations()).toEqual([]);
    expect(publishedLocalizedPaths()).toEqual([]);
    const english = getPageSeo("/en/pricing");
    expect(english.indexable).toBe(false);
    expect(english.canonical).toBeUndefined();
    expect(renderSeoHead(english)).not.toContain("hreflang");
    expect(getPageSeo("/pricing").alternates).toBeUndefined();
    expect(renderSitemap()).not.toContain("https://wechatai.app/en");
  });

  it("rejects incomplete or prefixed registrations", () => {
    expect(() =>
      registerTranslations("en", [{ ...sample, path: "/en/pricing" }], "fixture"),
    ).toThrow(/locale prefix/);
    expect(() => registerTranslations("en", [{ ...sample, title: "" }], "fixture")).toThrow(
      /complete title/,
    );
    expect(() =>
      registerTranslations("en", [{ ...sample, updatedAt: "today" }], "fixture"),
    ).toThrow(/ISO updatedAt/);
  });
});

describe("registered localized pages", () => {
  it.each([
    ["ja", "ja_JP"],
    ["ko", "ko_KR"],
    ["es", "es_ES"],
    ["pt", "pt_BR"],
  ] as const)("publishes %s only after registration", (locale, ogLocale) => {
    const path = `/${locale}/pricing`;
    expect(getPageSeo(path).indexable).toBe(false);
    registerTranslations(locale, [sample], "fixture");
    expect(publishedLocalizedPaths()).toEqual([path]);
    expect(getPageSeo(path)).toMatchObject({
      canonical: `https://wechatai.app${path}`,
      htmlLang: locale,
      ogLocale,
    });
  });

  it("enters the sitemap and keeps its own canonical", () => {
    registerTranslations("en", [sample], "fixture");
    expect(publishedLocalizedPaths()).toEqual(["/en/pricing"]);
    expect(pageLastModified("/en/pricing")).toBe(sample.updatedAt);
    const sitemap = renderSitemap();
    expect(sitemap).toContain(
      `<loc>https://wechatai.app/pricing</loc><lastmod>${pageLastModified("/pricing")}</lastmod>`,
    );
    expect(sitemap).toContain(
      `<loc>https://wechatai.app/en/pricing</loc><lastmod>${sample.updatedAt}</lastmod>`,
    );
    expect(sitemap.indexOf("https://wechatai.app/pricing")).toBeLessThan(
      sitemap.indexOf("https://wechatai.app/en/pricing"),
    );

    const english = getPageSeo("/en/pricing");
    expect(english.indexable).toBe(true);
    expect(english.canonical).toBe("https://wechatai.app/en/pricing");
    const head = renderSeoHead(english);
    expect(head).toContain('rel="canonical" href="https://wechatai.app/en/pricing"');
    expect(head).not.toContain('rel="canonical" href="https://wechatai.app/pricing"');
  });

  it("cross-links the page group and sends x-default to the Chinese source", () => {
    registerTranslations("en", [sample], "fixture");
    for (const path of ["/pricing", "/en/pricing"]) {
      const seo = getPageSeo(path);
      expect(seo.alternates, path).toEqual([
        { hreflang: "zh-CN", href: "https://wechatai.app/pricing" },
        { hreflang: "en", href: "https://wechatai.app/en/pricing" },
        { hreflang: "x-default", href: "https://wechatai.app/pricing" },
      ]);
      const head = renderSeoHead(seo);
      expect(head, path).toContain('hreflang="zh-CN"');
      expect(head, path).toContain('hreflang="en"');
      expect(head, path).toContain('hreflang="x-default"');
    }
    expect(getPageSeo("/pricing").canonical).toBe("https://wechatai.app/pricing");
  });

  it("uses the localized canonical for page-owned JSON-LD without moving shared entities", () => {
    registerTranslations("en", [sample], "fixture");
    const html = replaceSeoHead(
      '<html lang="zh-CN"><head><!-- SEO:START --><!-- SEO:END --></head></html>',
      getPageSeo("/en/pricing"),
    );
    expect(html).toContain('<html lang="en">');
    const json = html.match(/<script type="application\/ld\+json" data-seo>(.*?)<\/script>/)![1];
    const graph = JSON.parse(json)["@graph"];
    const canonical = "https://wechatai.app/en/pricing";
    expect(graph).toContainEqual(
      expect.objectContaining({
        "@type": "WebPage",
        "@id": `${canonical}#webpage`,
        url: canonical,
        inLanguage: "en",
        about: expect.objectContaining({
          "@id": "https://wechatai.app/#application",
          url: "https://wechatai.app/",
        }),
        publisher: expect.objectContaining({
          "@id": "https://wechatai.app/#organization",
          url: "https://wechatai.app/",
        }),
      }),
    );
    expect(graph).toContainEqual(
      expect.objectContaining({ "@type": "FAQPage", "@id": `${canonical}#faq` }),
    );
    expect(graph).toContainEqual({
      "@type": "BreadcrumbList",
      itemListElement: [
        expect.objectContaining({ item: "https://wechatai.app/" }),
        expect.objectContaining({ item: canonical }),
      ],
    });
  });

  it("keeps the WebSite on its shared URL when the homepage has a translation", () => {
    registerTranslations("en", [{ ...sample, path: "/" }], "fixture");
    const seo = getPageSeo("/en");
    expect(seo.structuredData?.["@graph"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          "@type": "WebPage",
          "@id": "https://wechatai.app/en#webpage",
          url: "https://wechatai.app/en",
          inLanguage: "en",
          isPartOf: { "@id": "https://wechatai.app/#website" },
        }),
        expect.objectContaining({
          "@type": "WebSite",
          "@id": "https://wechatai.app/#website",
          url: "https://wechatai.app/",
        }),
      ]),
    );
  });

  it("never resolves an unregistered prefixed page to the Chinese page", () => {
    registerTranslations("en", [sample], "fixture");
    for (const path of ["/en", "/en/docs", "/en/not-a-page"]) {
      const seo = getPageSeo(path);
      expect(seo.indexable, path).toBe(false);
      expect(seo.canonical, path).toBeUndefined();
      expect(seo.title, path).toContain("页面未找到");
    }
    // The same path is still reachable without the prefix.
    expect(getPageSeo("/docs").canonical).toBe("https://wechatai.app/docs");
  });

  it("does not publish a registered path that is not a public Chinese page", () => {
    registerTranslations("en", [{ ...sample, path: "/guide" }], "fixture");
    expect(getPageSeo("/en/guide").indexable).toBe(false);
    expect(getPageSeo("/guide", "en").indexable).toBe(false);
    expect(renderSitemap()).not.toContain("https://wechatai.app/en/guide");
  });
});
