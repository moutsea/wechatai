import { compareConnectorVersions } from "../shared/openclaw-release";
import type { OpenClawStatus } from "../shared/openclaw";
import type { PluginAccessIssue } from "../shared/plugin-access";

type Connection = { hasKey: boolean; lastSeen?: number; access?: PluginAccessIssue | null };

const labels = {
  pending: "待连接",
  waiting: "等待上线",
  online: "已连接",
  offline: "已离线",
  paused: "已暂停",
} as const;
const descriptions = {
  pending: "配置已保存，请执行连接命令完成连接",
  waiting: "配对已完成，等待本机渠道上线",
  online: "本机渠道在线，可以在微信中使用",
  offline: "本机渠道离线，请检查 Gateway 是否运行",
  paused: "此配置已暂停，请查看会员与插件设置",
} as const;

export function remoteAgentConnection(connection: Connection, now = Date.now()) {
  const lastSeen = connection.lastSeen ?? 0;
  const state = connection.access
    ? "paused"
    : !connection.hasKey
      ? "pending"
      : !lastSeen
        ? "waiting"
        : lastSeen > now - 60000
          ? "online"
          : "offline";
  return {
    state,
    label: connection.access?.code === "membership_expired" ? "会员到期已暂停" : labels[state],
    description: connection.access?.message ?? descriptions[state],
    connectedBefore: connection.hasKey && lastSeen > 0,
  };
}

export function openClawUpgradeState(status: OpenClawStatus, now = Date.now()) {
  const comparison = compareConnectorVersions(
    status.connectorVersion ?? "",
    status.connectorUpdate?.version ?? "",
  );
  const fresh =
    remoteAgentConnection(status, now).state === "online" &&
    (status.versionSeenAt ?? 0) > now - 60000;
  if (comparison === null) return { state: "unknown", label: "版本待检测", confirmed: false };
  if (comparison < 0) return { state: "outdated", label: "有更新", confirmed: false };
  if (!fresh) return { state: "offline", label: "等待上线确认", confirmed: false };
  return {
    state: "current",
    label: comparison > 0 ? "运行版本高于本站版本" : "已是最新版本",
    confirmed: true,
  };
}
