import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { browserPageViewReporter, type PageViewTarget } from "./analytics-client";

/**
 * 页面上报的 React 接线。真正的判断逻辑在 `analytics-client.ts`（可测试），
 * 这里只负责把「路由变化 + 可见性变化」翻译成一次上报。
 *
 * 预渲染产物不含本组件效果，爬虫看到的是静态 HTML；上报请求只在浏览器里发生。
 */

function observePageViews(location: () => Omit<PageViewTarget, "visible">) {
  const reporter = browserPageViewReporter();
  const flush = () =>
    reporter.reportPageView({
      ...location(),
      // A visible static document is already a visit, even before its route code loads.
      visible: document.visibilityState === "visible",
    });
  const onPageShow = (event: PageTransitionEvent) => {
    if (!event.persisted) return;
    reporter.resetBackForward();
    flush();
  };
  flush();
  document.addEventListener("visibilitychange", flush);
  window.addEventListener("pageshow", onPageShow);
  return () => {
    document.removeEventListener("visibilitychange", flush);
    window.removeEventListener("pageshow", onPageShow);
  };
}

/** Start before route preload; share React Router's initial key to dedupe the handoff. */
export function startInitialPageViewTracking() {
  return observePageViews(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
    key: window.history.state?.key ?? "default",
  }));
}

export function PageViewTracker({ onReady }: { onReady?: () => void }) {
  const { pathname, search, hash, key } = useLocation();

  useEffect(() => {
    const stop = observePageViews(() => ({ pathname, search, hash, key }));
    onReady?.();
    return stop;
  }, [pathname, search, hash, key, onReady]);

  return null;
}
