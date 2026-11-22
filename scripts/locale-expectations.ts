// Loaded through Vite by the build verifier and Playwright, so both see the
// same discovery modules as the application without publishing test metadata.
import "../src/shared/i18n/load";
import {
  AVAILABLE_LOCALES,
  DEFAULT_LOCALE,
  LOCALE_DEFINITIONS,
  localizedPath,
  registeredTranslationsForPath,
  type Locale,
} from "../src/shared/i18n";
import { PUBLIC_PATHS, SITE_URL } from "../src/shared/seo";

function expectedPage(locale: Locale, sourcePath: string, lastmod?: string) {
  const path = localizedPath(locale, sourcePath);
  return { ...LOCALE_DEFINITIONS[locale], path, canonical: `${SITE_URL}${path}`, lastmod };
}

export const defaultLocale = LOCALE_DEFINITIONS[DEFAULT_LOCALE];
export const localePageGroups = PUBLIC_PATHS.map((path) => [
  expectedPage(DEFAULT_LOCALE, path),
  ...registeredTranslationsForPath(path).map(({ locale, updatedAt }) =>
    expectedPage(locale, path, updatedAt),
  ),
]);

export function alternateLinks(group: (typeof localePageGroups)[number]) {
  if (group.length === 1) return [];
  return [
    ...group.map(({ htmlLang, canonical }) => [htmlLang, canonical]),
    ["x-default", group[0].canonical],
  ];
}

const publishedPaths = new Set(localePageGroups.flat().map(({ path }) => path));
export const locale404Probes = AVAILABLE_LOCALES.filter((locale) => locale !== DEFAULT_LOCALE)
  .flatMap((locale) => ["/", "/pricing", "/docs"].map((path) => localizedPath(locale, path)))
  .filter((path) => !publishedPaths.has(path));
