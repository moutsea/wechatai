import { useState, type FormEvent } from "react";
import { json } from "../api";
import { useApp } from "../context";
import { Modal } from "../ui";
import {
  GROK_ID,
  GROK_DISPATCH_UNAVAILABLE,
  grokRoutineInstructions,
  type GrokPlugin,
} from "../../shared/grok-bot";
import { PLUGIN_SHORTCUT_PATTERN, PLUGIN_SHORTCUT_HINT } from "../../shared/plugin-shortcut";

export function GrokEditor({
  plugin,
  onClose,
  onSaved,
}: {
  plugin: GrokPlugin | "new";
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { data, request, refresh, notify } = useApp();
  const [saved, setSaved] = useState(plugin === "new" ? null : plugin);
  const [name, setName] = useState(saved?.name ?? "Grok Bot");
  const [shortcut, setShortcut] = useState(saved?.shortcut ?? "grok");
  const [enabled, setEnabled] = useState(saved?.enabled ?? true);
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [token, setToken] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [endpoint, setEndpoint] = useState(
    () => new URL("/api/grok/mcp", window.location.origin).href,
  );
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "请求失败，请重试");
    } finally {
      setBusy(false);
    }
  }
  function save(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      const data = await request<GrokPlugin>(
        saved ? `/plugins/${saved.id}` : "/plugins",
        json(
          {
            pluginId: GROK_ID,
            name,
            shortcut,
            enabled,
            ...(url || key ? { webhookUrl: url, webhookKey: key } : {}),
          },
          saved ? "PATCH" : "POST",
        ),
      );
      setSaved(data);
      setKey("");
      setUrl("");
      if (!data.hasKey) setToken("");
      onSaved(data.id);
      await refresh();
      notify("Grok Bot 配置已保存");
    });
  }
  async function credential(revoke: boolean) {
    if (!saved) return;
    await run(async () => {
      if (revoke) {
        await request(`/plugins/${saved.id}/grok/token`, { method: "DELETE" });
        setToken("");
        setConfirmRevoke(false);
      } else {
        const value = await request<{ token: string; endpoint: string }>(
          `/plugins/${saved.id}/grok/token`,
          json({}),
        );
        setToken(value.token);
        setEndpoint(value.endpoint);
      }
      setSaved({ ...saved, hasKey: !revoke });
      await refresh();
    });
  }
  return (
    <Modal
      title="连接 Grok Bot"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="form-body" onSubmit={save}>
        <p>
          打开你拥有的 Grok Bot，在桌面端为它创建 Webhook Routine，并把以下文字保存为 Routine 指令。
        </p>
        <label>
          Routine 指令
          <textarea readOnly value={grokRoutineInstructions} rows={4} />
        </label>
        <label>
          配置名称
          <input required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          微信快捷名称
          <input
            required
            maxLength={24}
            pattern={PLUGIN_SHORTCUT_PATTERN}
            title={PLUGIN_SHORTCUT_HINT}
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value)}
          />
        </label>
        <label>
          Routine Webhook URL
          <input
            type="url"
            required={!saved || !!key}
            autoComplete="off"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={saved ? "已保存，留空保留" : "粘贴 Routine 中的 POST to 地址"}
          />
        </label>
        <label>
          Webhook key
          <input
            type="password"
            required={!saved || !!url}
            autoComplete="new-password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={saved ? "已加密保存，留空保留" : "粘贴 key，不含 Bearer 前缀"}
          />
        </label>
        {saved && (key || url) && (
          <p>更换 Webhook 会撤销旧连接并关闭未完成任务。保存后请重新配置 MCP 凭据。</p>
        )}
        <label className="check-row">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          启用此配置
        </label>
        <p>
          成功回复按本条消息、随任务发送的历史文字和平台保留的最终回复计收平台
          credits。失败或超时不扣费。
        </p>
        <button className="button" disabled={busy}>
          保存配置
        </button>
      </form>
      {saved && (
        <section className="form-body">
          <h3>让 Bot 把结果回到微信</h3>
          <p>
            在 Grok Bot 的 Connect apps 中添加 Remote HTTPS 自定义连接器，填写下面的地址，并添加
            Authorization 请求头。
          </p>
          <label>
            MCP 服务地址
            <input readOnly value={endpoint} />
          </label>
          {token && (
            <label>
              Authorization 请求头的值（仅显示本次）
              <input
                readOnly
                type="password"
                value={`Bearer ${token}`}
                onFocus={(e) => e.target.select()}
              />
            </label>
          )}
          {token && (
            <button
              className="button secondary"
              onClick={() =>
                void run(async () => {
                  await navigator.clipboard.writeText(`Bearer ${token}`);
                  notify("已复制 Authorization 请求头的值");
                })
              }
              disabled={busy}
            >
              复制请求头的值
            </button>
          )}
          {!saved.hasKey ? (
            <button
              className="button secondary"
              onClick={() => void credential(false)}
              disabled={busy}
            >
              生成 MCP 凭据
            </button>
          ) : (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => (confirmRevoke ? void credential(true) : setConfirmRevoke(true))}
            >
              {confirmRevoke ? "确认撤销凭据并关闭未完成任务" : "撤销 MCP 凭据"}
            </button>
          )}
          <p>
            {data?.grokBotReady ? (
              <>
                保存连接器后，在微信发送 <code>@{saved.shortcut} 回复一句你好</code>{" "}
                验证收发。需要审批时请在 Grok Bot 中处理。
              </>
            ) : (
              GROK_DISPATCH_UNAVAILABLE
            )}
          </p>
        </section>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </Modal>
  );
}
