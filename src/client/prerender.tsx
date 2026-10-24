import { OpenClawGuide } from "./pages/openclaw-guide";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
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
  replaceSeoHead,
  renderSitemap,
} from "../shared/seo";

export function renderPublicPage(path: string) {
  const infoKind = (Object.keys(INFO_PAGES) as Array<keyof typeof INFO_PAGES>).find(
    (kind) => INFO_PAGES[kind].path === path,
  );
  const landing = findSeoPage(path);
  return renderToString(
    <StaticRouter location={path}>
      <AnonymousAuthProvider>
        {landing ? (
          <SeoPageView page={landing} />
        ) : infoKind ? (
          <SiteInfoPage kind={infoKind} />
        ) : path === "/" ? (
          <Landing />
        ) : path === "/guide" ? (
          <Guide />
        ) : path === "/docs" ? (
          <DocsIndex />
        ) : path.startsWith("/docs/") && findDocArticle(path.slice(6)) ? (
          <DocArticlePage slug={path.slice(6)} />
        ) : path === "/developers/hermes" ? (
          <OpenClawGuide kind="hermes" />
        ) : path === "/developers/openclaw" ? (
          <OpenClawGuide />
        ) : path === "/developers/plugins" ? (
          <PluginProtocol />
        ) : (
          <NotFound />
        )}
      </AnonymousAuthProvider>
    </StaticRouter>,
  );
}
