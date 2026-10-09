import { isRemoteAgent, remoteAgentName } from "../../shared/remote-agent";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  Check,
  FlaskConical,
  Globe2,
  ImagePlus,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useApp } from "../context";
import { Modal } from "../ui";
import type { UserPlugin } from "../../shared/image-generation";
import { DEEPSEEK_SEARCH_DEFAULT_MODEL, searchProviderLabels } from "../../shared/web-research";

export type PluginKind = UserPlugin["pluginId"];

const library = [
  {
    id: "wechatai/hermes",
    name: "Hermes",
    Icon: Bot,
    description: "把微信连到自己的 Hermes Agent。沿用它的记忆与工具，接收定时任务和后台回复。",
    tags: ["本机主动连接", "定时与后台推送", "自备 Hermes"],
  },
  {
    id: "wechatai/openclaw",
    name: "OpenClaw",
    Icon: Bot,
    description: "把微信连到自己的 OpenClaw Agent。执行任务、接收定时提醒和后台结果。",
    tags: ["本机主动连接", "定时与后台推送", "自备 OpenClaw"],
  },
  {
    id: "wechatai/web-research",
    name: "DS Chat",
    Icon: Globe2,
    description: "自然聊天，需要时再搜索、读网页。模型和搜索服务都由你选择。",
    tags: ["按需联网", "自备搜索 API"],
  },
  {
    id: "wechatai/image-generation",
    name: "AI 生图",
    Icon: ImagePlus,
    description: "把一句描述变成图片，直接发到微信。连接你自己的生图渠道与 API Key。",
    tags: ["文字生图", "自备生图 API", "5 credits / 张"],
  },
] as const;

