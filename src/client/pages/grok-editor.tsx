import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, Check, Copy, LoaderCircle } from "lucide-react";
import { json } from "../api";
import { useApp } from "../context";
import { Modal } from "../ui";
import {
  GROK_ID,
  GROK_DISPATCH_UNAVAILABLE,
  GROK_SETUP_MINUTES,
  GROK_WAITING_MESSAGE,
  grokRoutineInstructions,
  grokSetupPrompt,
  type GrokPlugin,
} from "../../shared/grok-bot";
import { PLUGIN_SHORTCUT_PATTERN, PLUGIN_SHORTCUT_HINT } from "../../shared/plugin-shortcut";
import { remoteAgentConnection } from "../remote-agent-status";
import { WaitingMessageField } from "./waiting-message-field";
import { waitingMessageDefaults, type WaitingMessageSettings } from "../../shared/waiting-message";

type GrokStatus = {
  hasKey: boolean;
  lastSeen: number;
  webhookReady: boolean;
  setupPending: boolean;
};
type Setup = { prompt: string; token: string; until: number };

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
  const [waiting, setWaiting] = useState<WaitingMessageSettings>(() =>
    saved
      ? { waitingMessageEnabled: saved.waitingMessageEnabled, waitingMessage: saved.waitingMessage }
      : waitingMessageDefaults(GROK_WAITING_MESSAGE),
  );
  const [setup, setSetup] = useState<Setup | null>(null);
  const [copied, setCopied] = useState("");
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [endpoint, setEndpoint] = useState(
    () => new URL("/api/grok/mcp", window.location.origin).href,
  );
  const helpers = useRef({ request, refresh, notify, onSaved });
  helpers.current = { request, refresh, notify, onSaved };
  const id = saved?.id;
  const ready = !!data?.grokBotReady;
  // While a prompt is outstanding, watch for the Bot to register its Webhook.
  useEffect(() => {
    if (!id || !setup) return;
    const pluginId = id;
    const until = setup.until;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const state = await helpers.current.request<GrokStatus>(`/plugins/${pluginId}/grok/status`);
        if (stopped) return;
        setSaved((p) => (p ? { ...p, ...state } : p));
        if (state.hasKey && state.webhookReady && !state.setupPending && Date.now() < until) {
          stopped = true;
          setSetup(null);
          helpers.current.notify("Grok Bot 已完成配置，可以去微信测试了");
          void helpers.current.refresh();
          helpers.current.onSaved(pluginId);
        }
      } catch {
        // The next poll retries; the countdown shows when the prompt expires.
      } finally {
        if (!stopped && Date.now() < until) timer = setTimeout(() => void poll(), 3000);
      }
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id, setup]);
  useEffect(() => {
    if (!setup) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [setup]);
  const secondsLeft = setup ? Math.max(0, Math.ceil((setup.until - now) / 1000)) : 0;
  const connection = remoteAgentConnection({ ...(saved ?? { hasKey: false }), pluginId: GROK_ID });
  const configured = !!saved?.hasKey && saved.webhookReady !== false;
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
  async function persist(extra: Record<string, unknown> = {}) {
    const p = await request<GrokPlugin>(
      saved ? `/plugins/${saved.id}` : "/plugins",
      json(
        { pluginId: GROK_ID, name, shortcut, enabled, ...waiting, ...extra },
        saved ? "PATCH" : "POST",
      ),
    );
    setSaved(p);
    onSaved(p.id);
    return p;
  }
  function save(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      const p = await persist(url || key ? { webhookUrl: url, webhookKey: key } : {});
      setUrl("");
      setKey("");
      if (!p.hasKey) setSetup(null);
      await refresh();
      notify("Grok Bot 配置已保存");
    });
  }
  function generate() {
    void run(async () => {
      setEnabled(true);
      const p = await persist({ enabled: true });
      const value = await request<{ token: string; endpoint: string; setupUntil: number }>(
        `/plugins/${p.id}/grok/token`,
        json({}),
      );
      setEndpoint(value.endpoint);
      setSetup({
        token: value.token,
        until: value.setupUntil,
        prompt: grokSetupPrompt({
          endpoint: value.endpoint,
          token: value.token,
          shortcut: p.shortcut,
        }),
      });
      setSaved({ ...p, hasKey: true, setupPending: true });
      setCopied("");
      setConfirmRevoke(false);
      setNow(Date.now());
      await refresh();
    });
  }
  function copy(text: string, label: string) {
    void run(async () => {
      await navigator.clipboard.writeText(text);
      setCopied(label);
    });
  }
  function revoke() {
    if (!saved) return;
    void run(async () => {
      await request(`/plugins/${saved.id}/grok/token`, { method: "DELETE" });
      setSetup(null);
      setConfirmRevoke(false);
      setSaved({ ...saved, hasKey: false, setupPending: false });
      await refresh();
    });
  }
  const done = configured && !setup;
  return (
    <Modal
      title="连接 Grok Bot"
      description="把微信里的文字任务交给你自己的 Grok Bot，结果回到原微信会话。"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="form-body claw-onboarding">
        <div className={`claw-connection ${done ? "is-online" : ""}`}>
          <div className="claw-connection-icon">
            {done ? <Check size={23} /> : <Bot size={23} />}
          </div>
          <div>
            <strong>
              {!ready
                ? "Grok Bot 派发服务暂未开放"
                : setup
                  ? "等待 Grok Bot 完成配置"
                  : saved
                    ? `Grok Bot ${connection.label}`
                    : "一段指令，自动配置"}
            </strong>
            <p>
              {!ready ? (
                GROK_DISPATCH_UNAVAILABLE
              ) : setup ? (
                "把指令发给 Grok Bot 后，它会添加连接器、创建 Routine 并登记 Webhook。"
              ) : done ? (
                <>
                  在微信发送 <code>@{saved?.shortcut} 回复一句你好</code> 验证收发。需要审批时请在
                  Grok Bot 中处理。
                </>
              ) : (
                "复制配置指令发给自己的 Grok Bot，不用手动复制 Webhook 和凭据。"
              )}
            </p>
          </div>
        </div>
        {ready && !setup && !done && (
          <ol className="claw-steps">
            <li>
              <span>1</span>
              <div>
                <strong>生成配置指令</strong>
                <p>为这个配置生成连接凭据，{GROK_SETUP_MINUTES} 分钟内有效。</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>发给你的 Grok Bot</strong>
                <p>
                  在 Bot 的一对一聊天中粘贴发送。它会添加「微伴」连接器、创建 Webhook Routine
                  并登记。
                </p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>回到微信测试</strong>
                <p>配置完成后此处会自动更新，无需手动刷新。</p>
              </div>
            </li>
          </ol>
        )}
        {setup && (
          <div className="claw-command-panel">
            <div className="claw-command-heading">
              <strong>复制后发给你的 Grok Bot</strong>
              <small>
                {secondsLeft
                  ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")} 后过期`
                  : "指令已过期"}
              </small>
            </div>
            <pre aria-label="Grok Bot 配置指令">{setup.prompt}</pre>
            <button
              type="button"
              className="button small"
              disabled={!secondsLeft || busy}
              onClick={() => copy(setup.prompt, "prompt")}
            >
              {copied === "prompt" ? <Check size={15} /> : <Copy size={15} />}
              {copied === "prompt" ? "已复制" : "复制配置指令"}
            </button>
            <p>指令含连接凭据，只发给自己的 Grok Bot，不要公开分享。</p>
            <div className="claw-waiting">
              <LoaderCircle size={14} className={secondsLeft ? "claw-spin" : ""} />
              {secondsLeft
                ? "等待 Grok Bot 登记 Webhook，完成后此处会自动更新"
                : "未在有效期内完成，请重新生成指令"}
            </div>
          </div>
        )}
        <div className="claw-connect-actions">
          <button
            type="button"
            className={`button ${setup || done ? "secondary small" : ""}`}
            disabled={busy || !ready}
            onClick={generate}
          >
            {busy ? "处理中…" : setup ? "重新生成指令" : done ? "重新连接" : "生成配置指令"}
          </button>
        </div>
        {saved?.hasKey && (
          <p className="claw-install-note">
            重新生成会替换旧的 MCP 凭据。Bot 中原来的「微伴」连接器随即失效，未完成的任务会关闭。
          </p>
        )}
      </div>
      <form className="form-body" onSubmit={save}>
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
        <label className="check-row">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          启用此配置
        </label>
        <WaitingMessageField
          value={waiting}
          defaultMessage={GROK_WAITING_MESSAGE}
          onChange={setWaiting}
        />
        <details>
          <summary>Bot 读取不到 Webhook 时手动填写</summary>
          <p>
            在 Grok Bot 桌面端打开 Routine，从 Webhook 区域复制 POST to 地址和 key。手动新建 Routine
            时，把下面的文字保存为 Routine 指令。
          </p>
          <label>
            Routine 指令
            <textarea readOnly value={grokRoutineInstructions} rows={4} />
          </label>
          <label>
            Routine Webhook URL
            <input
              type="url"
              required={!!key}
              autoComplete="off"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={
                saved?.webhookReady ? "已保存，留空保留" : "粘贴 Routine 中的 POST to 地址"
              }
            />
          </label>
          <label>
            Webhook key
            <input
              type="password"
              required={!!url}
              autoComplete="new-password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={
                saved?.webhookReady ? "已加密保存，留空保留" : "粘贴 key，不含 Bearer 前缀"
              }
            />
          </label>
          {saved?.webhookReady && (key || url) && (
            <p>更换 Webhook 会撤销 MCP 凭据并关闭未完成任务，之后需要重新连接。</p>
          )}
          <label>
            MCP 服务地址
            <input readOnly value={endpoint} />
          </label>
          {setup ? (
            <button
              type="button"
              className="button secondary small"
              disabled={busy}
              onClick={() => copy(`Bearer ${setup.token}`, "header")}
            >
              {copied === "header" ? "已复制" : "复制 Authorization 请求头的值"}
            </button>
          ) : (
            <p>
              手动添加连接器时，在 Connect apps 中选择 Add a custom connector，类型选 Remote
              HTTPS，填写上面的地址。Authorization 请求头的值在生成配置指令后可复制。
            </p>
          )}
        </details>
        <p>
          成功回复按本条消息、随任务发送的历史文字和平台保留的最终回复计收平台
          credits。失败或超时不扣费。
        </p>
        <button className="button" disabled={busy}>
          保存配置
        </button>
      </form>
      {saved?.hasKey && (
        <div className="form-body">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => (confirmRevoke ? revoke() : setConfirmRevoke(true))}
          >
            {confirmRevoke ? "确认撤销凭据并关闭未完成任务" : "撤销 MCP 凭据"}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </Modal>
  );
}
