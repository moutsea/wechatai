import { OpenClawGuide } from "./pages/openclaw-guide";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import "../shared/i18n/load";
import { DEFAULT_LOCALE, normalizePath, resolveLocalizedPath } from "../shared/i18n";
import { LocaleProvider } from "./locale";
import { AnonymousAuthProvider } from "./auth";
import { Landing } from "./public-pages";
import { Guide } from "./pages/guide";
import { NotFound } from "./not-found";
import { PluginProtocol } from "./pages/plugin-protocol";
import { SiteInfoPage } from "./pages/site-info";
import { DocsIndex, DocArticlePage } from "./pages/docs";
import { SeoPageView } from "./pages/seo-page";
import { findDocArticle } from "../shared/docs";
import { findSeoPage } from "../shared/seo-pages";
import { INFO_PAGES } from "../shared/site-info";
export {
  getPageSeo,
  PRIVATE_PATHS,
  LEGACY_PATHS,
  PUBLIC_PATHS,
  publishedLocalizedPaths,
  replaceSeoHead,
  renderSitemap,
} from "../shared/seo";

export function renderPublicPage(path: string) {
  const localized = resolveLocalizedPath(path);
  const pagePath = localized?.path ?? normalizePath(path);
  const locale = localized?.locale ?? DEFAULT_LOCALE;
  const infoKind = (Object.keys(INFO_PAGES) as Array<keyof typeof INFO_PAGES>).find(
    (kind) => INFO_PAGES[kind].path === pagePath,
  );
  const landing = findSeoPage(pagePath);
  return renderToString(
    <StaticRouter location={pagePath}>
      <LocaleProvider locale={locale} path={pagePath}>
        <AnonymousAuthProvider>
          {landing ? (
            <SeoPageView page={landing} />
          ) : infoKind ? (
            <SiteInfoPage kind={infoKind} />
          ) : pagePath === "/" ? (
            <Landing />
          ) : pagePath === "/guide" ? (
            <Guide />
          ) : pagePath === "/docs" ? (
            <DocsIndex />
          ) : pagePath.startsWith("/docs/") && findDocArticle(pagePath.slice(6)) ? (
            <DocArticlePage slug={pagePath.slice(6)} />
          ) : pagePath === "/developers/muse" ? (
            <OpenClawGuide kind="muse" />
          ) : pagePath === "/developers/hermes" ? (
            <OpenClawGuide kind="hermes" />
          ) : pagePath === "/developers/openclaw" ? (
            <OpenClawGuide />
          ) : pagePath === "/developers/plugins" ? (
            <PluginProtocol />
          ) : (
            <NotFound />
          )}
        </AnonymousAuthProvider>
      </LocaleProvider>
    </StaticRouter>,
  );
}
