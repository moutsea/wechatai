import { ArrowUpRight, Download } from "lucide-react";
import { Link } from "react-router-dom";
import { connectorUpgradePath, type ConnectorUpdateNotice } from "../shared/connector-update";

export function ConnectorUpdateCard({
  notice,
  base,
  onRead,
  onNavigate,
  busy = false,
}: {
  notice: ConnectorUpdateNotice;
  base: string;
  onRead: () => void;
  onNavigate?: () => void;
  busy?: boolean;
}) {
  return (
    <article className={`connector-update-notice ${notice.isRead ? "" : "unread"}`}>
      <div className="connector-update-heading">
        <span className="notice-item-icon important">
          <Download size={17} />
        </span>
        <strong>OpenClaw 连接器 v{notice.version} 可升级</strong>
        {!notice.isRead && <span className="notice-unread-dot" aria-label="未读" />}
      </div>
      <p>更新连接器，获得最新修复。保留现有绑定和会话，无需重新配对。</p>
      <div className="connector-update-links">
        {notice.connections.map((connection) => (
          <Link
            key={connection.id}
            to={connectorUpgradePath(connection.id, base)}
            onClick={() => {
              onRead();
              onNavigate?.();
            }}
            aria-label={`升级 ${connection.name}（@${connection.shortcut}）`}
          >
            <span>
              <strong>
                {connection.name} <small>@{connection.shortcut}</small>
              </strong>
              <small>
                {connection.currentVersion
                  ? `当前 v${connection.currentVersion}`
                  : "尚未上报版本，可检查并升级"}
              </small>
            </span>
            <span className="text-link">
              去升级 <ArrowUpRight size={15} />
            </span>
          </Link>
        ))}
      </div>
      {!notice.isRead && (
        <button className="text-link connector-update-dismiss" disabled={busy} onClick={onRead}>
          不再提醒此版本
        </button>
      )}
    </article>
  );
}
