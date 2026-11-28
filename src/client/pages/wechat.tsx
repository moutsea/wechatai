import { workspaceError } from "../workspace-copy";
import { useLocale } from "../locale";
import { copy as sourceCopy } from "../../shared/i18n/zh-CN/copy/wechat-page";
import { copy as koCopy } from "../../shared/i18n/ko/copy/wechat-page";
import { workspaceCopy as ptCopy } from "../../shared/i18n/pt/copy/workspace";
import { formatCopy } from "../../shared/i18n/dashboard";
import { ConnectionPrivacy } from "../connection-privacy";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import {
  QrCode,
  Link2,
  Check,
  ShieldCheck,
  RefreshCw,
  ArrowUpRight,
  Smartphone,
  Unplug,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { useApp } from "../context";
import { Modal, PageHead, relativeTime } from "../ui";
import { json, limitErrorCode } from "../api";
import { LimitHint } from "../limit-hint";
import { COMMANDS_GUIDE_PATH } from "../../shared/guide";
import {
  chatSetupIssue,
  modelFreeWechatPlugins,
  notificationWechatIssue,
  preferredRemoteAgent,
} from "../../shared/wechat-readiness";
import { isCloudAgent } from "../../shared/cloud-agent";
import { isChatModel } from "../../shared/model-compatibility";
import type { Connection } from "../../shared/types";
import { remoteAgentName } from "../../shared/remote-agent";
// WeChat may show digits on the phone after the scan; the bind finishes once they match.
function VerifyCodeForm({
  state,
  onSubmit,
}: {
  state: "required" | "checking" | "rejected";
  onSubmit: (code: string) => Promise<void>;
}) {
  const { locale } = useLocale();
  const pageCopy =
    locale === "ko" ? koCopy : locale === "pt" ? ptCopy : sourceCopy;

  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      await onSubmit(code);
      setCode("");
    } catch (err) {
      setError(workspaceError(err as Error, locale));
    } finally {
      setSending(false);
    }
  };
  const checking = state === "checking" || sending;
  return (
    <form className="wechat-verify" onSubmit={(e) => void submit(e)}>
      <Smartphone size={40} strokeWidth={1.2} />
      <strong>{pageCopy["输入手机微信上显示的数字"]}</strong>
      <p>{pageCopy["扫码后手机微信会显示一串数字，在这里输入后即可完成连接。"]}</p>
      <input
        aria-label={pageCopy["手机微信上显示的数字"]}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={16}
        required
        value={code}
        disabled={checking}
        onChange={(e) => setCode(e.target.value)}
      />
      <button className="button" disabled={checking || !code.trim()}>
        {checking ? pageCopy["正在验证…"] : pageCopy["提交"]}
      </button>
      {(error || state === "rejected") && (
        <div className="form-error" role="alert">
          {error || pageCopy["数字不匹配，请对照手机微信重新输入。"]}
        </div>
      )}
    </form>
  );
}
// WeChat delivers bot pushes only for 24 hours after the user's latest message.
function PushWindowNote({ push }: { push: NonNullable<Connection["pushWindow"]> }) {
  const { locale } = useLocale();
  const pageCopy =
    locale === "ko" ? koCopy : locale === "pt" ? ptCopy : sourceCopy;

  const closed = push.until <= Date.now();
  if (push.blockedAt || closed)
    return (
      <div className="form-error" role="status">
        {!push.blockedAt
          ? pageCopy["已超过 24 小时没在微信发消息，提醒和通知可能发不出去。"]
          : closed
            ? pageCopy["微信拒绝了最近的提醒或通知推送，通常是因为超过 24 小时没在微信发消息。"]
            : // Reportedly WeChat also caps pushes per user message.
              pageCopy[
                "微信拒绝了最近的提醒或通知推送。你 24 小时内发过消息，可能是这条消息之后的推送条数已到微信的上限。"
              ]}
        {pageCopy["在微信发送 "]}
        <code>/wx help</code>
        {pageCopy[" 即可恢复，不消耗 credits；24 小时内未送达的提醒和通知会继续补发。"]}
      </div>
    );
  const until = new Date(push.until).toLocaleString(locale === "ko" ? "ko-KR" : locale === "pt" ? "pt-BR" : "zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return (
    <div className="simple-note">
      {pageCopy["提醒和通知可推送至 "]}
      {until}
      {
        pageCopy[
          "。微信只允许在你最近一次发消息后的 24 小时内推送，快到期时微伴会在微信里提醒你回复。"
        ]
      }
    </div>
  );
}
export function Wechat() {
  const { locale } = useLocale();
  const pageCopy =
    locale === "ko" ? koCopy : locale === "pt" ? ptCopy : sourceCopy;

  const { data, base, request, refresh, notify } = useApp();
  const [busy, setBusy] = useState(false);
  const [disconnect, setDisconnect] = useState(false);
  const [editor, setEditor] = useState<"create" | "rename" | "delete" | null>(null);
  const [name, setName] = useState("");
  // 撞到链接上限时不再只把按钮置灰——那一刻正是该告诉用户 Plus 能给什么的地方。
  const [limitCode, setLimitCode] = useState<string>();
  if (!data) return null;
  const connection = data.connection;
  const selected = data.connections.find((l) => l.id === data.selectedConnectionId);
  const paused = selected?.paused ?? false;
  const atLimit = data.connections.length >= data.limits.connections;
  // 升级出口只在免费版有意义：撞限这件事成立时（atLimit）或刚被服务端拒过（limitCode）都该说一次。
  const upgradeHint =
    data.plan === "free" ? (limitCode ?? (atLimit ? "connection_limit" : undefined)) : undefined;
  const connected = connection.status === "connected" && !paused;
  const waiting = ["waiting", "scanned"].includes(connection.status) && !paused;
  const modelFreePlugins = modelFreeWechatPlugins(data).filter(
    (p) => p.pluginId !== "wechatai/notification" || p.connectionId === data.selectedConnectionId,
  );
  const activePluginId = data.currentSession?.pluginInstanceId;
  const remote = preferredRemoteAgent(modelFreePlugins, activePluginId);
  const remoteMode =
    !!remote &&
    (activePluginId ? activePluginId === remote.id : !data.assistants.some(isChatModel));
  const notificationMode =
    !remoteMode &&
    !activePluginId &&
    !data.assistants.some(isChatModel) &&
    modelFreePlugins.some((p) => p.pluginId === "wechatai/notification");
  const setupIssue = remoteMode || notificationMode ? null : chatSetupIssue(data);
  const notificationIssue = notificationMode
    ? notificationWechatIssue({ ...connection, paused })
    : null;
  const cloud =
    data.plugins?.find(
      (p) => isCloudAgent(p) && p.enabled && p.id === data.currentSession?.pluginInstanceId,
    ) ??
    data.plugins?.find((p) => isCloudAgent(p) && p.enabled) ??
    data.plugins?.find(isCloudAgent);
  const cloudMode =
    !remoteMode &&
    !notificationMode &&
    !!cloud &&
    (!data.assistants.some(isChatModel) || data.currentSession?.pluginInstanceId === cloud.id);
  const pluginMode = cloudMode || remoteMode || notificationMode;
  const cloudSetupIssue =
    setupIssue &&
    ["cloud_plus_required", "cloud_agent_unavailable", "plugin_disabled"].includes(setupIssue.code);
  const action = async (
    type: "bind" | "rebind" | "disconnect" | "select" | "create" | "rename" | "delete",
    id = data.selectedConnectionId,
  ) => {
    setBusy(true);
    try {
      if (type === "create") await request("/wechat/links", json({ name }));
      else if (type === "rename") await request(`/wechat/links/${id}`, json({ name }, "PATCH"));
      else if (type === "delete") await request(`/wechat/links/${id}`, { method: "DELETE" });
      else
        await request(
          selected || type === "rebind" ? `/wechat/links/${id}/${type}` : `/wechat/${type}`,
          {
            method: "POST",
          },
        );
      await refresh();
      setLimitCode(undefined);
      setDisconnect(false);
      setEditor(null);
      if (type === "disconnect") notify(pageCopy["微信已断开，可以随时重新绑定"]);
    } catch (e) {
      setLimitCode(limitErrorCode(e));
      notify(workspaceError(e as Error, locale), true);
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page-enter">
      <PageHead
        eyebrow="YOUR FAMILIAR PLACE"
        title={pageCopy["微信连接"]}
        description={pageCopy["每条链接独立聊天，共用你的模型配置与 credits。"]}
        action={
          <button
            className="button"
            disabled={busy || atLimit}
            onClick={() => {
              setName(
                formatCopy(pageCopy["微信链接 {value0}"], { value0: data.connections.length + 1 }),
              );
              setEditor("create");
            }}
          >
            <Plus size={17} />
            {pageCopy["创建链接"]}
          </button>
        }
      />
      {/* 免费用户撞限给升级出口；Plus 撞到 10 条上限时升级没意义，只说清楚该怎么办。 */}
      {upgradeHint && <LimitHint code={upgradeHint} />}
      {data.plan !== "free" && atLimit && (
        <p className="wechat-link-limit-note" role="status">
          {pageCopy["已达 "]}
          {data.limits.connections}
          {pageCopy[" 条链接上限：先删掉不用的链接再创建新的。"]}
        </p>
      )}
      <div className="panel wechat-link-toolbar">
        <label htmlFor="wechat-link-select">
          {pageCopy["管理链接"]}
          <select
            id="wechat-link-select"
            value={selected?.id ?? ""}
            disabled={busy || !data.connections.length}
            onChange={(e) => void action("select", e.target.value)}
          >
            {!data.connections.length && <option value="">{pageCopy["尚未创建链接"]}</option>}
            {data.connections.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
                {l.paused
                  ? pageCopy[" · 已暂停"]
                  : l.status === "connected"
                    ? pageCopy[" · 已连接"]
                    : pageCopy[" · 待连接"]}
              </option>
            ))}
          </select>
        </label>
        <span className="subtle">
          {data.connections.length} / {data.limits.connections}
          {pageCopy[" 个 ·"]} {data.plan === "plus" ? "Plus" : "Free"}
        </span>
        {selected && (
          <div className="wechat-link-tools">
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setName(selected.name);
                setEditor("rename");
              }}
            >
              <Pencil size={15} />
              {pageCopy["重命名"]}
            </button>
            <button
              className="text-button muted"
              disabled={busy}
              onClick={() => setEditor("delete")}
            >
              <Trash2 size={15} />
              {pageCopy["删除链接"]}
            </button>
          </div>
        )}
      </div>
      {data.plan === "free" && (
        <div className="simple-note wechat-link-note">
          {pageCopy["Free 最多创建 1 个微信链接；Plus 最多 10 个。"]}{" "}
          <Link className="text-link" to={`${base}/billing`}>
            {pageCopy["升级 Plus "]}
            <ArrowUpRight size={14} />
          </Link>
        </div>
      )}
      {paused && (
        <div className="gentle-tip wechat-link-note">
          <ShieldCheck size={20} />
          <div>
            {
              pageCopy[
                "此链接的聊天功能因会员到期暂停。已绑定链接会保留收消息通道，回复到期原因与续费入口；第一条链接仍可正常使用，聊天记录保留。"
              ]
            }{" "}
            <Link className="text-link" to={`${base}/billing`}>
              {pageCopy["续费 Plus，恢复链接"]}
            </Link>
          </div>
        </div>
      )}
      {setupIssue && !paused && (
        <div className="gentle-tip wechat-link-note" role="status">
          <ShieldCheck size={20} />
          <div>
            <h3>{cloudMode ? pageCopy["请检查小薇配置"] : pageCopy["普通模型聊天尚未就绪"]}</h3>
            <p>{workspaceError(setupIssue, locale)}</p>
            <p>
              {
                pageCopy[
                  "可以先扫码连接微信；接入已有 Agent 或只收通知，可在「插件」中配置，无需另配模型。"
                ]
              }
            </p>
            <Link className="text-link" to={`${base}${cloudSetupIssue ? "/plugins" : "/channels"}`}>
              {cloudSetupIssue ? pageCopy["管理小薇"] : pageCopy["配置渠道与模型"]}
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
      )}
      <div className="connection-page-grid">
        <section className="panel binding-card">
          <div className="binding-card-top">
            <span className="connection-icon">
              <Smartphone size={28} />
            </span>
            <span className={`tag ${connected ? "green" : ""}`}>
              <span className="tiny-dot" />
              {paused
                ? pageCopy["已暂停"]
                : connected
                  ? pageCopy["已连接"]
                  : waiting
                    ? connection.verifyState
                      ? pageCopy["等待输入数字"]
                      : pageCopy["等待扫码确认"]
                    : connection.status === "expired"
                      ? pageCopy["连接已过期"]
                      : pageCopy["尚未连接"]}
            </span>
          </div>
          <h2>{selected?.name || pageCopy["扫一扫，让 AI 走进微信。"]}</h2>
          <p>
            {paused
              ? pageCopy["续费后可继续使用此链接；若微信凭据过期，需要重新扫码。"]
              : connected
                ? remoteMode
                  ? formatCopy(
                      pageCopy["发送 /use {value0} 选择 Agent；确认连接器在线后，再发送任务。"],
                      { value0: remote!.shortcut },
                    )
                  : notificationMode
                    ? ((notificationIssue
                        ? workspaceError(notificationIssue, locale)
                        : undefined) ??
                      pageCopy[
                        "已完成首次通信。到插件页配置 Token 并测试推送；通知受最近互动后的 24 小时回复窗口限制。"
                      ])
                    : setupIssue
                      ? pageCopy["微信已连接。配置模型或插件后即可使用；只收通知也可以继续配置。"]
                      : pageCopy["现在就可以在微信里与你选择的模型对话。"]
                : pageCopy["使用你自己的微信扫码，在手机上完成连接确认。"]}
          </p>
          <ConnectionPrivacy wechat />
          {!connected && !paused && (
            <p className="wechat-mobile-scan-note">
              {
                pageCopy[
                  "正在用手机浏览？请在电脑或另一台设备登录本站，打开「微信连接」展示二维码，再用这部手机的微信 ClawBot 扫码。"
                ]
              }
            </p>
          )}
          {!connected && !paused && (
            <div className="qr-area">
              {waiting && connection.verifyState ? (
                <VerifyCodeForm
                  state={connection.verifyState}
                  onSubmit={(code) =>
                    request(
                      selected
                        ? `/wechat/links/${data.selectedConnectionId}/verify`
                        : "/wechat/verify",
                      json({ code }),
                    ).then(() => refresh())
                  }
                />
              ) : waiting && connection.qrUrl ? (
                <>
                  <QRCodeSVG value={connection.qrUrl} size={192} marginSize={3} fgColor="#294c3d" />
                  <span>
                    {connection.status === "scanned"
                      ? pageCopy["已扫码，请在手机上确认"]
                      : pageCopy["使用微信 ClawBot 的「扫一扫」"]}
                  </span>
                </>
              ) : (
                <>
                  <QrCode size={110} strokeWidth={0.8} />
                  <p>
                    {connection.status === "expired"
                      ? pageCopy["二维码已过期，请重新获取"]
                      : pageCopy["生成你的专属连接二维码"]}
                  </p>
                  <button className="button" disabled={busy} onClick={() => void action("bind")}>
                    {busy ? pageCopy["正在获取…"] : pageCopy["获取二维码"]}
                    <ArrowUpRight size={16} />
                  </button>
                </>
              )}
            </div>
          )}
          {connected && (
            <div className="connected-visual">
              <span className="connected-ring">
                <Link2 size={44} strokeWidth={1.4} />
                <i>
                  <Check size={17} />
                </i>
              </span>
              <strong>{pageCopy["微伴 ↔ 你的微信"]}</strong>
              <small>{pageCopy["个人连接 · 独立会话"]}</small>
            </div>
          )}
          {connection.error && (
            <div className="form-error">
              {locale === "pt" ? workspaceError(connection.error, locale) : connection.error}
            </div>
          )}
          {connected && connection.pushWindow && <PushWindowNote push={connection.pushWindow} />}
          {connected && (
            <div className="simple-note">
              {
                pageCopy[
                  "每次扫码连接后，在微信发送任意一条消息，就会收到一次微伴的招呼和命令速查链接。 发送"
                ]
              }{" "}
              <code>/wx help</code>
              {pageCopy[" 不消耗 credits。"]}
              <Link className="text-link" to={COMMANDS_GUIDE_PATH}>
                {pageCopy["查看微信命令速查 "]}
                <ArrowUpRight size={14} />
              </Link>
            </div>
          )}
          <div className="binding-details">
            <div>
              <span>
                {pluginMode || (data.currentSession && !data.currentSession.assistantId)
                  ? pageCopy["当前入口"]
                  : pageCopy["当前渠道"]}
              </span>
              <strong>
                {data.currentSession?.channelName ||
                  (cloudMode
                    ? pageCopy["微伴托管"]
                    : remoteMode
                      ? pageCopy["外部 Agent"]
                      : notificationMode
                        ? pageCopy["HTTP 推送"]
                        : pageCopy["尚未选择"])}
              </strong>
            </div>
            <div>
              <span>
                {pluginMode || (data.currentSession && !data.currentSession.assistantId)
                  ? pageCopy["当前服务"]
                  : pageCopy["当前模型"]}
              </span>
              <strong>
                {data.currentSession?.assistantName ||
                  (cloudMode
                    ? cloud?.name
                    : remoteMode
                      ? remote?.name
                      : notificationMode
                        ? pageCopy["消息提醒"]
                        : pageCopy["尚未选择"])}
              </strong>
            </div>
            <div>
              <span>{pageCopy["当前会话"]}</span>
              <strong>{data.currentSession?.title || pageCopy["还没有会话"]}</strong>
            </div>
            <div>
              <span>{pageCopy["最近消息"]}</span>
              <strong>
                {connection.lastSeen
                  ? relativeTime(connection.lastSeen, locale)
                  : pageCopy["等待第一条消息"]}
              </strong>
            </div>
          </div>
          <div className="binding-actions">
            {paused ? (
              <Link className="button" to={`${base}/billing`}>
                {pageCopy["续费 Plus"]}
              </Link>
            ) : connected ? (
              <>
                <Link
                  className="button secondary"
                  to={`${base}${pluginMode || setupIssue ? "/plugins" : "/channels"}`}
                >
                  {pluginMode || setupIssue
                    ? pageCopy["管理插件与接入方式"]
                    : pageCopy["切换渠道与模型"]}
                  <ArrowUpRight size={15} />
                </Link>
                <button className="text-button muted" onClick={() => setDisconnect(true)}>
                  <Unplug size={16} />
                  {pageCopy["断开连接"]}
                </button>
              </>
            ) : waiting ? (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void action("rebind")}
              >
                <RefreshCw size={15} />
                {pageCopy["重新生成二维码"]}
              </button>
            ) : (
              <Link className="text-link" to={`${base}/plugins`}>
                {pageCopy["接入已有 Agent 或配置通知"]}
                <ArrowUpRight size={15} />
              </Link>
            )}
          </div>
        </section>
        <aside>
          <div className="panel connection-guide">
            <span className="eyebrow">
              {locale === "pt" ? ptCopy["READY IN A MOMENT"] : "READY IN A MOMENT"}
            </span>
            <h2>{pageCopy["接下来，很简单。"]}</h2>
            {[
              remoteMode
                ? [
                    "01",
                    formatCopy(pageCopy["连接 {value0}"], {
                      value0: remoteAgentName(remote!.pluginId),
                    }),
                    pageCopy[
                      "在插件页完成 Agent 配对，无需在微伴另配模型。Muse 使用托管环境；OpenClaw 和 Hermes 需保持运行设备在线。"
                    ],
                  ]
                : notificationMode
                  ? [
                      "01",
                      pageCopy["配置消息提醒"],
                      pageCopy["在插件页选择接收微信并生成专属 Token，无需模型 API Key。"],
                    ]
                  : cloudMode
                    ? [
                        "01",
                        pageCopy["确认小薇配置"],
                        pageCopy[
                          "默认使用当前微信的默认文本模型，也可在插件中单独指定；Plus 有效且云端服务已开放时可使用。"
                        ],
                      ]
                    : [
                        "01",
                        pageCopy["选择使用方式"],
                        pageCopy[
                          "聊模型时配置渠道与文本模型；已有 Agent 或只收通知，可直接在插件页配置。扫码本身无需模型。"
                        ],
                      ],
              [
                "02",
                pageCopy["扫码并确认连接"],
                pageCopy[
                  "打开微信「设置」，在「功能」分组进入「插件 → 微信 ClawBot → 扫一扫」，扫描二维码并确认连接。"
                ],
              ],
              remoteMode
                ? [
                    "03",
                    formatCopy(pageCopy["发送 /use {value0}"], { value0: remote!.shortcut }),
                    pageCopy[
                      "收到进入插件的确认、连接器在线后，再发送文字任务；扫码不会自动选择 Agent。"
                    ],
                  ]
                : notificationMode
                  ? [
                      "03",
                      pageCopy["发送 /wx help，再测试推送"],
                      pageCopy["先在微信建立回复通道，再用专属 Token 从你的服务发送一条通知。"],
                    ]
                  : cloudMode
                    ? [
                        "03",
                        formatCopy(pageCopy["发送 /use {value0}"], { value0: cloud?.shortcut }),
                        pageCopy[
                          "进入小薇后直接发送文字任务；/wx stop 请求停止，结果也可在云端任务页查看。"
                        ],
                      ]
                    : [
                        "03",
                        pageCopy["发送 /wx help，收到使用教程"],
                        pageCopy["免费了解常用命令，再开始你的第一段对话。"],
                      ],
            ].map(([n, title, desc]) => (
              <div className="guide-step" key={n}>
                <span>{n}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="gentle-tip large">
            <ShieldCheck size={22} />
            <div>
              <h3>{pageCopy["你的连接，由你掌握"]}</h3>
              <p>
                {
                  pageCopy[
                    "每条链接只处理该链接绑定微信本人的消息，会话与上下文互不影响。连接过期时可重新扫码。"
                  ]
                }
              </p>
              <p>{pageCopy["微信回复窗口受平台限制，长期未互动时可能无法主动发消息。"]}</p>
            </div>
          </div>
          <div className="simple-note">
            {
              pageCopy[
                "微伴是独立开发产品，与微信及腾讯无官方关联。首次连接后，请先用几条简短消息确认服务正常。"
              ]
            }
          </div>
        </aside>
      </div>
      {editor && (
        <Modal
          title={
            editor === "create"
              ? pageCopy["创建微信链接"]
              : editor === "rename"
                ? pageCopy["重命名链接"]
                : pageCopy["删除此微信链接？"]
          }
          description={
            editor === "delete"
              ? pageCopy[
                  "此链接将停止收发并释放名额，其他链接不受影响。聊天记录仍保留，但新链接不会接续旧链接的会话。"
                ]
              : pageCopy["起一个容易区分的名字，例如：日常微信、工作微信。"]
          }
          onClose={() => {
            if (!busy) setEditor(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(editor);
            }}
          >
            {editor !== "delete" && (
              <div className="form-body">
                <label>
                  {pageCopy["链接名称"]}
                  <input
                    autoFocus
                    required
                    maxLength={40}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setEditor(null)}
              >
                {pageCopy["取消"]}
              </button>
              <button className={`button ${editor === "delete" ? "danger" : ""}`} disabled={busy}>
                {busy
                  ? pageCopy["正在处理…"]
                  : editor === "delete"
                    ? pageCopy["确认删除"]
                    : pageCopy["保存"]}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {disconnect && (
        <Modal
          title={pageCopy["断开微信连接？"]}
          description={
            pageCopy[
              "只停止此链接的微信收发，其他链接不受影响。聊天记录保留，重新扫码不占用新的链接名额。"
            ]
          }
          onClose={() => setDisconnect(false)}
        >
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setDisconnect(false)}>
              {pageCopy["保持连接"]}
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={() => void action("disconnect")}
            >
              {pageCopy["确认断开"]}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
