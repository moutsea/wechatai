import { openClawManifest, type OpenClawPlugin } from "./openclaw";
import { hermesManifest, type HermesPlugin } from "./hermes";

export type RemoteAgentKind = "openclaw" | "hermes";
export type RemoteAgentPlugin = OpenClawPlugin | HermesPlugin;
export function isRemoteAgent<T extends { pluginId: string }>(
  p: T | null | undefined,
): p is Extract<T, { pluginId: "wechatai/openclaw" | "wechatai/hermes" }> {
  return p?.pluginId === "wechatai/openclaw" || p?.pluginId === "wechatai/hermes";
}
export const remoteAgentName = (id: string) => (id === "wechatai/hermes" ? "Hermes" : "OpenClaw");
export const remoteAgentManifest = (id: string) =>
  id === "wechatai/hermes" ? hermesManifest : openClawManifest;
