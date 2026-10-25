import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { browserPageViewReporter } from "./analytics-client";

/**
 * 页面上报的 React 接线。真正的判断逻辑在 `analytics-client.ts`（可测试），
 * 这里只负责把「路由变化 + 可见性变化」翻译成一次上报。
 *
 * 预渲染产物不含本组件效果，爬虫看到的是静态 HTML；上报请求只在浏览器里发生。
 */

export function PageViewTracker() {
  const { pathname, search, hash, key } = useLocation();
  const reporter = browserPageViewReporter();

  useEffect(() => {
    const flush = () =>
      reporter.reportPageView({
        pathname,
        search,
        hash,
        key,
        // 预渲染和后台标签页里打开的链接先不记，等用户真的切到这一页再补记，
        // 避免「开了但没看」被算成浏览。
        visible: document.visibilityState === "visible",
      });
    // 从往返缓存（后退）恢复时不会重新挂载，这时算一次新的浏览。
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
  }, [pathname, search, hash, key, reporter]);

  return null;
}
