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

/** The switcher's Chinese endonym is allowed in link text, not in attributes. */
function hanResidue(document: Document) {
  const text = document.body.textContent?.replaceAll("中文", "") ?? "";
  const attributes = [...document.querySelectorAll("[alt], [aria-label], [title], [placeholder]")]
    .flatMap((element) =>
      ["alt", "aria-label", "title", "placeholder"].map(
        (name) => element.getAttribute(name) ?? "",
      ),
    )
    .join(" ");
  return `${text} ${attributes}`.match(/\p{Script=Han}+/gu) ?? [];
}

describe("published Korean pages", () => {
  it("serves the Korean homepage with Korean chrome and localized links", () => {
    const document = parse("/ko");
    expect(document.documentElement.lang).toBe("ko-KR");
    expect(document.title).toBe("위챗 AI: DeepSeek, Claude, GPT와 에이전트 | Wechatai");
    expect(document.querySelector("h1")?.textContent).toContain("당신의 AI를");
    expect(document.querySelector("h1")?.textContent).toContain("위챗으로");

    const header = document.querySelector(".site-header-nav");
    expect(header?.querySelector('a[href="/ko"]')?.textContent).toBe("홈");
    expect(header?.querySelector('a[href="/ko/pricing"]')?.textContent).toBe("가격");
    // /ko/docs is not registered, so the header keeps the real Chinese URL.
    expect(header?.querySelector('a[href="/docs"]')?.textContent).toBe("문서");
    expect(header?.querySelector('a[href="/ko#how"]')).not.toBeNull();

    const image = document.querySelector(".hero-connections img");
    expect(image?.getAttribute("src")).toBe("/images/landing/ai-wechat-connections-en.webp");
    expect(image?.getAttribute("alt")).toContain("위챗");

    expect(document.querySelectorAll(".landing-plan")).toHaveLength(4);
    expect(
      document.querySelector('.landing-plan-year a[href="/ko/pricing?interval=year#plan-year"]'),
    ).not.toBeNull();

    const footer = document.querySelector(".landing-footer");
    expect(footer?.querySelector('a[href="/ko/pricing"]')?.textContent).toBe(
      "가격 및 무료 크레딧",
    );
    expect(footer?.querySelector('a[href="/wechat-ai"]')?.textContent).toBe("위챗 AI 어시스턴트");

    expect(document.querySelectorAll(".landing-faq details")).toHaveLength(7);
    expect(document.querySelector(".landing-faq summary")?.textContent).toContain(
      "모델 API 키를 직접 준비해야 하나요?",
    );
    expect(hanResidue(document)).toEqual([]);
  });

  it("renders Korean pricing copy, plans, FAQ, estimator and JSON-LD", () => {
    const document = parse("/ko/pricing");
    expect(document.documentElement.lang).toBe("ko-KR");
    expect(document.title).toBe(
      "가격: 매일 무료 100 크레딧, Plus 월 ¥9.9 | Wechatai",
    );
    expect(document.querySelector("h1")?.textContent).toBe(
      "무료로 시작하고 필요할 때 Plus로 업그레이드하세요",
    );
    expect(document.querySelector('meta[property="og:locale"]')?.getAttribute("content")).toBe(
      "ko_KR",
    );
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://wechatai.app/ko/pricing",
    );

    const planTitles = [...document.querySelectorAll(".plan h3")].map((node) => node.textContent);
    expect(planTitles).toEqual(["무료", "Plus 월간", "Plus 연간"]);
    expect(document.querySelector(".plan-year .plan-price strong")?.textContent).toBe("¥88");
    expect(document.querySelector(".plan-year .plan-price-unit")?.textContent).toBe("/ 년");
    expect(document.querySelectorAll(".pricing-faq details")).toHaveLength(8);
    expect(document.querySelector(".pricing-estimate summary")?.textContent).toContain(
      "하루 사용량 예측하기",
    );
    expect(document.querySelector(".cost-estimator h2")?.textContent).toBe(
      "먼저 텍스트 사용량을 예측하세요",
    );
    expect(document.querySelector(".seopage-related h2")?.textContent).toBe("계속 알아보기");
    expect(document.querySelector('.pricing-breadcrumb a[href="/ko"]')?.textContent).toBe("홈");

    const graph = JSON.parse(
      document.querySelector('script[type="application/ld+json"]')!.textContent!,
    )["@graph"] as Array<Record<string, unknown>>;
    const service = graph.find((node) => node["@type"] === "Service")!;
    expect(service.name).toBe("Wechatai 무료 및 Plus");
    expect(service.serviceType).toBe("위챗 AI 연결 서비스");
    expect((service.offers as Array<Record<string, unknown>>).map((offer) => offer.name)).toEqual([
      "무료",
      "Plus 월간",
      "Plus 연간",
    ]);
    const faq = graph.find((node) => node["@type"] === "FAQPage") as {
      mainEntity: Array<{ name: string }>;
    };
    expect(faq.mainEntity).toHaveLength(7);
    expect(faq.mainEntity[0].name).toBe("멤버십 요금에 모델 비용이 포함되나요?");
    expect(JSON.stringify(graph)).not.toMatch(/页面未找到|价格与方案|免费版/);
    expect(hanResidue(document)).toEqual([]);
  });

  it("keeps canonical and hreflang self-referential across the page group", () => {
    const groups = {
      "/": "/",
      "/ko": "/",
      "/pricing": "/pricing",
      "/ko/pricing": "/pricing",
    } as const;
    for (const [path, source] of Object.entries(groups)) {
      const seo = getPageSeo(path);
      expect(seo.canonical, path).toBe(`${SITE_URL}${path}`);
      expect(seo.alternates, path).toEqual([
        { hreflang: "zh-CN", href: `${SITE_URL}${source}` },
        { hreflang: "en", href: `${SITE_URL}${source === "/" ? "/en" : "/en/pricing"}` },
        { hreflang: "ko-KR", href: `${SITE_URL}${source === "/" ? "/ko" : "/ko/pricing"}` },
        { hreflang: "x-default", href: `${SITE_URL}${source}` },
      ]);
    }
  });

  it("publishes only the two registered Korean URLs and 404s the rest", () => {
    expect(publishedLocalizedPaths().filter((path) => path.startsWith("/ko")).sort()).toEqual([
      "/ko",
      "/ko/pricing",
    ]);
    const sitemap = renderSitemap();
    for (const path of ["/ko", "/ko/pricing"]) {
      const lastmod = getPageSeo(path).canonical && "2026-11-21";
      expect(sitemap).toContain(
        `<loc>${SITE_URL}${path}</loc><lastmod>${lastmod}</lastmod>`,
      );
    }
    expect(sitemap).not.toContain("https://wechatai.app/ko/docs");
    expect(sitemap).not.toContain("https://wechatai.app/ko/wechat-claude");

    for (const path of ["/ko/docs", "/ko/wechat-claude"]) {
      const seo = getPageSeo(path);
      expect(seo.indexable, path).toBe(false);
      expect(seo.canonical, path).toBeUndefined();
      expect(renderPublicPage(path), path).toContain("这个页面没有找到。");
      expect(renderPublicPage(path), path).not.toContain("site-language");
    }
  });
});
