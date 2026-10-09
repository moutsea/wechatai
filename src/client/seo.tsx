import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { getPageSeo, renderSeoHead } from "../shared/seo";

export function PageMetadata() {
  const { pathname } = useLocation();
  useEffect(() => {
    const template = document.createElement("template");
    template.innerHTML = renderSeoHead(getPageSeo(pathname));
    document.head.querySelectorAll("[data-seo]").forEach((node) => node.remove());
    document.head.appendChild(template.content);
  }, [pathname]);
  return null;
}
