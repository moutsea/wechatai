import { OpenClawGuide } from "./pages/openclaw-guide";
import React, { lazy, Suspense, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppProvider } from "./context";
import { AuthProvider } from "./auth";
import { Shell } from "./shell";
import { Landing, AuthPage } from "./public-pages";
import { Dashboard } from "./pages/dashboard";
import { Channels } from "./pages/channels";
import { Wechat } from "./pages/wechat";
import { Billing } from "./pages/billing";
import { Credits } from "./pages/credits";
import { Invite } from "./pages/invite";
import { Guide } from "./pages/guide";
import { SiteInfoPage } from "./pages/site-info";
import { DocsIndex, DocArticlePage } from "./pages/docs";
import { PageMetadata } from "./seo";
import { NotFound } from "./not-found";
import "./styles.css";
import "./pages/sessions.css";
// Included in initial HTML so the prerendered public docs also work without JavaScript.
import "./pages/plugin-protocol.css";
import "./pages/site-info.css";
import "./pages/docs.css";
const PluginProtocol = lazy(() =>
  import("./pages/plugin-protocol").then((module) => ({ default: module.PluginProtocol })),
);
const Sessions = lazy(() =>
  import("./pages/sessions").then((module) => ({ default: module.Sessions })),
);
const Plugins = lazy(() =>
  import("./pages/plugins").then((module) => ({ default: module.Plugins })),
);
const Admin = lazy(() => import("./pages/admin").then((module) => ({ default: module.Admin })));
function ScrollReset() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
function Workspace({ demo = false }: { demo?: boolean }) {
  return (
    <AppProvider key={demo ? "demo" : "live"} demo={demo}>
      <Shell>
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="channels" element={<Channels />} />
          <Route
            path="plugins"
            element={
              <Suspense
                fallback={
                  <div className="full-state" role="status">
                    正在加载插件…
                  </div>
                }
              >
                <Plugins />
              </Suspense>
            }
          />
          <Route path="assistants" element={<Channels />} />
          <Route path="wechat" element={<Wechat />} />
          <Route
            path="sessions"
            element={
              <Suspense
                fallback={
                  <div className="full-state" role="status">
                    正在加载会话记录…
                  </div>
                }
              >
                <Sessions />
              </Suspense>
            }
          />
          <Route path="billing" element={<Billing />} />
          <Route path="credits" element={<Credits />} />
          <Route path="invite" element={<Invite />} />
          {!demo && (
            <Route
              path="admin"
              element={
                <Suspense fallback={<div className="full-state">正在加载管理后台…</div>}>
                  <Admin />
                </Suspense>
              }
            />
          )}
          <Route path="*" element={<Navigate to={demo ? "/demo" : "/app"} replace />} />
        </Routes>
      </Shell>
    </AppProvider>
  );
}
// Preserve the existing root when Vite refreshes this module during development.
const root: Root = import.meta.hot?.data.root ?? createRoot(document.getElementById("root")!);
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ScrollReset />
        <PageMetadata />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/register" element={<AuthPage register />} />
          <Route path="/guide" element={<Guide />} />
          <Route path="/docs" element={<DocsIndex />} />
          <Route path="/docs/:slug" element={<DocArticlePage />} />
          <Route path="/terms" element={<SiteInfoPage kind="terms" />} />
          <Route path="/privacy" element={<SiteInfoPage kind="privacy" />} />
          <Route path="/contact" element={<SiteInfoPage kind="contact" />} />
          <Route path="/developers/hermes" element={<OpenClawGuide kind="hermes" />} />
          <Route path="/developers/openclaw" element={<OpenClawGuide />} />
          <Route
            path="/developers/plugins"
            element={
              <Suspense
                fallback={
                  <div className="full-state" role="status">
                    正在加载插件协议…
                  </div>
                }
              >
                <PluginProtocol />
              </Suspense>
            }
          />
          <Route path="/app/*" element={<Workspace />} />
          <Route path="/demo/*" element={<Workspace demo />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
