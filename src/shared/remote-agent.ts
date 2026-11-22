import { openClawManifest, type OpenClawPlugin } from "./openclaw";
import { hermesManifest, type HermesPlugin } from "./hermes";
import { museManifest, type MusePlugin } from "./muse";
import { grokManifest, type GrokPlugin } from "./grok-bot";

const agents = {
  "wechatai/openclaw": { kind: "openclaw", name: "OpenClaw", manifest: openClawManifest },
  "wechatai/hermes": { kind: "hermes", name: "Hermes", manifest: hermesManifest },
  "wechatai/muse": { kind: "muse", name: "Muse", manifest: museManifest },
  "wechatai/grok": { kind: "grok", name: "Grok Bot", manifest: grokManifest },
} as const;
type RemoteId = keyof typeof agents;
export type RemoteAgentKind = (typeof agents)[RemoteId]["kind"];
export type RemoteAgentPlugin = OpenClawPlugin | HermesPlugin | MusePlugin | GrokPlugin;
export function isRemoteAgentId(id: string): id is RemoteId {
  return Object.hasOwn(agents, id);
}
export function isRemoteAgent<T extends { pluginId: string }>(
  p: T | null | undefined,
): p is Extract<T, { pluginId: RemoteId }> {
  return !!p && isRemoteAgentId(p.pluginId);
}
function agent(id: string) {
  return agents[isRemoteAgentId(id) ? id : "wechatai/openclaw"];
}
export const remoteAgentName = (id: string) => agent(id).name;
export const remoteAgentKind = (id: string) => agent(id).kind;
export const remoteAgentManifest = (id: string) => agent(id).manifest;
