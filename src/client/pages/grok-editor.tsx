import {
  routineInstructions,
  setupPrompt,
  reopenPrompt,
} from "../../shared/i18n/ko/copy/grok-prompts";
import { workspaceError, workspaceLabel } from "../workspace-copy";
import { useLocale } from "../locale";
import { copy as sourceCopy } from "../../shared/i18n/zh-CN/copy/grok-editor-page";
import { copy as koCopy } from "../../shared/i18n/ko/copy/grok-editor-page";
import { formatCopy } from "../../shared/i18n/dashboard";
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
  grokReopenPrompt,
  grokRoutineInstructions,
  grokSetupPrompt,
  type GrokPlugin,
} from "../../shared/grok-bot";
import { PLUGIN_SHORTCUT_PATTERN, PLUGIN_SHORTCUT_HINT } from "../../shared/plugin-shortcut";
import { remoteAgentConnection } from "../remote-agent-status";
import { IMAGE_CREDITS } from "../../shared/credits";
import { WaitingMessageField } from "./waiting-message-field";
import { waitingMessageDefaults, type WaitingMessageSettings } from "../../shared/waiting-message";

type GrokStatus = {
  hasKey: boolean;
  lastSeen: number;
  webhookReady: boolean;
  setupPending: boolean;
  setupUntil: number;
  registeredAt: number;
};
// "resume" watches a window opened earlier, e.g. before the editor was reopened;
// "reopen" extends it for the connector the Bot already has (no credential).
type Setup = {
  kind: "prompt" | "reopen" | "resume";
  prompt: string;
  token?: string;
  until: number;
};

