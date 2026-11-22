import { describe, expect, it } from "vitest";
import { renderPublicPage } from "../src/client/prerender";
import englishDocs from "../src/shared/i18n/en/docs";
import { AVAILABLE_LOCALES, LOCALE_DEFINITIONS } from "../src/shared/i18n";
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

/** Switcher endonyms (中文, 日本語) are allowed in link text, not in attributes. */
function withoutLanguageLabels(text: string) {
  return AVAILABLE_LOCALES.reduce(
    (result, locale) => result.replaceAll(LOCALE_DEFINITIONS[locale].label, ""),
    text,
  );
}

function hanResidue(document: Document) {
  const text = withoutLanguageLabels(document.body.textContent ?? "");
  const attributes = [...document.querySelectorAll("[alt], [aria-label], [title], [placeholder]")]
    .flatMap((element) =>
      ["alt", "aria-label", "title", "placeholder"].map(
        (name) => element.getAttribute(name) ?? "",
      ),
    )
    .join(" ");
  return `${text} ${attributes}`.match(/\p{Script=Han}+/gu) ?? [];
}

describe("published English pages", () => {
  it("renders the complete English homepage and keeps only registered links prefixed", () => {
    const document = parse("/en");
    expect(document.querySelector("h1")?.textContent).toContain("Bring your AI");
    expect(document.querySelector("h1")?.textContent).toContain("into WeChat");
    expect(document.title).toBe("WeChat AI: DeepSeek, Claude, GPT, and agents | Wechatai");
    expect(document.documentElement.lang).toBe("en");

    const header = document.querySelector(".site-header-nav");
    expect(header?.querySelector('a[href="/en"]')?.textContent).toBe("Home");
    expect(header?.querySelector('a[href="/en/pricing"]')?.textContent).toBe("Pricing");
    expect(header?.querySelector('a[href="/en/docs"]')?.textContent).toBe("Docs");
    expect(header?.querySelector('a[href="/en#how"]')).not.toBeNull();

    const footer = document.querySelector(".landing-footer");
    expect(footer?.querySelector('a[href="/en/pricing"]')).not.toBeNull();
    expect(footer?.querySelector('a[href="/en/docs"]')?.textContent).toBe("Docs and tutorials");
    expect(footer?.querySelector('a[href="/en/wechat-ai"]')).not.toBeNull();

    expect(document.querySelectorAll(".landing-faq details")).toHaveLength(7);
    expect(document.querySelector(".landing-faq summary")?.textContent).toContain(
      "Do I need my own API key?",
    );
    expect(document.querySelectorAll(".landing-plan")).toHaveLength(4);
    expect(
      document.querySelector('.landing-plan-year a[href="/en/pricing?interval=year#plan-year"]'),
    ).not.toBeNull();
    expect(document.querySelector(".hero-connections img")?.getAttribute("alt")).toContain(
      "connected by lines into WeChat below",
    );
    expect(document.querySelector(".landing-repository")?.getAttribute("aria-label")).toContain(
      "View the moutsea/wechatai GitHub repository",
    );
    expect(hanResidue(document)).toEqual([]);
  });

  it.each([
    ["/en", "ai-wechat-connections-en"],
    ["/", "ai-wechat-connections"],
  ])("serves the matching hero artwork at both resolutions on %s", (path, filename) => {
    const image = parse(path).querySelector(".hero-connections img");
    const asset = `/images/landing/${filename}`;
    expect(image?.getAttribute("src")).toBe(`${asset}.webp`);
    expect(image?.getAttribute("srcset")).toBe(`${asset}-640.webp 640w, ${asset}.webp 1280w`);
  });

  it("documents how generated image sizes affect metering, retries and old configurations", () => {
    const text = parse("/en/developers/plugins").querySelector(
      'section[id="AI 生图插件 1.0"] h2 + p',
    )?.textContent;
    expect(text).toMatch(/automatically added size .*not counted toward input tokens/i);
    expect(text).toMatch(
      /if the upstream rejects the size, Wechatai does not retry without the parameter/i,
    );
    expect(text).toMatch(/fixed size values from older clients are ignored/i);
    expect(text).toMatch(/fixed sizes are still removed automatically from older configurations/i);
  });

  it("limits the English homepage privacy statement to proactive review", () => {
    const document = parse("/en");
    const statements = [...document.querySelectorAll(".landing-privacy-item p")];
    const inspection = statements.find((p) => p.textContent?.includes("chats or attachments"));
    expect(inspection?.textContent).toContain(
      "We do not proactively review your chats or attachments.",
    );
    expect(inspection?.previousElementSibling?.textContent).toBe("No proactive review");
  });

  it.each([
    ["/en", ".landing-plan-month .landing-plan-note"],
    ["/en/pricing", ".plan-month .plan-note"],
  ])("describes Plus Monthly as a one-time purchase on %s", (path, selector) => {
    expect(parse(path).querySelector(selector)?.textContent).toBe(
      "One-time payment for one month. Renew when needed.",
    );
  });

  it("preserves the Chinese homepage hero sentence boundary", () => {
    expect(parse("/").querySelector(".landing-copy > p")?.textContent).toBe(
      "微伴将模型与 Agent 接入微信，支持聊天、生图，以及云端助手小薇的文件与任务处理。 DeepSeek、Claude、GPT、Muse、Hermes、OpenClaw，一个账号按需连接。",
    );
  });

  it("renders English pricing copy, plans, FAQ, estimator and related links", () => {
    const document = parse("/en/pricing");
    expect(document.querySelector("h1")?.textContent).toBe(
      "Start free, upgrade to Plus when you need more",
    );
    expect(document.title).toBe(
      "Pricing: 100 free credits per day, Plus ¥9.9/month | Wechatai",
    );
    expect(document.documentElement.lang).toBe("en");

    const planTitles = [...document.querySelectorAll(".plan h3")].map((node) => node.textContent);
    expect(planTitles).toEqual(["Free", "Plus Monthly", "Plus Yearly"]);
    expect(document.querySelector(".plan-year .plan-price strong")?.textContent).toBe("¥88");
    expect(document.querySelector(".plan-year .plan-price-unit")?.textContent).toBe("/ year");
    expect(document.querySelectorAll(".pricing-faq details")).toHaveLength(8);
    expect(document.querySelector(".pricing-estimate summary")?.textContent).toContain(
      "Estimate my daily usage",
    );
    expect(document.querySelector(".cost-estimator h2")?.textContent).toBe(
      "Estimate your text usage first",
    );
    expect(document.querySelector(".seopage-related h2")?.textContent).toBe("Continue exploring");
    expect(document.querySelector('.seopage-related a[href="/wechat-muse"]')?.textContent).toContain(
      "Muse managed assistant for WeChat",
    );
    expect(document.querySelector('.pricing-breadcrumb a[href="/en"]')?.textContent).toBe("Home");
    expect(hanResidue(document)).toEqual([]);
  });

  it.each(["/en/pricing", "/pricing"])(
    "links the same breadcrumb home in HTML and JSON-LD on %s",
    (path) => {
      const document = parse(path);
      const home = document.querySelector(".pricing-breadcrumb a[href]")!;
      const json = document.querySelector('script[type="application/ld+json"]')!.textContent!;
      const graph = JSON.parse(json)["@graph"] as Array<Record<string, unknown>>;
      expect(graph.find((node) => node["@type"] === "BreadcrumbList")?.itemListElement).toMatchObject([
        {
          position: 1,
          name: home.textContent,
          item: new URL(home.getAttribute("href")!, SITE_URL).href,
        },
        { position: 2, item: `${SITE_URL}${path}` },
      ]);
    },
  );

  it("keeps page-owned JSON-LD copy aligned with the visible English content", () => {
    const seo = getPageSeo("/en/pricing");
    const graph = seo.structuredData?.["@graph"] as Array<Record<string, unknown>>;
    const service = graph.find((node) => node["@type"] === "Service")!;
    expect(service.name).toBe("Wechatai Free and Plus");
    expect(service.serviceType).toBe("WeChat AI integration service");
    expect(service["@id"]).toBe("https://wechatai.app/pricing#plans");
    const offers = service.offers as Array<Record<string, unknown>>;
    expect(offers.map((offer) => [offer.name, offer.price])).toEqual([
      ["Free", 0],
      ["Plus Monthly", 9.9],
      ["Plus Yearly", 88],
    ]);
    const faq = graph.find((node) => node["@type"] === "FAQPage") as {
      mainEntity: Array<{ name: string }>;
    };
    expect(faq.mainEntity).toHaveLength(7);
    expect(faq.mainEntity[0].name).toBe("Does the membership include model fees?");
    expect(JSON.stringify(graph)).not.toMatch(/页面未找到|价格与方案/);

    const home = getPageSeo("/en");
    const homeGraph = home.structuredData?.["@graph"] as Array<Record<string, unknown>>;
    expect(homeGraph).toContainEqual(
      expect.objectContaining({
        "@type": "WebPage",
        "@id": "https://wechatai.app/en#webpage",
        name: "WeChat AI: DeepSeek, Claude, GPT, and agents | Wechatai",
        inLanguage: "en",
      }),
    );
    const homeFaq = homeGraph.find((node) => node["@type"] === "FAQPage") as {
      mainEntity: Array<{ name: string }>;
    };
    expect(homeFaq.mainEntity[0].name).toBe("Do I need my own API key?");
  });

  it("documents that clearing Muse history removes bodies without deleting receipts", () => {
    const paragraph = [...parse("/en/developers/muse").querySelectorAll("main p")].find((p) =>
      p.textContent?.includes("delete all session records"),
    );
    expect(paragraph?.textContent).toMatch(
      /(?:reply |response )?bodies from (?:the )?corresponding receipts and (?:the )?result cache/i,
    );
    expect(paragraph?.textContent).toMatch(/retain\w* .*settlement and deduplication/i);
    expect(paragraph?.textContent).toMatch(
      /does not synchronously delete Muse's existing local records, long-term memory or files/i,
    );
  });

  it("keeps the existing Chinese pages and publishes only the approved localized URLs", () => {
    const home = parse("/");
    expect(home.querySelector("h1")?.textContent).toContain("把你的 AI");
    expect(home.querySelector('.site-header-nav a[href="/pricing"]')?.textContent).toBe("价格");
    expect(home.querySelector('.landing-plan-year a[href="/pricing?interval=year#plan-year"]'))
      .not.toBeNull();

    const pricing = parse("/pricing");
    expect(pricing.querySelector("h1")?.textContent).toBe("免费开始，按需升级 Plus");
    expect(pricing.querySelector(".plan-year h3")?.textContent).toBe("Plus 年付");
    expect(pricing.querySelector(".pricing-faq details summary")?.textContent).toContain(
      "会员费包含模型费用吗？",
    );

    const expected = [
      "/en",
      "/en/bring-your-own-api-key",
      "/en/compare/wechatai-vs-commercial-wechat-ai",
      "/en/compare/wechatai-vs-openclaw",
      "/en/compare/wechatai-vs-wechat-official-ai",
      "/en/developers/hermes",
      "/en/developers/muse",
      "/en/developers/openclaw",
      "/en/developers/plugins",
      ...englishDocs.map(({ path }) => `/en${path}`),
      "/en/pricing",
      "/en/terms",
      "/en/privacy",
      "/en/contact",
      "/en/wechat-agent",
      "/en/wechat-ai",
      "/en/wechat-ai-ban-risk",
      "/en/wechat-ai-image",
      "/en/wechat-ai-options",
      "/en/wechat-ai-partner",
      "/en/wechat-ai-privacy",
      "/en/wechat-bot",
      "/en/wechat-character-card",
      "/en/wechat-claude",
      "/en/wechat-clawbot",
      "/en/wechat-clawbot-models",
      "/en/wechat-deepseek",
      "/en/wechat-glm",
      "/en/wechat-gpt",
      "/en/wechat-kimi",
      "/en/wechat-muse",
      "/en/wechat-qwen",
      "/ja",
      "/ja/pricing",
      "/ja/wechat-ai",
      "/ja/wechat-bot",
      "/ja/wechat-deepseek",
      "/ko",
      "/ko/pricing",
      "/ko/wechat-ai",
      "/ko/wechat-bot",
      "/ko/wechat-deepseek",
    ].sort();
    expect(publishedLocalizedPaths().sort()).toEqual(expected);
    const sitemap = renderSitemap();
    const localized = [
      ...sitemap.matchAll(/<loc>https:\/\/wechatai\.app(\/(?:en|ja|ko)[^<]*)<\/loc>/g),
    ].map(([, path]) => path);
    expect(localized.sort()).toEqual(expected);
  });
});
