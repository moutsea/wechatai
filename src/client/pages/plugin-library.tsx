import { workspaceError, workspaceLabel } from "../workspace-copy";
import { useLocale } from "../locale";
import { copy as sourceCopy } from "../../shared/i18n/zh-CN/copy/plugin-library-page";
import { copy as koCopy } from "../../shared/i18n/ko/copy/plugin-library-page";
import { workspaceCopy as ptCopy } from "../../shared/i18n/pt/copy/workspace";
import { formatCopy } from "../../shared/i18n/dashboard";
import {
  cloudAgentAvailabilityIssue,
  isCloudAgent,
  resolveCloudAgentModel,
} from "../../shared/cloud-agent";
import {
  availablePluginIds,
  canAddPlugin,
  pluginAvailable,
  pluginLimitIssue,
} from "../../shared/plugin-access";
import { PLUGIN_SHORTCUT_PATTERN, PLUGIN_SHORTCUT_HINT } from "../../shared/plugin-shortcut";
import { useState } from "react";
import { GROK_DISPATCH_UNAVAILABLE } from "../../shared/grok-bot";
import type { PersonalAssistantPlugin } from "../../shared/personal-assistant";
import { NotificationAccess } from "./notification-editor";
import { isRemoteAgentId, isRemoteAgent, remoteAgentName } from "../../shared/remote-agent";
import { Link } from "react-router-dom";
import { ArrowRight, Check, FlaskConical, Pencil, Plus, Trash2 } from "lucide-react";
import { useApp } from "../context";
import { Modal } from "../ui";
import type { UserPlugin } from "../../shared/image-generation";
import { DEEPSEEK_SEARCH_DEFAULT_MODEL, searchProviderLabels } from "../../shared/web-research";
import { pluginIconSource, roleAvatarSource } from "../../shared/plugin-visuals";
import { remoteAgentConnection } from "../remote-agent-status";
import { conflictingShortcuts } from "../../shared/shortcut-conflicts";

export type PluginKind = UserPlugin["pluginId"];
type PluginMaintenance = (id: string, patch: { shortcut?: string; enabled?: false }) => void;

function PluginAlias({
  plugin,
  busy,
  onManage,
  paused,
}: {
  plugin: UserPlugin;
  busy: boolean;
  onManage: PluginMaintenance;
  paused: boolean;
}) {
  const { locale } = useLocale();
  const pageCopy =
    locale === "ko" ? koCopy : locale === "pt" ? ptCopy : sourceCopy;

  const [shortcut, setShortcut] = useState(plugin.shortcut);
  return (
    <form
      className="plugin-config-usage"
      onSubmit={(event) => {
        event.preventDefault();
        onManage(plugin.id, { shortcut: shortcut.trim() });
      }}
    >
      <label>
        {paused ? pageCopy["修改暂停配置的别名"] : pageCopy["修改别名"]}
        <input
          required
          maxLength={24}
          pattern={PLUGIN_SHORTCUT_PATTERN}
          title={workspaceLabel(locale, PLUGIN_SHORTCUT_HINT)}
          value={shortcut}
          disabled={busy}
          onChange={(event) => setShortcut(event.target.value)}
        />
      </label>
      <button
        className="button secondary small"
        disabled={busy || shortcut.trim() === plugin.shortcut}
      >
        {pageCopy["保存别名"]}
      </button>
    </form>
  );
}

