import { describe, expect, it } from "vitest";
import { renderPublicPage } from "../src/client/prerender";
import {
  getPageSeo,
  publishedLocalizedPaths,
  renderSeoHead,
  renderSitemap,
  SITE_URL,
} from "../src/shared/seo";

function parse(path: string) {
  const seo = getPageSeo(path);
  return new DOMParser().parseFromString(
    `<html lang="${seo.htmlLang ?? "zh-CN"}"><head>${renderSeoHead(seo)}</head><body>${renderPublicPage(path)}</body></html>`,
    "text/html",
  );
}

function graphOf(path: string) {
  const json = parse(path).querySelector('script[type="application/ld+json"]')!.textContent!;
  return JSON.parse(json)["@graph"] as Array<Record<string, unknown>>;
}

/** Chinese source strings that must never reach a Japanese page. */
const CHINESE_RESIDUE =
  /免费开始|价格与方案|常见问题|还有疑问|额度怎么用|会员费|微伴|页面未找到|继续了解|估算我的每日用量/;

describe("published Japanese pages", () => {
  it("renders the Japanese homepage with self-referencing metadata and the full language group", () => {
    const document = parse("/ja");
    expect(document.querySelector("h1")?.textContent).toBe("あなたの AI を、WeChat へ");
    expect(document.title).toBe("WeChat AI：DeepSeek・Claude・GPT とエージェント接続 | Wechatai");
    expect(document.documentElement.lang).toBe("ja-JP");
    expect(document.querySelector('meta[property="og:locale"]')?.getAttribute("content")).toBe(
      "ja_JP",
    );
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      `${SITE_URL}/ja`,
    );
    expect(
      [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((link) => [
        link.getAttribute("hreflang"),
        link.getAttribute("href"),
      ]),
    ).toEqual([
      ["zh-CN", `${SITE_URL}/`],
      ["en", `${SITE_URL}/en`],
      ["ja-JP", `${SITE_URL}/ja`],
      ["x-default", `${SITE_URL}/`],
    ]);
    expect(document.body.textContent).not.toMatch(CHINESE_RESIDUE);
  });

  it.each(["/ja", "/ja/pricing", "/ja/wechat-ai", "/ja/wechat-bot", "/ja/wechat-deepseek"])(
    "uses Japanese alternative text for both social image tags on %s",
    (path) => {
      const document = parse(path);
      for (const selector of ['meta[property="og:image:alt"]', 'meta[name="twitter:image:alt"]']) {
        expect(document.querySelector(selector)?.getAttribute("content")).toBe(
          "Wechatai：選んだモデルと WeChat でチャットできます。",
        );
      }
    },
  );

  it("localizes the homepage shell and prefixes only registered targets", () => {
    const document = parse("/ja");
    const header = document.querySelector(".site-header-nav");
    expect(header?.querySelector('a[href="/ja"]')?.textContent).toBe("ホーム");
    expect(header?.querySelector('a[href="/ja/pricing"]')?.textContent).toBe("料金");
    expect(header?.querySelector('a[href="/docs"]')?.textContent).toBe("ドキュメント");
    expect(header?.querySelector('a[href="/ja#how"]')).not.toBeNull();

    const switcher = document.querySelector(".site-language");
    expect(switcher?.getAttribute("aria-label")).toBe("言語");
    expect(switcher?.querySelector('a[href="/en"]')?.textContent).toBe("English");
    expect(switcher?.querySelector('a[href="/"]')?.textContent).toBe("中文");

    const footer = document.querySelector(".landing-footer");
    expect(footer?.querySelector('a[href="/ja/pricing"]')?.textContent).toBe(
      "料金と無料クレジット",
    );
    expect(footer?.querySelector('a[href="/docs"]')?.textContent).toBe(
      "ドキュメントとチュートリアル",
    );
    expect(footer?.querySelector('a[href="/terms"]')).not.toBeNull();
  });

  it("keeps prices in CNY and links the registered pricing routes with query and fragment", () => {
    const document = parse("/ja");
    expect(document.querySelectorAll(".landing-plan")).toHaveLength(4);
    expect(document.querySelector(".landing-plan-month .landing-plan-price span")?.textContent).toBe(
      "/ 月（人民元）",
    );
    expect(document.querySelector(".landing-plan-year .landing-plan-price strong")?.textContent).toBe(
      "¥88",
    );
    expect(
      document.querySelector('.landing-plan-year a[href="/ja/pricing?interval=year#plan-year"]'),
    ).not.toBeNull();
    expect(document.querySelector('a[href="/ja/pricing#estimate"]')).not.toBeNull();
    expect(document.querySelector(".hero-connections img")?.getAttribute("alt")).toContain(
      "WeChat へ集まっている図",
    );
    expect(document.querySelector(".hero-connections img")?.getAttribute("src")).toBe(
      "/images/landing/ai-wechat-connections-en.webp",
    );
  });

  it("renders the Japanese FAQ from the same source as the FAQPage JSON-LD", () => {
    const document = parse("/ja");
    const list = [...document.querySelectorAll(".landing-faq details")];
    expect(list).toHaveLength(7);
    expect(list[0].querySelector("summary")?.textContent).toContain(
      "自分で API キーを用意する必要がありますか？",
    );
    const faq = graphOf("/ja").find((node) => node["@type"] === "FAQPage") as {
      mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }>;
    };
    expect(faq.mainEntity.map((item) => item.name)).toEqual(
      list.map((item) => item.querySelector("summary > span")?.textContent),
    );
    expect(faq.mainEntity[0].acceptedAnswer.text).toContain("モデル API キー");
  });

  it("renders Japanese pricing copy, plans, estimator and related links", () => {
    const document = parse("/ja/pricing");
    expect(document.querySelector("h1")?.textContent).toBe(
      "無料で始めて、必要に応じて Plus へ",
    );
    expect(document.title).toContain("料金：毎日 100 クレジット無料");
    expect(document.documentElement.lang).toBe("ja-JP");
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      `${SITE_URL}/ja/pricing`,
    );

    expect([...document.querySelectorAll(".plan h3")].map((node) => node.textContent)).toEqual([
      "無料プラン",
      "Plus 月額プラン",
      "Plus 年間プラン",
    ]);
    expect(document.querySelector(".plan-month .plan-price-unit")?.textContent).toBe(
      "/ 月（人民元）",
    );
    expect(document.querySelector(".plan-year .plan-price-unit")?.textContent).toBe(
      "/ 年（人民元）",
    );
    expect(document.querySelectorAll(".pricing-faq details")).toHaveLength(8);
    expect(document.querySelector(".pricing-estimate summary")?.textContent).toContain(
      "1 日の利用量を試算する",
    );
    expect(document.querySelector(".cost-estimator h2")?.textContent).toBe(
      "まずはテキストの利用量を試算",
    );
    expect(document.querySelector(".seopage-related h2")?.textContent).toBe("さらに知る");
    expect(document.querySelector(".pricing-breadcrumb a[href]")?.textContent).toBe("ホーム");
    expect(document.querySelector(".pricing-breadcrumb a[href]")?.getAttribute("href")).toBe("/ja");
    expect(document.body.textContent).not.toMatch(CHINESE_RESIDUE);
  });

  it("keeps page-owned JSON-LD copy aligned with the visible Japanese content", () => {
    const seo = getPageSeo("/ja/pricing");
    const graph = seo.structuredData?.["@graph"] as Array<Record<string, unknown>>;
    const service = graph.find((node) => node["@type"] === "Service")!;
    expect(service.name).toBe("Wechatai 無料プランと Plus");
    expect(service.serviceType).toBe("WeChat AI 連携サービス");
    expect((service.offers as Array<Record<string, unknown>>).map((offer) => [offer.name, offer.price]))
      .toEqual([
        ["無料プラン", 0],
        ["Plus 月額プラン", 9.9],
        ["Plus 年間プラン", 88],
      ]);
    const breadcrumb = graph.find((node) => node["@type"] === "BreadcrumbList") as {
      itemListElement: Array<{ name: string; item: string }>;
    };
    expect(breadcrumb.itemListElement[0]).toMatchObject({
      name: "ホーム",
      item: `${SITE_URL}/ja`,
    });
    const faq = graph.find((node) => node["@type"] === "FAQPage") as {
      mainEntity: Array<{ name: string }>;
    };
    expect(faq.mainEntity).toHaveLength(7);
    expect(faq.mainEntity[0].name).toBe("会員プランにモデル利用料は含まれますか？");
    expect(JSON.stringify(graph)).not.toMatch(/页面未找到|价格与方案/);

    const home = getPageSeo("/ja");
    const homeGraph = home.structuredData?.["@graph"] as Array<Record<string, unknown>>;
    expect(homeGraph).toContainEqual(
      expect.objectContaining({
        "@type": "WebPage",
        "@id": `${SITE_URL}/ja#webpage`,
        inLanguage: "ja-JP",
      }),
    );
  });

  it.each([
    ["/ja/wechat-ai", "WeChat AI：自分の大規模モデルを WeChat の会話へ"],
    ["/ja/wechat-bot", "WeChat ボットの作り方：まず経路を選ぶ"],
    ["/ja/wechat-deepseek", "WeChat で DeepSeek を使いたい方は、ここから"],
  ])("renders the Japanese landing page %s from the registered content", (path, h1) => {
    const document = parse(path);
    const seo = getPageSeo(path);
    expect(seo.indexable).toBe(true);
    expect(seo.canonical).toBe(`${SITE_URL}${path}`);
    expect(seo.htmlLang).toBe("ja-JP");
    expect(document.querySelector("h1")?.textContent).toBe(h1);
    expect(document.querySelector(".seopage-skip")?.textContent).toBe("本文へスキップ");
    expect(document.querySelector(".seopage-breadcrumb a[href]")?.textContent).toBe("ホーム");
    expect(document.querySelector(".seopage-breadcrumb a[href]")?.getAttribute("href")).toBe("/ja");
    expect(document.querySelector(".seopage-faq h2")?.textContent).toBe("よくある質問");
    expect(document.querySelector(".seopage-cta-title, #seopage-cta-title")?.textContent).toBe(
      "接続条件を確認して、WeChat AI の設定を始める",
    );
    expect(document.body.textContent).not.toMatch(CHINESE_RESIDUE);

    // Chinese guides stay on their unprefixed paths; only the registered pages get a prefix.
    const guide = document.querySelector('.seopage-prose a[href="/docs/deepseek-in-wechat"]');
    if (path === "/ja/wechat-deepseek") expect(guide).not.toBeNull();
    expect(document.querySelector('[href="/ja/docs"]')).toBeNull();

    const alternates = seo.alternates ?? [];
    expect(alternates.at(-1)).toEqual({
      hreflang: "x-default",
      href: `${SITE_URL}${path.replace("/ja", "")}`,
    });
    expect(alternates).toContainEqual({ hreflang: "ja-JP", href: `${SITE_URL}${path}` });
    const published = new Set(publishedLocalizedPaths());
    for (const alternate of alternates.slice(0, -1)) {
      const alternatePath = alternate.href.slice(SITE_URL.length) || "/";
      const localePath = alternatePath.split("/")[1];
      if (localePath === "en" || localePath === "ja") {
        expect(published.has(alternatePath), alternatePath).toBe(true);
      }
    }
  });

  it("limits the landing-page switcher to published languages", () => {
    const ai = parse("/ja/wechat-ai");
    expect(ai.querySelector(".site-language a[hreflang='en']")?.textContent).toBe("English");
    expect(ai.querySelector(".site-language a[hreflang='en']")?.getAttribute("href")).toBe(
      "/en/wechat-ai",
    );
    expect(ai.querySelector(".site-language a[hreflang='zh-CN']")?.getAttribute("href")).toBe(
      "/wechat-ai",
    );

    const bot = parse("/ja/wechat-bot");
    expect(bot.querySelector(".site-language a[hreflang='en']")?.getAttribute("href")).toBe(
      "/en/wechat-bot",
    );
    expect(bot.querySelector(".site-language a[hreflang='zh-CN']")?.getAttribute("href")).toBe(
      "/wechat-bot",
    );
  });

  it("keeps the Chinese page group unchanged and adds only the registered Japanese URLs", () => {
    const chineseHome = parse("/");
    expect(chineseHome.querySelector("h1")?.textContent).toContain("把你的 AI");
    expect(chineseHome.querySelector('a[href="/pricing"]')?.textContent).toBe("价格");
    const chineseAlternates = [...chineseHome.querySelectorAll('link[rel="alternate"][hreflang]')].map(
      (link) => link.getAttribute("hreflang"),
    );
    expect(chineseAlternates).toEqual(["zh-CN", "en", "ja-JP", "x-default"]);

    const pricing = parse("/pricing");
    expect(pricing.querySelector("h1")?.textContent).toBe("免费开始，按需升级 Plus");

    const japanese = publishedLocalizedPaths().filter((path) => path.startsWith("/ja"));
    expect(japanese.sort()).toEqual([
      "/ja",
      "/ja/pricing",
      "/ja/wechat-ai",
      "/ja/wechat-bot",
      "/ja/wechat-deepseek",
    ]);
    const sitemap = renderSitemap();
    for (const path of japanese) expect(sitemap).toContain(`<loc>${SITE_URL}${path}</loc>`);
  });

  it("publishes no other Japanese path", () => {
    for (const path of ["/ja/docs", "/ja/wechat-claude", "/ja/terms", "/ja/wechat-glm"]) {
      expect(getPageSeo(path).indexable).toBe(false);
      expect(getPageSeo(path).canonical).toBeUndefined();
    }
    expect(renderPublicPage("/ja/docs")).toContain("这个页面没有找到。");
  });
});
