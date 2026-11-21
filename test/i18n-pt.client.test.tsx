import { describe, expect, it } from "vitest";
import { renderPublicPage } from "../src/client/prerender";
import { getPageSeo, renderSeoHead, SITE_URL } from "../src/shared/seo";

function parse(path: string) {
  const seo = getPageSeo(path);
  return new DOMParser().parseFromString(
    `<html lang="${seo.htmlLang ?? "zh-CN"}"><head>${renderSeoHead(seo)}</head><body>${renderPublicPage(path)}</body></html>`,
    "text/html",
  );
}

function hanResidue(document: Document) {
  const text = document.body.textContent ?? "";
  const attributes = [...document.querySelectorAll("[alt], [aria-label], [title], [placeholder]")]
    .flatMap((element) =>
      ["alt", "aria-label", "title", "placeholder"].map((name) => element.getAttribute(name) ?? ""),
    )
    .join(" ");
  return `${text} ${attributes}`.match(/\p{Script=Han}+/gu) ?? [];
}

const pageGroups = ["/", "/pricing", "/wechat-ai", "/wechat-bot", "/wechat-deepseek"];

describe("published Brazilian Portuguese pages", () => {
  it.each(pageGroups)("serves the full published language group for %s", (source) => {
    const suffix = source === "/" ? "" : source;
    const group = [
      { path: source, lang: "zh-CN", ogLocale: "zh_CN" },
      { path: `/en${suffix}`, lang: "en", ogLocale: "en_US" },
      { path: `/ja${suffix}`, lang: "ja-JP", ogLocale: "ja_JP" },
      { path: `/pt${suffix}`, lang: "pt-BR", ogLocale: "pt_BR" },
    ];
    const expected = [
      ...group.map(({ lang, path }) => [lang, `${SITE_URL}${path}`]),
      ["x-default", `${SITE_URL}${source}`],
    ];
    for (const { path, lang, ogLocale } of group) {
      const document = parse(path);
      expect(document.documentElement.lang, path).toBe(lang);
      expect(document.querySelector('meta[property="og:locale"]')?.getAttribute("content"), path)
        .toBe(ogLocale);
      expect(
        [...document.querySelectorAll('link[rel="canonical"]')].map((link) =>
          link.getAttribute("href"),
        ),
        path,
      ).toEqual([`${SITE_URL}${path}`]);
      const alternates = [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map(
        (link) => [link.getAttribute("hreflang"), link.getAttribute("href")],
      );
      expect(alternates, path).toEqual(expected);
      if (lang === "pt-BR") expect(hanResidue(document), path).toEqual([]);
    }
  });

  it("renders the complete Portuguese homepage and keeps only registered links under /pt", () => {
    const document = parse("/pt");
    expect(document.querySelector("h1")?.textContent).toBe("Leve sua IA para o WeChat");
    expect(document.title).toBe("WeChat AI: DeepSeek, Claude, GPT e agentes | Wechatai");

    const header = document.querySelector(".site-header-nav");
    expect(header?.querySelector('a[href="/pt"]')?.textContent).toBe("Início");
    expect(header?.querySelector('a[href="/pt/pricing"]')?.textContent).toBe("Preços");
    expect(header?.querySelector('a[href="/docs"]')?.textContent).toBe("Documentação");
    expect(header?.querySelector('a[href="/pt#how"]')).not.toBeNull();

    const footer = document.querySelector(".landing-footer");
    expect(footer?.querySelector('a[href="/pt/pricing"]')).not.toBeNull();
    expect(footer?.querySelector('a[href="/pt/wechat-ai"]')?.textContent).toBe(
      "Assistente de IA no WeChat",
    );
    expect(footer?.querySelector('a[href="/docs"]')?.textContent).toBe(
      "Documentação e tutoriais",
    );

    expect(document.querySelectorAll(".landing-faq details")).toHaveLength(7);
    expect(document.querySelector(".landing-faq summary")?.textContent).toContain(
      "Preciso da minha própria API key?",
    );
    expect(document.querySelectorAll(".landing-plan")).toHaveLength(4);
    expect(
      document.querySelector('.landing-plan-year a[href="/pt/pricing?interval=year#plan-year"]'),
    ).not.toBeNull();
    const hero = document.querySelector(".hero-connections img");
    expect(hero?.getAttribute("src")).toBe("/images/landing/ai-wechat-connections-en.webp");
    expect(hero?.getAttribute("alt")).toContain("conectados por linhas ao WeChat abaixo");
    expect(document.querySelector(".landing-repository")?.getAttribute("aria-label")).toContain(
      "Ver o repositório moutsea/wechatai no GitHub",
    );

    const switcher = [...document.querySelectorAll(".site-language a")].map((link) => [
      link.textContent,
      link.getAttribute("href"),
      link.getAttribute("hreflang"),
    ]);
    expect(switcher).toEqual([
      ["Chinês", "/", "zh-CN"],
      ["Inglês", "/en", "en"],
      ["Japonês", "/ja", "ja-JP"],
    ]);
  });

  it("renders Portuguese pricing plans, FAQ, estimator and related links", () => {
    const document = parse("/pt/pricing");
    expect(document.querySelector("h1")?.textContent).toBe(
      "Comece grátis e faça upgrade para o Plus quando precisar",
    );
    expect(document.title).toBe(
      "Preços: 100 credits grátis por dia, Plus ¥9.9/mês | Wechatai",
    );

    const planTitles = [...document.querySelectorAll(".plan h3")].map((node) => node.textContent);
    expect(planTitles).toEqual(["Free", "Plus Mensal", "Plus Anual"]);
    expect(document.querySelector(".plan-year .plan-price strong")?.textContent).toBe("¥88");
    expect(document.querySelector(".plan-year .plan-price-unit")?.textContent).toBe("/ ano");
    expect(document.querySelectorAll(".pricing-faq details")).toHaveLength(8);
    expect(document.querySelector(".pricing-estimate summary")?.textContent).toContain(
      "Estimar meu uso diário",
    );
    expect(document.querySelector(".cost-estimator h2")?.textContent).toBe(
      "Estime primeiro seu uso de texto",
    );
    expect(document.querySelector(".seopage-related h2")?.textContent).toBe(
      "Continue explorando",
    );
    expect(document.querySelector('.seopage-related a[href="/wechat-muse"]')?.textContent).toContain(
      "Assistente gerenciado Muse para WeChat",
    );
    expect(document.querySelector('.pricing-breadcrumb a[href="/pt"]')?.textContent).toBe("Início");
  });

  it.each([
    {
      path: "/pt/wechat-ai",
      heading: "WeChat AI: leve seu próprio modelo para o chat do WeChat",
      faq: 6,
      related: "/pt/wechat-deepseek",
      copyLabel: null,
    },
    {
      path: "/pt/wechat-deepseek",
      heading: "Quer usar DeepSeek no WeChat? Comece aqui",
      faq: 8,
      related: "/wechat-claude",
      copyLabel: null,
    },
    {
      path: "/pt/wechat-bot",
      heading: "Como criar um bot para WeChat: escolha a rota certa primeiro",
      faq: 5,
      related: "/wechat-ai-ban-risk",
      copyLabel: null,
    },
  ])(
    "renders the full Portuguese landing page at $path",
    ({ path, heading, faq, related, copyLabel }) => {
      const document = parse(path);
      expect(document.querySelector("h1")?.textContent).toBe(heading);
      expect(hanResidue(document)).toEqual([]);
      expect(document.querySelectorAll(".seopage-faq details")).toHaveLength(faq);
      expect(document.querySelector(".seopage-answer")?.textContent?.length).toBeGreaterThan(80);
      expect(document.querySelectorAll(".seopage-prose section").length).toBeGreaterThan(2);
      expect(document.querySelector(`.seopage-related a[href="${related}"]`)).not.toBeNull();
      expect(document.querySelector(".site-header-nav a")?.getAttribute("href")).toBe("/pt");
      expect(document.querySelector(".seopage-cta")?.textContent).toContain("Comece grátis");
      if (copyLabel) {
        expect(
          document.querySelector(".seopage-commands")?.getAttribute("aria-label"),
        ).toBe("Comandos comuns do WeChat");
        expect(document.querySelector(".seopage-commands button")?.getAttribute("aria-label")).toBe(
          copyLabel,
        );
      }
    },
  );

  it("keeps the DeepSeek language capability claim aligned with the Chinese source", () => {
    const doc = parse("/pt/wechat-ai");
    const deepSeek = doc.querySelector('#models a[href="/docs/deepseek-in-wechat"]')?.closest("li");
    expect(deepSeek?.textContent).toMatch(/chinês/i);
    expect(deepSeek?.textContent).not.toMatch(/português/i);
  });

  it("localizes the DeepSeek CTA destinations that have Portuguese pages", () => {
    const document = parse("/pt/wechat-deepseek");
    expect(document.querySelector(".seopage-actions a[href='/pt/pricing#estimate']")?.textContent)
      .toContain("Estime o custo de uso primeiro");
    expect(document.querySelector('.seopage-related a[href="/pt/pricing"]')).not.toBeNull();
  });
});
