import { describe, expect, it } from "vitest";
import { renderPublicPage } from "../src/client/prerender";
import {
  clearRegisteredTranslations,
  registerTranslations,
} from "../src/shared/i18n";
import {
  getPageSeo,
  renderSeoHead,
  renderSitemap,
  SITE_URL,
} from "../src/shared/seo";
import {
  INFO_PAGE_UPDATED_AT,
  POLICY_UPDATED_AT,
  SUPPORT_EMAIL,
  TERMS_UPDATED_AT,
} from "../src/shared/site-info";
import siteInfoPages, { EN_SITE_INFO_PAGES } from "../src/shared/i18n/en/site-info";

function parse(path: string) {
  const seo = getPageSeo(path);
  return new DOMParser().parseFromString(
    `<html lang="${seo.htmlLang ?? "zh-CN"}"><head>${renderSeoHead(seo)}</head><body>${renderPublicPage(path)}</body></html>`,
    "text/html",
  );
}

/** Endonyms in the language switcher are expected; everything else is page copy. */
function hanResidue(document: Document) {
  const text = (document.body.textContent ?? "").replaceAll("中文", "");
  const attributes = [...document.querySelectorAll("[alt], [aria-label], [title], [placeholder]")]
    .flatMap((element) =>
      ["alt", "aria-label", "title", "placeholder"].map(
        (name) => element.getAttribute(name) ?? "",
      ),
    )
    .join(" ");
  return `${text} ${attributes}`.match(/\p{Script=Han}+/gu) ?? [];
}

const pages = [
  { path: "/en/terms", zhPath: "/terms", name: "Terms of Service" },
  { path: "/en/privacy", zhPath: "/privacy", name: "Privacy Policy" },
  { path: "/en/contact", zhPath: "/contact", name: "Contact Us" },
] as const;


