export type ConnectorUpdateNotice = {
  version: string;
  createdAt: number;
  isRead: boolean;
  connections: {
    id: string;
    name: string;
    shortcut: string;
    currentVersion: string | null;
  }[];
};

export const connectorUpgradePath = (id: string, base = "/app") =>
  `${base}/plugins?upgrade=${encodeURIComponent(id)}`;

export type ConnectorUpdateReadState = Pick<
  ConnectorUpdateNotice,
  "version" | "createdAt" | "isRead"
>;
