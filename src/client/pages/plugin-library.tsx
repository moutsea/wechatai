import { useWorkspaceText, useWorkspaceError } from "../workspace-copy";
import {
  cloudAgentAvailabilityIssue,
  CLOUD_AGENT_NAME,
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
  const copyText = useWorkspaceText();
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
        {paused ? copyText("修改暂停配置的别名") : copyText("修改别名")}
        <input
          required
          maxLength={24}
          pattern={PLUGIN_SHORTCUT_PATTERN}
          title={copyText(PLUGIN_SHORTCUT_HINT)}
          value={shortcut}
          disabled={busy}
          onChange={(event) => setShortcut(event.target.value)}
        />
      </label>
      <button
        className="button secondary small"
        disabled={busy || shortcut.trim() === plugin.shortcut}
      >
        {copyText("保存别名")}
      </button>
    </form>
  );
}

const library = [
  {
    id: "wechatai/cloud-agent",
    name: CLOUD_AGENT_NAME,
    description:
      "你的微伴云端助手，不用安装、不用部署。在微信交代任务，小薇帮你处理文件、生成文档，结果直接发回来。",
    tags: ["Plus 专属", "自备模型 Key", "无需部署"],
  },
  {
    id: "wechatai/notification",
    name: "消息提醒",
    description:
      "用一个 HTTP 请求，把订单通知、服务告警和任务结果发到微信。专属 Token，随时接收你的消息。",
    tags: ["HTTP Webhook", "无需模型", "不扣 credits"],
  },
  {
    id: "wechatai/personal-assistant",
    name: "个人助理",
    description: "随手记、记账、待办与提醒，一个入口就够。把日常琐事发到微信，需要时随时找回。",
    tags: ["独立记录库", "收支统计", "到期微信提醒"],
  },
  {
    id: "wechatai/roleplay",
    name: "角色扮演",
    description:
      "让喜欢的角色住进微信。选择内置原创角色、自己写下人设，或导入角色卡，继续属于你们的故事。",
    tags: ["角色卡导入", "关键词世界书", "独立剧情记忆"],
  },
  {
    id: "wechatai/grok",
    name: "Grok Bot",
    description: "把文字任务交给你已有的 Grok Bot，通过 Routine 唤醒，最终回复送回当前微信会话。",
    tags: ["已有个人 Bot", "文字任务", "Webhook"],
  },
  {
    id: "wechatai/muse",
    name: "Muse",
    description:
      "把 Muse 托管助理接入微信。由 Muse hook 接收文字任务，沿用它的工具与记忆，并回传最终回复。",
    tags: ["Muse 托管环境", "文字与主动推送", "自备 Muse"],
  },
  {
    id: "wechatai/hermes",
    name: "Hermes",
    description: "把微信连到自己的 Hermes Agent。沿用它的记忆与工具，接收定时任务和后台回复。",
    tags: ["本机主动连接", "定时与后台推送", "自备 Hermes"],
  },
  {
    id: "wechatai/openclaw",
    name: "OpenClaw",
    description: "把微信连到自己的 OpenClaw Agent。执行任务、接收定时提醒和后台结果。",
    tags: ["本机主动连接", "定时与后台推送", "自备 OpenClaw"],
  },
  {
    id: "wechatai/web-research",
    name: "DS Chat",
    description: "自然聊天，需要时再搜索、读网页。模型和搜索服务都由你选择。",
    tags: ["按需联网", "自备搜索 API"],
  },
  {
    id: "wechatai/image-generation",
    name: "AI 生图",
    description: "把一句描述变成图片，直接发到微信。连接你自己的生图渠道与 API Key。",
    tags: ["文字生图", "自备生图 API", "5 credits / 张"],
  },
] as const;

