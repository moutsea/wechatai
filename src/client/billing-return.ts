import { localizedPath, splitLocalePath } from "../shared/i18n";

const storageKey = (email: string) => `wechatai:billing-return:${email}`;

export function rememberBillingReturn(email: string, base: string) {
  try {
    sessionStorage.setItem(storageKey(email), base);
  } catch {
    // Match plugin upgrade persistence when browser storage is unavailable.
  }
}

export function billingReturnPath(email: string): string | null {
  try {
    const base = sessionStorage.getItem(storageKey(email));
    if (base === "/app") return "/app/billing";
    const locale = splitLocalePath(base ?? "")?.locale;
    // Accept only exact workspace bases that support localized billing routes.
    if ((locale === "pt" || locale === "ko") && base === localizedPath(locale, "/app"))
      return localizedPath(locale, "/app/billing");
  } catch {
    // The canonical Stripe return remains usable without saved intent.
  }
  return null;
}

export function clearBillingReturn(email: string) {
  try {
    sessionStorage.removeItem(storageKey(email));
  } catch {
    // Clearing a navigation hint must not interrupt billing.
  }
}
