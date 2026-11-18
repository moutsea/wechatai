// The edge serves the installers. Pairing credentials and plugin access state
// come from Go, while commands and release notes must match this deployed edge.
import { z } from "zod";
import { openClawRelease } from "../shared/openclaw-release";
import {
  hermesConnectCommand,
  museConnectCommand,
  openClawConnectCommand,
  openClawUpgradeCommand,
} from "./openclaw-token";

const commands = {
  "plugin.clawPair": openClawConnectCommand,
  "plugin.hermesPair": hermesConnectCommand,
  "plugin.musePair": museConnectCommand,
} as const;
const pairing = z.object({ pairingCode: z.string(), expiresAt: z.number().int() });

export function connectorPresentation(action: string, input: unknown, raw: string, origin: string) {
  if (!Object.hasOwn(commands, action) && action !== "plugin.clawStatus") return raw;
  const result = JSON.parse(raw);
  if (!result.ok) return raw;
  if (action === "plugin.clawStatus") {
    const { id } = z.object({ id: z.string() }).parse(input);
    result.data.connectorUpdate = {
      ...openClawRelease,
      command: openClawUpgradeCommand(origin, id),
    };
  } else {
    const { pairingCode: code, expiresAt } = pairing.parse(result.data);
    result.data = { command: commands[action as keyof typeof commands](origin, code), expiresAt };
  }
  return JSON.stringify(result);
}
