import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import {
  DEFAULT_LOCALE,
  alternateLocales,
  hasRegisteredTranslation,
  localizedPath,
  normalizePath,
  splitLocalePath,
  type Locale,
} from "../shared/i18n";

export interface LocaleContextValue {
  locale: Locale;
  /** Canonical path without a locale prefix. */
  path: string;
  /** Every locale in the current page group, including the current one. */
  alternates: readonly Locale[];
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  path: "/",
  alternates: [],
});

// Keep the requested locale and path for 404 metadata, but offer alternates only
// when the current URL belongs to the published page group.
export function LocaleProvider({
  children,
  locale: fixedLocale,
  path: fixedPath,
}: {
  children: ReactNode;
  locale?: Locale;
  path?: string;
}) {
  const { pathname } = useLocation();
  const value = useMemo(() => {
    const split = splitLocalePath(pathname);
    const locale = fixedLocale ?? split?.locale ?? DEFAULT_LOCALE;
    const path =
      fixedPath ?? (split && split.locale === locale ? split.path : normalizePath(pathname));
    const alternates =
      locale === DEFAULT_LOCALE || hasRegisteredTranslation(locale, path)
        ? alternateLocales(path)
        : [];
    return { locale, path, alternates };
  }, [fixedLocale, fixedPath, pathname]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}

/** Keeps query strings and fragments and prefixes only registered translations. */
export function localizedHref(locale: Locale, href: string) {
  if (locale === DEFAULT_LOCALE) return href;
  const [, path, suffix] = /^([^?#]*)(.*)$/.exec(href)!;
  const base = path || "/";
  const portugueseWorkspace = locale === "pt" && (base === "/app" || base.startsWith("/app/"));
  if (!portugueseWorkspace && !hasRegisteredTranslation(locale, base)) return href;
  return `${localizedPath(locale, base)}${suffix}`;
}
