import { authReturnPath } from "../shared/auth";

const storageKey = (email: string) => `wechatai:billing-return:${email}`;

/** Stripe can reuse an older checkout whose return URL is still /app/billing. */
export function rememberBillingReturn(email: string, path: string) {
  try {
    if (new URL(path, window.location.origin).pathname !== "/es/app/billing") return;
    if (authReturnPath(path) !== path) return;
    sessionStorage.setItem(storageKey(email), path);
  } catch {
    // Billing remains available when browser storage is disabled.
  }
}

/** Consume this tab's return intent only when its account reaches billing again. */
export function takeBillingReturn(email: string, path: string): string | null {
  try {
    const current = new URL(path, window.location.origin);
    if (current.pathname !== "/app/billing" && current.pathname !== "/es/app/billing") return null;
    const saved = sessionStorage.getItem(storageKey(email));
    if (!saved) return null;
    sessionStorage.removeItem(storageKey(email));
    if (authReturnPath(saved) !== saved) return null;
    const target = new URL(saved, window.location.origin);
    if (target.pathname !== "/es/app/billing") return null;
    for (const [key, value] of current.searchParams) target.searchParams.set(key, value);
    if (current.hash) target.hash = current.hash;
    const result = target.pathname + target.search + target.hash;
    return result === path ? null : result;
  } catch {
    return null;
  }
}
