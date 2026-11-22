import { findSeoPage } from "../../shared/seo-pages";
import { registeredTranslation } from "../../shared/i18n";
import { useLocale } from "../locale";
import { NotFound } from "../not-found";
import { SeoPageView } from "./seo-page";

/**
 * `/compare/{a}-vs-{b}` shares the landing-page template: the pair is just a
 * path lookup, so unknown pairs fall through to the normal 404. A registered
 * translation supplies its own copy, including the comparison table.
 */
export function ComparePage() {
  const { locale, path } = useLocale();
  const page = registeredTranslation(locale, path)?.content ?? findSeoPage(path);
  return page ? <SeoPageView page={page} /> : <NotFound />;
}
