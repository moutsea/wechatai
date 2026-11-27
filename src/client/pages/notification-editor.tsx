import { workspaceError } from "../workspace-copy";
import { useLocale } from "../locale";
import { copy as sourceCopy } from "../../shared/i18n/zh-CN/copy/notification-editor-page";
import { copy as koCopy } from "../../shared/i18n/ko/copy/notification-editor-page";
import { formatCopy } from "../../shared/i18n/dashboard";
import { pluginAvailable } from "../../shared/plugin-access";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Copy, RefreshCw, KeyRound, MessageCircle } from "lucide-react";
import { useApp } from "../context";
import { Modal } from "../ui";
import { json } from "../api";
import { notificationWechatIssue } from "../../shared/wechat-readiness";
import type {
  NotificationInput,
  NotificationPlugin,
  NotificationStatus,
} from "../../shared/notification";

export function NotificationEditor({
  plugin,
  onClose,
  onSaved,
}: {
  plugin: NotificationPlugin | "new";
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { locale } = useLocale();
  const pageCopy = locale === "ko" ? koCopy : sourceCopy;

  const { data, request, refresh, notify, base } = useApp();
  const [form, setForm] = useState<NotificationInput>(
    plugin === "new"
      ? {
          name: pageCopy["消息提醒"],
          connectionId: data?.selectedConnectionId ?? "",
          enabled: true,
        }
      : plugin,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!data) return null;
  const wechatIssue = notificationWechatIssue(
    data.connections.find((c) => c.id === form.connectionId),
  );
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const saved = await request<NotificationPlugin>(
        plugin === "new" ? "/plugins" : `/plugins/${plugin.id}`,
        json({ ...form, pluginId: "wechatai/notification" }, plugin === "new" ? "POST" : "PATCH"),
      );
      await refresh();
      notify(pageCopy["消息提醒配置已保存"]);
      onSaved(saved.id);
    } catch (e) {
      setError(workspaceError(e as Error, locale));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={plugin === "new" ? pageCopy["配置消息提醒"] : pageCopy["编辑消息提醒"]}
      description={pageCopy["把订单、监控告警、脚本运行结果直接推送到微信。"]}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={save}>
        <div className="form-body">
          <label>
            {pageCopy["通知来源名称"]}
            <input
              required
              maxLength={40}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <small>{pageCopy["会显示在微信消息前，例如「订单通知」。"]}</small>
          </label>
          <label>
            {pageCopy["接收微信"]}
            <select
              required
              value={form.connectionId}
              onChange={(e) => setForm({ ...form, connectionId: e.target.value })}
            >
              <option value="" disabled>
                {pageCopy["请选择微信链接"]}
              </option>
              {data.connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.status !== "connected" ? pageCopy["（未连接）"] : ""}
                </option>
              ))}
            </select>
            <small>
              {(wechatIssue ? workspaceError(wechatIssue, locale) : undefined) ??
                pageCopy["接收微信已完成初始化。推送受最近互动后的 24 小时回复窗口限制。"]}{" "}
              {pageCopy["无需配置模型。"]}
              <Link to={`${base}/wechat`}>{pageCopy["管理微信连接"]}</Link>
            </small>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            {pageCopy["启用消息提醒"]}
          </label>
          {plugin === "new" && (
            <div className="notification-setup-hint">
              <KeyRound size={18} aria-hidden="true" />
              <div>
                <strong>{pageCopy["下一步：设置专属 Token"]}</strong>
                <p>
                  {
                    pageCopy[
                      "保存后即可生成，用来授权你的服务向微信推送消息，无需填写模型 API Key。"
                    ]
                  }
                </p>
              </div>
            </div>
          )}
          <p className="form-hint">
            {pageCopy["不消耗 credits，不需要模型 API。停用或更换接收微信，会取消尚未发送的消息。"]}
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose} disabled={busy}>
            {pageCopy["取消"]}
          </button>
          <button className="button" disabled={busy || !form.connectionId}>
            {busy
              ? pageCopy["正在保存…"]
              : plugin === "new"
                ? pageCopy["保存并设置 Token"]
                : pageCopy["保存配置"]}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function NotificationAccess({ plugin }: { plugin: NotificationPlugin }) {
  const { locale } = useLocale();
  const pageCopy = locale === "ko" ? koCopy : sourceCopy;

  const stateLabels = {
    pending: pageCopy["等待发送"],
    sending: pageCopy["正在发送"],
    sent: pageCopy["已发送"],
    failed: pageCopy["发送失败"],
    cancelled: pageCopy["已取消"],
  };

  const { request, refresh, notify, data, base } = useApp();
  const [status, setStatus] = useState<NotificationStatus | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"rotate" | "revoke" | null>(null);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const result = await request<NotificationStatus>(`/plugins/${plugin.id}/notification`, {
        signal,
      });
      if (!signal?.aborted) {
        setStatus(result);
        setError("");
      }
    },
    [request, plugin.id],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((e) => {
      if (!controller.signal.aborted) setError(workspaceError(e, locale));
    });
    return () => controller.abort();
  }, [load, locale]);
  const changeToken = async (operation: "rotate" | "revoke") => {
    setBusy(true);
    setError("");
    setError("");
    setConfirm(null);
    try {
      if (operation === "rotate") {
        const result = await request<{ token: string }>(
          `/plugins/${plugin.id}/notification/token`,
          json({}),
        );
        setToken(result.token);
      } else {
        await request(`/plugins/${plugin.id}/notification/token`, { method: "DELETE" });
        setToken("");
        setStatus((value) => value && { ...value, hasToken: false });
      }
      await Promise.all([load(), refresh()]);
    } catch (e) {
      setError(workspaceError(e as Error, locale));
    } finally {
      setBusy(false);
    }
  };
  const hasToken = Boolean(token || status?.hasToken);
  const connection = data?.connections.find((c) => c.id === plugin.connectionId);
  const wechatIssue = notificationWechatIssue(connection);
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notify(pageCopy["已复制"]);
    } catch {
      notify(pageCopy["复制失败，请手动选择复制"], true);
    }
  };
  const sample = formatCopy(
    pageCopy[
      "curl '{value0}' \\\n  -H 'Authorization: Bearer {value1}' \\\n  -H 'Content-Type: application/json' \\\n  -H 'Idempotency-Key: order-20261010-001' \\\n  -d '{\"title\":\"收款成功\",\"text\":\"订单已支付，金额 ¥9.90\"}'"
    ],
    {
      value0: status?.endpoint ?? "https://wechatai.app/api/notify",
      value1: token || "YOUR_TOKEN",
    },
  );
  return (
    <section className="notification-access">
      {data && (
        <div className="notification-setup-hint" role="status">
          <MessageCircle size={18} aria-hidden="true" />
          <div>
            <strong>
              {pageCopy["接收微信"]}
              {connection ? `「${connection.name}」` : ""}
              {wechatIssue?.code === "wechat_reply_window_expired"
                ? pageCopy["需要更新回复窗口"]
                : wechatIssue
                  ? pageCopy["尚未就绪"]
                  : pageCopy["已完成初始化"]}
            </strong>
            <p>
              {(wechatIssue ? workspaceError(wechatIssue, locale) : undefined) ??
                pageCopy[
                  "已连接并完成首次通信。推送受最近互动后的 24 小时回复窗口限制，是否送达请查看投递结果。"
                ]}
            </p>
            {wechatIssue && <Link to={`${base}/wechat`}>{pageCopy["前往微信连接"]}</Link>}
          </div>
        </div>
      )}
      <section className="notification-token-panel" aria-label={pageCopy["专属 Token"]}>
        <div className="notification-token-heading">
          <h3>
            <KeyRound size={18} aria-hidden="true" />
            {pageCopy["专属 Token"]}
          </h3>
          <span className={`plugin-status ${hasToken ? "configured" : ""}`}>
            {!status ? pageCopy["正在加载"] : hasToken ? pageCopy["已生成"] : pageCopy["待生成"]}
          </span>
        </div>
        <p>
          {token
            ? pageCopy["请立即复制保存。完整 Token 仅在这次生成后显示，关闭弹窗后不再展示。"]
            : hasToken
              ? pageCopy[
                  "已设置推送凭证。完整 Token 仅在生成时显示；如果没有保存，请重置后更新调用方。"
                ]
              : pageCopy[
                  "点击下方按钮，由微伴为这组配置生成专属 Token，用于授权你的服务调用推送接口。接收微信就绪后才能推送。"
                ]}
        </p>
        {token && (
          <div className="notification-token">
            <textarea aria-label={pageCopy["专属 Token"]} readOnly value={token} rows={3} />
            <button className="button secondary small" onClick={() => void copy(token)}>
              <Copy size={14} />
              {pageCopy["复制 Token"]}
            </button>
          </div>
        )}
        <div className="notification-actions">
          <button
            className={`button small ${hasToken ? "secondary" : ""}`}
            disabled={
              busy || !data || !pluginAvailable(data.plan, data.plugins ?? [], plugin.id) || !status
            }
            onClick={() => (hasToken ? setConfirm("rotate") : void changeToken("rotate"))}
          >
            <KeyRound size={14} />
            {busy
              ? pageCopy["正在处理…"]
              : hasToken
                ? pageCopy["重置 Token"]
                : pageCopy["生成专属 Token"]}
          </button>
          {hasToken && (
            <button className="text-link" disabled={busy} onClick={() => setConfirm("revoke")}>
              {pageCopy["撤销 Token"]}
            </button>
          )}
        </div>
        {error && (
          <div className="form-error" role="alert">
            <p>{error}</p>
            {!status && (
              <button
                className="text-link"
                onClick={() => void load().catch((e) => setError(workspaceError(e, locale)))}
              >
                {pageCopy["重新加载 Token 设置"]}
              </button>
            )}
          </div>
        )}
        {confirm && (
          <div className="notification-confirm">
            <p>
              {confirm === "rotate"
                ? pageCopy["重置后旧 Token 立即失效，请同步更新调用方。"]
                : pageCopy["撤销后停止接收请求，并取消尚未发送的消息。"]}
            </p>
            <button
              className="button small"
              disabled={busy}
              onClick={() => void changeToken(confirm)}
            >
              {pageCopy["确认"]}
              {confirm === "rotate" ? pageCopy["重置"] : pageCopy["撤销"]}
            </button>
            <button className="button secondary small" onClick={() => setConfirm(null)}>
              {pageCopy["取消"]}
            </button>
          </div>
        )}
      </section>
      <div className="claw-command-panel">
        <div className="claw-command-heading">
          <strong>{pageCopy["HTTP 推送接口"]}</strong>
          <Link to="/docs/notifications" target="_blank">
            {pageCopy["查看接入文档"]}
          </Link>
        </div>
        <code className="notification-endpoint">
          POST {status?.endpoint ?? pageCopy["正在加载…"]}
        </code>
        <div className="claw-command-heading">
          <strong>{pageCopy["调用示例"]}</strong>
          <button className="text-link" onClick={() => void copy(sample)}>
            <Copy size={14} />
            {pageCopy["复制示例"]}
          </button>
        </div>
        <pre>{sample}</pre>
        <p>
          {
            pageCopy[
              "每个业务事件使用不同的 Idempotency-Key；同一事件重试时保持不变。返回 202 表示已入队，可根据返回的 id 查询是否送达。"
            ]
          }
        </p>
      </div>
      <div className="claw-command-heading">
        <strong>{pageCopy["最近投递 · 近 7 天最多 20 条"]}</strong>
        <button
          className="text-link"
          disabled={busy}
          onClick={() => void load().catch((e) => setError(workspaceError(e, locale)))}
        >
          <RefreshCw size={14} />
          {pageCopy["刷新"]}
        </button>
      </div>
      <ul className="notification-deliveries">
        {status?.deliveries.map((d) => (
          <li key={d.id}>
            <div>
              <strong>{d.title || pageCopy["文字消息"]}</strong>
              <span>{stateLabels[d.state]}</span>
            </div>
            <small>
              {new Date(d.createdAt).toLocaleString(locale === "ko" ? "ko-KR" : "zh-CN")}
              {pageCopy[" · 尝试 "]}
              {d.attempts}
              {pageCopy[" 次"]}
            </small>
            {d.error && <p>{workspaceError(d.error, locale)}</p>}
          </li>
        ))}
      </ul>
      {status && !status.deliveries.length && (
        <p className="form-hint">{pageCopy["暂未收到推送请求。使用上方示例发送第一条通知。"]}</p>
      )}
      <p className="form-hint">
        {
          pageCopy[
            "每个账户每分钟最多 30 条、滚动 24 小时最多 1000 条。失败最多重试 24 小时；配置超出套餐上限时会暂停接收和投递。"
          ]
        }
      </p>
    </section>
  );
}
