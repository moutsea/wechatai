import { describe, expect, it } from "vitest";
import { renderPublicPage } from "../src/client/prerender";
import { getPageSeo, renderSeoHead } from "../src/shared/seo";

function parse(path: string) {
  const seo = getPageSeo(path);
  return new DOMParser().parseFromString(
    `<html lang="${seo.htmlLang ?? "zh-CN"}"><head>${renderSeoHead(seo)}</head><body>${renderPublicPage(path)}</body></html>`,
    "text/html",
  );
}

/** The switcher's published endonyms are allowed in link text, not in attributes. */
function hanResidue(document: Document) {
  const text = document.body.textContent?.replaceAll("中文", "").replaceAll("日本語", "") ?? "";
  const attributes = [...document.querySelectorAll("[alt], [aria-label], [title], [placeholder]")]
    .flatMap((element) =>
      ["alt", "aria-label", "title", "placeholder"].map((name) => element.getAttribute(name) ?? ""),
    )
    .join(" ");
  return `${text} ${attributes}`.match(/\p{Script=Han}+/gu) ?? [];
}

const landingPages = [
  ["/es/wechat-ai", "IA para WeChat: lleva tu propio modelo al chat de WeChat", 6],
  ["/es/wechat-bot", "Cómo crear un bot de WeChat: elige primero la ruta correcta", 5],
  ["/es/wechat-deepseek", "¿Quieres usar DeepSeek en WeChat? Empieza aquí", 8],
] as const;