function getLibrary(pageCopy: typeof sourceCopy) {
  return [
    {
      id: "wechatai/cloud-agent",
      name: pageCopy["小薇"],
      description:
        pageCopy[
          "你的微伴云端助手，不用安装、不用部署。在微信交代任务，小薇帮你处理文件、生成文档，结果直接发回来。"
        ],
      tags: [pageCopy["Plus 专属"], pageCopy["自备模型 Key"], pageCopy["无需部署"]],
    },
    {
      id: "wechatai/notification",
      name: pageCopy["消息提醒"],
      description:
        pageCopy[
          "用一个 HTTP 请求，把订单通知、服务告警和任务结果发到微信。专属 Token，随时接收你的消息。"
        ],
      tags: ["HTTP Webhook", pageCopy["无需模型"], pageCopy["不扣 credits"]],
    },
    {
      id: "wechatai/personal-assistant",
      name: pageCopy["个人助理"],
      description:
        pageCopy["随手记、记账、待办与提醒，一个入口就够。把日常琐事发到微信，需要时随时找回。"],
      tags: [pageCopy["独立记录库"], pageCopy["收支统计"], pageCopy["到期微信提醒"]],
    },
    {
      id: "wechatai/roleplay",
      name: pageCopy["角色扮演"],
      description:
        pageCopy[
          "让喜欢的角色住进微信。选择内置原创角色、自己写下人设，或导入角色卡，继续属于你们的故事。"
        ],
      tags: [pageCopy["角色卡导入"], pageCopy["关键词世界书"], pageCopy["独立剧情记忆"]],
    },
    {
      id: "wechatai/grok",
      name: "Grok Bot",
      description:
        pageCopy["把文字任务交给你已有的 Grok Bot，通过 Routine 唤醒，最终回复送回当前微信会话。"],
      tags: [pageCopy["已有个人 Bot"], pageCopy["文字任务"], "Webhook"],
    },
    {
      id: "wechatai/muse",
      name: "Muse",
      description:
        pageCopy[
          "把 Muse 托管助理接入微信。由 Muse hook 接收文字任务，沿用它的工具与记忆，并回传最终回复。"
        ],
      tags: [pageCopy["Muse 托管环境"], pageCopy["文字与主动推送"], pageCopy["自备 Muse"]],
    },
    {
      id: "wechatai/hermes",
      name: "Hermes",
      description:
        pageCopy["把微信连到自己的 Hermes Agent。沿用它的记忆与工具，接收定时任务和后台回复。"],
      tags: [pageCopy["本机主动连接"], pageCopy["定时与后台推送"], pageCopy["自备 Hermes"]],
    },
    {
      id: "wechatai/openclaw",
      name: "OpenClaw",
      description: pageCopy["把微信连到自己的 OpenClaw Agent。执行任务、接收定时提醒和后台结果。"],
      tags: [pageCopy["本机主动连接"], pageCopy["定时与后台推送"], pageCopy["自备 OpenClaw"]],
    },
    {
      id: "wechatai/web-research",
      name: "DS Chat",
      description: pageCopy["自然聊天，需要时再搜索、读网页。模型和搜索服务都由你选择。"],
      tags: [pageCopy["按需联网"], pageCopy["自备搜索 API"]],
    },
    {
      id: "wechatai/image-generation",
      name: pageCopy["AI 生图"],
      description: pageCopy["把一句描述变成图片，直接发到微信。连接你自己的生图渠道与 API Key。"],
      tags: [pageCopy["文字生图"], pageCopy["自备生图 API"], pageCopy["5 credits / 张"]],
    },
  ] as const;
}

