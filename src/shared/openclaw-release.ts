import { OPENCLAW_CONNECTOR_VERSION } from "../../integrations/openclaw/version";

export const openClawRelease = {
  version: OPENCLAW_CONNECTOR_VERSION,
  notes: [
    "支持保留原有绑定的独立升级，并在网页显示实际运行版本。",
    "保留工具报错后的有效回答，正确返回 /compact 等原生命令的结果。",
  ],
};

export const connectorVersionPattern = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;

export function compareConnectorVersions(current: string, target: string): number | null {
  if (!connectorVersionPattern.test(current) || !connectorVersionPattern.test(target)) return null;
  const a = current.split(".").map(Number);
  const b = target.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return Math.sign(a[i] - b[i]);
  return 0;
}
