/**
 * Locale definitions and the page translation registry.
 *
 * Modules explicitly register every path that may be served under a language
 * prefix. The SEO layer uses its public path list to decide what to index.
 */
import type { SeoPage } from "../seo-pages";

export const AVAILABLE_LOCALES = ["zh-CN", "en", "ja", "ko", "es", "pt"] as const;
export type Locale = (typeof AVAILABLE_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "zh-CN";
export const DASHBOARD_PATH = "/app";

export interface LocaleDefinition {
  /** URL prefix without slashes. The default locale is unprefixed. */
  readonly prefix: string;
  /** Value for the HTML `lang` attribute and hreflang. */
  readonly htmlLang: string;
  /** Value for `og:locale`. */
  readonly ogLocale: string;
  /** Label used by the language switcher. */
  readonly label: string;
}

export const LOCALE_DEFINITIONS: Readonly<Record<Locale, LocaleDefinition>> = {
  "zh-CN": { prefix: "", htmlLang: "zh-CN", ogLocale: "zh_CN", label: "中文" },
  en: { prefix: "en", htmlLang: "en", ogLocale: "en_US", label: "English" },
  ja: { prefix: "ja", htmlLang: "ja-JP", ogLocale: "ja_JP", label: "日本語" },
  ko: { prefix: "ko", htmlLang: "ko-KR", ogLocale: "ko_KR", label: "한국어" },
  es: { prefix: "es", htmlLang: "es", ogLocale: "es_ES", label: "Español" },
  pt: { prefix: "pt", htmlLang: "pt-BR", ogLocale: "pt_BR", label: "Português" },
};

export interface TranslationPage {
  /** Unprefixed canonical Chinese path, e.g. "/pricing". Never a locale URL. */
  readonly path: string;
  /** Complete document title, including the brand suffix. */
  readonly title: string;
  readonly description: string;
  /** ISO date of the translation; drives the sitemap lastmod. */
  readonly updatedAt: string;
  /**
   * Complete landing-page copy for pages rendered from `SeoPage`. The same
   * object feeds the prerendered body and the page-owned JSON-LD. Pages whose
   * body lives in a hand-written component omit it.
   */
  readonly content?: SeoPage;
}

export interface RegisteredTranslation extends TranslationPage {
  readonly locale: Locale;
}

export interface TranslationModule {
  default: readonly TranslationPage[];
}

const registry = new Map<Locale, Map<string, TranslationPage>>();

export function isLocale(value: string): value is Locale {
  return (AVAILABLE_LOCALES as readonly string[]).includes(value);
}

export function localePrefix(locale: Locale): string {
  return LOCALE_DEFINITIONS[locale].prefix;
}

/** Same normalization used by the SEO layer: drop query/hash and trailing slashes. */
export function normalizePath(pathname: string): string {
  return pathname.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
}

export function localizedPath(locale: Locale, path: string): string {
  const normalized = normalizePath(path);
  const prefix = localePrefix(locale);
  if (!prefix) return normalized;
  return normalized === "/" ? `/${prefix}` : `/${prefix}${normalized}`;
}

/** Splits a locale-prefixed URL. Unknown or default prefixes return undefined. */
export function splitLocalePath(pathname: string): { locale: Locale; path: string } | undefined {
  const normalized = normalizePath(pathname);
  const [, first, ...rest] = normalized.split("/");
  if (!first || !isLocale(first) || first === DEFAULT_LOCALE) return undefined;
  return { locale: first, path: rest.length ? `/${rest.join("/")}` : "/" };
}

function assertTranslation(locale: Locale, page: TranslationPage, source: string): void {
  if (locale === DEFAULT_LOCALE) {
    throw new Error(`${source}: ${locale} is the source locale and cannot be registered`);
  }
  if (!page || typeof page !== "object")
    throw new Error(`${source}: translation entry is not an object`);
  if (typeof page.path !== "string") throw new Error(`${source}: translation path is missing`);
  const path = normalizePath(page.path);
  if (!page.path.startsWith("/") || path !== page.path) {
    throw new Error(`${source}: translation path must be a normalized absolute path: ${page.path}`);
  }
  if (splitLocalePath(path)) {
    throw new Error(`${source}: translation path must not contain a locale prefix: ${page.path}`);
  }
  if (typeof page.title !== "string" || !page.title.trim()) {
    throw new Error(`${source}: ${path} needs a complete title`);
  }
  if (typeof page.description !== "string" || !page.description.trim()) {
    throw new Error(`${source}: ${path} needs a complete description`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(page.updatedAt)) {
    throw new Error(`${source}: ${path} needs an ISO updatedAt date`);
  }
  if (page.content) {
    if (page.content.path !== path) {
      throw new Error(`${source}: ${path} content points at ${page.content.path}`);
    }
    if (!page.content.h1.trim() || !page.content.sections.length) {
      throw new Error(`${source}: ${path} content needs a heading and sections`);
    }
    if (page.description !== page.content.description) {
      throw new Error(`${source}: ${path} metadata description differs from page content`);
    }
  }
}

/** Registers explicit, complete page translations. Used by discovery modules and tests. */
export function registerTranslations(
  locale: Locale,
  pages: readonly TranslationPage[],
  source = "translations",
): void {
  if (!isLocale(locale)) throw new Error(`${source}: unknown locale ${locale}`);
  let localeRegistry = registry.get(locale);
  if (!localeRegistry) {
    localeRegistry = new Map();
    registry.set(locale, localeRegistry);
  }
  for (const page of pages) {
    assertTranslation(locale, page, source);
    localeRegistry.set(page.path, {
      path: page.path,
      title: page.title,
      description: page.description,
      updatedAt: page.updatedAt,
      ...(page.content ? { content: page.content } : {}),
    });
  }
}

/** Tests only: forget every registration so a fixture cannot leak into another case. */
export function clearRegisteredTranslations(): void {
  registry.clear();
}

export function registeredTranslation(
  locale: Locale,
  path: string,
): RegisteredTranslation | undefined {
  const normalized = normalizePath(path);
  const page = registry.get(locale)?.get(normalized);
  return page ? { ...page, locale } : undefined;
}

export function hasRegisteredTranslation(locale: Locale, path: string): boolean {
  return registeredTranslation(locale, path) !== undefined;
}

export function registeredTranslationsForPath(path: string): readonly RegisteredTranslation[] {
  const normalized = normalizePath(path);
  return AVAILABLE_LOCALES.flatMap((locale) => {
    if (locale === DEFAULT_LOCALE) return [];
    const page = registry.get(locale)?.get(normalized);
    return page ? [{ ...page, locale }] : [];
  });
}

/** Locales with a registered translation for this path, including the Chinese source. */
export function alternateLocales(path: string): readonly Locale[] {
  const translated = registeredTranslationsForPath(path).map((page) => page.locale);
  return translated.length ? [DEFAULT_LOCALE, ...translated] : [];
}

/** Resolves a localized URL only when that exact page has been registered. */
export function resolveLocalizedPath(
  pathname: string,
): { locale: Locale; path: string; translation: RegisteredTranslation } | undefined {
  const split = splitLocalePath(pathname);
  if (!split) return undefined;
  const translation = registeredTranslation(split.locale, split.path);
  return translation ? { ...split, translation } : undefined;
}

export function publishedTranslations(): readonly RegisteredTranslation[] {
  return AVAILABLE_LOCALES.flatMap((locale) => {
    if (locale === DEFAULT_LOCALE) return [];
    const pages = registry.get(locale);
    if (!pages) return [];
    return [...pages.values()].map((page) => ({ ...page, locale }));
  });
}
