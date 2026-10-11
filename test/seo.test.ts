import { describe, expect, it } from "vitest";
import {
  DOC_ARTICLES,
  docPath,
  legacyGuideDestination,
  guideSectionRedirect,
} from "../src/shared/docs";
import {
  getPageSeo,
  PRIVATE_PATHS,
  PUBLIC_PATHS,
  renderSeoHead,
  renderSitemap,
  pageLastModified,
  replaceSeoHead,
} from "../src/shared/seo";

describe("search indexing boundaries", () => {
  it("uses distinct public titles and stable production canonicals", () => {
    expect(getPageSeo("/").title).toContain("WeChat AI");
    expect(getPageSeo("/guide").title).not.toBe(getPageSeo("/").title);
    expect(getPageSeo("/?utm_source=wechat").canonical).toBe("https://wechatai.app/");
    expect(getPageSeo("/guide/?utm_source=wechat#commands").canonical).toBe(
      "https://wechatai.app/docs/getting-started",
    );
    for (const path of PUBLIC_PATHS) expect(getPageSeo(path).indexable).toBe(true);
  });

  it("preserves old guide sections while removing the duplicate page from search", () => {
    expect(getPageSeo("/guide").canonical).toBe("https://wechatai.app/docs/getting-started");
    expect(getPageSeo("/guide").indexable).toBe(true);
    expect(renderSitemap()).not.toContain("https://wechatai.app/guide");
    for (const [hash, path] of [
      ["", "getting-started"],
      ["#start", "getting-started"],
      ["#models", "channels-models"],
      ["#plugins", "ds-chat"],
      ["#roleplay", "roleplay"],
      ["#personal", "personal-assistant"],
      ["#commands", "commands"],
      ["#sessions", "sessions"],
      ["#credits", "credits"],
      ["#faq", "faq"],
      ["#unknown", "getting-started"],
      ["#toString", "getting-started"],
    ])
      expect(legacyGuideDestination(hash)).toBe(`/docs/${path}`);
  });

  it("resolves fragments preserved by the guide 301 without hijacking new anchors", () => {
    expect(guideSectionRedirect("/docs/getting-started", "#commands")).toBe("/docs/commands");
    expect(guideSectionRedirect("/docs/getting-started/", "#models")).toBe("/docs/channels-models");
    for (const hash of ["", "#start", "#prepare", "#next", "#unknown", "#toString"]) {
      expect(guideSectionRedirect("/docs/getting-started", hash)).toBeNull();
    }
    expect(guideSectionRedirect("/docs/roleplay", "#credits")).toBeNull();
    expect(guideSectionRedirect("/docs/deepseek-in-wechat", "#sessions")).toBeNull();
  });

  it("uses documented content dates and omits unknown dates", () => {
    const sitemap = renderSitemap();
    expect(sitemap).toContain(
      `<loc>https://wechatai.app/docs</loc><lastmod>${pageLastModified("/docs")}</lastmod>`,
    );
    expect(sitemap).toContain(
      `<loc>https://wechatai.app/privacy</loc><lastmod>${pageLastModified("/privacy")}</lastmod>`,
    );
    expect(pageLastModified("/developers/plugins")).toBeUndefined();
    expect(pageLastModified("/not-a-page")).toBeUndefined();
    expect(sitemap).not.toContain("<priority>");
    expect(sitemap).not.toContain("<changefreq>");
  });

  it("never indexes account, demo, auth callback or unknown pages", () => {
    for (const path of [
      ...PRIVATE_PATHS,
      "/app/sessions/private-id",
      "/api/auth/callback/google",
      "/not-a-page",
      "/docs/not-a-real-article",
      "/docs/deepseek-in-wechat/extra",
    ]) {
      const page = getPageSeo(path);
      expect(page.indexable).toBe(false);
      expect(page.canonical).toBeUndefined();
      expect(page.structuredData).toBeUndefined();
      const head = renderSeoHead(page);
      expect(head).toContain('content="noindex, follow"');
      expect(head).not.toContain('property="og:url"');
    }
  });

  it("keeps auth return URLs out of metadata", () => {
    const head = renderSeoHead(getPageSeo("/login?token=private-token&returnTo=/app"));
    expect(head).not.toContain("private-token");
    expect(head).not.toContain("returnTo");
  });

  it("only lists canonical public pages in the sitemap", () => {
    const sitemap = renderSitemap();
    expect([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1])).toEqual([
      "https://wechatai.app/",
      "https://wechatai.app/docs",
      ...DOC_ARTICLES.map((article) => `https://wechatai.app${docPath(article.slug)}`),
      "https://wechatai.app/developers/plugins",
      "https://wechatai.app/developers/openclaw",
      "https://wechatai.app/developers/hermes",
      "https://wechatai.app/terms",
      "https://wechatai.app/privacy",
      "https://wechatai.app/contact",
    ]);
  });

  it("provides article metadata and breadcrumbs for each tutorial, without query parameters", () => {
    for (const article of DOC_ARTICLES) {
      const canonical = `https://wechatai.app${docPath(article.slug)}`;
      const seo = getPageSeo(`${docPath(article.slug)}/?utm_source=wechat#faq`);
      expect(seo.canonical).toBe(canonical);
      expect(seo.title).toContain(article.title);
      expect(renderSeoHead(seo)).toContain('property="og:type" content="article"');
      const graph = seo.structuredData?.["@graph"] as Array<Record<string, unknown>>;
      expect(graph.find((item) => item["@type"] === "Article")).toMatchObject({
        headline: article.title,
        mainEntityOfPage: canonical,
        description: article.description,
      });
      expect(graph.find((item) => item["@type"] === "BreadcrumbList")?.itemListElement).toEqual([
        { "@type": "ListItem", position: 1, name: "首页", item: "https://wechatai.app/" },
        { "@type": "ListItem", position: 2, name: "文档", item: "https://wechatai.app/docs" },
        { "@type": "ListItem", position: 3, name: article.title, item: canonical },
      ]);
    }
    const index = getPageSeo("/docs");
    expect(index.ogType).toBe("website");
    expect(index.structuredData?.["@graph"]).toEqual(
      expect.arrayContaining([expect.objectContaining({ "@type": "CollectionPage" })]),
    );
  });

  it("replaces head metadata without changing scripts or body", () => {
    const template =
      '<head><!-- SEO:START -->old<!-- SEO:END --><script src="/app.js"></script></head><body>content</body>';
    const html = replaceSeoHead(template, getPageSeo("/guide"));
    expect(html).not.toContain("old");
    expect(html).toContain('<script src="/app.js"></script>');
    expect(html).toContain("<body>content</body>");
    expect((html.match(/<title\b/g) || []).length).toBe(1);
    expect(() => replaceSeoHead("missing template markers", getPageSeo("/"))).toThrow();
  });

  it("escapes metadata and prevents JSON-LD from closing its script element", () => {
    const head = renderSeoHead({
      title: '<img src=x onerror="alert(1)">',
      description: '"/><script>alert(1)</script>',
      indexable: true,
      canonical: "https://wechatai.app/",
      structuredData: { name: "</script><script>alert(1)</script>" },
    });
    expect(head).not.toContain("<img");
    expect(head).not.toContain("<script>alert");
    expect(head).toContain("&lt;img");
    const json = head.match(/<script type="application\/ld\+json" data-seo>(.*?)<\/script>/)?.[1];
    expect(JSON.parse(json!).name).toBe("</script><script>alert(1)</script>");
  });
});
