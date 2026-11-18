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
  /** Optional advanced guidance, readable without JavaScript but collapsed by default. */
  details?: { summary: string; body: string };
}

export interface SeoFaq {
  question: string;
  /** Plain text: it is repeated verbatim inside FAQPage structured data. */
  answer: string;
  guide?: SeoLink;
}

export interface SeoLink {
  label: string;
  href: string;
}

export interface SeoStep {
  title: string;
  text: string;
}

/**
 * Side-by-side facts rendered above the prose. A `null` cell means the field
 * could not be verified from a public source; it is rendered as a dash with a
 * note, never as "unsupported".
 */
export interface SeoComparison {
  title: string;
  /** First column is the dimension label; the rest are product names. */
  columns: readonly string[];
  rows: readonly {
    label: string;
    /** One cell per entry in `columns` after the label column. */
    values: readonly (string | null)[];
  }[];
  note: string;
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
  /** Optional fact table for side-by-side pages such as /compare/*. */
  comparison?: SeoComparison;
  /** ISO date of the last content change; drives sitemap lastmod. */
  updatedAt: string;
  /** Optional label override for the primary call to action. */
  ctaLabel?: string;
  /** Topic pages may lead to their specific tutorial before registration. */
  ctaHref?: string;
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
