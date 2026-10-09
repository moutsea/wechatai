import { describe, expect, it } from "vitest";
import {
  getPageSeo,
  PRIVATE_PATHS,
  PUBLIC_PATHS,
  renderSeoHead,
  renderSitemap,
  replaceSeoHead,
} from "../src/shared/seo";

describe("search indexing boundaries", () => {
  it("uses distinct public titles and stable production canonicals", () => {
    expect(getPageSeo("/").title).toContain("WeChat AI");
    expect(getPageSeo("/guide").title).not.toBe(getPageSeo("/").title);
    expect(getPageSeo("/?utm_source=wechat").canonical).toBe("https://wechatai.app/");
    expect(getPageSeo("/guide/?utm_source=wechat#commands").canonical).toBe(
      "https://wechatai.app/guide",
    );
    for (const path of PUBLIC_PATHS) expect(getPageSeo(path).indexable).toBe(true);
  });

  it("never indexes account, demo, auth callback or unknown pages", () => {
    for (const path of [
      ...PRIVATE_PATHS,
      "/app/sessions/private-id",
      "/api/auth/callback/google",
      "/not-a-page",
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
      "https://wechatai.app/guide",
      "https://wechatai.app/developers/plugins",
      "https://wechatai.app/developers/openclaw",
      "https://wechatai.app/developers/hermes",
    ]);
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
