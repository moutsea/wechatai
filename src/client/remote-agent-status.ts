type Connection = { hasKey: boolean; lastSeen?: number };

const labels = {
  pending: "待连接",
  waiting: "等待上线",
  online: "已连接",
  offline: "已离线",
} as const;
const descriptions = {
  pending: "配置已保存，请执行连接命令完成连接",
  waiting: "配对已完成，等待本机渠道上线",
  online: "本机渠道在线，可以在微信中使用",
  offline: "本机渠道离线，请检查 Gateway 是否运行",
} as const;

export function remoteAgentConnection(connection: Connection, now = Date.now()) {
  const lastSeen = connection.lastSeen ?? 0;
  const state = !connection.hasKey
    ? "pending"
    : !lastSeen
      ? "waiting"
      : lastSeen > now - 60000
        ? "online"
        : "offline";
  return {
    state,
    label: labels[state],
    description: descriptions[state],
    connectedBefore: connection.hasKey && lastSeen > 0,
  };
}
