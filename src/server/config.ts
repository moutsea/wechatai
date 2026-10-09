export const MODEL_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
// Leave time for bookkeeping within the 15-minute Durable Object alarm wall limit.
export const MODEL_TURN_TIMEOUT_MS = 14 * 60 * 1000;
// Cover DNS validation and completion bookkeeping before treating a run as stale.
export const MODEL_RUN_LOCK_MS = MODEL_REQUEST_TIMEOUT_MS + 60 * 1000;

export function secret(env: Env, name: string, required = true): string {
  const value = Reflect.get(env, name);
  if (typeof value === "string" && value.trim()) return value.trim();
  if (required) throw new Error(`Missing server configuration: ${name}`);
  return "";
}
export function publicSiteUrl(env: { APP_URL: string; PUBLIC_SITE_URL?: string }): string {
  return env.PUBLIC_SITE_URL?.trim() || env.APP_URL;
}
export function trustedAppOrigins(env: { APP_URL: string }): string[] {
  const appURL = new URL(env.APP_URL);
  const origins = new Set([appURL.origin]);
  // Only a loopback APP_URL enables local aliases, always on the configured port.
  const localHosts = ["localhost", "127.0.0.1", "[::1]"];
  if (localHosts.includes(appURL.hostname)) {
    for (const hostname of localHosts) {
      const alias = new URL(appURL);
      alias.hostname = hostname;
      origins.add(alias.origin);
    }
  }
  return [...origins];
}
export function numberSetting(value: string, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const fail = (code: string, message: string, status = 400): never => {
  throw new AppError(code, message, status);
};
