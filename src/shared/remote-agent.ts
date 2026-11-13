import { openClawManifest, type OpenClawPlugin } from "./openclaw";
import { hermesManifest, type HermesPlugin } from "./hermes";
import { museManifest, type MusePlugin } from "./muse";

export type RemoteAgentKind = "openclaw" | "hermes" | "muse";
export type RemoteAgentPlugin = OpenClawPlugin | HermesPlugin | MusePlugin;
export function isRemoteAgent<T extends { pluginId: string }>(
  p: T | null | undefined,
): p is Extract<T, { pluginId: "wechatai/openclaw" | "wechatai/hermes" | "wechatai/muse" }> {
  return (
    p?.pluginId === "wechatai/openclaw" ||
    p?.pluginId === "wechatai/hermes" ||
    p?.pluginId === "wechatai/muse"
  );
}
export const remoteAgentName = (id: string) =>
  id === "wechatai/muse" ? "Muse" : id === "wechatai/hermes" ? "Hermes" : "OpenClaw";
export const remoteAgentKind = (id: string): RemoteAgentKind =>
  id === "wechatai/muse" ? "muse" : id === "wechatai/hermes" ? "hermes" : "openclaw";
export const remoteAgentManifest = (id: string) =>
  id === "wechatai/muse"
    ? museManifest
    : id === "wechatai/hermes"
      ? hermesManifest
      : openClawManifest;
