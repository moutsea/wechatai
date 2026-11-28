import { workspaceError, workspaceLabel } from "../workspace-copy";
import { useLocale } from "../locale";
import { copy as sourceCopy } from "../../shared/i18n/zh-CN/copy/openclaw-editor-page";
import { copy as koCopy } from "../../shared/i18n/ko/copy/openclaw-editor-page";
import { workspaceCopy as ptCopy } from "../../shared/i18n/pt/copy/workspace";
import { formatCopy } from "../../shared/i18n/dashboard";
import {
  pluginShortcutForEdit,
  pluginShortcutPatternForEdit,
  isLegacyNumericShortcut,
  LEGACY_NUMERIC_SHORTCUT_HINT,
  PLUGIN_SHORTCUT_HINT,
} from "../../shared/plugin-shortcut";
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
import { remoteAgentConnection } from "../remote-agent-status";
import { OpenClawUpgrade } from "./openclaw-upgrade";
import { Link } from "react-router-dom";
import { pluginAvailable, pluginLimitIssue } from "../../shared/plugin-access";

export function OpenClawEditor({
  plugin,
  kind = "openclaw",
  showUpgrade = false,
  onClose,
  onSaved,
  onComplete,
}: {
  plugin: RemoteAgentPlugin | "new";
  kind?: RemoteAgentKind;
  showUpgrade?: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
  onComplete: (id: string) => void;
}) {
  const { locale } = useLocale();
  const pageCopy =
    locale === "ko" ? koCopy : locale === "pt" ? ptCopy : sourceCopy;

  const { data, base, request, refresh, notify } = useApp();
  const agentName = remoteAgentName(`wechatai/${kind}`);
  const [saved, setSaved] = useState(plugin === "new" ? null : plugin);
  const editSchema = openClawInputSchema.safeExtend({
    shortcut: pluginShortcutForEdit(saved?.shortcut),
  });
  const [form, setForm] = useState<OpenClawInput>(() =>
    editSchema.parse(
      plugin === "new"
        ? {
            name: agentName,
            shortcut: kind === "openclaw" ? "claw" : kind,
            waitingMessage: workspaceLabel(locale, OPENCLAW_WAITING_MESSAGE),
          }
        : plugin,
    ),
  );
  const previousShortcut = saved?.shortcut;
  const keepingLegacyShortcut =
    isLegacyNumericShortcut(previousShortcut) && form.shortcut === previousShortcut;
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
    if (!id) return;
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
          remoteAgentConnection(state, undefined, locale).state === "online"
        ) {
          stopped = true;
          setPairing(null);
          setSaved((p) => (p ? { ...p, ...state } : p));
          helpers.current.notify(
            formatCopy(pageCopy["{value0} 已连接，可以去微信聊天了"], { value0: agentName }),
          );
          void helpers.current.refresh();
          helpers.current.onComplete(pluginId);
        }
      } catch {
        if (!stopped) setPollError(pageCopy["暂时无法更新连接状态，正在重试…"]);
      } finally {
        if (!stopped) timer = setTimeout(() => void poll(), pairing ? 3000 : 10000);
      }
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id, pairing, kind, agentName, pageCopy]);
  useEffect(() => {
    if (!pairing) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pairing]);
  const access =
    status?.access !== undefined
      ? status.access
      : (saved?.access ??
        (saved && data && !pluginAvailable(data.plan, data.plugins ?? [], saved.id)
          ? pluginLimitIssue(data.planUntil)
          : null));
  const connection = remoteAgentConnection(
    { ...(status ?? saved ?? { hasKey: false }), access },
    now,
    locale,
  );
  const limited = access?.code === "membership_expired" || access?.code === "plugin_limit";
  const connected = connection.state === "online";
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
      setError(workspaceError(e as Error, locale));
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
      notify(
        remoteAgentConnection(p, undefined, locale).connectedBefore
          ? pageCopy["配置已保存"]
          : pageCopy["配置已保存，完成连接后即可使用"],
      );
      onComplete(p.id);
    });
  }
  return (
    <Modal
      title={formatCopy(pageCopy["连接 {value0}"], { value0: agentName })}
      description={
        kind === "muse"
          ? pageCopy["让 Muse 托管助理，在微信里接收任务并回复。"]
          : pageCopy["让自己的助手，从电脑走进微信。"]
      }
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
                ? formatCopy(pageCopy["{value0} 已连接"], { value0: agentName })
                : pairing
                  ? formatCopy(pageCopy["等待 {value0} 连接"], { value0: agentName })
                  : saved
                    ? `${agentName} ${connection.label}`
                    : pageCopy["一条命令，自动配置"]}
            </strong>
            <p>
              {connected
                ? isLegacyNumericShortcut(saved?.shortcut)
                  ? pageCopy["请在「更多设置」中修改纯数字别名，再使用 /use 进入对话。"]
                  : pageCopy["在微信发送 /use "] + saved?.shortcut + pageCopy["，即可开始对话。"]
                : saved
                  ? connection.description
                  : kind === "muse"
                    ? pageCopy["把连接指令发给 Muse，由它安装并启用接收消息的 hook。"]
                    : pageCopy["自动安装渠道、选择默认助手并完成配对，无需填写密钥。"]}
            </p>
          </div>
        </div>
        {limited && (
          <p className="plugin-config-renew" role="status">
            <Link to={`${base}/billing`}>{pageCopy["查看会员 / 续费 Plus"]}</Link> ·{" "}
            <Link to={`${base}/plugins`}>{pageCopy["管理插件名额"]}</Link>
          </p>
        )}
        {!connected && !pairing && !limited && (
          <ol className="claw-steps">
            <li>
              <span>1</span>
              <div>
                <strong>{pageCopy["生成连接命令"]}</strong>
                <p>{pageCopy["为你的账号创建一次性配对信息。"]}</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>
                  {kind === "muse" ? pageCopy["把指令发给 Muse"] : pageCopy["在命令行终端执行"]}
                </strong>
                <p>
                  {kind === "muse"
                    ? pageCopy["在 Muse 主聊天中粘贴指令，让它完成安装、注册并启用 hook。"]
                    : formatCopy(
                        pageCopy["打开运行 {value0} 的电脑或服务器上的命令行终端，粘贴并执行。"],
                        { value0: agentName },
                      )}
                </p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>{pageCopy["回到微信，开始聊天"]}</strong>
                <p>{pageCopy["连接成功后会自动关闭弹窗，无需手动刷新。"]}</p>
              </div>
            </li>
          </ol>
        )}
        {pairing && (
          <div className="claw-command-panel">
            <div className="claw-command-heading">
              <strong>
                {kind === "muse"
                  ? pageCopy["复制后发送到 Muse 主聊天"]
                  : pageCopy["在命令行终端粘贴并执行"]}
              </strong>
              <small>
                {secondsLeft
                  ? formatCopy(pageCopy["{value0}:{value1} 后过期"], {
                      value0: Math.floor(secondsLeft / 60),
                      value1: String(secondsLeft % 60).padStart(2, "0"),
                    })
                  : pageCopy["命令已过期"]}
              </small>
            </div>
            <p>
              {kind === "muse"
                ? pageCopy[
                    "由 Muse 在自己的托管环境中执行安装，并按输出说明启用 hook。配对完成后仍需等待 hook 实际上线。"
                  ]
                : formatCopy(
                    pageCopy["请在运行 {value0} 的电脑或服务器上打开命令行终端，再执行下方命令。"],
                    { value0: agentName },
                  )}
            </p>
            <pre aria-label={formatCopy(pageCopy["{value0} 连接命令"], { value0: agentName })}>
              {pairing.command}
            </pre>
            <button
              type="button"
              className="button small"
              disabled={secondsLeft === 0}
              onClick={() =>
                void run(async () => {
                  await navigator.clipboard.writeText(pairing.command);
                  setCopied(true);
                })
              }
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied
                ? pageCopy["已复制"]
                : kind === "muse"
                  ? pageCopy["复制 Muse 连接指令"]
                  : pageCopy["复制连接命令"]}
            </button>
            <p>
              {kind === "muse"
                ? pageCopy[
                    "指令含一次性配对信息，只发给自己的 Muse，不要公开分享。需要 Muse 托管环境支持 hook。"
                  ]
                : pageCopy["命令仅用于本次连接，请勿转发。支持 macOS、Linux 和 WSL。"]}
            </p>
            <div className="claw-waiting">
              <LoaderCircle size={14} className={secondsLeft ? "claw-spin" : ""} />
              {status?.pairingClaimed
                ? pageCopy["配对完成，等待渠道上线…"]
                : secondsLeft
                  ? pageCopy["等待执行，连接后此处会自动更新"]
                  : pageCopy["尚未完成连接，请重新生成命令"]}
            </div>
          </div>
        )}
        {kind === "openclaw" && status?.hasKey && !pairing && !limited && (
          <OpenClawUpgrade status={status} initiallyExpanded={showUpgrade} />
        )}
        {kind === "hermes" && status?.hasKey && !status.nativeCommands && !pairing && (
          <p className="muted">
            {
              pageCopy[
                "当前连接器尚不支持 Agent 原生命令。点击「重新连接」，生成并执行新命令即可升级。"
              ]
            }
          </p>
        )}
        {agents.length > 1 && (
          <label>
            {pageCopy["使用哪个助手？"]}
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
                  {a.isDefault ? pageCopy[" · 默认助手"] : ""}（{a.id}）
                </option>
              ))}
            </select>
            <small>
              {
                pageCopy[
                  "切换后点击「保存配置」。将开始新的远端会话，旧任务停止向微信推送，历史记录保留。"
                ]
              }
            </small>
          </label>
        )}
        {agents.length === 1 && (
          <p className="claw-agent-label">
            {pageCopy["当前助手 "]}
            <strong>{agents[0].name}</strong>
            {pageCopy[" · 自动识别"]}
          </p>
        )}
        <div className="claw-connect-actions">
          <button
            type="button"
            className={`button ${pairing || connected ? "secondary small" : ""}`}
            disabled={busy || limited}
            onClick={() => void connect()}
          >
            {busy
              ? pageCopy["处理中…"]
              : pairing
                ? pageCopy["重新生成命令"]
                : connected || saved?.hasKey
                  ? pageCopy["重新连接"]
                  : formatCopy(pageCopy["连接 {value0}"], { value0: agentName })}
          </button>
          <a href={`/developers/${kind}`} target="_blank" rel="noreferrer" className="text-link">
            {pageCopy["查看教程 "]}
            <ExternalLink size={13} />
          </a>
        </div>
        {!connected && !limited && (
          <p className="claw-install-note">
            {kind === "muse" ? (
              pageCopy[
                "需要已有 Muse 托管助理及 hook 功能。安装程序保存配对，Muse 负责注册并启用 hook；不会创建新的微信连接。"
              ]
            ) : (
              <>
                {pageCopy["需要已安装"]}{" "}
                {kind === "hermes" ? pageCopy["Hermes Agent（当前稳定版）"] : "OpenClaw 2026.6.10+"}
                {pageCopy["。执行后会安装微伴渠道并重启 Gateway，请等待当前任务完成后再连接。"]}
              </>
            )}
          </p>
        )}
        {pairing && (connected || (kind === "muse" && saved?.hasKey)) && (
          <p className="claw-install-note">
            {kind === "muse"
              ? pageCopy[
                  "重新配对会替换旧连接，旧会话推送将停止。请等待当前任务完成且结果回传后再连接；网络、权限或额度暂停时，先恢复原 hook 完成回传。"
                ]
              : pageCopy["执行新命令后会替换旧连接并重启 Gateway，旧会话推送将停止。"]}
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
              {pageCopy["更多设置"]}
              <span>{pageCopy["名称、用量与消息提示"]}</span>
            </summary>
            <div className="claw-preferences-body">
              <div className="form-grid">
                <label>
                  {pageCopy["插件名称"]}
                  <input
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    required
                    maxLength={40}
                  />
                </label>
                <label>
                  {pageCopy["快捷名称"]}
                  <input
                    pattern={pluginShortcutPatternForEdit(saved?.shortcut)}
                    title={workspaceLabel(locale, PLUGIN_SHORTCUT_HINT)}
                    value={form.shortcut}
                    onChange={(e) => update("shortcut", e.target.value)}
                    required
                    maxLength={24}
                  />
                  <small>
                    {keepingLegacyShortcut
                      ? workspaceLabel(locale, LEGACY_NUMERIC_SHORTCUT_HINT)
                      : formatCopy(
                          pageCopy["别名不能是纯数字。@{value0} 单次调用；/use {value1} 进入"],
                          { value0: form.shortcut, value1: form.shortcut },
                        )}
                  </small>
                </label>
                <label>
                  {pageCopy["单条输入上限（tokens）"]}
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
                    {pageCopy["默认 128K，最高可设 2M。仅计算本条文字，"]}
                    {agentName}
                    {pageCopy["的历史、系统提示词和工具输入由它自行管理。"]}
                  </small>
                </label>
                <label>
                  {pageCopy["回复上限（tokens）"]}
                  <input
                    type="number"
                    min={256}
                    max={16000}
                    value={form.maxOutputTokens}
                    onChange={(e) => update("maxOutputTokens", Number(e.target.value))}
                  />
                  {kind === "muse" && (
                    <small>
                      {
                        pageCopy[
                          "超出上限的回复会裁剪并附上提示，提示不计费。可让 Muse 精简或分段回复。"
                        ]
                      }
                    </small>
                  )}
                </label>
              </div>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => update("enabled", e.target.checked)}
                />
                {pageCopy["启用插件"]}
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={form.allowProactive}
                  onChange={(e) => update("allowProactive", e.target.checked)}
                />
                {pageCopy["接收定时任务和后台结果推送"]}
              </label>
              <WaitingMessageField
                value={form}
                defaultMessage={workspaceLabel(locale, OPENCLAW_WAITING_MESSAGE)}
                onChange={(value) => setForm((f) => ({ ...f, ...value }))}
              />
              <p className="form-note">
                {pageCopy["只计算发送和返回的文字：5,000 输入 tokens = 1 credit，输出权重 ×8。"]}
                {agentName}
                {pageCopy["内部的模型与工具调用不计入微伴用量。当前支持文字和带转写的语音。"]}
              </p>
            </div>
          </details>
          {!!status?.deliveries.length && (
            <details>
              <summary>{pageCopy["最近投递"]}</summary>
              <ul className="claw-deliveries">
                {status.deliveries.map((d) => (
                  <li key={d.id}>
                    {new Date(d.createdAt).toLocaleString()} ·{" "}
                    {d.state === "done"
                      ? pageCopy["已投递"]
                      : d.state === "waiting_context"
                        ? pageCopy["等待你在微信发送新消息后重试"]
                        : d.state === "failed"
                          ? pageCopy["投递失败"]
                          : pageCopy["等待投递"]}
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
                    notify(formatCopy(pageCopy["{value0} 已断开"], { value0: agentName }));
                  })
                }
              >
                {pageCopy["断开连接"]}
              </button>
            )}
            <button type="submit" className="button" disabled={busy || limited}>
              {pageCopy["保存配置"]}
            </button>
          </div>
        )}
      </form>
    </Modal>
  );
}
