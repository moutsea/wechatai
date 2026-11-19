import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import {
  DEFAULT_LOCALE,
  alternateLocales,
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

/**
 * Browser and prerender entry points share this provider. It derives the locale
 * from a registered URL prefix; an unregistered prefix still yields that locale,
 * so the route guard cannot render the Chinese page under it.
 */
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
    return { locale, path, alternates: alternateLocales(path) };
  }, [fixedLocale, fixedPath, pathname]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}
