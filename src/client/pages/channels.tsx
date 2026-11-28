import { workspaceError, workspaceLabel } from "../workspace-copy";
import { useLocale } from "../locale";
import { copy as sourceCopy } from "../../shared/i18n/zh-CN/copy/channels-page";
import { copy as koCopy } from "../../shared/i18n/ko/copy/channels-page";
import { formatCopy } from "../../shared/i18n/dashboard";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Plus,
  ArrowRight,
  Pencil,
  Trash2,
  Zap,
  Check,
  LoaderCircle,
  Network,
  Download,
} from "lucide-react";
import { useApp } from "../context";
import { Modal, PageHead, Empty } from "../ui";
import { ChannelIcon } from "../channel-icon";
import { ChannelConnectionFields } from "../channel-connection-fields";
import { saveChannelSetup, modelImportMessage } from "../channel-setup";
import { trackChannelModelImport, trackFunnel } from "../analytics-client";
import {
  DEFAULT_CHANNEL_PROVIDER,
  channelProvider,
  detectChannelProvider,
  selectChannelProvider,
} from "../../shared/channel-providers";
import { json, limitErrorCode } from "../api";
import { LimitHint } from "../limit-hint";
import {
  protocolLabels,
  formatCredits,
  type Assistant,
  type Channel,
  type ChannelInput,
  type ModelInput,
  type ModelImportResult,
} from "../../shared/types";
import {
  DEFAULT_CONTEXT_TOKENS,
  DEFAULT_INPUT_TOKENS,
  DEFAULT_OUTPUT_TOKENS,
  MAX_CONTEXT_TOKENS,
  MAX_OUTPUT_TOKENS,
  modelInputBudget,
} from "../../shared/context";
import { TOKENS_PER_CREDIT, OUTPUT_TOKEN_WEIGHT } from "../../shared/credits";
import { modelKind, modelKindLabels, type ModelKind } from "../../shared/model-kind";
import { isChatModel, modelProtocolIssue } from "../../shared/model-compatibility";
import { KimiseekBalance, KimiseekConnectError, useKimiseekConnect } from "./kimiseek-connect";
import { conflictingShortcuts } from "../../shared/shortcut-conflicts";

const newChannel = selectChannelProvider(
  {
    name: "",
    description: "",
    protocol: "chat-completions",
    baseUrl: "",
    apiKey: "",
    color: "sage",
  },
  DEFAULT_CHANNEL_PROVIDER,
);
const newModel: ModelInput = {
  channelId: "",
  name: "",
  description: "",
  model: "",
  systemPrompt: "你是一个友好、可靠的助手。请用清晰简洁的中文回答。",
  shortcut: "",
  maxInputTokens: DEFAULT_INPUT_TOKENS,
  maxOutputTokens: DEFAULT_OUTPUT_TOKENS,
  contextTokens: DEFAULT_CONTEXT_TOKENS,
  maxCredits: 0,
  color: "sage",
};