export function PluginLibrary({
  onConfigure,
  onView,
  onResume,
}: {
  onConfigure: (kind: PluginKind) => void;
  onView: (kind: PluginKind) => void;
  onResume: (plugin: UserPlugin) => void;
}) {
  const errorText = useWorkspaceError();
  const copyText = useWorkspaceText();
  const { data, base } = useApp();
  if (!data) return null;
  const canAdd = canAddPlugin(data.plan, data.plugins?.length ?? 0);
  const availableIds = availablePluginIds(data.plan, data.plugins ?? []);
  const shortcutConflicts = conflictingShortcuts([...data.assistants, ...(data.plugins ?? [])]);
  const cloudAvailability = cloudAgentAvailabilityIssue(data.plan, data.cloudAgent);
  const visible = library.filter(({ id }) => id !== "wechatai/grok" || data.grokBotVisible);
  return (
    <div className="plugin-library">
      {visible.map(({ id, name: sourceName, description: sourceDescription, tags: sourceTags }) => {
        const name = copyText(sourceName);
        const description = copyText(sourceDescription);
        const tags = sourceTags.map((tag) => copyText(tag));
        const configs = (data.plugins ?? []).filter((p) => p.pluginId === id);
        const conflicts = configs.filter((p) => shortcutConflicts.has(p.shortcut.toLowerCase()));
        const usable = configs.filter((p) => availableIds.has(p.id));
        const allowed = usable.length > 0;
        const active = usable.find((p) => p.id === data.currentSession?.pluginInstanceId);
        const remote = usable.filter(isRemoteAgent);
        const available = remote.filter((p) => p.enabled);
        const online = available.filter((p) => remoteAgentConnection(p).state === "online");
        const representative =
          active ?? online[0] ?? usable.find((p) => p.enabled) ?? usable[0] ?? configs[0];
        const enabled = usable.some((p) => p.enabled);
        const connection = isRemoteAgent(representative) && remoteAgentConnection(representative);
        const connectedBefore = available.some((p) => remoteAgentConnection(p).connectedBefore);
        const resume = configs.length === 1 && connection && !connection.connectedBefore;
        const notificationReady = usable.some((p) => p.enabled && p.hasKey);
        const cloudUnavailable =
          (id === "wechatai/cloud-agent" && !data.cloudAgent.ready) ||
          (id === "wechatai/grok" && !data.grokBotReady);
        const cloudLabel = cloudUnavailable
          ? configs.length
            ? copyText("服务未就绪")
            : copyText("暂未开放")
          : id === "wechatai/cloud-agent" && configs.length
            ? data.plan !== "plus"
              ? copyText("需开通或续费 Plus")
              : !enabled
                ? copyText("已停用")
                : copyText("已配置")
            : null;
        const defaultStatusLabel = !configs.length
          ? copyText("未配置")
          : !allowed
            ? copyText("已暂停")
            : id === "wechatai/notification"
              ? !enabled
                ? copyText("已停用")
                : notificationReady
                  ? copyText("已配置")
                  : copyText("待设置 Token")
              : !remote.length
                ? copyText("已配置")
                : !enabled
                  ? copyText("已停用")
                  : id === "wechatai/grok" && connection
                    ? copyText(connection.label)
                    : online.length
                      ? copyText("已连接")
                      : connectedBefore
                        ? copyText("已离线")
                        : available.some((p) => p.hasKey)
                          ? copyText("等待上线")
                          : copyText("待连接");
        const statusLabel = cloudLabel ?? defaultStatusLabel;
        const positiveStatus =
          allowed &&
          (id === "wechatai/cloud-agent"
            ? cloudLabel === copyText("已配置")
            : id === "wechatai/notification"
              ? notificationReady
              : remote.length
                ? online.length > 0
                : configs.length > 0);
        const actionLabel =
          id === "wechatai/notification"
            ? configs.some((p) => p.hasKey)
              ? copyText("管理 Token")
              : copyText("设置 Token")
            : resume && allowed
              ? copyText("继续连接")
              : copyText("查看配置");
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
                    copyText(" · {value0}{value1} 组", {
                      value0: online.length ? `${online.length}/` : "",
                      value1: configs.length,
                    })}
                </span>
              </div>
              <p>{description}</p>
              <div className="plugin-entry-tags">
                {id === "wechatai/cloud-agent" && data.cloudAgent.adminPreview && (
                  <span>{copyText("管理员内测")}</span>
                )}
                {tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              {id === "wechatai/web-research" && (
                <small className="plugin-attribution">
                  {copyText("基于")}{" "}
                  <a
                    href="https://github.com/deepseek-ai/deepseek-harness"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    DeepSeek Harness
                  </a>{" "}
                  {copyText("开源项目开发")}
                </small>
              )}
              {(configs.length > 0 || cloudUnavailable) && (
                <div className="plugin-entry-summary">
                  {representative && (
                    <code>
                      {id === "wechatai/notification"
                        ? copyText("HTTP 推送")
                        : `@${representative.shortcut}`}
                    </code>
                  )}
                  <span>
                    {(id === "wechatai/cloud-agent" &&
                      cloudAvailability &&
                      errorText(cloudAvailability)) ||
                      (id === "wechatai/grok" &&
                        cloudUnavailable &&
                        copyText(GROK_DISPATCH_UNAVAILABLE)) ||
                      (!allowed
                        ? copyText("超出当前套餐的插件上限")
                        : !enabled
                          ? copyText("配置已停用")
                          : connection && connection.state !== "online"
                            ? errorText(connection.description)
                            : id === "wechatai/notification"
                              ? representative.hasKey
                                ? copyText("Token 已配置")
                                : copyText("待生成专属 Token")
                              : active
                                ? copyText("微信默认使用中")
                                : copyText("在任意对话中单次调用"))}
                  </span>
                </div>
              )}
              {conflicts.length > 0 && (
                <button className="text-link shortcut-conflict" onClick={() => onView(id)}>
                  {conflicts.length}
                  {copyText(" 组配置的别名重复 · 查看并修改")}
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
                      ? copyText("消息提醒：{value0}", { value0: actionLabel })
                      : resume && allowed
                        ? copyText("继续连接 {value0}", { value0: name })
                        : copyText("查看 {value0} 配置", { value0: name })
                  }
                >
                  {actionLabel} <ArrowRight size={15} />
                </button>
              ) : cloudUnavailable ? (
                <button className="button secondary small" disabled>
                  {copyText("暂未开放")}
                </button>
              ) : data.plan === "free" && (id === "wechatai/cloud-agent" || !canAdd) ? (
                <button
                  className="button secondary small"
                  onClick={() => onConfigure(id)}
                  aria-label={copyText("配置 {value0}", { value0: name })}
                >
                  <Plus size={15} />
                  {copyText(" 配置插件")}
                </button>
              ) : !data.assistants.length &&
                !isRemoteAgentId(id) &&
                id !== "wechatai/notification" &&
                id !== "wechatai/cloud-agent" ? (
                <Link className="button secondary small" to={`${base}/channels`}>
                  {copyText("先添加模型 ")}
                  <ArrowRight size={15} />
                </Link>
              ) : (
                <button
                  className="button small"
                  onClick={() => onConfigure(id)}
                  aria-label={copyText("配置 {value0}", { value0: name })}
                >
                  <Plus size={15} />
                  {copyText(" 配置插件")}
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
  const errorText = useWorkspaceError();
  const copyText = useWorkspaceText();
  const { data, base } = useApp();
  if (!data) return null;
  const configs = (data.plugins ?? []).filter((p) => p.pluginId === kind);
  const selected =
    configs.find((p) => p.id === selectedId) ??
    configs.find((p) => p.id === data.currentSession?.pluginInstanceId) ??
    configs[0];
  const title = copyText(library.find((p) => p.id === kind)!.name);
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
    ? remoteAgentConnection({
        ...selected,
        access: allowed ? selected.access : pluginLimitIssue(data.planUntil),
      })
    : null;
  const cloud = isCloudAgent(selected) ? selected : null;
  const cloudAvailability = cloudAgentAvailabilityIssue(data.plan, data.cloudAgent);
  const cloudIssue = cloud
    ? cloudAvailability
      ? errorText(cloudAvailability)
      : cloud.access
        ? errorText(cloud.access)
        : undefined
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
      title={copyText("{value0} 配置", { value0: title })}
      description={
        kind === "wechatai/notification"
          ? copyText("设置专属 Token，查看推送接口与投递记录。")
          : copyText("查看连接信息，管理在微信中的使用方式。")
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
                  {copyText("选择配置")}
                  <select
                    value={selected.id}
                    disabled={busy}
                    onChange={(e) => onSelect(e.target.value)}
                  >
                    {configs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.pluginId === "wechatai/notification" ? "" : ` · @${p.shortcut}`}
                        {shortcutConflicts.has(p.shortcut.toLowerCase()) && copyText(" · 别名重复")}
                        {isRemoteAgent(p) && ` · ${copyText(remoteAgentConnection(p).label)}`}
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
                  ? copyText("已暂停")
                  : !selected.enabled
                    ? copyText("已停用")
                    : cloudIssue || grokUnavailable
                      ? copyText("服务不可用")
                      : (connection?.label ?? copyText("已启用"))}
              </span>
            </div>
            {selected.pluginId === "wechatai/personal-assistant" && (
              <button className="button secondary" onClick={() => onRecords(selected)}>
                {copyText("查看笔记、账目与提醒 ")}
                <ArrowRight size={15} />
              </button>
            )}
            {selected.pluginId === "wechatai/notification" ? (
              <>
                <dl className="plugin-config-details">
                  <div>
                    <dt>{copyText("接收微信")}</dt>
                    <dd>
                      {data.connections.find((c) => c.id === selected.connectionId)?.name ??
                        copyText("链接已删除，请修改配置")}
                    </dd>
                  </div>
                  <div>
                    <dt>{copyText("使用费用")}</dt>
                    <dd>{copyText("不调用模型，不扣 credits")}</dd>
                  </div>
                </dl>
                <NotificationAccess key={selected.id} plugin={selected} />
              </>
            ) : (
              <>
                <dl className="plugin-config-details">
                  <div>
                    <dt>{copyText("快捷名称")}</dt>
                    <dd>
                      <code>@{selected.shortcut}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>
                      {isRemoteAgentId(kind)
                        ? copyText("{value0} 助手", { value0: remoteAgentName(kind) })
                        : kind === "wechatai/image-generation"
                          ? copyText("生图模型")
                          : copyText("回答模型")}
                    </dt>
                    <dd>
                      {isRemoteAgent(selected) ? (
                        (selected.agents?.find((a) => a.id === selected.agentId)?.name ??
                        (kind === "wechatai/grok"
                          ? copyText("拥有该 Routine 的 Grok Bot")
                          : selected.hasKey
                            ? selected.agentId
                            : copyText("连接后自动识别")))
                      ) : model ? (
                        <>
                          {isCloudAgent(selected) && !selected.modelId && copyText("默认模型：")}
                          {model.channelName} / {model.name}
                          <code className="plugin-model-id">{model.model}</code>
                        </>
                      ) : isCloudAgent(selected) && !selected.modelId ? (
                        copyText("尚未配置默认文本模型")
                      ) : (
                        copyText("模型已删除")
                      )}
                    </dd>
                  </div>
                  {selected.pluginId === "wechatai/personal-assistant" ? (
                    <>
                      <div>
                        <dt>{copyText("默认币种")}</dt>
                        <dd>{selected.currency}</dd>
                      </div>
                      <div>
                        <dt>{copyText("提醒链接")}</dt>
                        <dd>
                          {data.connections.find((c) => c.id === selected.reminderConnectionId)
                            ?.name ?? copyText("暂未设置")}
                        </dd>
                      </div>
                      <div>
                        <dt>{copyText("时间")}</dt>
                        <dd>{copyText("北京时间 · 支持一次性、每天、每周提醒")}</dd>
                      </div>
                    </>
                  ) : isRemoteAgent(selected) ? (
                    <>
                      <div>
                        <dt>{copyText("连接状态")}</dt>
                        <dd>
                          {grokUnavailable
                            ? copyText(GROK_DISPATCH_UNAVAILABLE)
                            : copyText(connection?.description ?? "")}
                        </dd>
                      </div>
                      <div>
                        <dt>{copyText("主动推送")}</dt>
                        <dd>
                          {selected.allowProactive
                            ? copyText("允许定时任务与后台结果")
                            : copyText("已关闭")}
                        </dd>
                      </div>
                      <div>
                        <dt>{copyText("文字上限")}</dt>
                        <dd>
                          {copyText("输入 ")}
                          {selected.maxInputTokens}
                          {copyText(" / 输出 ")}
                          {selected.maxOutputTokens} tokens
                        </dd>
                      </div>
                      <div>
                        <dt>{copyText("模型与工具")}</dt>
                        <dd>
                          {copyText("在 ")}
                          {remoteAgentName(selected.pluginId)}
                          {copyText(" 中管理，无需本站模型渠道")}
                        </dd>
                      </div>
                    </>
                  ) : isCloudAgent(selected) ? (
                    <>
                      <div>
                        <dt>{copyText("服务状态")}</dt>
                        <dd>{cloudIssue ?? copyText("已配置；在微信提交任务验证实际运行")}</dd>
                      </div>
                      {data.cloudAgent.ready && (
                        <>
                          <div>
                            <dt>{copyText("账号任务额度")}</dt>
                            <dd>
                              {copyText("今日 ")}
                              {data.cloudAgent.usedToday} / {data.cloudAgent.dailyLimit}
                              {copyText(" 次 · 执行中 ")}
                              {data.cloudAgent.active} / {data.cloudAgent.maxActive}
                              {copyText(" 个")}
                            </dd>
                          </div>
                          <div>
                            <dt>{copyText("执行时限")}</dt>
                            <dd>
                              {data.cloudAgent.deadlineMinutes}
                              {copyText(" 分钟后请求停止，等待云端确认")}
                            </dd>
                          </div>
                        </>
                      )}
                      <div>
                        <dt>{copyText("任务记录")}</dt>
                        <dd>
                          <Link to={`${base}/tasks?plugin=${selected.id}`}>
                            {copyText("查看云端任务")}
                          </Link>
                          {" · "}
                          <Link to="/docs/cloud-agent">{copyText("使用指南")}</Link>
                        </dd>
                      </div>
                      <div>
                        <dt>{copyText("使用费用")}</dt>
                        <dd>
                          {copyText(
                            "输入和最终回复文字按 token 扣 credits，返回图片每张另计 5 credits，非图片文件不另收费；模型 API 费用另付服务商，包括内部多次调用。失败或确认取消不收成功账单，请求停止的费用以最终结果为准。",
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>{copyText("支持范围")}</dt>
                        <dd>
                          {copyText(
                            "文字、图片、可提取文字的 PDF、DOCX 和文本文件，以及带微信转写文本的语音。 先发附件，再补充要求；图片需模型支持视觉，单张最大 2 MB。/wx stop 请求停止当前会话任务。",
                          )}
                        </dd>
                      </div>
                    </>
                  ) : selected.pluginId === "wechatai/web-research" ? (
                    <>
                      <div>
                        <dt>{copyText("搜索服务")}</dt>
                        <dd>{copyText(searchProviderLabels[selected.searchProvider])}</dd>
                      </div>
                      <div>
                        <dt>{copyText("搜索地址")}</dt>
                        <dd>{selected.searchEndpoint}</dd>
                      </div>
                      {selected.searchProvider === "deepseek" && (
                        <div>
                          <dt>{copyText("搜索模型")}</dt>
                          <dd>
                            <code>{selected.searchModel || DEEPSEEK_SEARCH_DEFAULT_MODEL}</code>
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt>{copyText("搜索密钥")}</dt>
                        <dd>{selected.hasKey ? copyText("已加密保存") : copyText("未配置")}</dd>
                      </div>
                      <div>
                        <dt>{copyText("每次最多")}</dt>
                        <dd>
                          {copyText("搜索 ")}
                          {selected.maxSearches}
                          {copyText(" 次 · 阅读 ")}
                          {selected.maxReads}
                          {copyText(" 页")}
                        </dd>
                      </div>
                    </>
                  ) : selected.pluginId === "wechatai/roleplay" ? (
                    <>
                      <div>
                        <dt>{copyText("角色设定")}</dt>
                        <dd className="role-config-description">{selected.description}</dd>
                      </div>
                      <div>
                        <dt>{copyText("世界书")}</dt>
                        <dd>
                          {selected.lore.filter((e) => e.enabled).length}
                          {copyText(" 条启用 · 最多")} {selected.loreTokenBudget.toLocaleString()}{" "}
                          tokens
                        </dd>
                      </div>
                      <div>
                        <dt>{copyText("剧情记忆")}</dt>
                        <dd>{copyText("每个会话独立 · 自动摘要 · 可在会话记录中修正")}</dd>
                      </div>
                      <div>
                        <dt>{copyText("开场白")}</dt>
                        <dd>
                          {selected.firstMessage
                            ? copyText("已设置，新故事展示一次")
                            : copyText("未设置")}
                        </dd>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <dt>{copyText("生图渠道地址")}</dt>
                        <dd>{model?.baseUrl ?? copyText("模型已删除")}</dd>
                      </div>
                      <div>
                        <dt>API Key</dt>
                        <dd>
                          {selected.hasKey ? copyText("使用渠道已保存的密钥") : copyText("未配置")}
                        </dd>
                      </div>
                      <div>
                        <dt>{copyText("画面尺寸")}</dt>
                        <dd>{copyText("自动识别描述中的常见比例，未指定时使用上游默认尺寸")}</dd>
                      </div>
                      <div>
                        <dt>{copyText("每次生成")}</dt>
                        <dd>{copyText("1 张 · 5 credits + 输入文字")}</dd>
                      </div>
                    </>
                  )}
                  {"waitingMessageEnabled" in selected && (
                    <div>
                      <dt>{copyText("等待提示")}</dt>
                      <dd>
                        {selected.waitingMessageEnabled
                          ? selected.waitingMessage
                          : copyText("已关闭")}
                      </dd>
                    </div>
                  )}
                </dl>
                {!grokUnavailable && (
                  <div className="plugin-config-usage">
                    <code>
                      @{selected.shortcut}{" "}
                      {kind === "wechatai/image-generation"
                        ? copyText("画面描述")
                        : copyText("问题")}
                    </code>{" "}
                    {copyText("仅本次使用")}
                    <br />
                    <code>/use {selected.shortcut}</code>
                    {copyText(" 设为默认，")}
                    <code>/exit</code>
                    {copyText(" 返回普通模型")}
                  </div>
                )}
              </>
            )}
            {!allowed && !cloud && (
              <p className="plugin-config-renew">
                {errorText(pluginLimitIssue(data.planUntil))}{" "}
                <button className="text-link" onClick={() => onEdit(selected)}>
                  {copyText("查看 Plus 方案")}
                </button>
              </p>
            )}
            {cloudIssue && (
              <p className="plugin-config-renew">
                {cloudIssue}
                {cloudAvailability?.code === "cloud_plus_required" && (
                  <button className="text-link" onClick={() => onEdit(selected)}>
                    {copyText("查看 Plus 方案")}
                  </button>
                )}
              </p>
            )}
            {aliasConflict && (
              <p className="form-hint" role="status">
                {copyText("别名 @")}
                {selected.shortcut}{" "}
                {copyText(
                  " 与其他模型或插件重复，大小写不能用于区分。 请修改其中一方的别名后再使用 @ 调用。模型别名可在",
                )}
                <Link to={`${base}/channels`}>{copyText("渠道与模型")}</Link>
                {copyText("中修改。")}
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
                  {copyText("停用插件")}
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
                    ? copyText("检查服务状态")
                    : connection
                      ? copyText("连接设置")
                      : copyText("测试配置")}
                </button>
              )}
              <button
                className="button secondary small"
                disabled={busy}
                onClick={() => onDelete(selected)}
              >
                <Trash2 size={15} />
                {copyText("删除配置")}
              </button>
              {canConfigure && (
                <button className="text-link" disabled={busy} onClick={() => onAdd(kind)}>
                  <Plus size={15} />
                  {copyText("添加另一组配置")}
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="plugin-config-empty">
            <p>
              {grokUnavailable
                ? copyText("Grok Bot 派发服务暂未开放。")
                : copyText("还没有配置此插件。")}
            </p>
            {kind === "wechatai/cloud-agent" && cloudAvailability && (
              <p>{errorText(cloudAvailability)}</p>
            )}
            {canConfigure && (
              <button className="button" onClick={() => onAdd(kind)}>
                <Plus size={16} />
                {copyText("添加配置")}
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
              {active ? copyText("退出默认插件") : copyText("设为默认插件")}
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
            {incomplete ? copyText("继续连接") : copyText("修改配置")}
          </button>
        </div>
      )}
    </Modal>
  );
}
