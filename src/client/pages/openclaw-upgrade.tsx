import { workspaceLabel } from "../workspace-copy";
import { useLocale } from "../locale";
import { copy as sourceCopy } from "../../shared/i18n/zh-CN/copy/openclaw-upgrade-page";
import { copy as koCopy } from "../../shared/i18n/ko/copy/openclaw-upgrade-page";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { OpenClawStatus } from "../../shared/openclaw";
import { openClawUpgradeState } from "../remote-agent-status";

export function OpenClawUpgrade({
  status,
  initiallyExpanded = false,
}: {
  status: OpenClawStatus;
  initiallyExpanded?: boolean;
}) {
  const { locale } = useLocale();
  const pageCopy = locale === "ko" ? koCopy : sourceCopy;

  const [copiedAt, setCopiedAt] = useState(0);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const release = status.connectorUpdate;
  if (!release || !status.hasKey) return null;
  const version = openClawUpgradeState(status, undefined, locale);
  const updated = copiedAt > 0 && version.confirmed && (status.versionSeenAt ?? 0) >= copiedAt;
  return (
    <section className="claw-upgrade" aria-label={pageCopy["连接器更新"]}>
      <div className="claw-command-heading">
        <strong>{pageCopy["微伴连接器"]}</strong>
        <span className={`plugin-status ${version.confirmed ? "configured" : ""}`} role="status">
          {updated ? pageCopy["新版连接器已上线"] : version.label}
        </span>
      </div>
      <p className="claw-upgrade-version">
        {pageCopy["最近上报 "]}
        {status.connectorVersion ? `v${status.connectorVersion}` : pageCopy["未提供版本"]}
        <span>
          {pageCopy["本站最新 v"]}
          {release.version}
        </span>
      </p>
      {version.state === "unknown" && (
        <p className="muted">{pageCopy["旧连接器可能不会上报版本，升级后可自动检测。"]}</p>
      )}
      <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
        <summary>{pageCopy["更新说明与升级命令"]}</summary>
        <ul>
          {release.notes.map((note) => (
            <li key={note}>{workspaceLabel(locale, note)}</li>
          ))}
        </ul>
        <div className="claw-command-panel">
          <strong>{pageCopy["在原先连接的电脑或服务器上执行"]}</strong>
          <p>
            {
              pageCopy[
                "保留现有绑定、助手选择和会话，无需重新配对。同一 OpenClaw 下的微伴连接会一起升级。"
              ]
            }
          </p>
          <pre aria-label={pageCopy["OpenClaw 升级命令"]}>{release.command}</pre>
          <button
            type="button"
            className="button small"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(release.command);
                setCopiedAt(Date.now());
                setError("");
              } catch {
                setError(pageCopy["复制失败，请选中上方命令手动复制。"]);
              }
            }}
          >
            {copiedAt ? <Check size={15} /> : <Copy size={15} />}
            {copiedAt ? pageCopy["已复制升级命令"] : pageCopy["复制升级命令"]}
          </button>
          <p>
            {
              pageCopy[
                "请等待任务结束后执行。支持安全重启的 OpenClaw 会等待任务完成；否则需手动重启 Gateway。页面收到新版连接器的心跳后才会确认生效。"
              ]
            }
          </p>
          {copiedAt > 0 && !updated && (
            <p role="status">{pageCopy["等待终端执行和新版连接器上线，状态会自动更新。"]}</p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </details>
    </section>
  );
}
