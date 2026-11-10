import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { reloadPage } from "./load-error-boundary";

function showPendingMetadata() {
  document.head.querySelectorAll("[data-seo]").forEach((node) => node.remove());
  const title = document.createElement("title");
  title.setAttribute("data-seo", "");
  title.textContent = "页面信息暂不可用";
  const robots = document.createElement("meta");
  robots.setAttribute("data-seo", "");
  robots.name = "robots";
  robots.content = "noindex, follow";
  document.head.appendChild(title);
  document.head.appendChild(robots);
}

export function PageMetadata() {
  const { pathname } = useLocation();
  const path = pathname.replace(/\/+$/, "") || "/";
  const [failedPath, setFailedPath] = useState<string | null>(null);
  useEffect(() => {
    setFailedPath(null);
    const canonical = document.head.querySelector<HTMLLinkElement>(
      'link[data-seo][rel="canonical"]',
    );
    if (canonical && new URL(canonical.href).pathname === path) return;
    let active = true;
    // Until the current route's metadata is available, never retain another page's canonical.
    showPendingMetadata();
    void import("../shared/seo")
      .then(({ getPageSeo, renderSeoHead }) => {
        if (!active) return;
        const template = document.createElement("template");
        template.innerHTML = renderSeoHead(getPageSeo(pathname));
        document.head.querySelectorAll("[data-seo]").forEach((node) => node.remove());
        document.head.appendChild(template.content);
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error("页面元数据加载失败", error);
        setFailedPath(path);
      });
    return () => {
      active = false;
    };
  }, [pathname, path]);
  if (failedPath !== path) return null;
  return (
    <aside className="form-error" role="alert">
      页面信息未能加载，请重新加载以恢复。
      <button type="button" className="button secondary small" onClick={reloadPage}>
        重新加载页面
      </button>
    </aside>
  );
}
