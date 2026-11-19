import { LOCALE_DEFINITIONS, localizedPath } from "../shared/i18n";
import { useLocale } from "./locale";

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
    return (
      <a
        key={target}
        href={localizedPath(target, path)}
        hrefLang={definition.htmlLang}
        lang={definition.htmlLang}
      >
        {definition.label}
      </a>
    );
  });
  return mobile ? (
    <>{links}</>
  ) : (
    <nav className="site-language" aria-label="语言">
      {links}
    </nav>
  );
}