export function Channels() {
  const { locale } = useLocale();
  const pageCopy = locale === "ko" ? koCopy : sourceCopy;

  const { data, base, request, refresh, notify } = useApp();
  const initialModel =
    locale === "ko"
      ? {
          ...newModel,
          systemPrompt: koCopy["你是一个友好、可靠的助手。请用清晰简洁的中文回答。"],
        }
      : newModel;
  const [params, setParams] = useSearchParams();
  const [channelEditor, setChannelEditor] = useState<Channel | "new" | null>(null);
  const [modelEditor, setModelEditor] = useState<Assistant | "new" | null>(null);
  const [channelForm, setChannelForm] = useState<ChannelInput>(newChannel);
  const [providerId, setProviderId] = useState(DEFAULT_CHANNEL_PROVIDER);
  const [form, setForm] = useState<ModelInput>(initialModel);
  const effectiveInput = Math.max(0, modelInputBudget(form));
  const estimatedCallCredits =
    Math.ceil(
      ((effectiveInput + form.maxOutputTokens * OUTPUT_TOKEN_WEIGHT) / TOKENS_PER_CREDIT) * 1000,
    ) / 1000;
  const [deleting, setDeleting] = useState<{
    kind: "channel" | "model";
    id: string;
    name: string;
  } | null>(null);
  const [actionBusy, setBusy] = useState("");
  const kimiseek = useKimiseekConnect(() => setChannelEditor(null));
  const busy = actionBusy || (kimiseek.busy ? "kimiseek" : "");
  const [error, setError] = useState("");
  const [limitCode, setLimitCode] = useState<string | undefined>();
  const [importResults, setImportResults] = useState<
    Record<string, { text: string; failed: boolean }>
  >({});
  useEffect(() => {
    if (params.get("new")) {
      setError("");
      setChannelEditor("new");
      const id = channelProvider(params.get("provider") ?? "")?.id ?? DEFAULT_CHANNEL_PROVIDER;
      setProviderId(id);
      setChannelForm(selectChannelProvider(newChannel, id, (name) => workspaceLabel(locale, name)));
      setParams({}, { replace: true });
    }
  }, [params, setParams, locale]);
  useEffect(() => {
    const id = params.get("channel");
    if (id && data) document.getElementById(`channel-${id}`)?.scrollIntoView({ block: "nearest" });
  }, [params, data?.channels.length]);
  if (!data) return null;
  const shortcutConflicts = conflictingShortcuts([...data.assistants, ...(data.plugins ?? [])]);
  const openChannel = (c: Channel | "new") => {
    setError("");
    setChannelEditor(c);
    setChannelForm(c === "new" ? newChannel : { ...c, apiKey: "" });
    setProviderId(c === "new" ? DEFAULT_CHANNEL_PROVIDER : detectChannelProvider(c));
  };
  const openModel = (channel: Channel, a: Assistant | "new") => {
    setError("");
    setModelEditor(a);
    setForm(
      a === "new" ? { ...initialModel, channelId: channel.id, color: channel.color } : { ...a },
    );
  };
  const update = <K extends keyof ModelInput>(key: K, value: ModelInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const updateChannel = <K extends keyof ChannelInput>(key: K, value: ChannelInput[K]) =>
    setChannelForm((f) => ({ ...f, [key]: value }));
  const changeProvider = (id: string) => {
    setProviderId(id);
    setChannelForm((f) => selectChannelProvider(f, id, (name) => workspaceLabel(locale, name)));
    setError("");
  };
  const saveChannel = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("channel-save");
    setError("");
    try {
      const result = await saveChannelSetup(
        request,
        {
          ...channelForm,
          name: channelForm.name.trim() || channelProvider(providerId)?.name || "",
        },
        channelEditor && channelEditor !== "new" ? channelEditor : undefined,
        providerId !== "custom",
      );
      // 保存配置和成功导入模型是两件事；无效 Key 也可能保存成功。
      trackFunnel("channel_saved", { provider: providerId, created: channelEditor === "new" });
      trackChannelModelImport(providerId, result.models);
      if (result.importError) trackFunnel("channel_test_failed", { provider: providerId });
      await refresh();
      setChannelEditor(null);
      if (result.models || result.importError) {
        const text = result.models
          ? modelImportMessage(result.models, data.limits.modelsPerChannel, locale)
          : formatCopy(
              pageCopy[
                "渠道已保存；获取模型失败：{value0}。可重试「获取可用模型」或手动添加模型。"
              ],
              { value0: workspaceError(result.importError, locale) },
            );
        setImportResults((results) => ({
          ...results,
          [result.channel.id]: { text, failed: Boolean(result.importError) },
        }));
        notify(
          result.models?.imported
            ? formatCopy(pageCopy["渠道已保存，已导入 {value0} 个模型"], {
                value0: result.models.imported,
              })
            : pageCopy["渠道已保存，请在渠道卡片中查看模型导入结果"],
        );
      } else
        notify(
          channelEditor === "new"
            ? pageCopy["渠道已保存，可以获取可用模型或手动添加"]
            : pageCopy["渠道已保存，所属模型共用这份连接配置"],
        );
    } catch (e) {
      setError(workspaceError(e as Error, locale));
      setLimitCode(limitErrorCode(e));
    } finally {
      setBusy("");
    }
  };
  const saveModel = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("model-save");
    setError("");
    try {
      await request(
        modelEditor === "new"
          ? `/channels/${form.channelId}/models`
          : `/models/${(modelEditor as Assistant).id}`,
        json(form, modelEditor === "new" ? "POST" : "PATCH"),
      );
      await refresh();
      setModelEditor(null);
      notify(pageCopy["模型已保存"]);
    } catch (e) {
      setError(workspaceError(e as Error, locale));
      setLimitCode(limitErrorCode(e));
    } finally {
      setBusy("");
    }
  };
  const importModels = async (channel: Channel) => {
    setBusy(`import:${channel.id}`);
    setImportResults((results) => ({
      ...results,
      [channel.id]: { text: pageCopy["正在获取上游模型…"], failed: false },
    }));
    try {
      const result = await request<ModelImportResult>(`/channels/${channel.id}/models/import`, {
        method: "POST",
      }).catch((error: unknown) => {
        trackFunnel("channel_test_failed", { provider: detectChannelProvider(channel) });
        throw error;
      });
      trackChannelModelImport(detectChannelProvider(channel), result);
      await refresh();
      setImportResults((results) => ({
        ...results,
        [channel.id]: {
          text: modelImportMessage(result, data.limits.modelsPerChannel, locale),
          failed: false,
        },
      }));
    } catch (e) {
      setImportResults((results) => ({
        ...results,
        [channel.id]: { text: workspaceError(e as Error, locale), failed: true },
      }));
    } finally {
      setBusy("");
    }
  };
  const action = async (
    kind: "channel" | "model",
    id: string,
    action: "test" | "activate" | "delete",
  ) => {
    setBusy(`${action}:${id}`);
    try {
      const result = await request<{ text?: string; cost?: number }>(
        `/${kind === "channel" ? "channels" : "models"}/${id}${action === "delete" ? "" : `/${action}`}`,
        action === "activate"
          ? json({ connectionId: data.selectedConnectionId })
          : { method: action === "delete" ? "DELETE" : "POST" },
      );
      await refresh();
      setDeleting(null);
      notify(
        action === "test"
          ? formatCopy(pageCopy["{value0} · 消耗 {value1} credits"], {
              value0: String(result.text),
              value1: String(result.cost),
            })
          : action === "delete"
            ? pageCopy["已删除"]
            : pageCopy["已切换微信当前使用的渠道和模型"],
      );
    } catch (e) {
      notify(workspaceError(e as Error, locale), true);
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="page-enter">
      {data.connections.length > 1 && (
        <div className="simple-note wechat-link-note">
          {pageCopy["当前管理："]}
          {data.connections.find((l) => l.id === data.selectedConnectionId)?.name}
          {pageCopy[" · 切换渠道或模型只影响此链接。"]}{" "}
          <Link className="text-link" to={`${base}/wechat`}>
            {pageCopy["更换链接"]}
          </Link>
        </div>
      )}
      <PageHead
        eyebrow="YOUR CONNECTIONS"
        title={pageCopy["渠道与模型"]}
        description={formatCopy(pageCopy["{value0} / {value1} 个渠道 · {value2} 个模型"], {
          value0: data.channels.length,
          value1: data.limits.channels,
          value2: data.assistants.length,
        })}
        action={
          <button className="button" onClick={() => openChannel("new")} disabled={Boolean(busy)}>
            <Plus size={17} />
            {pageCopy["添加渠道"]}
          </button>
        }
      />
      {kimiseek.pendingUrl && (
        <p className="simple-note" role="status">
          {pageCopy["正在关联 KimiSeek… 若新窗口未打开，"]}
          <a
            className="text-link"
            href={kimiseek.pendingUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {pageCopy["点击继续关联"]}
          </a>
          。
        </p>
      )}
      {data.channels.length ? (
        <div className="channel-card-grid">
          {data.channels.map((channel) => {
            const models = data.assistants.filter((a) => a.channelId === channel.id);
            const activeHere = data.currentSession?.channelId === channel.id;
            return (
              <article
                className={`channel-card panel ${activeHere ? "is-current" : ""}`}
                id={`channel-${channel.id}`}
                key={channel.id}
                aria-label={formatCopy(pageCopy["{value0} 渠道"], { value0: channel.name })}
              >
                <div className="channel-card-header">
                  <ChannelIcon small channel={channel} />
                  <div className="channel-card-identity">
                    <h2>{channel.name}</h2>
                    <p title={channel.baseUrl}>{channel.baseUrl}</p>
                  </div>
                  <div className="channel-card-tools">
                    <button
                      className="icon-button"
                      aria-label={formatCopy(pageCopy["编辑渠道 {value0}"], {
                        value0: channel.name,
                      })}
                      title={pageCopy["编辑渠道"]}
                      disabled={Boolean(busy)}
                      onClick={() => openChannel(channel)}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={formatCopy(pageCopy["删除渠道 {value0}"], {
                        value0: channel.name,
                      })}
                      title={pageCopy["删除渠道"]}
                      disabled={Boolean(busy)}
                      onClick={() =>
                        setDeleting({ kind: "channel", id: channel.id, name: channel.name })
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <div className="channel-card-meta">
                  <span className="tag">
                    {workspaceLabel(locale, protocolLabels[channel.protocol])}
                  </span>
                  <span>
                    {models.length}
                    {pageCopy[" 个模型"]}
                  </span>
                </div>
                {channel.description && (
                  <p className="channel-card-description">{channel.description}</p>
                )}
                {channel.integration === "kimiseek" && (
                  <KimiseekBalance
                    disabled={Boolean(busy)}
                    onRecharge={() => void kimiseek.start("recharge")}
                  />
                )}
                {models.length ? (
                  <div className="channel-model-groups">
                    {(["text", "image", "other"] as const).map((kind) => {
                      const group = models.filter((a) => modelKind(a) === kind);
                      if (!group.length) return null;
                      return (
                        <details className="channel-model-group" key={kind} open>
                          <summary>
                            {workspaceLabel(locale, modelKindLabels[kind])}
                            <span>{group.length}</span>
                          </summary>
                          {kind === "image" && (
                            <p>{pageCopy["在「AI 生图」插件中选择这些模型使用。"]}</p>
                          )}
                          <ul
                            className="channel-card-models"
                            aria-label={formatCopy(pageCopy["{value0} 的模型"], {
                              value0: channel.name,
                            })}
                          >
                            {group.map((a) => {
                              const active = data.currentSession?.assistantId === a.id;
                              const label = a.name === channel.name ? a.model : a.name;
                              const protocolIssue = modelProtocolIssue(a);
                              return (
                                <li
                                  className={`channel-model-row ${active ? "is-current" : ""}`}
                                  key={a.id}
                                >
                                  <span className="channel-model-dot" aria-hidden="true" />
                                  <div className="channel-model-name">
                                    <strong title={label}>{label}</strong>
                                    {label !== a.model && <small title={a.model}>{a.model}</small>}
                                    {protocolIssue && (
                                      <small className="form-error">{protocolIssue}</small>
                                    )}
                                    {shortcutConflicts.has(a.shortcut.toLowerCase()) && (
                                      <button
                                        className="text-link shortcut-conflict"
                                        disabled={Boolean(busy)}
                                        onClick={() => openModel(channel, a)}
                                        aria-label={formatCopy(
                                          pageCopy["修改模型 {value0} 的重复别名"],
                                          { value0: a.name },
                                        )}
                                      >
                                        {pageCopy["别名 @"]}
                                        {a.shortcut}
                                        {pageCopy[" 重复 · 修改"]}
                                      </button>
                                    )}
                                  </div>
                                  <div className="channel-model-tools">
                                    {isChatModel(a) &&
                                      (active ? (
                                        <span className="channel-model-current">
                                          <Check size={13} />
                                          {pageCopy["当前"]}
                                        </span>
                                      ) : (
                                        <button
                                          className="channel-model-use"
                                          disabled={Boolean(busy)}
                                          aria-label={formatCopy(pageCopy["使用模型 {value0}"], {
                                            value0: a.name,
                                          })}
                                          onClick={() => void action("model", a.id, "activate")}
                                        >
                                          {pageCopy["使用"]}
                                        </button>
                                      ))}
                                    {isChatModel(a) && (
                                      <button
                                        className="icon-button"
                                        aria-label={formatCopy(pageCopy["测试模型 {value0}"], {
                                          value0: a.name,
                                        })}
                                        title={pageCopy["测试连接，会消耗少量 credits"]}
                                        disabled={Boolean(busy)}
                                        onClick={() => void action("model", a.id, "test")}
                                      >
                                        {busy === `test:${a.id}` ? (
                                          <LoaderCircle className="spin" size={15} />
                                        ) : (
                                          <Zap size={15} />
                                        )}
                                      </button>
                                    )}
                                    <button
                                      className="icon-button"
                                      aria-label={formatCopy(pageCopy["编辑模型 {value0}"], {
                                        value0: a.name,
                                      })}
                                      title={pageCopy["编辑模型"]}
                                      disabled={Boolean(busy)}
                                      onClick={() => openModel(channel, a)}
                                    >
                                      <Pencil size={14} />
                                    </button>
                                    <button
                                      className="icon-button"
                                      aria-label={formatCopy(pageCopy["删除模型 {value0}"], {
                                        value0: a.name,
                                      })}
                                      title={pageCopy["删除模型"]}
                                      disabled={Boolean(busy)}
                                      onClick={() =>
                                        setDeleting({ kind: "model", id: a.id, name: a.name })
                                      }
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </details>
                      );
                    })}
                  </div>
                ) : (
                  <div className="channel-card-empty">{pageCopy["获取上游模型，或手动添加。"]}</div>
                )}
                {importResults[channel.id] && (
                  <p
                    className={`channel-import-result ${importResults[channel.id].failed ? "is-error" : ""}`}
                    role="status"
                  >
                    {importResults[channel.id].text}
                  </p>
                )}
                <div className="channel-card-footer">
                  <div className="channel-card-add-actions">
                    <button
                      className="text-button"
                      disabled={Boolean(busy)}
                      onClick={() => void importModels(channel)}
                      aria-label={formatCopy(pageCopy["为 {value0} 获取可用模型"], {
                        value0: channel.name,
                      })}
                      title={pageCopy["从上游获取并导入模型，自动跳过已添加的模型"]}
                    >
                      {busy === `import:${channel.id}` ? (
                        <LoaderCircle className="spin" size={15} />
                      ) : (
                        <Download size={15} />
                      )}
                      {busy === `import:${channel.id}`
                        ? pageCopy["获取中…"]
                        : pageCopy["获取可用模型"]}
                    </button>
                    <button
                      className="text-button"
                      disabled={Boolean(busy)}
                      onClick={() => openModel(channel, "new")}
                      aria-label={formatCopy(pageCopy["为 {value0} 添加模型"], {
                        value0: channel.name,
                      })}
                    >
                      <Plus size={15} />
                      {pageCopy["添加模型"]}
                    </button>
                  </div>
                  {!activeHere && models.some(isChatModel) && (
                    <button
                      className="text-button channel-card-activate"
                      disabled={Boolean(busy)}
                      onClick={() => void action("channel", channel.id, "activate")}
                      aria-label={formatCopy(pageCopy["使用渠道 {value0}"], {
                        value0: channel.name,
                      })}
                      title={pageCopy["继续此渠道上次使用的模型"]}
                    >
                      {pageCopy["使用此渠道"]}
                      <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="panel">
          <Empty
            icon={<Network size={30} />}
            title={pageCopy["添加你的第一个渠道"]}
            description={pageCopy["填写服务地址和 API Key，再添加它支持的模型。"]}
            action={
              <button className="button" onClick={() => openChannel("new")}>
                <Plus size={17} />
                {pageCopy["添加渠道"]}
              </button>
            }
          />
        </div>
      )}
      {channelEditor && (
        <Modal
          wide
          title={
            channelEditor === "new"
              ? pageCopy["添加渠道"]
              : formatCopy(pageCopy["编辑渠道 · {value0}"], { value0: channelEditor.name })
          }
          description={
            channelEditor === "new"
              ? pageCopy["选择服务商，填写你自己的 API Key。保存后即可配置模型。"]
              : pageCopy["同一渠道下的模型共用协议、服务地址和 API Key。"]
          }
          onClose={() => {
            if (!busy) setChannelEditor(null);
          }}
        >
          <form onSubmit={(e) => void saveChannel(e)}>
            <div className="form-body">
              <ChannelConnectionFields
                form={channelForm}
                providerId={providerId}
                previous={channelEditor === "new" ? undefined : channelEditor}
                disabled={Boolean(busy)}
                onChange={updateChannel}
                onProviderChange={changeProvider}
                importAction={
                  <button
                    type="button"
                    className="text-link"
                    disabled={Boolean(busy)}
                    onClick={() => void kimiseek.start("connect")}
                  >
                    {kimiseek.busy ? pageCopy["正在关联…"] : pageCopy["kimiseek 一键导入"]}
                  </button>
                }
                importStatus={
                  <>
                    {kimiseek.pendingUrl && (
                      <small>
                        {pageCopy["正在打开 KimiSeek 充值页，完成后自动导入。"]}
                        <a
                          className="text-link"
                          href={kimiseek.pendingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {pageCopy["未打开？点此继续"]}
                        </a>
                      </small>
                    )}
                    {kimiseek.error && (
                      <KimiseekConnectError message={kimiseek.error} code={kimiseek.errorCode} />
                    )}
                  </>
                }
              />
              {channelEditor !== "new" && (
                <div className="form-hint">
                  {pageCopy["更新连接配置后，此渠道下所有模型的新请求都会使用新配置。"]}
                </div>
              )}
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
              <LimitHint code={error ? limitCode : undefined} />
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                disabled={Boolean(busy)}
                onClick={() => setChannelEditor(null)}
              >
                {pageCopy["取消"]}
              </button>
              <button className="button" disabled={Boolean(busy)}>
                {busy
                  ? channelEditor === "new" && providerId !== "custom"
                    ? pageCopy["正在保存并获取模型…"]
                    : pageCopy["正在保存…"]
                  : channelEditor === "new" && providerId !== "custom"
                    ? pageCopy["保存并获取模型"]
                    : pageCopy["保存渠道"]}
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modelEditor && (
        <Modal
          wide
          title={
            modelEditor === "new"
              ? pageCopy["添加模型"]
              : formatCopy(pageCopy["编辑模型 · {value0}"], { value0: modelEditor.name })
          }
          description={formatCopy(pageCopy["所属渠道：{value0}。连接配置直接使用渠道设置。"], {
            value0: data.channels.find((c) => c.id === form.channelId)?.name ?? "",
          })}
          onClose={() => {
            if (!busy) setModelEditor(null);
          }}
        >
          <form onSubmit={(e) => void saveModel(e)}>
            <div className="form-body">
              <div className="form-grid">
                <label>
                  {pageCopy["显示名称"]}
                  <input
                    autoFocus
                    required
                    maxLength={40}
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    placeholder={pageCopy["例如：DeepSeek Chat"]}
                  />
                </label>
                <label>
                  {pageCopy["模型 ID"]}
                  <input
                    required
                    readOnly={modelEditor !== "new"}
                    maxLength={120}
                    value={form.model}
                    onChange={(e) => update("model", e.target.value)}
                    placeholder={pageCopy["填写供应商提供的模型 ID"]}
                  />
                  {modelEditor !== "new" && (
                    <small>{pageCopy["使用其他模型 ID 请添加新模型，保留原会话归属。"]}</small>
                  )}
                </label>
              </div>
              <label>
                {pageCopy["备注（可选）"]}
                <input
                  maxLength={160}
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                  placeholder={pageCopy["例如：用于日常提问"]}
                />
              </label>
              <label>
                {pageCopy["模型类型"]}
                <select
                  value={modelKind(form)}
                  onChange={(e) => update("kind", e.target.value as ModelKind)}
                >
                  {Object.entries(modelKindLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {workspaceLabel(locale, label)}
                    </option>
                  ))}
                </select>
                <small>{pageCopy["优先读取上游分类；未提供时自动识别，也可在这里调整。"]}</small>
              </label>
              <label>
                {pageCopy["系统提示词（可选）"]}
                <textarea
                  rows={3}
                  maxLength={12000}
                  value={form.systemPrompt}
                  onChange={(e) => update("systemPrompt", e.target.value)}
                />
              </label>
              <details
                className="advanced-fields"
                open={
                  modelEditor !== "new" && shortcutConflicts.has(modelEditor.shortcut.toLowerCase())
                }
              >
                <summary>{pageCopy["更多设置：输入、输出与消耗上限"]}</summary>
                <div className="form-grid">
                  <label>
                    {pageCopy["输入 Token 上限"]}
                    <input
                      type="number"
                      required
                      min={512}
                      max={MAX_CONTEXT_TOKENS}
                      value={form.maxInputTokens}
                      onChange={(e) => update("maxInputTokens", Number(e.target.value))}
                    />
                  </label>
                  <label>
                    {pageCopy["输出 Token 上限"]}
                    <input
                      type="number"
                      required
                      min={64}
                      max={MAX_OUTPUT_TOKENS}
                      value={form.maxOutputTokens}
                      onChange={(e) => update("maxOutputTokens", Number(e.target.value))}
                    />
                  </label>
                  <label>
                    {pageCopy["模型上下文窗口（含输出）"]}
                    <input
                      type="number"
                      required
                      min={512}
                      max={MAX_CONTEXT_TOKENS}
                      list="context-window-presets"
                      value={form.contextTokens}
                      onChange={(e) => update("contextTokens", Number(e.target.value))}
                    />
                    <datalist id="context-window-presets">
                      <option value={128000}>128K</option>
                      <option value={256000}>256K</option>
                      <option value={1000000}>1M</option>
                      <option value={2000000}>2M</option>
                    </datalist>
                  </label>
                  <label>
                    {pageCopy["单轮 credits 上限（0 为不限）"]}
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      step={0.001}
                      value={form.maxCredits}
                      onChange={(e) => update("maxCredits", Number(e.target.value))}
                    />
                  </label>
                  <label>
                    {pageCopy["快捷名称 "]}
                    <span className="inline-plus">PLUS</span>
                    <input
                      disabled={data.plan !== "plus"}
                      maxLength={24}
                      value={form.shortcut}
                      onChange={(e) => update("shortcut", e.target.value)}
                      placeholder={pageCopy["例如：写作（不含 @）"]}
                    />
                    {data.plan !== "plus" && form.shortcut && (
                      <button
                        type="button"
                        className="text-link"
                        disabled={Boolean(busy)}
                        onClick={() => update("shortcut", "")}
                      >
                        {pageCopy["移除旧快捷名"]}
                      </button>
                    )}
                    {shortcutConflicts.has(form.shortcut.toLowerCase()) && (
                      <small>
                        {pageCopy["此别名与其他模型或插件重复，大小写不能用于区分。"]}
                        {data.plan === "plus"
                          ? pageCopy["请修改别名后保存，再使用 @ 调用。"]
                          : pageCopy["可移除旧快捷名后保存；仍可通过渠道和模型菜单使用此模型。"]}
                        {pageCopy["也可到 "]}
                        <Link to={`${base}/plugins`}>{pageCopy["插件"]}</Link>
                        {pageCopy[" 修改另一方的别名。"]}
                      </small>
                    )}
                  </label>
                </div>
                <small>
                  {pageCopy["有效输入上限 "]}
                  {effectiveInput.toLocaleString(locale === "ko" ? "ko-KR" : "zh-CN")}{" "}
                  {
                    pageCopy[
                      "tokens，已为回复和安全余量预留空间。 按输入、输出上限估算，一次回答约"
                    ]
                  }{" "}
                  {formatCredits(estimatedCallCredits)}
                  {pageCopy[" credits；自动摘要不额外扣本站额度。"]}
                </small>
                <small>
                  {
                    pageCopy[
                      "输入包含系统提示词、历史摘要、最近对话与本次消息，按平台 Token 计量；接近有效上限的 80% 时自动整理历史。摘要也遵守输入、输出上限。上游超过输出上限时平台会截取回复，单轮 credits 上限限制本站扣费。 模型上下文窗口请按供应商实际能力填写。"
                    ]
                  }
                </small>
                {form.maxCredits > 0 && estimatedCallCredits > form.maxCredits && (
                  <small>
                    {
                      pageCopy[
                        "当前单轮 credits 上限更低，系统会进一步限制回复长度；预算不足时提示调整设置。"
                      ]
                    }
                  </small>
                )}
                {effectiveInput < 64 && (
                  <small>
                    {pageCopy["上下文窗口不足以容纳回复，请降低输出上限或增大上下文窗口。"]}
                  </small>
                )}
              </details>
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
              <LimitHint code={error ? limitCode : undefined} />
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                disabled={Boolean(busy)}
                onClick={() => setModelEditor(null)}
              >
                {pageCopy["取消"]}
              </button>
              <button className="button" disabled={Boolean(busy)}>
                {busy ? pageCopy["正在保存…"] : pageCopy["保存模型"]}
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          title={formatCopy(pageCopy["删除{value0}「{value1}」？"], {
            value0: deleting.kind === "channel" ? pageCopy["渠道"] : pageCopy["模型"],
            value1: deleting.name,
          })}
          description={
            deleting.kind === "channel"
              ? pageCopy["此渠道、所属模型、绑定的插件配置及相关会话消息将永久删除，无法恢复。"]
              : pageCopy[
                  "此模型、绑定的插件配置及相关会话消息将永久删除，无法恢复。渠道和其他模型会保留。"
                ]
          }
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={Boolean(busy)}
              onClick={() => setDeleting(null)}
            >
              {pageCopy["取消"]}
            </button>
            <button
              className="button danger"
              disabled={Boolean(busy)}
              onClick={() => void action(deleting.kind, deleting.id, "delete")}
            >
              {busy ? pageCopy["正在删除…"] : pageCopy["确认删除"]}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
