import { normalizePath } from "./analytics";

/** 演示工作台只记录预览入口，模拟操作不进入正式事件统计。 */
export function allowsFunnelEvent(name: string, pathname: string): boolean {
  const path = normalizePath(pathname).toLowerCase();
  return name === "demo_view" || (path !== "/demo" && !path.startsWith("/demo/"));
}
