import { ArrowUpRight, Download } from "lucide-react";
import { Link } from "react-router-dom";
import { connectorUpgradePath, type ConnectorUpdateNotice } from "../shared/connector-update";

import { useLocale } from "./locale";
import { dashboardCopy, formatCopy } from "../shared/i18n/dashboard";

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
  const { locale } = useLocale();
  const copy = dashboardCopy[locale].notices;
  return (
    <article className={`connector-update-notice ${notice.isRead ? "" : "unread"}`}>
      <div className="connector-update-heading">
        <span className="notice-item-icon important">
          <Download size={17} />
        </span>
        <strong>{formatCopy(copy.connectorVersionAvailable, { version: notice.version })}</strong>
        {!notice.isRead && <span className="notice-unread-dot" aria-label={copy.unread} />}
      </div>
      <p>{copy.updateHelp}</p>
      <div className="connector-update-links">
        {notice.connections.map((connection) => (
          <Link
            key={connection.id}
            to={connectorUpgradePath(connection.id, base)}
            onClick={() => {
              onRead();
              onNavigate?.();
            }}
            aria-label={formatCopy(copy.upgradeConnection, {
              name: connection.name,
              shortcut: connection.shortcut,
            })}
          >
            <span>
              <strong>
                {connection.name} <small>@{connection.shortcut}</small>
              </strong>
              <small>
                {connection.currentVersion
                  ? formatCopy(copy.currentVersion, { version: connection.currentVersion })
                  : copy.versionUnknown}
              </small>
            </span>
            <span className="text-link">
              {copy.upgrade} <ArrowUpRight size={15} />
            </span>
          </Link>
        ))}
      </div>
      {!notice.isRead && (
        <button className="text-link connector-update-dismiss" disabled={busy} onClick={onRead}>
          {copy.dismissVersion}
        </button>
      )}
    </article>
  );
}
