import { normalizePath } from "./analytics";

/** 成功状态只能由验证过业务结果的服务端写入。 */
export function isServerFunnelEvent(name: string): name is "verify_done" | "checkout_success" {
  return name === "verify_done" || name === "checkout_success";
}

/** 演示工作台只记录预览入口，模拟操作不进入正式事件统计。 */
export function allowsFunnelEvent(name: string, pathname: string): boolean {
  const path = normalizePath(pathname).toLowerCase();
  return name === "demo_view" || (path !== "/demo" && !path.startsWith("/demo/"));
}
