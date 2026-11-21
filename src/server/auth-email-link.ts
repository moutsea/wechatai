// Keep bearer tokens in the email fragment until a same-origin form POST.
// Only these two Better Auth GET handlers may be reached through the form.
export const emailLinkPath = "/api/auth/email-link";

function isEmailAction(url: URL) {
  return (
    (url.pathname === "/api/auth/verify-email" && !!url.searchParams.get("token")) ||
    /^\/api\/auth\/reset-password\/[A-Za-z0-9_-]+$/.test(url.pathname)
  );
}

export function privateEmailLink(target: URL) {
  if (!isEmailAction(target)) throw new Error("Invalid authentication email action");
  const entry = new URL(emailLinkPath, target.origin);
  entry.hash = new URLSearchParams({ link: target.pathname + target.search }).toString();
  return entry.href;
}

export function emailLinkPage() {
  const nonce = crypto.randomUUID();
  return new Response(
    `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>处理邮件链接</title>
<main><p id="status">请使用邮件中的完整链接继续。</p>
<form method="post" action="${emailLinkPath}"><input type="hidden" name="link"><button hidden>继续</button></form>
<noscript>请在浏览器中启用 JavaScript，再重新打开邮件链接。</noscript></main>
<script nonce="${nonce}">
const link = new URLSearchParams(location.hash.slice(1)).get("link");
if (link) {
  const form = document.forms[0];
  form.elements.namedItem("link").value = link;
  history.replaceState(null, "", location.pathname);
  document.getElementById("status").textContent = "正在处理邮件链接…";
  form.querySelector("button").hidden = false;
  form.requestSubmit();
}
</script></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "same-origin",
        "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
      },
    },
  );
}

export async function emailActionRequest(
  request: Request,
  appUrl: string,
): Promise<Request | null> {
  const origin = new URL(appUrl).origin;
  if (
    request.headers.get("origin") !== origin ||
    request.headers.get("content-type")?.split(";")[0].trim() !==
      "application/x-www-form-urlencoded"
  )
    return null;
  const path = new URLSearchParams(await request.text()).get("link");
  if (!path?.startsWith("/api/auth/") || path.length > 8192) return null;
  const target = URL.parse(path, origin);
  if (!target || target.origin !== origin || target.hash || !isEmailAction(target)) return null;
  const callback = target.searchParams.get("callbackURL");
  if (callback && URL.parse(callback, origin)?.origin !== origin) return null;
  const headers = new Headers(request.headers);
  headers.delete("content-type");
  headers.delete("content-length");
  return new Request(target.href, { headers });
}

export function privateAuthResponse(response: Response, request: Request) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Referrer-Policy", "no-referrer");
  if (response.status >= 500) {
    const requestId = crypto.randomUUID();
    headers.set("X-Request-Id", requestId);
    console.error(
      JSON.stringify({
        event: "auth.handler_error",
        route: "/api/auth/*",
        status: response.status,
        requestId,
      }),
    );
  }
  const location = headers.get("location");
  if (location && new URL(request.url).pathname.startsWith("/api/auth/reset-password/")) {
    const target = new URL(location, request.url);
    const token = target.searchParams.get("token");
    if (token && target.origin === new URL(request.url).origin) {
      target.searchParams.delete("token");
      target.hash = new URLSearchParams({ token }).toString();
      headers.set("location", target.href);
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
