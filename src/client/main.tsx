import { OpenClawGuide } from "./pages/openclaw-guide";
import React, { lazy, Suspense, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "./auth";
import { Landing, AuthPage } from "./public-pages";
import { VerifyEmailPage, ForgotPasswordPage, ResetPasswordPage } from "./pages/auth-recovery";
import { Guide } from "./pages/guide";
import { SiteInfoPage } from "./pages/site-info";
import { DocsIndex, DocArticlePage } from "./pages/docs";
import { SeoPageView } from "./pages/seo-page";
import { SEO_PAGES } from "../shared/seo-pages";
import { PageMetadata } from "./seo";
import { PageViewTracker } from "./page-view-tracker";
import { NotFound } from "./not-found";
import "./styles.css";
// Included in initial HTML so the prerendered public docs also work without JavaScript.
import "./pages/plugin-protocol.css";
import "./pages/site-info.css";
import "./pages/docs.css";
import "./pages/seo-page.css";
const PluginProtocol = lazy(() =>
  import("./pages/plugin-protocol").then((module) => ({ default: module.PluginProtocol })),
);
const Workspace = lazy(() =>
  import("./workspace").then((module) => ({ default: module.Workspace })),
);
function ScrollReset() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
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
        <PageViewTracker />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/register" element={<AuthPage register />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/guide" element={<Guide />} />
          {SEO_PAGES.map((page) => (
            <Route key={page.path} path={page.path} element={<SeoPageView page={page} />} />
          ))}
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
          <Route
            path="/app/*"
            element={
              <Suspense
                fallback={
                  <div className="full-state" role="status">
                    正在加载工作台…
                  </div>
                }
              >
                <Workspace />
              </Suspense>
            }
          />
          <Route
            path="/demo/*"
            element={
              <Suspense
                fallback={
                  <div className="full-state" role="status">
                    正在加载工作台…
                  </div>
                }
              >
                <Workspace demo />
              </Suspense>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
