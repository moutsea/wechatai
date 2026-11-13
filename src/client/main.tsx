import React, { lazy, Suspense, useLayoutEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  BrowserRouter,
  matchRoutes,
  useLocation,
  useRoutes,
  type RouteObject,
} from "react-router-dom";
import { AuthProvider } from "./auth";
import { Landing } from "./public-pages";
import { PageMetadata } from "./seo";
import { PageViewTracker, startInitialPageViewTracking } from "./page-view-tracker";
import { NotFound } from "./not-found";
import { WorkspaceSkeleton } from "./workspace-skeleton";
import { reloadPage, RouteLoadErrorBoundary } from "./load-error-boundary";
import { preloadable } from "./preloadable";
import {
  captureDocumentState,
  restoreDocumentState,
  DocumentInputProvider,
  type DocumentState,
} from "./document-handoff";
import "./styles.css";
// Included in initial HTML so the prerendered public docs also work without JavaScript.
import "./pages/plugin-protocol.css";
import "./pages/site-info.css";
import "./pages/docs.css";
import "./pages/seo-page.css";
import "./pages/guide.css";
import "./pages/pricing-plans.css";
const PluginProtocol = preloadable(async () => ({
  default: (await import("./pages/plugin-protocol")).PluginProtocol,
}));
const Workspace = lazy(() =>
  import("./workspace").then((module) => ({ default: module.Workspace })),
);
const AuthPage = lazy(() =>
  import("./pages/auth-page").then((module) => ({ default: module.AuthPage })),
);
const VerifyEmailPage = lazy(() =>
  import("./pages/auth-recovery").then((module) => ({ default: module.VerifyEmailPage })),
);
const ForgotPasswordPage = lazy(() =>
  import("./pages/auth-recovery").then((module) => ({ default: module.ForgotPasswordPage })),
);
const ResetPasswordPage = lazy(() =>
  import("./pages/auth-recovery").then((module) => ({ default: module.ResetPasswordPage })),
);
const Guide = preloadable(async () => ({ default: (await import("./pages/guide")).Guide }));
const SiteInfoPage = preloadable(async () => ({
  default: (await import("./pages/site-info")).SiteInfoPage,
}));
const DocsIndex = preloadable(async () => ({ default: (await import("./pages/docs")).DocsIndex }));
const DocArticlePage = preloadable(async () => ({
  default: (await import("./pages/docs")).DocArticlePage,
}));
const OpenClawGuide = preloadable(async () => ({
  default: (await import("./pages/openclaw-guide")).OpenClawGuide,
}));
const SeoLandingPage = preloadable(async () => ({
  default: (await import("./pages/seo-landing")).SeoLandingPage,
}));
type AppRoute = RouteObject & { preload?: () => Promise<void> };
const routes: AppRoute[] = [
  { path: "/", element: <Landing /> },
  { path: "/login", element: <AuthPage /> },
  { path: "/register", element: <AuthPage register /> },
  { path: "/verify-email", element: <VerifyEmailPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  { path: "/guide", element: <Guide />, preload: Guide.preload },
  { path: "/:slug", element: <SeoLandingPage />, preload: SeoLandingPage.preload },
  { path: "/docs", element: <DocsIndex />, preload: DocsIndex.preload },
  { path: "/docs/:slug", element: <DocArticlePage />, preload: DocArticlePage.preload },
  { path: "/terms", element: <SiteInfoPage kind="terms" />, preload: SiteInfoPage.preload },
  { path: "/privacy", element: <SiteInfoPage kind="privacy" />, preload: SiteInfoPage.preload },
  { path: "/contact", element: <SiteInfoPage kind="contact" />, preload: SiteInfoPage.preload },
  {
    path: "/developers/muse",
    element: <OpenClawGuide kind="muse" />,
    preload: OpenClawGuide.preload,
  },
  {
    path: "/developers/hermes",
    element: <OpenClawGuide kind="hermes" />,
    preload: OpenClawGuide.preload,
  },
  { path: "/developers/openclaw", element: <OpenClawGuide />, preload: OpenClawGuide.preload },
  { path: "/developers/plugins", element: <PluginProtocol />, preload: PluginProtocol.preload },
  {
    path: "/app/*",
    element: (
      <Suspense fallback={<WorkspaceSkeleton />}>
        <Workspace />
      </Suspense>
    ),
  },
  { path: "*", element: <NotFound /> },
];
function AppRoutes() {
  return useRoutes(routes);
}
function ScrollReset({ initialDocument }: { initialDocument?: DocumentState }) {
  const { pathname, hash, key } = useLocation();
  const handledKey = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    // Ignore StrictMode/reveal replays, but handle returning to an earlier history entry.
    if (handledKey.current === key) return;
    const initial = handledKey.current === undefined;
    if (initial && initialDocument) {
      handledKey.current = key;
      restoreDocumentState(document.getElementById("root")!, initialDocument);
      return;
    }
    // 带 hash 的跳转（例如页头的「如何使用」→ /#how）要滚到目标区块，
    // 而不是回到顶部；目标不在本页时仍回到顶部。
    // 依赖里必须带 location.key：停在 /#how 之后又点一次同一个链接不会改变
    // pathname/hash，只靠这两个值去重会让这次点击什么都不做。
    // Let history traversal finish its native scroll restoration before positioning a new route.
    const frame = requestAnimationFrame(() => {
      handledKey.current = key;
      if (hash) {
        let id = hash.slice(1);
        try {
          id = decodeURIComponent(id);
        } catch {
          // A malformed fragment can still be an exact element ID.
        }
        const target = document.getElementById(id);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
      }
      window.scrollTo(0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, hash, key, initialDocument]);
  return null;
}
function mountApp(initialDocument?: DocumentState, stopInitialTracking?: () => void) {
  // Preserve the existing root when Vite refreshes this module during development.
  const root: Root = import.meta.hot?.data.root ?? createRoot(document.getElementById("root")!);
  if (import.meta.hot) import.meta.hot.data.root = root;
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <PageMetadata />
          <PageViewTracker onReady={stopInitialTracking} />
          <DocumentInputProvider initialDocument={initialDocument}>
            <RouteLoadErrorBoundary>
              <Suspense
                fallback={
                  <div className="full-state" role="status">
                    正在加载页面…
                  </div>
                }
              >
                <ScrollReset initialDocument={initialDocument} />
                <AppRoutes />
              </Suspense>
            </RouteLoadErrorBoundary>
          </DocumentInputProvider>
        </AuthProvider>
      </BrowserRouter>
    </React.StrictMode>,
  );
}

// Keep the usable static document until its route is ready. Other routes stay lazy.
const initialPreload = matchRoutes(routes, window.location)?.at(-1)?.route.preload;
if (
  !import.meta.hot?.data.root &&
  document.getElementById("root")!.hasChildNodes() &&
  initialPreload
) {
  const stopInitialTracking = startInitialPageViewTracking();
  void initialPreload()
    .then(() =>
      mountApp(captureDocumentState(document.getElementById("root")!), stopInitialTracking),
    )
    .catch((error: unknown) => {
      console.error("页面交互加载失败", error);
      const notice = document.createElement("div");
      const container = document.getElementById("root")!;
      container.parentNode!.insertBefore(notice, container);
      createRoot(notice).render(
        <aside className="form-error" role="alert">
          页面交互未能加载，你仍可阅读正文和打开链接。
          <button type="button" className="button secondary small" onClick={reloadPage}>
            重新加载页面
          </button>
        </aside>,
      );
    });
} else {
  // The homepage is already in the entry bundle, but its static reading state still needs handoff.
  const container = document.getElementById("root")!;
  const hasStaticHomepage =
    !import.meta.hot?.data.root && window.location.pathname === "/" && container.hasChildNodes();
  if (hasStaticHomepage) {
    const stopInitialTracking = startInitialPageViewTracking();
    const mountHomepage = () => {
      // DOMContentLoaded precedes the browser's final initial-fragment positioning.
      // Capture interactions first, then restore after that positioning has finished.
      const initialDocument = captureDocumentState(container);
      const untouched =
        initialDocument.x === 0 &&
        initialDocument.y === 0 &&
        !initialDocument.focus &&
        !initialDocument.details.some(({ open }) => open);
      requestAnimationFrame(() =>
        mountApp(
          untouched ? captureDocumentState(container) : initialDocument,
          stopInitialTracking,
        ),
      );
    };
    // The module can execute before other deferred scripts finish loading.
    if (document.readyState === "complete") mountHomepage();
    else document.addEventListener("DOMContentLoaded", mountHomepage, { once: true });
  } else {
    mountApp();
  }
}