export function GrokEditor({
  plugin,
  onClose,
  onSaved,
}: {
  plugin: GrokPlugin | "new";
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { locale } = useLocale();
  const pageCopy = locale === "ko" ? koCopy : sourceCopy;

  const { data, request, refresh, notify } = useApp();
  const [saved, setSaved] = useState(plugin === "new" ? null : plugin);
  const [name, setName] = useState(saved?.name ?? "Grok Bot");
  const [shortcut, setShortcut] = useState(saved?.shortcut ?? "grok");
  const [enabled, setEnabled] = useState(saved?.enabled ?? true);
  const [waiting, setWaiting] = useState<WaitingMessageSettings>(() =>
    saved
      ? { waitingMessageEnabled: saved.waitingMessageEnabled, waitingMessage: saved.waitingMessage }
      : waitingMessageDefaults(workspaceLabel(locale, GROK_WAITING_MESSAGE)),
  );
  const [setup, setSetup] = useState<Setup | null>(() =>
    saved?.hasKey && saved.setupPending && saved.setupUntil
      ? { kind: "resume", prompt: "", until: saved.setupUntil }
      : null,
  );
  const [confirmGenerate, setConfirmGenerate] = useState(false);
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
        // Compare server times: a window that merely expired is not a registration.
        // A Routine saved by hand still waits for the Bot to use its credential.
        const opened = until - GROK_SETUP_MINUTES * 60_000;
        if (
          state.hasKey &&
          state.lastSeen &&
          state.webhookReady &&
          !state.setupPending &&
          (state.registeredAt ?? 0) >= opened
        ) {
          stopped = true;
          setSetup(null);
          helpers.current.notify(pageCopy["Grok Bot 已完成配置，可以去微信测试了"]);
          void helpers.current.refresh();
          helpers.current.onSaved(pluginId);
        }
      } catch {
        // The next poll retries; the countdown shows when the prompt expires.
      } finally {
        // A minute of grace covers a client clock behind the server's.
        if (!stopped && Date.now() < until + 60_000) timer = setTimeout(() => void poll(), 3000);
      }
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id, setup, pageCopy]);
  useEffect(() => {
    if (!setup) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [setup]);
  const secondsLeft = setup ? Math.max(0, Math.ceil((setup.until - now) / 1000)) : 0;
  const connection = remoteAgentConnection(
    { ...(saved ?? { hasKey: false }), pluginId: GROK_ID },
    undefined,
    locale,
  );
  // lastSeen is set by the Bot's first MCP call with the current credential.
  const configured = !!saved?.hasKey && saved.webhookReady !== false && !!saved.lastSeen;
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? workspaceError(e, locale) : pageCopy["请求失败，请重试"]);
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
      notify(pageCopy["Grok Bot 配置已保存"]);
    });
  }
  function generate() {
    // A new credential stops the connector the Bot already uses.
    if (saved?.hasKey && !confirmGenerate) {
      setConfirmGenerate(true);
      return;
    }
    void run(async () => {
      setConfirmGenerate(false);
      setEnabled(true);
      const p = await persist({ enabled: true });
      const value = await request<{ token: string; endpoint: string; setupUntil: number }>(
        `/plugins/${p.id}/grok/token`,
        json({}),
      );
      setEndpoint(value.endpoint);
      setSetup({
        kind: "prompt",
        token: value.token,
        until: value.setupUntil,
        prompt: (locale === "ko" ? setupPrompt : grokSetupPrompt)({
          endpoint: value.endpoint,
          token: value.token,
          shortcut: p.shortcut,
        }),
      });
      setSaved({ ...p, hasKey: true, setupPending: true, setupUntil: value.setupUntil });
      setCopied("");
      setConfirmRevoke(false);
      setNow(Date.now());
      await refresh();
    });
  }
  function reopen() {
    if (!saved) return;
    void run(async () => {
      const { setupUntil } = await request<{ setupUntil: number }>(
        `/plugins/${saved.id}/grok/reopen`,
        json({}),
      );
      setSetup({
        kind: "reopen",
        prompt: (locale === "ko" ? reopenPrompt : grokReopenPrompt)({ shortcut: saved.shortcut }),
        until: setupUntil,
      });
      setSaved({ ...saved, setupPending: true, setupUntil });
      setCopied("");
      setConfirmGenerate(false);
      setNow(Date.now());
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
      setConfirmGenerate(false);
      setSaved({ ...saved, hasKey: false, setupPending: false, setupUntil: 0 });
      await refresh();
    });
  }
  const done = configured && !setup;
  return (
    <Modal
      title={pageCopy["连接 Grok Bot"]}
      description={
        pageCopy["把微信里的文字任务交给你自己的 Grok Bot，文字和图片结果回到原微信会话。"]
      }
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
                ? pageCopy["Grok Bot 派发服务暂未开放"]
                : setup
                  ? pageCopy["等待 Grok Bot 完成配置"]
                  : saved
                    ? `Grok Bot ${connection.label}`
                    : pageCopy["一段指令，自动配置"]}
            </strong>
            <p>
              {!ready ? (
                workspaceLabel(locale, GROK_DISPATCH_UNAVAILABLE)
              ) : setup ? (
                pageCopy["把指令发给 Grok Bot 后，它会添加连接器、创建 Routine 并登记 Webhook。"]
              ) : done ? (
                <>
                  {pageCopy["在微信发送 "]}
                  <code>
                    @{saved?.shortcut}
                    {pageCopy[" 回复一句你好"]}
                  </code>
                  {pageCopy[" 验证收发。需要审批时请在 Grok Bot 中处理。"]}
                </>
              ) : (
                pageCopy["复制配置指令发给自己的 Grok Bot，不用手动复制 Webhook 和凭据。"]
              )}
            </p>
          </div>
        </div>
        {ready && !setup && !done && saved?.hasKey && (
          <div className="claw-command-panel">
            <div className="claw-command-heading">
              <strong>{pageCopy["上次的配置还没完成"]}</strong>
            </div>
            <p>
              {
                pageCopy[
                  "如果 Grok Bot 已经按指令添加了「微伴」连接器，重新开放登记，再把提醒发给它即可，不用换凭据。"
                ]
              }
            </p>
            <button type="button" className="button small" disabled={busy} onClick={reopen}>
              {pageCopy["重新开放登记"]}
            </button>
          </div>
        )}
        {ready && !setup && !done && !saved?.hasKey && (
          <ol className="claw-steps">
            <li>
              <span>1</span>
              <div>
                <strong>{pageCopy["生成配置指令"]}</strong>
                <p>
                  {pageCopy["为这个配置生成连接凭据，"]}
                  {GROK_SETUP_MINUTES}
                  {pageCopy[" 分钟内有效。"]}
                </p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>{pageCopy["发给你的 Grok Bot"]}</strong>
                <p>
                  {
                    pageCopy[
                      "在 Bot 的一对一聊天中粘贴发送。它会添加「微伴」连接器、创建 Webhook Routine 并登记。"
                    ]
                  }
                </p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>{pageCopy["回到微信测试"]}</strong>
                <p>{pageCopy["配置完成后此处会自动更新，无需手动刷新。"]}</p>
              </div>
            </li>
          </ol>
        )}
        {setup && (
          <div className="claw-command-panel">
            <div className="claw-command-heading">
              <strong>
                {setup.kind === "resume"
                  ? pageCopy["等待 Grok Bot 完成登记"]
                  : pageCopy["复制后发给你的 Grok Bot"]}
              </strong>
              <small>
                {secondsLeft
                  ? formatCopy(pageCopy["{value0}:{value1} 后{value2}"], {
                      value0: Math.floor(secondsLeft / 60),
                      value1: String(secondsLeft % 60).padStart(2, "0"),
                      value2: setup.kind === "prompt" ? pageCopy["过期"] : pageCopy["关闭登记"],
                    })
                  : setup.kind === "prompt"
                    ? pageCopy["指令已过期"]
                    : pageCopy["登记已关闭"]}
              </small>
            </div>
            {setup.prompt ? (
              <>
                <pre aria-label={pageCopy["Grok Bot 配置指令"]}>{setup.prompt}</pre>
                <button
                  type="button"
                  className="button small"
                  disabled={!secondsLeft || busy}
                  onClick={() => copy(setup.prompt, "prompt")}
                >
                  {copied === "prompt" ? <Check size={15} /> : <Copy size={15} />}
                  {copied === "prompt"
                    ? pageCopy["已复制"]
                    : setup.kind === "reopen"
                      ? pageCopy["复制提醒"]
                      : pageCopy["复制配置指令"]}
                </button>
                <p>
                  {setup.kind === "reopen"
                    ? pageCopy["这段提醒不含凭据，Bot 会沿用已添加的「微伴」连接器。"]
                    : pageCopy["指令含连接凭据，只发给自己的 Grok Bot，不要公开分享。"]}
                </p>
              </>
            ) : (
              <p>{pageCopy["配置指令已经发出。Grok Bot 登记 Webhook 后，这里会自动更新。"]}</p>
            )}
            <div className="claw-waiting">
              <LoaderCircle size={14} className={secondsLeft ? "claw-spin" : ""} />
              {secondsLeft
                ? saved?.webhookReady && !saved.setupPending && !saved.lastSeen
                  ? pageCopy[
                      "Webhook 已保存。Grok Bot 第一次调用「微伴」连接器后即完成，此处会自动更新"
                    ]
                  : pageCopy["等待 Grok Bot 登记 Webhook，完成后此处会自动更新"]
                : pageCopy[
                    "未在有效期内完成。Bot 已添加「微伴」连接器时，重新开放登记即可，不用换凭据。"
                  ]}
            </div>
            {!secondsLeft && saved?.hasKey && (
              <button
                type="button"
                className="button small"
                disabled={busy || !ready}
                onClick={reopen}
              >
                {pageCopy["重新开放登记"]}
              </button>
            )}
          </div>
        )}
        <div className="claw-connect-actions">
          <button
            type="button"
            className={`button ${setup || done ? "secondary small" : ""}`}
            disabled={busy || !ready}
            onClick={generate}
          >
            {busy
              ? pageCopy["处理中…"]
              : confirmGenerate
                ? pageCopy["确认重新生成，现有连接器会失效"]
                : setup
                  ? pageCopy["重新生成指令"]
                  : done
                    ? pageCopy["重新连接"]
                    : pageCopy["生成配置指令"]}
          </button>
          {done && (
            // Lets the Bot register a rebuilt Routine with the connector it has.
            <button
              type="button"
              className="button secondary small"
              disabled={busy || !ready}
              onClick={reopen}
            >
              {pageCopy["重新开放登记"]}
            </button>
          )}
        </div>
        {saved?.hasKey && (
          <p className="claw-install-note">
            {
              pageCopy[
                "重新生成会替换旧的 MCP 凭据，Bot 中原来的「微伴」连接器随即失效。未完成的任务会关闭，并在微信里提示重新发送。"
              ]
            }
          </p>
        )}
      </div>
      <form className="form-body" onSubmit={save}>
        <label>
          {pageCopy["配置名称"]}
          <input required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          {pageCopy["微信快捷名称"]}
          <input
            required
            maxLength={24}
            pattern={PLUGIN_SHORTCUT_PATTERN}
            title={workspaceLabel(locale, PLUGIN_SHORTCUT_HINT)}
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value)}
          />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {pageCopy["启用此配置"]}
        </label>
        <WaitingMessageField
          value={waiting}
          defaultMessage={workspaceLabel(locale, GROK_WAITING_MESSAGE)}
          onChange={setWaiting}
        />
        <details>
          <summary>{pageCopy["Bot 读取不到 Webhook 时手动填写"]}</summary>
          <p>
            {
              pageCopy[
                "在 Grok Bot 桌面端打开 Routine，从 Webhook 区域复制 POST to 地址和 key。手动新建 Routine 时，把下面的文字保存为 Routine 指令。"
              ]
            }
          </p>
          <label>
            {pageCopy["Routine 指令"]}
            <textarea
              readOnly
              value={locale === "ko" ? routineInstructions : grokRoutineInstructions}
              rows={4}
            />
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
                saved?.webhookReady
                  ? pageCopy["已保存，留空保留"]
                  : pageCopy["粘贴 Routine 中的 POST to 地址"]
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
                saved?.webhookReady
                  ? pageCopy["已加密保存，留空保留"]
                  : pageCopy["粘贴 key，不含 Bearer 前缀"]
              }
            />
          </label>
          {saved?.webhookReady && (key || url) && (
            <p>{pageCopy["更换 Webhook 会撤销 MCP 凭据并关闭未完成任务，之后需要重新连接。"]}</p>
          )}
          <label>
            {pageCopy["MCP 服务地址"]}
            <input readOnly value={endpoint} />
          </label>
          {setup?.token ? (
            <button
              type="button"
              className="button secondary small"
              disabled={busy}
              onClick={() => copy(`Bearer ${setup.token}`, "header")}
            >
              {copied === "header" ? pageCopy["已复制"] : pageCopy["复制 Authorization 请求头的值"]}
            </button>
          ) : (
            <p>
              {
                pageCopy[
                  "手动添加连接器时，在 Connect apps 中选择 Add a custom connector，类型选 Remote HTTPS，填写上面的地址。Authorization 请求头的值在生成配置指令后可复制。"
                ]
              }
            </p>
          )}
        </details>
        <p>
          {
            pageCopy[
              "成功回复按本条消息、随任务发送的历史文字和平台保留的最终回复计收平台 credits，每张图片另计"
            ]
          }{" "}
          {IMAGE_CREDITS}
          {pageCopy[" credits。失败或超时不扣费。"]}
        </p>
        <button className="button" disabled={busy}>
          {pageCopy["保存配置"]}
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
            {confirmRevoke ? pageCopy["确认撤销凭据并关闭未完成任务"] : pageCopy["撤销 MCP 凭据"]}
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
