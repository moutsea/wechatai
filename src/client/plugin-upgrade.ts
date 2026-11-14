import type { UserPlugin } from "../shared/image-generation";
import { pluginIconSource } from "../shared/plugin-visuals";

export type PluginUpgradeTarget = { kind: UserPlugin["pluginId"] } & (
  | { action: "create" }
  | { action: "edit"; id: string }
);

export function isPluginKind(value: string | null): value is UserPlugin["pluginId"] {
  return !!value && !!pluginIconSource(value);
}

const storageKey = (email: string) => `wechatai:plugin-upgrade:${email}`;

export function rememberPluginUpgrade(email: string, target: PluginUpgradeTarget) {
  try {
    sessionStorage.setItem(storageKey(email), JSON.stringify(target));
  } catch {
    // 购买不依赖浏览器存储；存储不可用时仍可从插件页继续配置。
  }
}

export function pluginUpgradeReturnPath(email: string): string | null {
  try {
    const target = JSON.parse(sessionStorage.getItem(storageKey(email)) ?? "null");
    if (
      !target ||
      !isPluginKind(target.kind) ||
      (target.action !== "create" && target.action !== "edit") ||
      (target.action === "edit" && typeof target.id !== "string")
    )
      return null;
    const params = new URLSearchParams({ plugin: target.kind, action: target.action });
    if (target.action === "edit") params.set("config", target.id);
    return `/app/plugins?${params}`;
  } catch {
    return null;
  }
}

export function clearPluginUpgrade(email: string) {
  try {
    sessionStorage.removeItem(storageKey(email));
  } catch {
    // 不影响返回插件页。
  }
}
