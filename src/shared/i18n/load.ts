// Vite discovers registration modules by locale directory. A directory with no
// complete translation module publishes nothing. This module is imported for its
// side effect by the client entry and the prerender entry, never by config code.
import {
  isLocale,
  DEFAULT_LOCALE,
  registerTranslations,
  type Locale,
  type TranslationModule,
} from "./index";

const modules = import.meta.glob<TranslationModule>("./*/*.ts", { eager: true });

for (const [file, module] of Object.entries(modules)) {
  const match = /^\.\/([^/]+)\/([^/]+)\.ts$/.exec(file);
  if (!match) throw new Error(`${file}: translation modules live at <locale>/<namespace>.ts`);
  const [, locale, namespace] = match;
  if (!isLocale(locale)) throw new Error(`${file}: unknown locale directory ${locale}`);
  if (locale === DEFAULT_LOCALE) {
    throw new Error(`${file}: Chinese source pages are not registered as translations`);
  }
  if (!/^[a-z0-9-]+$/.test(namespace)) throw new Error(`${file}: invalid namespace ${namespace}`);
  if (!Array.isArray(module.default)) {
    throw new Error(`${file}: default export must be an array of complete page translations`);
  }
  registerTranslations(locale as Locale, module.default, file);
}
