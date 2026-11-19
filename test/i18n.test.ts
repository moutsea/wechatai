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

  it("synchronizes the HTML lang attribute and structured-data language", () => {
    registerTranslations("en", [sample], "fixture");
    const english = getPageSeo("/en/pricing");
    expect(english.htmlLang).toBe("en");
    const html = replaceSeoHead(
      '<html lang="zh-CN"><head><!-- SEO:START --><!-- SEO:END --></head></html>',
      english,
    );
    expect(html).toContain('<html lang="en">');
    expect(html).not.toContain('"inLanguage":"zh-CN"');
    expect(html).toContain('"inLanguage":"en"');
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
