import { findSeoPage } from "../../shared/seo-pages";
import { registeredTranslation } from "../../shared/i18n";
import { useLocale } from "../locale";
import { NotFound } from "../not-found";
import { SeoPageView } from "./seo-page";

export function SeoLandingPage() {
  const { locale, path } = useLocale();
  const page = registeredTranslation(locale, path)?.content ?? findSeoPage(path);
  return page ? <SeoPageView page={page} /> : <NotFound />;
}
