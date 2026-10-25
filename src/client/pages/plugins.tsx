import {
  pluginShortcutPatternForEdit,
  isLegacyNumericShortcut,
  LEGACY_NUMERIC_SHORTCUT_HINT,
  PLUGIN_SHORTCUT_HINT,
} from "../../shared/plugin-shortcut";
import { PLUGIN_LIMITS } from "../../shared/plugin-access";
import { isChatModel } from "../../shared/model-compatibility";
import { NotificationEditor } from "./notification-editor";
import type { NotificationPlugin } from "../../shared/notification";
import { PersonalAssistantEditor } from "./personal-assistant-editor";
import { PersonalRecords } from "./personal-records";
import type { PersonalAssistantPlugin } from "../../shared/personal-assistant";
import { RoleplayEditor } from "./roleplay-editor";
import type { RoleplayPlugin } from "../../shared/roleplay";
import { OpenClawEditor } from "./openclaw-editor";
import {
  isRemoteAgent,
  type RemoteAgentPlugin,
  type RemoteAgentKind,
} from "../../shared/remote-agent";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, FlaskConical, Power } from "lucide-react";
import { useApp } from "../context";
import { Modal, PageHead } from "../ui";
import { json, limitErrorCode } from "../api";
import { LimitHint } from "../limit-hint";
import { formatCredits } from "../../shared/types";
import {
  searchProviderLabels,
  searchEndpointHints,
  DEEPSEEK_SEARCH_DEFAULT_MODEL,
  type WebResearchInput,
  type WebResearchPlugin,
} from "../../shared/web-research";
import { ChatMarkdown as MessageMarkdown } from "../chat-markdown";
import "./plugins.css";
import { type UserPlugin, type ImageGenerationPlugin } from "../../shared/image-generation";
import { ImagePluginEditor } from "./image-plugin-editor";
import { PluginLibrary, PluginConfiguration, type PluginKind } from "./plugin-library";

