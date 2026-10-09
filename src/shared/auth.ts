// Preserve protected deep links without allowing an external post-login redirect.
export function authReturnPath(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/app";
  try {
    const url = new URL(value, "https://wechatai.app");
    return url.pathname === "/app" || url.pathname.startsWith("/app/")
      ? `${url.pathname}${url.search}${url.hash}`
      : "/app";
  } catch {
    return "/app";
  }
}
