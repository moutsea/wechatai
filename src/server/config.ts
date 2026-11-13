import type { CloudAgentClientConfig } from "./cloud-agent-client";

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

/** Server-only AGT settings. Task execution persists its own configuration snapshot. */
export type CloudAgentConfig = CloudAgentClientConfig & {
  workspacePrefix: string;
  maxActive: number;
  dailyLimit: number;
  deadlineMs: number;
};

export function cloudAgentAdminOnly(env: Env) {
  return secret(env, "CLOUD_AGENT_ENABLED", false).toLowerCase() === "admin";
}

/** The service can run in public or admin-only mode; account access is checked separately. */
export function cloudAgentEnabled(env: Env) {
  return ["1", "true", "admin"].includes(secret(env, "CLOUD_AGENT_ENABLED", false).toLowerCase());
}

/** Recovery needs current credentials for the same scope, not new-task defaults. */
export function cloudAgentConnectionConfig(
  env: Env,
): Pick<CloudAgentClientConfig, "origin" | "appId" | "appKey" | "tenantId"> | null {
  const origin = secret(env, "AGT_ORIGIN", false).replace(/\/+$/, "");
  const appId = secret(env, "AGT_APP_ID", false);
  const appKey = secret(env, "AGT_APP_KEY", false);
  const tenantId = secret(env, "AGT_TENANT_ID", false);
  if (!origin || !appId || !appKey || !tenantId) return null;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return null;
  }
  // Same origin contract as CloudAgentClient: TLS, with HTTP only on loopback.
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) return null;
  if (parsed.origin !== origin) return null;
  if (![appId, tenantId].every((id) => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id))) return null;
  return { origin, appId, appKey, tenantId };
}

/** Admission of new tasks requires the gate and all operator defaults to be valid. */
export function cloudAgentConfig(env: Env, isAdmin = false): CloudAgentConfig | null {
  if (!cloudAgentEnabled(env) || (cloudAgentAdminOnly(env) && !isAdmin)) return null;
  const connection = cloudAgentConnectionConfig(env);
  if (!connection) return null;
  const agentId = `${secret(env, "AGT_AGENT_ID", false) || "wechatai"}-v3`;
  const workspacePrefix = secret(env, "AGT_WORKSPACE_PREFIX", false) || "wechatai";
  // AGT profile IDs are at most 64 characters. Workspace names allow 120;
  // leave room for the separator and 32-character account suffix used by the runtime.
  if (!/^[a-z][a-z0-9._-]{0,63}$/.test(agentId)) return null;
  if (!/^[a-zA-Z0-9_-]{1,87}$/.test(workspacePrefix)) return null;
  return {
    ...connection,
    agentId,
    workspacePrefix,
    // Includes submissions whose upstream acceptance has not yet been confirmed.
    maxActive: 1,
    dailyLimit: Math.min(
      1000,
      Math.max(
        1,
        Math.floor(numberSetting(secret(env, "CLOUD_AGENT_DAILY_LIMIT", false) || "30", 30)),
      ),
    ),
    deadlineMs:
      Math.min(
        30,
        Math.max(1, numberSetting(secret(env, "CLOUD_AGENT_DEADLINE_MINUTES", false) || "10", 10)),
      ) * 60_000,
  };
}

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public upstreamStatus?: number,
  ) {
    super(message);
  }
}
export const fail = (code: string, message: string, status = 400): never => {
  throw new AppError(code, message, status);
};
