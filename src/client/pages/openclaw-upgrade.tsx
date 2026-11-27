import { useWorkspaceText } from "../workspace-copy";
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
  const copyText = useWorkspaceText();
  const [copiedAt, setCopiedAt] = useState(0);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const release = status.connectorUpdate;
  if (!release || !status.hasKey) return null;
  const version = openClawUpgradeState(status);
  const updated = copiedAt > 0 && version.confirmed && (status.versionSeenAt ?? 0) >= copiedAt;
  return (
    <section className="claw-upgrade" aria-label={copyText("连接器更新")}>
      <div className="claw-command-heading">
        <strong>{copyText("微伴连接器")}</strong>
        <span className={`plugin-status ${version.confirmed ? "configured" : ""}`} role="status">
          {updated ? copyText("新版连接器已上线") : copyText(version.label)}
        </span>
      </div>
      <p className="claw-upgrade-version">
        {copyText("最近上报 ")}
        {status.connectorVersion ? `v${status.connectorVersion}` : copyText("未提供版本")}
        <span>
          {copyText("本站最新 v")}
          {release.version}
        </span>
      </p>
      {version.state === "unknown" && (
        <p className="muted">{copyText("旧连接器可能不会上报版本，升级后可自动检测。")}</p>
      )}
      <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
        <summary>{copyText("更新说明与升级命令")}</summary>
        <ul>
          {release.notes.map((note) => (
            <li key={note}>{copyText(note)}</li>
          ))}
        </ul>
        <div className="claw-command-panel">
          <strong>{copyText("在原先连接的电脑或服务器上执行")}</strong>
          <p>
            {copyText(
              "保留现有绑定、助手选择和会话，无需重新配对。同一 OpenClaw 下的微伴连接会一起升级。",
            )}
          </p>
          <pre aria-label={copyText("OpenClaw 升级命令")}>{release.command}</pre>
          <button
            type="button"
            className="button small"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(release.command);
                setCopiedAt(Date.now());
                setError("");
              } catch {
                setError(copyText("复制失败，请选中上方命令手动复制。"));
              }
            }}
          >
            {copiedAt ? <Check size={15} /> : <Copy size={15} />}
            {copiedAt ? copyText("已复制升级命令") : copyText("复制升级命令")}
          </button>
          <p>
            {copyText(
              "请等待任务结束后执行。支持安全重启的 OpenClaw 会等待任务完成；否则需手动重启 Gateway。页面收到新版连接器的心跳后才会确认生效。",
            )}
          </p>
          {copiedAt > 0 && !updated && (
            <p role="status">{copyText("等待终端执行和新版连接器上线，状态会自动更新。")}</p>
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