export function PluginLibrary({
  onConfigure,
  onView,
  onResume,
}: {
  onConfigure: (kind: PluginKind) => void;
  onView: (kind: PluginKind) => void;
  onResume: (plugin: UserPlugin) => void;
}) {
  const { locale } = useLocale();
  const pageCopy =
    locale === "ko" ? koCopy : locale === "pt" ? ptCopy : sourceCopy;

  const library = getLibrary(pageCopy);
  const { data, base } = useApp();
  if (!data) return null;
  const canAdd = canAddPlugin(data.plan, data.plugins?.length ?? 0);
  const availableIds = availablePluginIds(data.plan, data.plugins ?? []);
  const shortcutConflicts = conflictingShortcuts([...data.assistants, ...(data.plugins ?? [])]);
  const cloudAvailability = cloudAgentAvailabilityIssue(data.plan, data.cloudAgent);
  const visible = library.filter(({ id }) => id !== "wechatai/grok" || data.grokBotVisible);
  return (
    <div className="plugin-library">
      {visible.map(({ id, name, description, tags }) => {
        const configs = (data.plugins ?? []).filter((p) => p.pluginId === id);
        const conflicts = configs.filter((p) => shortcutConflicts.has(p.shortcut.toLowerCase()));
        const usable = configs.filter((p) => availableIds.has(p.id));
        const allowed = usable.length > 0;
        const active = usable.find((p) => p.id === data.currentSession?.pluginInstanceId);
        const remote = usable.filter(isRemoteAgent);
        const available = remote.filter((p) => p.enabled);
        const online = available.filter(
          (p) => remoteAgentConnection(p, undefined, locale).state === "online",
        );
        const representative =
          active ?? online[0] ?? usable.find((p) => p.enabled) ?? usable[0] ?? configs[0];
        const enabled = usable.some((p) => p.enabled);
        const connection =
          isRemoteAgent(representative) && remoteAgentConnection(representative, undefined, locale);
        const connectedBefore = available.some(
          (p) => remoteAgentConnection(p, undefined, locale).connectedBefore,
        );
        const resume = configs.length === 1 && connection && !connection.connectedBefore;
        const notificationReady = usable.some((p) => p.enabled && p.hasKey);
        const cloudUnavailable =
          (id === "wechatai/cloud-agent" && !data.cloudAgent.ready) ||
          (id === "wechatai/grok" && !data.grokBotReady);
        const cloudLabel = cloudUnavailable
          ? configs.length
            ? pageCopy["服务未就绪"]
            : pageCopy["暂未开放"]
          : id === "wechatai/cloud-agent" && configs.length
            ? data.plan !== "plus"
              ? pageCopy["需开通或续费 Plus"]
              : !enabled
                ? pageCopy["已停用"]
                : pageCopy["已配置"]
            : null;
        const defaultStatusLabel = !configs.length
          ? pageCopy["未配置"]
          : !allowed
            ? pageCopy["已暂停"]
            : id === "wechatai/notification"
              ? !enabled
                ? pageCopy["已停用"]
                : notificationReady
                  ? pageCopy["已配置"]
                  : pageCopy["待设置 Token"]
              : !remote.length
                ? pageCopy["已配置"]
                : !enabled
                  ? pageCopy["已停用"]
                  : id === "wechatai/grok" && connection
                    ? connection.label
                    : online.length
                      ? pageCopy["已连接"]
                      : connectedBefore
                        ? pageCopy["已离线"]
                        : available.some((p) => p.hasKey)
                          ? pageCopy["等待上线"]
                          : pageCopy["待连接"];
        const statusLabel = cloudLabel ?? defaultStatusLabel;
        const positiveStatus =
          allowed &&
          (id === "wechatai/cloud-agent"
            ? cloudLabel === pageCopy["已配置"]
            : id === "wechatai/notification"
              ? notificationReady
              : remote.length
                ? online.length > 0
                : configs.length > 0);
        const actionLabel =
          id === "wechatai/notification"
            ? configs.some((p) => p.hasKey)
              ? pageCopy["管理 Token"]
              : pageCopy["设置 Token"]
            : resume && allowed
              ? pageCopy["继续连接"]
              : pageCopy["查看配置"];
        return (
          <article className="plugin-entry" key={id} aria-label={name}>
            <div className="plugin-entry-icon">
              <img src={pluginIconSource(id)} alt="" width={56} height={56} decoding="async" />
            </div>
            <div className="plugin-entry-content">
              <div className="plugin-entry-heading">
                <h2>{name}</h2>
                <span className={`plugin-status ${positiveStatus ? "configured" : ""}`}>
                  {positiveStatus ? <Check size={13} /> : null}
                  {statusLabel}
                  {configs.length > 1 &&
                    formatCopy(pageCopy[" · {value0}{value1} 组"], {
                      value0: online.length ? `${online.length}/` : "",
                      value1: configs.length,
                    })}
                </span>
              </div>
              <p>{description}</p>
              <div className="plugin-entry-tags">
                {id === "wechatai/cloud-agent" && data.cloudAgent.adminPreview && (
                  <span>{pageCopy["管理员内测"]}</span>
                )}
                {tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              {id === "wechatai/web-research" && (
                <small className="plugin-attribution">
                  {pageCopy["基于"]}{" "}
                  <a
                    href="https://github.com/deepseek-ai/deepseek-harness"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    DeepSeek Harness
                  </a>{" "}
                  {pageCopy["开源项目开发"]}
                </small>
              )}
              {(configs.length > 0 || cloudUnavailable) && (
                <div className="plugin-entry-summary">
                  {representative && (
                    <code>
                      {id === "wechatai/notification"
                        ? pageCopy["HTTP 推送"]
                        : `@${representative.shortcut}`}
                    </code>
                  )}
                  <span>
                    {(id === "wechatai/cloud-agent" &&
                      (cloudAvailability
                        ? workspaceError(cloudAvailability, locale)
                        : undefined)) ||
                      (id === "wechatai/grok" &&
                        cloudUnavailable &&
                        workspaceLabel(locale, GROK_DISPATCH_UNAVAILABLE)) ||
                      (!allowed
                        ? pageCopy["超出当前套餐的插件上限"]
                        : !enabled
                          ? pageCopy["配置已停用"]
                          : connection && connection.state !== "online"
                            ? connection.description
                            : id === "wechatai/notification"
                              ? representative.hasKey
                                ? pageCopy["Token 已配置"]
                                : pageCopy["待生成专属 Token"]
                              : active
                                ? pageCopy["微信默认使用中"]
                                : pageCopy["在任意对话中单次调用"])}
                  </span>
                </div>
              )}
              {conflicts.length > 0 && (
                <button className="text-link shortcut-conflict" onClick={() => onView(id)}>
                  {conflicts.length}
                  {pageCopy[" 组配置的别名重复 · 查看并修改"]}
                </button>
              )}
            </div>
            <div className="plugin-entry-action">
              {configs.length ? (
                <button
                  className="button secondary small"
                  onClick={() => (resume && allowed ? onResume(representative) : onView(id))}
                  aria-label={
                    id === "wechatai/notification"
                      ? formatCopy(pageCopy["消息提醒：{value0}"], { value0: actionLabel })
                      : resume && allowed
                        ? formatCopy(pageCopy["继续连接 {value0}"], { value0: name })
                        : formatCopy(pageCopy["查看 {value0} 配置"], { value0: name })
                  }
                >
                  {actionLabel} <ArrowRight size={15} />
                </button>
              ) : cloudUnavailable ? (
                <button className="button secondary small" disabled>
                  {pageCopy["暂未开放"]}
                </button>
              ) : data.plan === "free" && (id === "wechatai/cloud-agent" || !canAdd) ? (
                <button
                  className="button secondary small"
                  onClick={() => onConfigure(id)}
                  aria-label={formatCopy(pageCopy["配置 {value0}"], { value0: name })}
                >
                  <Plus size={15} />
                  {pageCopy[" 配置插件"]}
                </button>
              ) : !data.assistants.length &&
                !isRemoteAgentId(id) &&
                id !== "wechatai/notification" &&
                id !== "wechatai/cloud-agent" ? (
                <Link className="button secondary small" to={`${base}/channels`}>
                  {pageCopy["先添加模型 "]}
                  <ArrowRight size={15} />
                </Link>
              ) : (
                <button
                  className="button small"
                  onClick={() => onConfigure(id)}
                  aria-label={formatCopy(pageCopy["配置 {value0}"], { value0: name })}
                >
                  <Plus size={15} />
                  {pageCopy[" 配置插件"]}
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function PluginConfiguration({
  kind,
  selectedId,
  onSelect,
  busy,
  onClose,
  onAdd,
  onEdit,
  onTest,
  onDelete,
  onAction,
  onManage,
  onRecords,
}: {
  kind: PluginKind;
  selectedId: string;
  onSelect: (id: string) => void;
  busy: boolean;
  onClose: () => void;
  onAdd: (kind: PluginKind) => void;
  onEdit: (plugin: UserPlugin) => void;
  onTest: (plugin: UserPlugin) => void;
  onDelete: (plugin: UserPlugin) => void;
  onRecords: (plugin: PersonalAssistantPlugin) => void;
  onAction: (id: string, action: "activate" | "exit") => void;
  onManage: PluginMaintenance;
}) {
  const { locale } = useLocale();
  const pageCopy =
    locale === "ko" ? koCopy : locale === "pt" ? ptCopy : sourceCopy;

  const library = getLibrary(pageCopy);
  const { data, base } = useApp();
  if (!data) return null;
  const configs = (data.plugins ?? []).filter((p) => p.pluginId === kind);
  const selected =
    configs.find((p) => p.id === selectedId) ??
    configs.find((p) => p.id === data.currentSession?.pluginInstanceId) ??
    configs[0];
  const title = library.find((p) => p.id === kind)!.name;
  const allowed = !!selected && pluginAvailable(data.plan, data.plugins ?? [], selected.id);
  const canAdd = canAddPlugin(data.plan, data.plugins?.length ?? 0);
  const shortcutConflicts = conflictingShortcuts([...data.assistants, ...(data.plugins ?? [])]);
  const aliasConflict = !!selected && shortcutConflicts.has(selected.shortcut.toLowerCase());
  const model = isCloudAgent(selected)
    ? resolveCloudAgentModel(selected, data.assistants, data.defaultModelId)
    : data.assistants.find(
        (a) => a.id === (selected && "modelId" in selected ? selected.modelId : null),
      );
  const active = selected && data.currentSession?.pluginInstanceId === selected.id;
  const connection = isRemoteAgent(selected)
    ? remoteAgentConnection(
        {
          ...selected,
          access: allowed ? selected.access : pluginLimitIssue(data.planUntil),
        },
        undefined,
        locale,
      )
    : null;
  const cloud = isCloudAgent(selected) ? selected : null;
  const cloudAvailability = cloudAgentAvailabilityIssue(data.plan, data.cloudAgent);
  const cloudIssue = cloud
    ? ((cloudAvailability ? workspaceError(cloudAvailability, locale) : undefined) ??
      (cloud.access ? workspaceError(cloud.access, locale) : undefined))
    : null;
  const needsUpgrade = data.plan === "free" && (kind === "wechatai/cloud-agent" || !canAdd);
  const grokUnavailable = kind === "wechatai/grok" && !data.grokBotReady;
  const canConfigure =
    !grokUnavailable &&
    (canAdd || needsUpgrade) &&
    (kind === "wechatai/cloud-agent"
      ? !cloudAvailability || cloudAvailability.code === "cloud_plus_required"
      : isRemoteAgentId(kind) ||
        kind === "wechatai/notification" ||
        needsUpgrade ||
        data.assistants.length > 0);
  const incomplete = connection && !connection.connectedBefore;
  return (
    <Modal
      title={formatCopy(pageCopy["{value0} 配置"], { value0: title })}
      description={
        kind === "wechatai/notification"
          ? pageCopy["设置专属 Token，查看推送接口与投递记录。"]
          : pageCopy["查看连接信息，管理在微信中的使用方式。"]
      }
      onClose={onClose}
      wide={kind === "wechatai/notification"}
    >
      <div className="plugin-config-body">
        {selected ? (
          <>
            <div className="plugin-config-selector">
              <img
                className="plugin-config-avatar"
                src={
                  (selected.pluginId === "wechatai/roleplay" &&
                    roleAvatarSource(selected.avatar)) ||
                  pluginIconSource(kind)
                }
                alt=""
                width={48}
                height={48}
              />
              {configs.length > 1 ? (
                <label>
                  {pageCopy["选择配置"]}
                  <select
                    value={selected.id}
                    disabled={busy}
                    onChange={(e) => onSelect(e.target.value)}
                  >
                    {configs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.pluginId === "wechatai/notification" ? "" : ` · @${p.shortcut}`}
                        {shortcutConflicts.has(p.shortcut.toLowerCase()) && pageCopy[" · 别名重复"]}
                        {isRemoteAgent(p) &&
                          ` · ${remoteAgentConnection(p, undefined, locale).label}`}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <h3>{selected.name}</h3>
              )}
              <span
                className={`plugin-status ${allowed && !cloudIssue && !grokUnavailable && selected.enabled && (!connection || connection.state === "online") ? "configured" : ""}`}
              >
                {!allowed
                  ? pageCopy["已暂停"]
                  : !selected.enabled
                    ? pageCopy["已停用"]
                    : cloudIssue || grokUnavailable
                      ? pageCopy["服务不可用"]
                      : (connection?.label ?? pageCopy["已启用"])}
              </span>
            </div>
            {selected.pluginId === "wechatai/personal-assistant" && (
              <button className="button secondary" onClick={() => onRecords(selected)}>
                {pageCopy["查看笔记、账目与提醒 "]}
                <ArrowRight size={15} />
              </button>
            )}
            {selected.pluginId === "wechatai/notification" ? (
              <>
                <dl className="plugin-config-details">
                  <div>
                    <dt>{pageCopy["接收微信"]}</dt>
                    <dd>
                      {data.connections.find((c) => c.id === selected.connectionId)?.name ??
                        pageCopy["链接已删除，请修改配置"]}
                    </dd>
                  </div>
                  <div>
                    <dt>{pageCopy["使用费用"]}</dt>
                    <dd>{pageCopy["不调用模型，不扣 credits"]}</dd>
                  </div>
                </dl>
                <NotificationAccess key={selected.id} plugin={selected} />
              </>
            ) : (
              <>
                <dl className="plugin-config-details">
                  <div>
                    <dt>{pageCopy["快捷名称"]}</dt>
                    <dd>
                      <code>@{selected.shortcut}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>
                      {isRemoteAgentId(kind)
                        ? formatCopy(pageCopy["{value0} 助手"], { value0: remoteAgentName(kind) })
                        : kind === "wechatai/image-generation"
                          ? pageCopy["生图模型"]
                          : pageCopy["回答模型"]}
                    </dt>
                    <dd>
                      {isRemoteAgent(selected) ? (
                        (selected.agents?.find((a) => a.id === selected.agentId)?.name ??
                        (kind === "wechatai/grok"
                          ? pageCopy["拥有该 Routine 的 Grok Bot"]
                          : selected.hasKey
                            ? selected.agentId
                            : pageCopy["连接后自动识别"]))
                      ) : model ? (
                        <>
                          {isCloudAgent(selected) && !selected.modelId && pageCopy["默认模型："]}
                          {model.channelName} / {model.name}
                          <code className="plugin-model-id">{model.model}</code>
                        </>
                      ) : isCloudAgent(selected) && !selected.modelId ? (
                        pageCopy["尚未配置默认文本模型"]
                      ) : (
                        pageCopy["模型已删除"]
                      )}
                    </dd>
                  </div>
                  {selected.pluginId === "wechatai/personal-assistant" ? (
                    <>
                      <div>
                        <dt>{pageCopy["默认币种"]}</dt>
                        <dd>{selected.currency}</dd>
                      </div>
                      <div>
                        <dt>{pageCopy["提醒链接"]}</dt>
                        <dd>
                          {data.connections.find((c) => c.id === selected.reminderConnectionId)
                            ?.name ?? pageCopy["暂未设置"]}
                        </dd>
                      </div>
                      <div>
                        <dt>{pageCopy["时间"]}</dt>
                        <dd>{pageCopy["北京时间 · 支持一次性、每天、每周提醒"]}</dd>
                      </div>
                    </>
                  ) : isRemoteAgent(selected) ? (
                    <>
                      <div>
                        <dt>{pageCopy["连接状态"]}</dt>
                        <dd>
                          {grokUnavailable
                            ? workspaceLabel(locale, GROK_DISPATCH_UNAVAILABLE)
                            : connection?.description}
                        </dd>
                      </div>
                      <div>
                        <dt>{pageCopy["主动推送"]}</dt>
                        <dd>
                          {selected.allowProactive
                            ? pageCopy["允许定时任务与后台结果"]
                            : pageCopy["已关闭"]}
                        </dd>
                      </div>
                      <div>
                        <dt>{pageCopy["文字上限"]}</dt>
                        <dd>
                          {pageCopy["输入 "]}
                          {selected.maxInputTokens}
                          {pageCopy[" / 输出 "]}
                          {selected.maxOutputTokens} tokens
                        </dd>
                      </div>
                      <div>
                        <dt>{pageCopy["模型与工具"]}</dt>
                        <dd>
                          {pageCopy["在 "]}
                          {remoteAgentName(selected.pluginId)}
                          {pageCopy[" 中管理，无需本站模型渠道"]}
                        </dd>
                      </div>
                    </>
                  ) : isCloudAgent(selected) ? (
                    <>
                      <div>
                        <dt>{pageCopy["服务状态"]}</dt>
                        <dd>{cloudIssue ?? pageCopy["已配置；在微信提交任务验证实际运行"]}</dd>
                      </div>
                      {data.cloudAgent.ready && (
                        <>
                          <div>
                            <dt>{pageCopy["账号任务额度"]}</dt>
                            <dd>
                              {pageCopy["今日 "]}
                              {data.cloudAgent.usedToday} / {data.cloudAgent.dailyLimit}
                              {pageCopy[" 次 · 执行中 "]}
                              {data.cloudAgent.active} / {data.cloudAgent.maxActive}
                              {pageCopy[" 个"]}
                            </dd>
                          </div>
                          <div>
                            <dt>{pageCopy["执行时限"]}</dt>
                            <dd>
                              {data.cloudAgent.deadlineMinutes}
                              {pageCopy[" 分钟后请求停止，等待云端确认"]}
                            </dd>
                          </div>
                        </>
                      )}
                      <div>
                        <dt>{pageCopy["任务记录"]}</dt>
                        <dd>
                          <Link to={`${base}/tasks?plugin=${selected.id}`}>
                            {pageCopy["查看云端任务"]}
                          </Link>
                          {" · "}
                          <Link to="/docs/cloud-agent">{pageCopy["使用指南"]}</Link>
                        </dd>
                      </div>
                      <div>
                        <dt>{pageCopy["使用费用"]}</dt>
                        <dd>
                          {
                            pageCopy[
                              "输入和最终回复文字按 token 扣 credits，返回图片每张另计 5 credits，非图片文件不另收费；模型 API 费用另付服务商，包括内部多次调用。失败或确认取消不收成功账单，请求停止的费用以最终结果为准。"
                            ]
                          }
                        </dd>
                      </div>
                      <div>
                        <dt>{pageCopy["支持范围"]}</dt>
                        <dd>
                          {
                            pageCopy[
                              "文字、图片、可提取文字的 PDF、DOCX 和文本文件，以及带微信转写文本的语音。 先发附件，再补充要求；图片需模型支持视觉，单张最大 2 MB。/wx stop 请求停止当前会话任务。"
                            ]
                          }
                        </dd>
                      </div>
                    </>
                  ) : selected.pluginId === "wechatai/web-research" ? (
                    <>
                      <div>
                        <dt>{pageCopy["搜索服务"]}</dt>
                        <dd>
                          {workspaceLabel(locale, searchProviderLabels[selected.searchProvider])}
                        </dd>
                      </div>
                      <div>
                        <dt>{pageCopy["搜索地址"]}</dt>
                        <dd>{selected.searchEndpoint}</dd>
                      </div>
                      {selected.searchProvider === "deepseek" && (
                        <div>
                          <dt>{pageCopy["搜索模型"]}</dt>
                          <dd>
                            <code>{selected.searchModel || DEEPSEEK_SEARCH_DEFAULT_MODEL}</code>
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt>{pageCopy["搜索密钥"]}</dt>
                        <dd>{selected.hasKey ? pageCopy["已加密保存"] : pageCopy["未配置"]}</dd>
                      </div>
                      <div>
                        <dt>{pageCopy["每次最多"]}</dt>
                        <dd>
                          {pageCopy["搜索 "]}
                          {selected.maxSearches}
                          {pageCopy[" 次 · 阅读 "]}
                          {selected.maxReads}
                          {pageCopy[" 页"]}
                        </dd>
                      </div>
                    </>
                  ) : selected.pluginId === "wechatai/roleplay" ? (
                    <>
                      <div>
                        <dt>{pageCopy["角色设定"]}</dt>
                        <dd className="role-config-description">{selected.description}</dd>
                      </div>
                      <div>
                        <dt>{pageCopy["世界书"]}</dt>
                        <dd>
                          {selected.lore.filter((e) => e.enabled).length}
                          {pageCopy[" 条启用 · 最多"]} {selected.loreTokenBudget.toLocaleString()}{" "}
                          tokens
                        </dd>
                      </div>
                      <div>
                        <dt>{pageCopy["剧情记忆"]}</dt>
                        <dd>{pageCopy["每个会话独立 · 自动摘要 · 可在会话记录中修正"]}</dd>
                      </div>
                      <div>
                        <dt>{pageCopy["开场白"]}</dt>
                        <dd>
                          {selected.firstMessage
                            ? pageCopy["已设置，新故事展示一次"]
                            : pageCopy["未设置"]}
                        </dd>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <dt>{pageCopy["生图渠道地址"]}</dt>
                        <dd>{model?.baseUrl ?? pageCopy["模型已删除"]}</dd>
                      </div>
                      <div>
                        <dt>API Key</dt>
                        <dd>
                          {selected.hasKey ? pageCopy["使用渠道已保存的密钥"] : pageCopy["未配置"]}
                        </dd>
                      </div>
                      <div>
                        <dt>{pageCopy["画面尺寸"]}</dt>
                        <dd>{pageCopy["自动识别描述中的常见比例，未指定时使用上游默认尺寸"]}</dd>
                      </div>
                      <div>
                        <dt>{pageCopy["每次生成"]}</dt>
                        <dd>{pageCopy["1 张 · 5 credits + 输入文字"]}</dd>
                      </div>
                    </>
                  )}
                  {"waitingMessageEnabled" in selected && (
                    <div>
                      <dt>{pageCopy["等待提示"]}</dt>
                      <dd>
                        {selected.waitingMessageEnabled
                          ? selected.waitingMessage
                          : pageCopy["已关闭"]}
                      </dd>
                    </div>
                  )}
                </dl>
                {!grokUnavailable && (
                  <div className="plugin-config-usage">
                    <code>
                      @{selected.shortcut}{" "}
                      {kind === "wechatai/image-generation"
                        ? pageCopy["画面描述"]
                        : pageCopy["问题"]}
                    </code>{" "}
                    {pageCopy["仅本次使用"]}
                    <br />
                    <code>/use {selected.shortcut}</code>
                    {pageCopy[" 设为默认，"]}
                    <code>/exit</code>
                    {pageCopy[" 返回普通模型"]}
                  </div>
                )}
              </>
            )}
            {!allowed && !cloud && (
              <p className="plugin-config-renew">
                {workspaceError(pluginLimitIssue(data.planUntil), locale)}{" "}
                <button className="text-link" onClick={() => onEdit(selected)}>
                  {pageCopy["查看 Plus 方案"]}
                </button>
              </p>
            )}
            {cloudIssue && (
              <p className="plugin-config-renew">
                {cloudIssue}
                {cloudAvailability?.code === "cloud_plus_required" && (
                  <button className="text-link" onClick={() => onEdit(selected)}>
                    {pageCopy["查看 Plus 方案"]}
                  </button>
                )}
              </p>
            )}
            {aliasConflict && (
              <p className="form-hint" role="status">
                {pageCopy["别名 @"]}
                {selected.shortcut}
                {
                  pageCopy[
                    " 与其他模型或插件重复，大小写不能用于区分。 请修改其中一方的别名后再使用 @ 调用。模型别名可在"
                  ]
                }
                <Link to={`${base}/channels`}>{pageCopy["渠道与模型"]}</Link>
                {pageCopy["中修改。"]}
              </p>
            )}
            {(!allowed || aliasConflict) && selected.pluginId !== "wechatai/notification" && (
              <PluginAlias
                key={`${selected.id}:${selected.shortcut}`}
                plugin={selected}
                busy={busy}
                onManage={onManage}
                paused={!allowed}
              />
            )}
            <div className="plugin-config-tools">
              {selected.enabled && (
                <button
                  className="button secondary small"
                  disabled={busy}
                  onClick={() => onManage(selected.id, { enabled: false })}
                >
                  {pageCopy["停用插件"]}
                </button>
              )}
              {kind !== "wechatai/notification" && (
                <button
                  className="button secondary small"
                  disabled={busy || !allowed || !selected.enabled}
                  onClick={() => onTest(selected)}
                >
                  <FlaskConical size={15} />
                  {cloud
                    ? pageCopy["检查服务状态"]
                    : connection
                      ? pageCopy["连接设置"]
                      : pageCopy["测试配置"]}
                </button>
              )}
              <button
                className="button secondary small"
                disabled={busy}
                onClick={() => onDelete(selected)}
              >
                <Trash2 size={15} />
                {pageCopy["删除配置"]}
              </button>
              {canConfigure && (
                <button className="text-link" disabled={busy} onClick={() => onAdd(kind)}>
                  <Plus size={15} />
                  {pageCopy["添加另一组配置"]}
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="plugin-config-empty">
            <p>
              {grokUnavailable
                ? pageCopy["Grok Bot 派发服务暂未开放。"]
                : pageCopy["还没有配置此插件。"]}
            </p>
            {kind === "wechatai/cloud-agent" && cloudAvailability && (
              <p>{workspaceError(cloudAvailability, locale)}</p>
            )}
            {canConfigure && (
              <button className="button" onClick={() => onAdd(kind)}>
                <Plus size={16} />
                {pageCopy["添加配置"]}
              </button>
            )}
          </div>
        )}
      </div>
      {selected && (
        <div className="modal-actions plugin-config-actions">
          {kind !== "wechatai/notification" && (
            <button
              className="button secondary"
              disabled={
                busy ||
                (!active &&
                  (!allowed || !selected.enabled || Boolean(incomplete) || Boolean(cloudIssue)))
              }
              onClick={() => onAction(selected.id, active ? "exit" : "activate")}
            >
              {active ? pageCopy["退出默认插件"] : pageCopy["设为默认插件"]}
            </button>
          )}
          <button
            className="button"
            disabled={busy}
            onClick={() => {
              onSelect(selected.id);
              onEdit(selected);
            }}
          >
            <Pencil size={16} />
            {incomplete ? pageCopy["继续连接"] : pageCopy["修改配置"]}
          </button>
        </div>
      )}
    </Modal>
  );
}