export function PluginLibrary({
  onConfigure,
  onView,
}: {
  onConfigure: (kind: PluginKind) => void;
  onView: (kind: PluginKind) => void;
}) {
  const { data, base } = useApp();
  if (!data) return null;
  const plus = data.plan === "plus";
  return (
    <div className="plugin-library">
      {library.map(({ id, name, Icon, description, tags }) => {
        const configs = (data.plugins ?? []).filter((p) => p.pluginId === id);
        const active = configs.find((p) => p.id === data.currentSession?.pluginInstanceId);
        const representative = active ?? configs.find((p) => p.enabled) ?? configs[0];
        const enabled = configs.some((p) => p.enabled);
        return (
          <article className="plugin-entry" key={id} aria-label={name}>
            <div
              className={`plugin-entry-icon ${id === "wechatai/image-generation" ? "image" : ""}`}
            >
              <Icon size={25} strokeWidth={1.7} />
            </div>
            <div className="plugin-entry-content">
              <div className="plugin-entry-heading">
                <h2>{name}</h2>
                <span className={`plugin-status ${configs.length ? "configured" : ""}`}>
                  {configs.length ? <Check size={13} /> : null}
                  {configs.length
                    ? `已配置${configs.length > 1 ? ` · ${configs.length} 组` : ""}`
                    : "未配置"}
                </span>
              </div>
              <p>{description}</p>
              <div className="plugin-entry-tags">
                {tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              {id === "wechatai/web-research" && (
                <small className="plugin-attribution">
                  基于{" "}
                  <a
                    href="https://github.com/deepseek-ai/deepseek-harness"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    DeepSeek Harness
                  </a>{" "}
                  开源项目开发
                </small>
              )}
              {configs.length > 0 && (
                <div className="plugin-entry-summary">
                  <code>@{representative.shortcut}</code>
                  <span>
                    {!plus
                      ? "续费 Plus 后可使用"
                      : !enabled
                        ? "配置已停用"
                        : active
                          ? "微信默认使用中"
                          : "在任意对话中单次调用"}
                  </span>
                </div>
              )}
            </div>
            <div className="plugin-entry-action">
              {configs.length ? (
                <button
                  className="button secondary small"
                  onClick={() => onView(id)}
                  aria-label={`查看 ${name} 配置`}
                >
                  查看配置 <ArrowRight size={15} />
                </button>
              ) : !plus ? (
                <Link className="button secondary small" to={`${base}/billing`}>
                  升级 Plus <ArrowRight size={15} />
                </Link>
              ) : !data.assistants.length &&
                id !== "wechatai/openclaw" &&
                id !== "wechatai/hermes" ? (
                <Link className="button secondary small" to={`${base}/channels`}>
                  先添加模型 <ArrowRight size={15} />
                </Link>
              ) : (
                <button
                  className="button small"
                  onClick={() => onConfigure(id)}
                  aria-label={`配置 ${name}`}
                >
                  <Plus size={15} /> 配置插件
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
  onAction: (id: string, action: "activate" | "exit") => void;
}) {
  const { data, base } = useApp();
  if (!data) return null;
  const configs = (data.plugins ?? []).filter((p) => p.pluginId === kind);
  const selected =
    configs.find((p) => p.id === selectedId) ??
    configs.find((p) => p.id === data.currentSession?.pluginInstanceId) ??
    configs[0];
  const title = library.find((p) => p.id === kind)!.name;
  const plus = data.plan === "plus";
  const model = data.assistants.find(
    (a) => a.id === (selected && "modelId" in selected ? selected.modelId : null),
  );
  const active = selected && data.currentSession?.pluginInstanceId === selected.id;
  return (
    <Modal
      title={`${title} 配置`}
      description="查看连接信息，管理在微信中的使用方式。"
      onClose={onClose}
    >
      <div className="plugin-config-body">
        {selected ? (
          <>
            <div className="plugin-config-selector">
              {configs.length > 1 ? (
                <label>
                  选择配置
                  <select
                    value={selected.id}
                    disabled={busy}
                    onChange={(e) => onSelect(e.target.value)}
                  >
                    {configs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · @{p.shortcut}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <h3>{selected.name}</h3>
              )}
              <span className={`plugin-status ${plus && selected.enabled ? "configured" : ""}`}>
                {!plus ? "需续费" : selected.enabled ? "已启用" : "已停用"}
              </span>
            </div>
            <dl className="plugin-config-details">
              <div>
                <dt>快捷名称</dt>
                <dd>
                  <code>@{selected.shortcut}</code>
                </dd>
              </div>
              <div>
                <dt>
                  {kind === "wechatai/openclaw" || kind === "wechatai/hermes"
                    ? `${remoteAgentName(kind)} 助手`
                    : kind === "wechatai/image-generation"
                      ? "生图模型"
                      : "回答模型"}
                </dt>
                <dd>
                  {isRemoteAgent(selected) ? (
                    (selected.agents?.find((a) => a.id === selected.agentId)?.name ??
                    (selected.hasKey ? selected.agentId : "连接后自动识别"))
                  ) : model ? (
                    <>
                      {model.channelName} / {model.name}
                      <code className="plugin-model-id">{model.model}</code>
                    </>
                  ) : (
                    "模型已删除"
                  )}
                </dd>
              </div>
              {isRemoteAgent(selected) ? (
                <>
                  <div>
                    <dt>连接状态</dt>
                    <dd>
                      {!selected.hasKey
                        ? "尚未连接，点击编辑配置开始"
                        : (selected.lastSeen ?? 0) > Date.now() - 60000
                          ? "在线"
                          : "离线 · 等待本机连接"}
                    </dd>
                  </div>
                  <div>
                    <dt>主动推送</dt>
                    <dd>{selected.allowProactive ? "允许定时任务与后台结果" : "已关闭"}</dd>
                  </div>
                  <div>
                    <dt>文字上限</dt>
                    <dd>
                      输入 {selected.maxInputTokens} / 输出 {selected.maxOutputTokens} tokens
                    </dd>
                  </div>
                  <div>
                    <dt>模型与工具</dt>
                    <dd>在 {remoteAgentName(selected.pluginId)} 中管理，无需本站模型渠道</dd>
                  </div>
                </>
              ) : selected.pluginId === "wechatai/web-research" ? (
                <>
                  <div>
                    <dt>搜索服务</dt>
                    <dd>{searchProviderLabels[selected.searchProvider]}</dd>
                  </div>
                  <div>
                    <dt>搜索地址</dt>
                    <dd>{selected.searchEndpoint}</dd>
                  </div>
                  {selected.searchProvider === "deepseek" && (
                    <div>
                      <dt>搜索模型</dt>
                      <dd>
                        <code>{selected.searchModel || DEEPSEEK_SEARCH_DEFAULT_MODEL}</code>
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>搜索密钥</dt>
                    <dd>{selected.hasKey ? "已加密保存" : "未配置"}</dd>
                  </div>
                  <div>
                    <dt>每次最多</dt>
                    <dd>
                      搜索 {selected.maxSearches} 次 · 阅读 {selected.maxReads} 页
                    </dd>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <dt>生图渠道地址</dt>
                    <dd>{model?.baseUrl ?? "模型已删除"}</dd>
                  </div>
                  <div>
                    <dt>API Key</dt>
                    <dd>{selected.hasKey ? "使用渠道已保存的密钥" : "未配置"}</dd>
                  </div>
                  <div>
                    <dt>画面尺寸</dt>
                    <dd>自动识别描述中的常见比例，未指定时使用上游默认尺寸</dd>
                  </div>
                  <div>
                    <dt>每次生成</dt>
                    <dd>1 张 · 5 credits + 输入文字</dd>
                  </div>
                </>
              )}
              {selected.pluginId !== "wechatai/web-research" && (
                <div>
                  <dt>等待提示</dt>
                  <dd>{selected.waitingMessageEnabled ? selected.waitingMessage : "已关闭"}</dd>
                </div>
              )}
            </dl>
            <div className="plugin-config-usage">
              <code>
                @{selected.shortcut} {kind === "wechatai/image-generation" ? "画面描述" : "问题"}
              </code>{" "}
              仅本次使用
              <br />
              <code>/use {selected.shortcut}</code> 设为默认，<code>/exit</code> 返回普通模型
            </div>
            {!plus && (
              <p className="plugin-config-renew">
                配置已保留，<Link to={`${base}/billing`}>续费 Plus</Link> 后可继续使用和修改。
              </p>
            )}
            <div className="plugin-config-tools">
              <button
                className="button secondary small"
                disabled={busy || !plus || !selected.enabled}
                onClick={() => onTest(selected)}
              >
                <FlaskConical size={15} />
                测试配置
              </button>
              <button
                className="button secondary small"
                disabled={busy}
                onClick={() => onDelete(selected)}
              >
                <Trash2 size={15} />
                删除配置
              </button>
              {plus &&
                (kind === "wechatai/openclaw" ||
                  kind === "wechatai/hermes" ||
                  data.assistants.length > 0) && (
                  <button className="text-link" disabled={busy} onClick={() => onAdd(kind)}>
                    <Plus size={15} />
                    添加另一组配置
                  </button>
                )}
            </div>
          </>
        ) : (
          <div className="plugin-config-empty">
            <p>还没有配置此插件。</p>
            {plus &&
              (kind === "wechatai/openclaw" ||
                kind === "wechatai/hermes" ||
                data.assistants.length > 0) && (
                <button className="button" onClick={() => onAdd(kind)}>
                  <Plus size={16} />
                  添加配置
                </button>
              )}
          </div>
        )}
      </div>
      {selected && (
        <div className="modal-actions plugin-config-actions">
          <button
            className="button secondary"
            disabled={busy || (!active && (!plus || !selected.enabled))}
            onClick={() => onAction(selected.id, active ? "exit" : "activate")}
          >
            {active ? "退出默认插件" : "设为默认插件"}
          </button>
          <button
            className="button"
            disabled={busy || !plus}
            onClick={() => {
              onSelect(selected.id);
              onEdit(selected);
            }}
          >
            <Pencil size={16} />
            修改配置
          </button>
        </div>
      )}
    </Modal>
  );
}
