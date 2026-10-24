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
import { SEO_PAGES } from "../src/shared/seo-pages";
import { FAQ_DOC_SECTIONS, faqAnswerText } from "../src/shared/faq-doc";
import { BILLING_OFFERS } from "../src/shared/billing";
import { PLUGIN_LIMITS } from "../src/shared/plugin-access";
import { WECHAT_LINK_LIMITS } from "../src/shared/wechat-links";
import { llmsText } from "../src/shared/plugin-docs";

describe("search indexing boundaries", () => {
  it("includes notification routes in the deployable private pages", () => {
    for (const path of ["/app/notices", "/demo/notices"]) {
      expect(PRIVATE_PATHS).toContain(path);
      expect(getPageSeo(path).indexable).toBe(false);
      expect(renderSitemap()).not.toContain(`https://wechatai.app${path}`);
    }
  });

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
      "https://wechatai.app/wechat-ai",
      "https://wechatai.app/wechat-clawbot",
      "https://wechatai.app/wechat-ai-ban-risk",
      "https://wechatai.app/wechat-clawbot-models",
      "https://wechatai.app/bring-your-own-api-key",
      "https://wechatai.app/wechat-deepseek",
      "https://wechatai.app/wechat-claude",
      "https://wechatai.app/wechat-gpt",
      "https://wechatai.app/wechat-agent",
      "https://wechatai.app/wechat-ai-options",
      "https://wechatai.app/pricing",
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

describe("query landing pages", () => {
  it("gives every public page a unique title and description", () => {
    const titles = PUBLIC_PATHS.map((path) => getPageSeo(path).title);
    const descriptions = PUBLIC_PATHS.map((path) => getPageSeo(path).description);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it("targets one query per page and keeps the answer block quotable", () => {
    for (const page of SEO_PAGES) {
      expect(page.primaryKeyword.length).toBeGreaterThan(3);
      expect(page.secondaryKeywords.length).toBeGreaterThanOrEqual(3);
      expect(page.answer.length).toBeGreaterThan(60);
      expect(page.sections.length).toBeGreaterThanOrEqual(4);
      expect(page.faq.length).toBeGreaterThanOrEqual(4);
      expect(page.sections.some((section) => section.id === "faq")).toBe(false);
    }
  });

  it("publishes canonical, breadcrumb and FAQ structured data per page", () => {
    for (const page of SEO_PAGES) {
      const seo = getPageSeo(`${page.path}/?utm_source=wechat`);
      const canonical = `https://wechatai.app${page.path}`;
      expect(seo.canonical).toBe(canonical);
      expect(seo.indexable).toBe(true);
      expect(seo.title).toContain(page.title);
      expect(renderSeoHead(seo)).toContain('content="index, follow, max-image-preview:large"');
      const graph = seo.structuredData?.["@graph"] as Array<Record<string, unknown>>;
      const breadcrumb = graph.find((item) => item["@type"] === "BreadcrumbList");
      expect(breadcrumb?.itemListElement).toEqual([
        { "@type": "ListItem", position: 1, name: "首页", item: "https://wechatai.app/" },
        { "@type": "ListItem", position: 2, name: page.title, item: canonical },
      ]);
      const faq = graph.find((item) => item["@type"] === "FAQPage") as
        | { "@id": string; mainEntity: unknown[] }
        | undefined;
      expect(faq?.["@id"]).toBe(`${canonical}#faq`);
      expect(faq?.mainEntity).toHaveLength(page.faq.length);
      expect(pageLastModified(page.path)).toBe(page.updatedAt);
    }
  });

  it("only links to pages that exist", () => {
    const known = new Set(PUBLIC_PATHS);
    // Setup tutorials also link to the existing, authenticated channel setup route.
    for (const path of ["/register", "/login", "/docs", "/app/channels"]) known.add(path);
    for (const page of SEO_PAGES) {
      for (const link of page.related) {
        const [path] = link.href.split("#");
        expect(known.has(path), `${page.path} → ${link.href}`).toBe(true);
      }
      for (const section of page.sections) {
        for (const match of section.body.matchAll(/\]\((\/[^)#\s]*)/g)) {
          const target = match[1].replace(/\/$/, "") || "/";
          expect(known.has(target), `${page.path} → ${match[1]}`).toBe(true);
        }
      }
    }
  });
});

describe("published prices stay in sync with billing", () => {
  // A price change in BILLING_OFFERS must not leave public copy quoting the old number.
  const yuan = (cents: number) => {
    const value = cents / 100;
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  };
  const offers = BILLING_OFFERS;
  const planText = (page: (typeof SEO_PAGES)[number] | undefined): string => {
    if (!page) return "";
    return JSON.stringify(page);
  };
  const pricingText = planText(SEO_PAGES.find((page) => page.path === "/pricing"));

  it("quotes the current Plus prices on the pricing page", () => {
    const monthly = offers.find((offer) => offer.id === "plus_monthly");
    const yearly = offers.find((offer) => offer.id === "plus_yearly");
    expect(monthly && yearly).toBeTruthy();
    expect(pricingText).toContain(`**¥${yuan(monthly!.amount)} / 月**`);
    expect(pricingText).toContain(`**¥${yuan(yearly!.amount)} / 年**`);
  });

  it("quotes the current credit packs on the pricing page", () => {
    for (const offer of offers.filter((item) => item.kind === "credits")) {
      expect(pricingText, `${offer.id} 价格与数量`).toContain(
        `¥${yuan(offer.amount)} / ${offer.credits}`,
      );
    }
  });

  it("matches the enforced plugin and WeChat link limits", () => {
    expect(pricingText).toContain(`| 插件数量 | ${PLUGIN_LIMITS.free} 个 | 不限 |`);
    expect(pricingText).toContain(
      `| 微信链接 | ${WECHAT_LINK_LIMITS.free} 个 | ${WECHAT_LINK_LIMITS.plus} 个 |`,
    );
  });

  it("keeps the llms.txt summary consistent with billing", () => {
    const monthly = offers.find((offer) => offer.id === "plus_monthly")!;
    const yearly = offers.find((offer) => offer.id === "plus_yearly")!;
    expect(llmsText).toContain(`¥${yuan(monthly.amount)}/月`);
    expect(llmsText).toContain(`¥${yuan(yearly.amount)}/年`);
    expect(llmsText).toContain(`${PLUGIN_LIMITS.free} 个插件`);
    expect(llmsText).toContain(`${WECHAT_LINK_LIMITS.plus} 个微信链接`);
  });
});

describe("/docs/faq structured data", () => {
  it("publishes every visible question as a FAQPage entry", () => {
    const seo = getPageSeo("/docs/faq");
    const graph = seo.structuredData?.["@graph"] as Array<Record<string, unknown>>;
    const faq = graph.find((item) => item["@type"] === "FAQPage") as
      | { "@id": string; mainEntity: { name: string; acceptedAnswer: { text: string } }[] }
      | undefined;
    expect(faq, "/docs/faq 缺少 FAQPage").toBeTruthy();
    expect(faq!["@id"]).toBe(`${seo.canonical}#faq`);
    expect(faq!.mainEntity).toHaveLength(FAQ_DOC_SECTIONS.length);
    FAQ_DOC_SECTIONS.forEach((section, index) => {
      expect(faq!.mainEntity[index].name).toBe(section.title);
      expect(faq!.mainEntity[index].acceptedAnswer.text).toBe(faqAnswerText(section.body));
    });
  });

  it("keeps answers free of markdown syntax", () => {
    for (const section of FAQ_DOC_SECTIONS) {
      const answer = faqAnswerText(section.body);
      expect(answer, section.id).not.toMatch(/\[.*?\]\(|\*\*|`/);
      expect(answer.length, section.id).toBeGreaterThan(30);
    }
  });

  it("does not add FAQPage to documents that have no question list", () => {
    for (const article of DOC_ARTICLES.filter((item) => item.slug !== "faq")) {
      const seo = getPageSeo(docPath(article.slug));
      const graph = seo.structuredData?.["@graph"] as Array<Record<string, unknown>>;
      expect(graph.some((item) => item["@type"] === "FAQPage"), article.slug).toBe(false);
    }
  });
});
