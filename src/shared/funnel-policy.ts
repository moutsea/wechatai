/** 成功状态只能由验证过业务结果的服务端写入。 */
export function isServerFunnelEvent(name: string): name is "verify_done" | "checkout_success" {
  return name === "verify_done" || name === "checkout_success";
}
