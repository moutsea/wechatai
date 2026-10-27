import { pluginAvailable } from "../../shared/plugin-access";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Copy, RefreshCw, KeyRound } from "lucide-react";
import { useApp } from "../context";
import { Modal } from "../ui";
import { json } from "../api";
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
  const { data, request, refresh, notify, base } = useApp();
  const [form, setForm] = useState<NotificationInput>(
    plugin === "new"
      ? { name: "消息提醒", connectionId: data?.selectedConnectionId ?? "", enabled: true }
      : plugin,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!data) return null;
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
      notify("配置已保存，生成专属 Token 后即可接收推送");
      onSaved(saved.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={plugin === "new" ? "配置消息提醒" : "编辑消息提醒"}
      description="把订单、监控告警、脚本运行结果直接推送到微信。"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={save}>
        <div className="form-body">
          <label>
            通知来源名称
            <input
              required
              maxLength={40}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <small>会显示在微信消息前，例如「订单通知」。</small>
          </label>
          <label>
            接收微信
            <select
              required
              value={form.connectionId}
              onChange={(e) => setForm({ ...form, connectionId: e.target.value })}
            >
              <option value="" disabled>
                请选择微信链接
              </option>
              {data.connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.status !== "connected" ? "（未连接）" : ""}
                </option>
              ))}
            </select>
            <small>
              先在<Link to={`${base}/wechat`}>微信连接</Link>中扫码，再向对应微信对话发送一条消息。
            </small>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            启用消息提醒
          </label>
          {plugin === "new" && (
            <div className="notification-setup-hint">
              <KeyRound size={18} aria-hidden="true" />
              <div>
                <strong>下一步：设置专属 Token</strong>
                <p>保存后即可生成，用来授权你的服务向微信推送消息，无需填写模型 API Key。</p>
              </div>
            </div>
          )}
          <p className="form-hint">
            不消耗 credits，不需要模型 API。停用或更换接收微信，会取消尚未发送的消息。
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button className="button" disabled={busy || !form.connectionId}>
            {busy ? "正在保存…" : plugin === "new" ? "保存并设置 Token" : "保存配置"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const stateLabels = {
  pending: "等待发送",
  sending: "正在发送",
  sent: "已发送",
  failed: "发送失败",
  cancelled: "已取消",
};
export function NotificationAccess({ plugin }: { plugin: NotificationPlugin }) {
  const { request, refresh, notify, data } = useApp();
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
      if (!controller.signal.aborted) setError(e.message);
    });
    return () => controller.abort();
  }, [load]);
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
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const hasToken = Boolean(token || status?.hasToken);
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notify("已复制");
    } catch {
      notify("复制失败，请手动选择复制", true);
    }
  };
  const sample = `curl '${status?.endpoint ?? "https://wechatai.app/api/notify"}' \\\n  -H 'Authorization: Bearer ${token || "YOUR_TOKEN"}' \\\n  -H 'Content-Type: application/json' \\\n  -H 'Idempotency-Key: order-20261010-001' \\\n  -d '{"title":"收款成功","text":"订单已支付，金额 ¥9.90"}'`;
  return (
    <section className="notification-access">
      <section className="notification-token-panel" aria-label="专属 Token">
        <div className="notification-token-heading">
          <h3>
            <KeyRound size={18} aria-hidden="true" />
            专属 Token
          </h3>
          <span className={`plugin-status ${hasToken ? "configured" : ""}`}>
            {!status ? "正在加载" : hasToken ? "已生成" : "待生成"}
          </span>
        </div>
        <p>
          {token
            ? "请立即复制保存。完整 Token 仅在这次生成后显示，关闭弹窗后不再展示。"
            : hasToken
              ? "已设置推送凭证。完整 Token 仅在生成时显示；如果没有保存，请重置后更新调用方。"
              : "点击下方按钮，由微伴为这组配置生成专属 Token。将它填入你的服务端，即可向所选微信推送消息。"}
        </p>
        {token && (
          <div className="notification-token">
            <textarea aria-label="专属 Token" readOnly value={token} rows={3} />
            <button className="button secondary small" onClick={() => void copy(token)}>
              <Copy size={14} />
              复制 Token
            </button>
          </div>
        )}
        <div className="notification-actions">
          <button
            className={`button small ${hasToken ? "secondary" : ""}`}
            disabled={
              busy ||
              !data ||
              !pluginAvailable(data.plan, data.plugins ?? [], plugin.id) ||
              !status
            }
            onClick={() => (hasToken ? setConfirm("rotate") : void changeToken("rotate"))}
          >
            <KeyRound size={14} />
            {busy ? "正在处理…" : hasToken ? "重置 Token" : "生成专属 Token"}
          </button>
          {hasToken && (
            <button className="text-link" disabled={busy} onClick={() => setConfirm("revoke")}>
              撤销 Token
            </button>
          )}
        </div>
        {error && (
          <div className="form-error" role="alert">
            <p>{error}</p>
            {!status && (
              <button
                className="text-link"
                onClick={() => void load().catch((e) => setError(e.message))}
              >
                重新加载 Token 设置
              </button>
            )}
          </div>
        )}
        {confirm && (
          <div className="notification-confirm">
            <p>
              {confirm === "rotate"
                ? "重置后旧 Token 立即失效，请同步更新调用方。"
                : "撤销后停止接收请求，并取消尚未发送的消息。"}
            </p>
            <button
              className="button small"
              disabled={busy}
              onClick={() => void changeToken(confirm)}
            >
              确认{confirm === "rotate" ? "重置" : "撤销"}
            </button>
            <button className="button secondary small" onClick={() => setConfirm(null)}>
              取消
            </button>
          </div>
        )}
      </section>
      <div className="claw-command-panel">
        <div className="claw-command-heading">
          <strong>HTTP 推送接口</strong>
          <Link to="/docs/notifications" target="_blank">
            查看接入文档
          </Link>
        </div>
        <code className="notification-endpoint">POST {status?.endpoint ?? "正在加载…"}</code>
        <div className="claw-command-heading">
          <strong>调用示例</strong>
          <button className="text-link" onClick={() => void copy(sample)}>
            <Copy size={14} />
            复制示例
          </button>
        </div>
        <pre>{sample}</pre>
        <p>
          每个业务事件使用不同的 Idempotency-Key；同一事件重试时保持不变。返回 202
          表示已入队，可根据返回的 id 查询是否送达。
        </p>
      </div>
      <div className="claw-command-heading">
        <strong>最近投递 · 近 7 天最多 20 条</strong>
        <button
          className="text-link"
          disabled={busy}
          onClick={() => void load().catch((e) => setError(e.message))}
        >
          <RefreshCw size={14} />
          刷新
        </button>
      </div>
      <ul className="notification-deliveries">
        {status?.deliveries.map((d) => (
          <li key={d.id}>
            <div>
              <strong>{d.title || "文字消息"}</strong>
              <span>{stateLabels[d.state]}</span>
            </div>
            <small>
              {new Date(d.createdAt).toLocaleString("zh-CN")} · 尝试 {d.attempts} 次
            </small>
            {d.error && <p>{d.error}</p>}
          </li>
        ))}
      </ul>
      {status && !status.deliveries.length && (
        <p className="form-hint">暂未收到推送请求。使用上方示例发送第一条通知。</p>
      )}
      <p className="form-hint">
        每个账户每分钟最多 30 条、滚动 24 小时最多 1000 条。失败最多重试 24
        小时；配置超出套餐上限时会暂停接收和投递。
      </p>
    </section>
  );
}