describe("published Spanish pages", () => {
  it("renders the Spanish homepage with localized chrome, plans and FAQ", () => {
    const document = parse("/es");
    expect(document.documentElement.lang).toBe("es");
    expect(document.title).toBe("IA para WeChat: DeepSeek, Claude, GPT y agentes | Wechatai");
    expect(document.querySelector("h1")?.textContent).toBe("Trae tu IA a WeChat");

    const header = document.querySelector(".site-header-nav");
    expect(header?.querySelector('a[href="/es"]')?.textContent).toBe("Inicio");
    expect(header?.querySelector('a[href="/es/pricing"]')?.textContent).toBe("Precios");
    expect(header?.querySelector('a[href="/docs"]')?.textContent).toBe("Documentación");
    expect(header?.querySelector('a[href="/es#how"]')).not.toBeNull();

    const footer = document.querySelector(".landing-footer");
    expect(footer?.querySelector('a[href="/es/pricing"]')?.textContent).toBe(
      "Precios y créditos gratis",
    );
    expect(footer?.querySelector('a[href="/es/wechat-ai"]')?.textContent).toBe(
      "Asistente de IA para WeChat",
    );
    expect(footer?.querySelector('a[href="/docs"]')?.textContent).toBe(
      "Documentación y tutoriales",
    );
    expect(footer?.querySelector(".landing-footer-title")?.textContent).toBe("Producto");

    expect(document.querySelectorAll(".landing-faq details")).toHaveLength(7);
    expect(document.querySelector(".landing-faq summary")?.textContent).toContain(
      "¿Necesito mi propia clave de API?",
    );
    expect(document.querySelectorAll(".landing-plan")).toHaveLength(4);
    expect(
      document.querySelector('.landing-plan-year a[href="/es/pricing?interval=year#plan-year"]'),
    ).not.toBeNull();
    expect(document.querySelector(".hero-connections img")?.getAttribute("alt")).toContain(
      "conectados con líneas a WeChat abajo",
    );
    expect(document.querySelector(".landing-repository")?.getAttribute("aria-label")).toContain(
      "Ver el repositorio moutsea/wechatai",
    );
    expect(document.querySelector(".site-language")?.getAttribute("aria-label")).toBe("Idioma");
    expect(hanResidue(document)).toEqual([]);
  });

  it("renders the Spanish pricing page, plans, estimator and related links", () => {
    const document = parse("/es/pricing");
    expect(document.documentElement.lang).toBe("es");
    expect(document.title).toBe("Precios: 100 créditos gratis al día, Plus ¥9.9/mes | Wechatai");
    expect(document.querySelector("h1")?.textContent).toBe(
      "Empieza gratis y pasa a Plus cuando necesites más",
    );
    const planTitles = [...document.querySelectorAll(".plan h3")].map((node) => node.textContent);
    expect(planTitles).toEqual(["Gratis", "Plus mensual", "Plus anual"]);
    expect(document.querySelector(".plan-year .plan-price strong")?.textContent).toBe("¥88");
    expect(document.querySelector(".plan-year .plan-price-unit")?.textContent).toBe("/ año");
    expect(document.querySelectorAll(".pricing-faq details")).toHaveLength(8);
    expect(document.querySelector(".pricing-estimate summary")?.textContent).toContain(
      "Calcular mi uso diario",
    );
    expect(document.querySelector(".plan-highlights")?.textContent).toContain("Créditos al día");
    expect(document.querySelector("#estimate")?.textContent).toContain("Uso de Wechatai / día");
    expect(document.querySelector("#estimate")?.textContent).toContain(
      "Gratis incluye 100 al día; Plus incluye 1000.",
    );
    expect(document.querySelector(".seopage-related h2")?.textContent).toBe("Sigue explorando");
    expect(document.querySelector('.seopage-related a[href="/es/wechat-muse"]')).toBeNull();
    expect(hanResidue(document)).toEqual([]);
  });

  it.each(landingPages)("renders the Spanish landing page %s", (path, h1, faqCount) => {
    const document = parse(path);
    expect(document.documentElement.lang).toBe("es");
    expect(document.querySelector("h1")?.textContent).toBe(h1);
    expect(document.querySelector(".seopage-breadcrumb")?.textContent).toContain("Inicio");
    expect(document.querySelector('.seopage-breadcrumb a[href="/es"]')).not.toBeNull();
    expect(document.querySelector(".seopage-skip")?.textContent).toBe("Saltar al contenido");
    expect(document.querySelector(".seopage-faq")?.getAttribute("aria-labelledby")).toBe(
      "seopage-faq-title",
    );
    expect(document.querySelector("#seopage-faq-title")?.textContent).toBe("Preguntas frecuentes");
    expect(document.querySelectorAll(".seopage-faq details")).toHaveLength(faqCount);
    expect(document.querySelector(".seopage-related h2")?.textContent).toBe("Sigue explorando");
    expect(hanResidue(document)).toEqual([]);
  });

  it("localizes only registered landing targets and keeps real paths otherwise", () => {
    const document = parse("/es/wechat-ai");
    const related = [...document.querySelectorAll(".seopage-related a")].map((link) => ({
      href: link.getAttribute("href"),
      label: link.querySelector("span")?.textContent,
    }));
    expect(related).toContainEqual({
      href: "/es/wechat-deepseek",
      label: "Usar DeepSeek en WeChat",
    });
    expect(related).toContainEqual({ href: "/es/pricing", label: "Precios y cuota gratuita" });
    expect(related).toContainEqual({ href: "/wechat-gpt", label: "Usar GPT en WeChat" });
    expect(related).toContainEqual({
      href: "/docs/getting-started",
      label: "Guía de inicio",
    });

    const deepseek = parse("/es/wechat-deepseek");
    expect(deepseek.querySelector('a[href="/es/pricing#estimate"]')).not.toBeNull();
    expect(deepseek.querySelector('a[href="/es/pricing"]')).not.toBeNull();
    expect(deepseek.querySelector('a[href="/docs/deepseek-in-wechat"]')).not.toBeNull();
  });

  it("renders the not-found page for unregistered Spanish paths", () => {
    for (const path of ["/es/docs", "/es/docs/getting-started", "/es/wechat-muse"]) {
      const seo = getPageSeo(path);
      expect(seo.indexable, path).toBe(false);
      expect(seo.canonical, path).toBeUndefined();
      expect(renderSeoHead(seo), path).not.toContain("hreflang");
      expect(renderPublicPage(path), path).not.toContain("seopage-breadcrumb");
    }
  });
});
