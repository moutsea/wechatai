import { OpenClawGuide } from "./pages/openclaw-guide";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { AnonymousAuthProvider } from "./auth";
import { Landing } from "./public-pages";
import { Guide } from "./pages/guide";
import { NotFound } from "./not-found";
import { PluginProtocol } from "./pages/plugin-protocol";
export {
  getPageSeo,
  PRIVATE_PATHS,
  PUBLIC_PATHS,
  replaceSeoHead,
  renderSitemap,
} from "../shared/seo";

export function renderPublicPage(path: string) {
  return renderToString(
    <StaticRouter location={path}>
      <AnonymousAuthProvider>
        {path === "/" ? (
          <Landing />
        ) : path === "/guide" ? (
          <Guide />
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
