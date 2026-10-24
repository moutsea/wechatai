import { SEO_CONTENT } from "./seo-content";

/**
 * Query-driven landing pages. Each entry targets one search intent cluster so the
 * page can own a query without competing with the documentation, which stays
 * task-oriented ("how do I configure X").
 */
export type SeoPageKind = "product" | "tutorial" | "comparison" | "pricing" | "article";

export interface SeoSection {
  /** Anchor id, unique inside the page. */
  id: string;
  title: string;
  /** Markdown body. Rendered server-side so crawlers see it without JavaScript. */
  body: string;
}

export interface SeoFaq {
  question: string;
  /** Plain text: it is repeated verbatim inside FAQPage structured data. */
  answer: string;
}

export interface SeoLink {
  label: string;
  href: string;
}

export interface SeoStep {
  title: string;
  text: string;
}

export interface SeoPage {
  /** Canonical public path, no trailing slash. */
  path: string;
  kind: SeoPageKind;
  /** Search title without the brand suffix; keep it within ~30 CJK characters. */
  title: string;
  /** Meta description; keep it within ~80 CJK characters. */
  description: string;
  eyebrow: string;
  h1: string;
  /** One or two sentences directly below the H1. */
  lede: string;
  /** Direct answer block: the sentence an AI answer engine can quote. */
  answer: string;
  /** The single query this page is built for. */
  primaryKeyword: string;
  /** Supporting queries the same page should also satisfy. */
  secondaryKeywords: readonly string[];
  /** Three short value claims shown under the hero. */
  highlights: readonly string[];
  sections: readonly SeoSection[];
  faq: readonly SeoFaq[];
  /** Related documentation and landing pages; also used for internal linking. */
  related: readonly SeoLink[];
  steps?: readonly SeoStep[];
  /** ISO date of the last content change; drives sitemap lastmod. */
  updatedAt: string;
  /** Optional label override for the primary call to action. */
  ctaLabel?: string;
}

export const SEO_PAGES: readonly SeoPage[] = SEO_CONTENT;
export const SEO_PATHS: readonly string[] = SEO_PAGES.map((page) => page.path);

export function findSeoPage(path: string): SeoPage | undefined {
  return SEO_PAGES.find((page) => page.path === path);
}

const normalize = (path: string) => path.replace(/\/+$/, "") || "/";

/** Normalises a pathname so `/pricing/`, `/pricing?utm=x` and `/pricing` match. */
export function seoPathKey(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0];
  return normalize(path);
}
