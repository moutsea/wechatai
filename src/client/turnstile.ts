import type { AuthEmailAction } from "../shared/auth";

type WidgetOptions = {
  sitekey: string;
  action: AuthEmailAction;
  size: "flexible";
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
  "timeout-callback": () => void;
};
type Turnstile = {
  render(container: HTMLElement, options: WidgetOptions): string;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let loading: Promise<Turnstile> | undefined;

export function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => {
      window.clearTimeout(timeout);
      loading = undefined;
      script.remove();
      reject(new Error("Turnstile failed to load"));
    };
    const timeout = window.setTimeout(fail, 15000);
    script.async = true;
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.onerror = fail;
    script.onload = () => {
      window.clearTimeout(timeout);
      if (window.turnstile) resolve(window.turnstile);
      else fail();
    };
    document.head.appendChild(script);
  });
  return loading;
}
