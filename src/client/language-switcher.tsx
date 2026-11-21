import { LOCALE_DEFINITIONS, localizedPath, type Locale } from "../shared/i18n";
import { useLocale } from "./locale";

const koreanLabels: Partial<Record<Locale, string>> = { "zh-CN": "중국어", ja: "일본어" };

/**
 * Real links, never client-side navigation: switching language reloads the whole
 * document so `lang`, `og:locale` and the prerendered body stay consistent.
 * Renders nothing when the current page has no published translation.
 */
export function LanguageSwitcher({ mobile = false }: { mobile?: boolean }) {
  const { locale, path, alternates } = useLocale();
  const targets = alternates.filter((target) => target !== locale);
  if (!targets.length) return null;
  const links = targets.map((target) => {
    const definition = LOCALE_DEFINITIONS[target];
    const label = locale === "ko" ? koreanLabels[target] : undefined;
    return (
      <a
        key={target}
        href={localizedPath(target, path)}
        hrefLang={definition.htmlLang}
        lang={label ? undefined : definition.htmlLang}
      >
        {label ?? definition.label}
      </a>
    );
  });
  return mobile ? (
    <>{links}</>
  ) : (
    <nav
      className="site-language"
      aria-label={locale === "ko" ? "언어" : locale === "en" ? "Language" : locale === "ja" ? "言語" : "语言"}
    >
      {links}
    </nav>
  );
}
