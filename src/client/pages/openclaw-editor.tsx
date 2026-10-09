import {
  remoteAgentName,
  type RemoteAgentKind,
  type RemoteAgentPlugin,
} from "../../shared/remote-agent";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Copy, ExternalLink, LoaderCircle, Terminal } from "lucide-react";
import { useApp } from "../context";
import { Modal } from "../ui";
import { json } from "../api";
import { MAX_CONTEXT_TOKENS } from "../../shared/context";
import {
  openClawInputSchema,
  type OpenClawInput,
  type OpenClawPairing,
  type OpenClawStatus,
} from "../../shared/openclaw";
import { OPENCLAW_WAITING_MESSAGE } from "../../shared/waiting-message";
import { WaitingMessageField } from "./waiting-message-field";

export function OpenClawEditor({
  plugin,
  kind = "openclaw",
  onClose,
  onSaved,
  onComplete,
}: {
  plugin: RemoteAgentPlugin | "new";
  kind?: RemoteAgentKind;
  onClose: () => void;
  onSaved: (id: string) => void;
  onComplete: (id: string) => void;
}) {
  const { request, refresh, notify, demo } = useApp();
  const agentName = remoteAgentName(`wechatai/${kind}`);
  const [saved, setSaved] = useState(plugin === "new" ? null : plugin);
  const [form, setForm] = useState<OpenClawInput>(
    openClawInputSchema.parse(
      plugin === "new"
        ? { name: agentName, shortcut: kind === "hermes" ? "hermes" : "claw" }
        : plugin,
    ),
  );
  const [pairing, setPairing] = useState<OpenClawPairing | null>(null);
  const [status, setStatus] = useState<OpenClawStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());
  const selectedAgent = useRef(false);
  const helpers = useRef({ request, refresh, notify, onComplete, busy });
  helpers.current = { request, refresh, notify, onComplete, busy };
  const id = saved?.id;
  useEffect(() => {
    if (!id || demo) return;
    const pluginId = id;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const state = await helpers.current.request<OpenClawStatus>(
          `/plugins/${pluginId}/${kind}/status`,
        );
        if (stopped) return;
        setStatus(state);
        setNow(Date.now());
        setPollError("");
        if (!selectedAgent.current) setForm((f) => ({ ...f, agentId: state.agentId }));
        if (
          pairing &&
          !helpers.current.busy &&
          state.pairingClaimed &&
          state.hasKey &&
          state.lastSeen > Date.now() - 60000
        ) {
          stopped = true;
          setPairing(null);
          setSaved((p) => (p ? { ...p, ...state } : p));
          helpers.current.notify(`${agentName} 已连接，可以去微信聊天了`);
          void helpers.current.refresh();
          helpers.current.onComplete(pluginId);
        }
      } catch {
        if (!stopped) setPollError("暂时无法更新连接状态，正在重试…");
      } finally {
        if (!stopped) timer = setTimeout(() => void poll(), pairing ? 3000 : 10000);
      }
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id, demo, pairing, kind, agentName]);
  useEffect(() => {
    if (!pairing) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pairing]);
  const connected =
    (status?.hasKey ?? saved?.hasKey) && (status?.lastSeen ?? saved?.lastSeen ?? 0) > now - 60000;
  const agents = status?.agents ?? saved?.agents ?? [];
  const secondsLeft = Math.max(0, Math.ceil(((pairing?.expiresAt ?? 0) - now) / 1000));
  const update = <K extends keyof OpenClawInput>(key: K, value: OpenClawInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function persist(connect = false) {
    const p = await request<RemoteAgentPlugin>(
      saved ? `/plugins/${saved.id}` : "/plugins",
      json(
        { ...form, enabled: connect ? true : form.enabled, pluginId: `wechatai/${kind}` },
        saved ? "PATCH" : "POST",
      ),
    );
    setSaved(p);
    setForm(p);
    selectedAgent.current = false;
    onSaved(p.id);
    await refresh();
    return p;
  }
  async function connect() {
    await run(async () => {
      const p = await persist(true);
      setPairing(await request<OpenClawPairing>(`/plugins/${p.id}/${kind}/pair`, json({})));
      setNow(Date.now());
      setCopied(false);
    });
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const p = await persist();
      notify("配置已保存");
      onComplete(p.id);
    });
  }
  return (
    <Modal
      title={`连接 ${agentName}`}
      description="让自己的助手，从电脑走进微信。"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="form-body claw-onboarding">
        <div className={`claw-connection ${connected ? "is-online" : ""}`}>
          <div className="claw-connection-icon">
            {connected ? <Check size={23} /> : <Terminal size={23} />}
          </div>
          <div>
            <strong>
              {connected
                ? `${agentName} 已连接`
                : pairing
                  ? `等待 ${agentName} 连接`
                  : "一条命令，自动配置"}
            </strong>
            <p>
              {connected
                ? "在微信发送 /use " + form.shortcut + "，即可开始对话。"
                : "自动安装渠道、选择默认助手并完成配对，无需填写密钥。"}
            </p>
          </div>
        </div>
        {!connected && !pairing && (
          <ol className="claw-steps">
            <li>
              <span>1</span>
              <div>
                <strong>生成连接命令</strong>
                <p>为你的账号创建一次性配对信息。</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>在命令行终端执行</strong>
                <p>打开运行 {agentName} 的电脑或服务器上的命令行终端，粘贴并执行。</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>回到微信，开始聊天</strong>
                <p>连接成功后会自动关闭弹窗，无需手动刷新。</p>
              </div>
            </li>
          </ol>
        )}
        {pairing && (
          <div className="claw-command-panel">
            <div className="claw-command-heading">
              <strong>在命令行终端粘贴并执行</strong>
              <small>
                {demo
                  ? "演示命令"
                  : secondsLeft
                    ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")} 后过期`
                    : "命令已过期"}
              </small>
            </div>
            <p>请在运行 {agentName} 的电脑或服务器上打开命令行终端，再执行下方命令。</p>
            <pre aria-label={`${agentName} 连接命令`}>{pairing.command}</pre>
            <button
              type="button"
              className="button small"
              disabled={demo || secondsLeft === 0}
              onClick={() =>
                void run(async () => {
                  await navigator.clipboard.writeText(pairing.command);
                  setCopied(true);
                })
              }
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? "已复制" : "复制连接命令"}
            </button>
            <p>
              {demo
                ? "这是演示预览。登录 Plus 账号后可以生成真实连接命令。"
                : "命令仅用于本次连接，请勿转发。支持 macOS、Linux 和 WSL。"}
            </p>
            <div className="claw-waiting">
              <LoaderCircle size={14} className={secondsLeft ? "claw-spin" : ""} />
              {status?.pairingClaimed
                ? "配对完成，等待渠道上线…"
                : secondsLeft
                  ? "等待执行，连接后此处会自动更新"
                  : "尚未完成连接，请重新生成命令"}
            </div>
          </div>
        )}
        {agents.length > 1 && (
          <label>
            使用哪个助手？
            <select
              value={form.agentId}
              onChange={(e) => {
                selectedAgent.current = true;
                update("agentId", e.target.value);
              }}
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.isDefault ? " · 默认助手" : ""}（{a.id}）
                </option>
              ))}
            </select>
            <small>
              切换后点击「保存配置」。将开始新的远端会话，旧任务停止向微信推送，历史记录保留。
            </small>
          </label>
        )}
        {agents.length === 1 && (
          <p className="claw-agent-label">
            当前助手 <strong>{agents[0].name}</strong> · 自动识别
          </p>
        )}
        <div className="claw-connect-actions">
          <button
            type="button"
            className={`button ${pairing || connected ? "secondary small" : ""}`}
            disabled={busy}
            onClick={() => void connect()}
          >
            {busy
              ? "处理中…"
              : pairing
                ? "重新生成命令"
                : connected || saved?.hasKey
                  ? "重新连接"
                  : `连接 ${agentName}`}
          </button>
          <a href={`/developers/${kind}`} target="_blank" rel="noreferrer" className="text-link">
            查看教程 <ExternalLink size={13} />
          </a>
        </div>
        {!connected && (
          <p className="claw-install-note">
            需要已安装 {kind === "hermes" ? "Hermes Agent（当前稳定版）" : "OpenClaw 2026.6.10+"}
            。执行后会安装微伴渠道并重启 Gateway，请等待当前任务完成后再连接。
          </p>
        )}
        {connected && pairing && (
          <p className="claw-install-note">
            执行新命令后会替换旧连接并重启 Gateway，旧会话推送将停止。
          </p>
        )}
        {pollError && (
          <p role="status" className="form-note">
            {pollError}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <form onSubmit={save}>
        <div className="form-body claw-preferences">
          <details>
            <summary>
              更多设置<span>名称、用量与消息提示</span>
            </summary>
            <div className="claw-preferences-body">
              <div className="form-grid">
                <label>
                  插件名称
                  <input
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    required
                    maxLength={40}
                  />
                </label>
                <label>
                  快捷名称
                  <input
                    value={form.shortcut}
                    onChange={(e) => update("shortcut", e.target.value)}
                    required
                    maxLength={24}
                  />
                  <small>
                    @{form.shortcut} 单次调用；/use {form.shortcut} 进入
                  </small>
                </label>
                <label>
                  单条输入上限（tokens）
                  <input
                    type="number"
                    min={256}
                    max={MAX_CONTEXT_TOKENS}
                    list="openclaw-input-presets"
                    value={form.maxInputTokens}
                    onChange={(e) => update("maxInputTokens", Number(e.target.value))}
                  />
                  <datalist id="openclaw-input-presets">
                    <option value={128000}>128K</option>
                    <option value={256000}>256K</option>
                    <option value={1000000}>1M</option>
                    <option value={2000000}>2M</option>
                  </datalist>
                  <small>
                    默认 128K，最高可设 2M。仅计算本条文字，{agentName}
                    的历史、系统提示词和工具输入由它自行管理。
                  </small>
                </label>
                <label>
                  回复上限（tokens）
                  <input
                    type="number"
                    min={256}
                    max={16000}
                    value={form.maxOutputTokens}
                    onChange={(e) => update("maxOutputTokens", Number(e.target.value))}
                  />
                </label>
              </div>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => update("enabled", e.target.checked)}
                />
                启用插件
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={form.allowProactive}
                  onChange={(e) => update("allowProactive", e.target.checked)}
                />
                接收定时任务和后台结果推送
              </label>
              <WaitingMessageField
                value={form}
                defaultMessage={OPENCLAW_WAITING_MESSAGE}
                onChange={(value) => setForm((f) => ({ ...f, ...value }))}
              />
              <p className="form-note">
                只计算发送和返回的文字：5,000 输入 tokens = 1 credit，输出权重 ×8。{agentName}
                内部的模型与工具调用不计入微伴用量。当前支持文字和带转写的语音。
              </p>
            </div>
          </details>
          {!!status?.deliveries.length && (
            <details>
              <summary>最近投递</summary>
              <ul className="claw-deliveries">
                {status.deliveries.map((d) => (
                  <li key={d.id}>
                    {new Date(d.createdAt).toLocaleString()} ·{" "}
                    {d.state === "done"
                      ? "已投递"
                      : d.state === "waiting_context"
                        ? "等待你在微信发送新消息后重试"
                        : d.state === "failed"
                          ? "投递失败"
                          : "等待投递"}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        {saved && (
          <div className="modal-actions claw-footer">
            {(status?.hasKey ?? saved.hasKey) && (
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await request(`/plugins/${saved.id}/${kind}/token`, { method: "DELETE" });
                    setPairing(null);
                    setStatus(null);
                    setSaved({ ...saved, hasKey: false, lastSeen: 0, agents: [] });
                    await refresh();
                    notify("OpenClaw 已断开");
                  })
                }
              >
                断开连接
              </button>
            )}
            <button type="submit" className="button" disabled={busy}>
              保存配置
            </button>
          </div>
        )}
      </form>
    </Modal>
  );
}