describe("English terms, privacy and contact pages", () => {
  it.each(pages)("prerenders $path with its own title, body and navigation", (page) => {
    const seo = getPageSeo(page.path);
    expect(seo.indexable).toBe(true);
    expect(seo.canonical).toBe(`${SITE_URL}${page.path}`);
    expect(seo.htmlLang).toBe("en");
    expect(seo.ogLocale).toBe("en_US");

    const document = parse(page.path);
    expect(document.documentElement.lang).toBe("en");
    expect(document.title).toBe(`${page.name} | Wechatai`);
    expect(document.querySelector("h1")?.textContent).toBe(page.name);
    expect(document.querySelector(".info-navigation")?.getAttribute("aria-label")).toBe(
      "Support and policy navigation",
    );
    expect(
      [...document.querySelectorAll(".info-navigation a")].map((link) => [
        link.getAttribute("href"),
        link.textContent,
      ]),
    ).toEqual([
      ["/en/terms", "Terms of Service"],
      ["/en/privacy", "Privacy Policy"],
      ["/en/contact", "Contact Us"],
    ]);
    expect(hanResidue(document)).toEqual([]);
  });

  it("renders seven terms sections with the source update date in a time element", () => {
    const document = parse("/en/terms");
    expect(document.querySelectorAll(".info-document > section")).toHaveLength(7);
    const time = document.querySelector(".info-intro time");
    expect(time?.getAttribute("datetime")).toBe(TERMS_UPDATED_AT);
    expect(time?.textContent).toBe("Updated: November 12, 2026");
    expect(document.querySelector(".info-document")?.getAttribute("aria-label")).toBe(
      "Terms of service",
    );
    expect(document.querySelector(".info-document")?.textContent).toContain(
      "These terms do not exclude or limit liability",
    );
  });

  it("renders eight privacy sections with the source update date in a time element", () => {
    const document = parse("/en/privacy");
    expect(document.querySelectorAll(".info-document > section")).toHaveLength(8);
    const time = document.querySelector(".info-intro time");
    expect(time?.getAttribute("datetime")).toBe(POLICY_UPDATED_AT);
    expect(time?.textContent).toBe("Updated: November 8, 2026");
    expect(document.querySelector(".info-document")?.getAttribute("aria-label")).toBe(
      "Privacy policy",
    );
    expect(document.querySelector(".info-document")?.textContent).toContain(
      "Global Privacy Control (GPC)",
    );
  });

  it("identifies the hashed password as belonging to a Wechatai account registered by email", () => {
    const document = parse("/en/privacy");
    const accountData = [...document.querySelectorAll(".info-document li")].find(
      (item) => item.querySelector("strong")?.textContent === "Account and sign-in:",
    );
    expect(accountData?.textContent).toContain(
      "Passwords for Wechatai accounts registered with an email address are stored in hashed form.",
    );
  });

  it("keeps the contact page date-free and preserves #maintainer and the mail subject", () => {
    const document = parse("/en/contact");
    expect(document.querySelector(".info-intro time")).toBeNull();
    expect(document.querySelector("#maintainer")?.textContent).toContain("Coder Liang");
    expect(document.querySelector(".contact-address")?.getAttribute("href")).toBe(
      `mailto:${SUPPORT_EMAIL}?subject=Wechatai%20feedback`,
    );
    expect(document.querySelector('.contact-grid a[href="/en/docs"]')?.textContent).toBe(
      "Open the documentation",
    );
    expect(document.querySelector('.contact-privacy a[href="/en/privacy"]')).not.toBeNull();
  });

  it("makes account email and order number optional when contacting support", () => {
    const document = parse("/en/contact");
    expect(document.querySelector(".contact-grid")?.textContent).toContain(
      "For account or payment issues, you may include your account email and order number if applicable.",
    );
  });

  it("localizes registered targets and leaves unregistered targets on their real paths", () => {
    const terms = parse("/en/terms");
    for (const href of [
      "/en/privacy",
      "/en/contact",
      "/en/docs/cloud-agent",
      "/en/docs/credits",
      "/app/billing",
    ]) {
      expect(terms.querySelector(`a[href="${href}"]`), href).not.toBeNull();
    }
    expect(terms.querySelector('a[href="/en/app/billing"]')).toBeNull();

    const privacy = parse("/en/privacy");
    for (const href of [
      "/en/contact",
      "/en/docs/commands",
      "mailto:cfjwlchangji@gmail.com",
      "https://www.cloudflare.com/privacypolicy/",
      "https://stripe.com/privacy",
      "https://kimiseek.app/privacy",
    ]) {
      expect(privacy.querySelector(`a[href="${href}"]`), href).not.toBeNull();
    }
    expect(privacy.body.textContent).toContain("/wx reset");
  });

  it("keeps JSON-LD names, summaries, URLs and language aligned with the visible page", () => {
    for (const page of pages) {
      const seo = getPageSeo(page.path);
      expect(seo.structuredData).toMatchObject({
        name: page.name,
        description: EN_SITE_INFO_PAGES[page.path.slice(4) as keyof typeof EN_SITE_INFO_PAGES]
          .description,
        url: `${SITE_URL}${page.path}`,
        inLanguage: "en",
      });
    }
    const englishContact = getPageSeo("/en/contact").structuredData;
    const chineseContact = getPageSeo("/contact").structuredData;
    expect(englishContact?.["@type"]).toBe("ContactPage");
    expect(englishContact?.about).toEqual(chineseContact?.about);
    expect(englishContact?.mainEntity).toEqual(chineseContact?.mainEntity);
    expect(getPageSeo("/terms").structuredData?.name).toBe("服务协议");
  });

  it("publishes both language groups with self canonical and reciprocal hreflang", () => {
    for (const page of pages) {
      const english = getPageSeo(page.path);
      expect(english.canonical).toBe(`${SITE_URL}${page.path}`);
      expect(english.alternates).toEqual([
        { hreflang: "zh-CN", href: `${SITE_URL}${page.zhPath}` },
        { hreflang: "en", href: `${SITE_URL}${page.path}` },
        { hreflang: "x-default", href: `${SITE_URL}${page.zhPath}` },
      ]);
      const head = renderSeoHead(english);
      expect(head).toContain(`rel="canonical" href="${SITE_URL}${page.path}"`);
      expect(head).toContain('hreflang="x-default"');

      const chinese = getPageSeo(page.zhPath);
      expect(chinese.canonical).toBe(`${SITE_URL}${page.zhPath}`);
      expect(chinese.alternates).toContainEqual({
        hreflang: "en",
        href: `${SITE_URL}${page.path}`,
      });
    }
  });

  it("keeps the Chinese pages, links, anchors and dates unchanged", () => {
    const terms = parse("/terms");
    expect(terms.querySelector("h1")?.textContent).toBe("服务协议");
    expect(terms.querySelector(".info-intro time")?.getAttribute("datetime")).toBe(
      TERMS_UPDATED_AT,
    );
    expect(terms.querySelector('a[href="/privacy"]')).not.toBeNull();
    expect(terms.querySelector('a[href="/en/privacy"]')).toBeNull();

    const privacy = parse("/privacy");
    expect(privacy.querySelector("h1")?.textContent).toBe("隐私政策");
    expect(privacy.querySelector(".info-intro time")?.getAttribute("datetime")).toBe(
      POLICY_UPDATED_AT,
    );
    expect(privacy.querySelector('a[href="/contact"]')).not.toBeNull();
    expect(privacy.querySelector('a[href="/en/contact"]')).toBeNull();

    const contact = parse("/contact");
    expect(contact.querySelector("h1")?.textContent).toBe("联系我们");
    expect(contact.querySelector("#maintainer")).not.toBeNull();
    expect(contact.querySelector(".contact-address")?.getAttribute("href")).toContain(
      encodeURIComponent("微伴 Wechatai 使用反馈"),
    );
  });

  it("adds exactly the three English paths to the sitemap", () => {
    clearRegisteredTranslations();
    const before = renderSitemap();
    registerTranslations("en", siteInfoPages, "T6A fixture");
    const after = renderSitemap();
    const localized = [
      ...after.matchAll(/<loc>https:\/\/wechatai\.app(\/en\/[^<]*)<\/loc>/g),
    ].map(([, path]) => path);
    expect(localized.sort()).toEqual(["/en/contact", "/en/privacy", "/en/terms"]);
    for (const page of pages) {
      expect(after).toContain(
        `<loc>${SITE_URL}${page.path}</loc><lastmod>${INFO_PAGE_UPDATED_AT[page.path.slice(4) as "terms" | "privacy" | "contact"]}</lastmod>`,
      );
    }
    expect(before).not.toContain("https://wechatai.app/en/terms");
  });
});
