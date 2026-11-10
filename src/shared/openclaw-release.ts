import { OPENCLAW_CONNECTOR_VERSION } from "../../integrations/openclaw/version";

export const openClawRelease = {
  version: OPENCLAW_CONNECTOR_VERSION,
  notes: [
    "会员到期或插件超出名额时，连接状态和日志明确说明暂停原因及恢复方式。",
    "保留原有绑定，权益恢复后自动重试连接。",
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