const initial: WebResearchInput = {
  name: "DS Chat",
  shortcut: "DS",
  modelId: "",
  enabled: true,
  searchProvider: "deepseek",
  searchEndpoint: searchEndpointHints.deepseek,
  searchModel: "",
  apiKey: "",
  maxSearches: 3,
  maxReads: 3,
};
export function Plugins() {
  const { data, request, refresh, notify, demo } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editor, setEditor] = useState<WebResearchPlugin | "new" | null>(null);
  const [notificationEditor, setNotificationEditor] = useState<NotificationPlugin | "new" | null>(
    null,
  );
  const [form, setForm] = useState(initial);
  const [agentKind, setAgentKind] = useState<RemoteAgentKind>("openclaw");
  const [clawEditor, setClawEditor] = useState<RemoteAgentPlugin | "new" | null>(null);
  const [personalEditor, setPersonalEditor] = useState<PersonalAssistantPlugin | "new" | null>(
    null,
  );
  const [personalRecords, setPersonalRecords] = useState<PersonalAssistantPlugin | null>(null);
  const [roleEditor, setRoleEditor] = useState<RoleplayPlugin | "new" | null>(null);
  const [imageEditor, setImageEditor] = useState<ImageGenerationPlugin | "new" | null>(null);
  const [viewing, setViewing] = useState<PluginKind | null>(null);
  const [viewedId, setViewedId] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [limitCode, setLimitCode] = useState<string | undefined>();
  const [deleting, setDeleting] = useState<UserPlugin | null>(null);
  const [testing, setTesting] = useState<UserPlugin | null>(null);
  const [query, setQuery] = useState("");
  const [reply, setReply] = useState<{ text: string; cost: number } | null>(null);
  const previousShortcut = editor && editor !== "new" ? editor.shortcut : undefined;
  const keepingLegacyShortcut =
    isLegacyNumericShortcut(previousShortcut) && form.shortcut === previousShortcut;
  if (!data) return null;
  const upgradeId = searchParams.get("upgrade");
  const upgradePlugin = upgradeId
    ? data.plugins?.find(
        (p): p is RemoteAgentPlugin => p.id === upgradeId && p.pluginId === "wechatai/openclaw",
      )
    : undefined;
  const activeClawEditor = upgradePlugin ?? clawEditor;
  const activeAgentKind = upgradePlugin ? "openclaw" : agentKind;
  const closeClawEditor = () => {
    setClawEditor(null);
    if (upgradeId) {
      const next = new URLSearchParams(searchParams);
      next.delete("upgrade");
      setSearchParams(next, { replace: true });
    }
  };
  const textModels = data.assistants.filter(isChatModel);
  const selectedModel = textModels.find((a) => a.id === form.modelId);
  const update = <K extends keyof WebResearchInput>(key: K, value: WebResearchInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const open = (p: UserPlugin | "new") => {
    if (p !== "new" && p.pluginId === "wechatai/notification") {
      setNotificationEditor(p);
      return;
    }
    if (p !== "new" && p.pluginId === "wechatai/personal-assistant") {
      setPersonalEditor(p);
      return;
    }
    if (p !== "new" && p.pluginId === "wechatai/roleplay") {
      setRoleEditor(p);
      return;
    }
    if (p !== "new" && isRemoteAgent(p)) {
      setAgentKind(p.pluginId === "wechatai/hermes" ? "hermes" : "openclaw");
      setClawEditor(p);
      return;
    }
    if (p !== "new" && p.pluginId === "wechatai/image-generation") {
      setImageEditor(p);
      return;
    }
    setError("");
    setEditor(p);
    setForm(p === "new" ? { ...initial, modelId: textModels[0]?.id ?? "" } : { ...p, apiKey: "" });
  };
  const configure = (kind: PluginKind) => {
    if (kind === "wechatai/notification") {
      setNotificationEditor("new");
      return;
    }
    if (kind === "wechatai/openclaw" || kind === "wechatai/hermes") {
      setAgentKind(kind === "wechatai/hermes" ? "hermes" : "openclaw");
      setClawEditor("new");
    } else if (kind === "wechatai/personal-assistant") setPersonalEditor("new");
    else if (kind === "wechatai/roleplay") setRoleEditor("new");
    else if (kind === "wechatai/image-generation") setImageEditor("new");
    else open("new");
  };
  const action = async (id: string, operation: string) => {
    setBusy(id);
    setError("");
    try {
      await request(
        operation === "exit"
          ? "/plugins/exit"
          : `/plugins/${id}${operation === "delete" ? "" : "/activate"}`,
        operation === "delete"
          ? { method: "DELETE" }
          : json({ connectionId: data.selectedConnectionId }),
      );
      await refresh();
      setDeleting(null);
      if (operation === "delete") {
        setViewedId("");
        if (!(data.plugins ?? []).some((p) => p.pluginId === viewing && p.id !== id))
          setViewing(null);
      }
      notify(
        operation === "delete"
          ? "插件配置已删除，会话记录仍然保留"
          : operation === "exit"
            ? "已退出插件，返回普通模型会话"
            : "已进入默认插件模式，直接发送问题即可；/exit 退出",
      );
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy("");
    }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("save");
    setError("");
    try {
      const saved = await request<WebResearchPlugin>(
        editor === "new" ? "/plugins" : `/plugins/${editor?.id}`,
        json(form, editor === "new" ? "POST" : "PATCH"),
      );
      await refresh();
      setViewedId(saved.id);
      setEditor(null);
      notify(
        "插件已保存。/use " + form.shortcut + " 设为默认；@" + form.shortcut + " 问题 仅本次使用",
      );
    } catch (e) {
      setError((e as Error).message);
      setLimitCode(limitErrorCode(e));
    } finally {
      setBusy("");
    }
  };
  const maintain = async (id: string, patch: { shortcut?: string; enabled?: false }) => {
    setBusy(id);
    try {
      await request(`/plugins/${id}`, json(patch, "PATCH"));
      await refresh();
      notify(patch.enabled === false ? "插件已停用" : "别名已更新，套餐限制保持不变");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy("");
    }
  };
  const test = async (event: FormEvent) => {
    event.preventDefault();
    if (!testing) return;
    setBusy("test");
    setError("");
    setReply(null);
    try {
      setReply(await request(`/plugins/${testing.id}/test`, json({ query })));
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      setLimitCode(limitErrorCode(e));
    } finally {
      setBusy("");
    }
  };
  const destinationChanged =
    editor &&
    editor !== "new" &&
    (editor.searchEndpoint !== form.searchEndpoint ||
      editor.searchProvider !== form.searchProvider);
  return (
    <>
      <PageHead
        eyebrow="PLUGINS"
        title="插件"
        description={`给微信添一点新能力。Free 最多配置 1 个插件，Plus 会员配置数量不限。当前已配置 ${data.plugins?.length ?? 0}${data.plan === "free" ? ` / ${PLUGIN_LIMITS.free}` : ""} 个。`}
        action={
          <Link className="text-link" to="/docs/ds-chat">
            使用指南 <ArrowRight size={15} />
          </Link>
        }
      />
      {upgradeId && !upgradePlugin && (
        <p className="plugin-config-renew" role="alert">
          这个 OpenClaw 配置已删除，或不属于当前登录账号。
          <button className="text-link" onClick={closeClawEditor}>
            返回插件列表
          </button>
        </p>
      )}
      <PluginLibrary
        onConfigure={configure}
        onResume={open}
        onView={(kind) => {
          setViewedId("");
          setViewing(kind);
        }}
      />
      <p className="research-commands">
        <code>@快捷名 内容</code> 单次调用 · <code>/use 快捷名</code> 直接切换 · <code>/exit</code>{" "}
        返回普通模型
      </p>
      {data.currentSession?.pluginInstanceId &&
        !(data.plugins ?? []).some((p) => p.id === data.currentSession?.pluginInstanceId) && (
          <p className="plugin-config-renew">
            当前默认插件已删除。
            <button
              className="text-link"
              disabled={Boolean(busy)}
              onClick={() => void action("exit", "exit")}
            >
              返回普通模型
            </button>
          </p>
        )}
      <p className="research-billing">
        消息提醒不扣 credits。其他插件输入与最终回复按 token 计费，生成图片另计 5 credits /
        张；插件内部调用不重复计收。上游 API 费用由你的服务商另行收取。
      </p>
      {viewing &&
        !notificationEditor &&
        !personalEditor &&
        !personalRecords &&
        !roleEditor &&
        !editor &&
        !imageEditor &&
        !activeClawEditor &&
        !testing &&
        !deleting && (
          <PluginConfiguration
            kind={viewing}
            selectedId={viewedId}
            onSelect={setViewedId}
            busy={Boolean(busy)}
            onClose={() => {
              if (!busy) setViewing(null);
            }}
            onAdd={configure}
            onEdit={open}
            onTest={(p) => {
              if (isRemoteAgent(p)) {
                setAgentKind(p.pluginId === "wechatai/hermes" ? "hermes" : "openclaw");
                setClawEditor(p);
                return;
              }
              setTesting(p);
              setReply(null);
              setQuery("");
              setError("");
            }}
            onRecords={setPersonalRecords}
            onDelete={setDeleting}
            onAction={(id, operation) => void action(id, operation)}
            onManage={(id, patch) => void maintain(id, patch)}
          />
        )}
      {notificationEditor && (
        <NotificationEditor
          plugin={notificationEditor}
          onClose={() => setNotificationEditor(null)}
          onSaved={(id) => {
            setViewedId(id);
            setViewing("wechatai/notification");
            setNotificationEditor(null);
          }}
        />
      )}
      {personalEditor && (
        <PersonalAssistantEditor
          plugin={personalEditor}
          onClose={() => setPersonalEditor(null)}
          onSaved={(id) => {
            setViewedId(id);
            setViewing("wechatai/personal-assistant");
            setPersonalEditor(null);
          }}
        />
      )}
      {personalRecords && (
        <PersonalRecords plugin={personalRecords} onClose={() => setPersonalRecords(null)} />
      )}
      {activeClawEditor && (
        <OpenClawEditor
          key={`${activeAgentKind}:${activeClawEditor === "new" ? "new" : activeClawEditor.id}`}
          kind={activeAgentKind}
          plugin={activeClawEditor}
          showUpgrade={Boolean(upgradePlugin)}
          onClose={closeClawEditor}
          onSaved={(id) => {
            setViewedId(id);
            setViewing(`wechatai/${activeAgentKind}`);
          }}
          onComplete={(id) => {
            setViewedId(id);
            closeClawEditor();
            setViewing(null);
          }}
        />
      )}
      {roleEditor && (
        <RoleplayEditor
          plugin={roleEditor}
          onSaved={(id) => {
            setViewedId(id);
            setViewing("wechatai/roleplay");
          }}
          onClose={() => setRoleEditor(null)}
        />
      )}
      {imageEditor && (
        <ImagePluginEditor
          plugin={imageEditor}
          onSaved={setViewedId}
          onClose={() => setImageEditor(null)}
        />
      )}
      {editor && (
        <Modal
          title={editor === "new" ? "添加 DS Chat" : "编辑 DS Chat"}
          description="一个名称，一组模型与搜索配置。"
          onClose={() => {
            if (!busy) setEditor(null);
          }}
        >
          <form onSubmit={(e) => void save(e)}>
            <div className="form-body">
              <div className="form-grid">
                <label>
                  插件名称
                  <input
                    required
                    maxLength={40}
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                  />
                </label>
                <label>
                  微信快捷名称
                  <input
                    required
                    maxLength={24}
                    pattern={pluginShortcutPatternForEdit(
                      editor && editor !== "new" ? editor.shortcut : undefined,
                    )}
                    title={PLUGIN_SHORTCUT_HINT}
                    value={form.shortcut}
                    onChange={(e) => update("shortcut", e.target.value)}
                  />
                  <small>
                    {keepingLegacyShortcut
                      ? LEGACY_NUMERIC_SHORTCUT_HINT
                      : "别名不能是纯数字。例如「DS」：@DS 问题 单次使用，/use DS 设为默认"}
                  </small>
                </label>
              </div>
              <label>
                回答模型
                <select
                  required
                  disabled={editor !== "new"}
                  value={form.modelId}
                  onChange={(e) => update("modelId", e.target.value)}
                >
                  {!selectedModel && (
                    <option value={form.modelId} disabled>
                      请选择文本模型
                    </option>
                  )}
                  {textModels.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.channelName} / {a.name}
                      {a.name !== a.model ? `（${a.model}）` : ""}
                    </option>
                  ))}
                </select>
                {selectedModel && (
                  <small className="research-selected-model">
                    实际模型 ID：<code>{selectedModel.model}</code>
                  </small>
                )}
                <small>沿用该模型的输入、输出及单次 credits 上限。更换模型请新建配置。</small>
              </label>
              <label>
                搜索 API 类型
                <select
                  value={form.searchProvider}
                  onChange={(e) => {
                    const provider = e.target.value as WebResearchInput["searchProvider"];
                    setForm((f) => ({
                      ...f,
                      searchProvider: provider,
                      searchEndpoint:
                        !f.searchEndpoint ||
                        Object.values(searchEndpointHints).some((url) => url === f.searchEndpoint)
                          ? provider === "searxng"
                            ? ""
                            : searchEndpointHints[provider]
                          : f.searchEndpoint,
                      apiKey: "",
                    }));
                  }}
                >
                  {Object.entries(searchProviderLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                搜索 API 地址
                <input
                  type="url"
                  required
                  maxLength={1000}
                  placeholder={searchEndpointHints[form.searchProvider]}
                  value={form.searchEndpoint}
                  onChange={(e) => update("searchEndpoint", e.target.value)}
                />
                <small>已知服务会预填官方地址，也可改为自己的完整 HTTPS 接口地址。</small>
              </label>
              {form.searchProvider === "deepseek" && (
                <label>
                  搜索模型 ID（选填）
                  <input
                    maxLength={120}
                    value={form.searchModel}
                    placeholder={`留空使用 ${DEEPSEEK_SEARCH_DEFAULT_MODEL}`}
                    onChange={(e) => update("searchModel", e.target.value)}
                  />
                  <small>
                    留空自动使用 {DEEPSEEK_SEARCH_DEFAULT_MODEL} 搜索，与上方回答模型独立。
                    自定义模型须支持原生 Web Search。
                  </small>
                </label>
              )}
              <label>
                搜索 API Key
                <input
                  type="password"
                  autoComplete="new-password"
                  maxLength={2000}
                  required={
                    form.searchProvider !== "searxng" &&
                    (editor === "new" || Boolean(destinationChanged) || !editor.hasKey)
                  }
                  value={form.apiKey}
                  onChange={(e) => update("apiKey", e.target.value)}
                  placeholder={
                    editor !== "new" && editor.hasKey && !destinationChanged
                      ? "已加密保存，留空不更改"
                      : form.searchProvider === "searxng"
                        ? "公开实例可留空；填写时作为 Bearer Token"
                        : "填写你自己的搜索服务密钥"
                  }
                />
                <small>更换地址或类型时须重新填写。密钥不会回传到浏览器。</small>
              </label>
              <details className="advanced-fields">
                <summary>调用次数与启用状态</summary>
                <div className="form-grid">
                  <label>
                    最多搜索次数
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={form.maxSearches}
                      onChange={(e) => update("maxSearches", Number(e.target.value))}
                    />
                  </label>
                  <label>
                    最多读取网页数
                    <input
                      type="number"
                      min={0}
                      max={8}
                      value={form.maxReads}
                      onChange={(e) => update("maxReads", Number(e.target.value))}
                    />
                  </label>
                </div>
                <label>
                  状态
                  <select
                    value={String(form.enabled)}
                    onChange={(e) => update("enabled", e.target.value === "true")}
                  >
                    <option value="true">启用</option>
                    <option value="false">停用</option>
                  </select>
                </label>
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
                onClick={() => setEditor(null)}
              >
                取消
              </button>
              <button className="button" disabled={Boolean(busy) || !selectedModel}>
                {busy ? "正在保存…" : "保存配置"}
                <Power size={16} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {testing && (
        <Modal
          wide
          title={`测试 · ${testing.name}`}
          description={
            demo
              ? "预览模式仅展示示例，不发送真实请求。"
              : testing.pluginId === "wechatai/personal-assistant"
                ? "会实际调用你的模型并消耗 credits；仅演练操作，不保存笔记、账目或提醒，不发送提醒。"
                : testing.pluginId === "wechatai/image-generation"
                  ? "会实际生成一张图片，消耗 5 credits 加描述文字的输入费用；图片保留 30 天。"
                  : testing.pluginId === "wechatai/roleplay"
                    ? "会实际调用你的模型，按角色设定、输入和最终回复消耗 credits；测试不写入故事会话。"
                    : "会实际调用你的模型和搜索服务，并按输入与最终回复消耗 credits。"
          }
          onClose={() => {
            if (!busy) setTesting(null);
          }}
        >
          <form onSubmit={(e) => void test(e)}>
            <div className="form-body">
              <label>
                {testing.pluginId === "wechatai/image-generation" ? "画面描述" : "测试问题"}
                <textarea
                  required
                  maxLength={2000}
                  rows={3}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    testing.pluginId === "wechatai/image-generation"
                      ? "例如：一只橘猫坐在窗边读书，温暖阳光，水彩风格"
                      : testing.pluginId === "wechatai/roleplay"
                        ? "例如：你好，今天我们去哪里？"
                        : "例如：查一下 DeepSeek Harness 的功能，并附上来源"
                  }
                />
              </label>
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
              <LimitHint code={error ? limitCode : undefined} />
              {reply && (
                <div className="research-test-result">
                  <MessageMarkdown content={reply.text} id="research-test" />
                  <small>本次使用 {formatCredits(reply.cost)} credits</small>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button className="button" disabled={Boolean(busy)}>
                {busy
                  ? testing.pluginId === "wechatai/image-generation"
                    ? "正在生成图片，请稍候…"
                    : "正在搜索与整理，请稍候…"
                  : "开始测试"}
                <FlaskConical size={16} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          title={`删除「${deleting.name}」？`}
          description={
            deleting.pluginId === "wechatai/personal-assistant"
              ? "将永久删除这份助理的全部笔记、账目和提醒，并取消提醒。已有聊天记录保留。建议先导出需要保留的数据。"
              : "将删除插件配置，已有会话记录保留，但无法继续调用此插件。"
          }
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setDeleting(null)}
              disabled={Boolean(busy)}
            >
              取消
            </button>
            <button
              className="button danger"
              onClick={() => void action(deleting.id, "delete")}
              disabled={Boolean(busy)}
            >
              删除配置
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
