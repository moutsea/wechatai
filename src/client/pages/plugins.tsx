import { OpenClawEditor } from "./openclaw-editor";
import {
  isRemoteAgent,
  type RemoteAgentPlugin,
  type RemoteAgentKind,
} from "../../shared/remote-agent";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FlaskConical, Power } from "lucide-react";
import { useApp } from "../context";
import { Modal, PageHead } from "../ui";
import { json } from "../api";
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
  const [editor, setEditor] = useState<WebResearchPlugin | "new" | null>(null);
  const [form, setForm] = useState(initial);
  const [agentKind, setAgentKind] = useState<RemoteAgentKind>("openclaw");
  const [clawEditor, setClawEditor] = useState<RemoteAgentPlugin | "new" | null>(null);
  const [imageEditor, setImageEditor] = useState<ImageGenerationPlugin | "new" | null>(null);
  const [viewing, setViewing] = useState<PluginKind | null>(null);
  const [viewedId, setViewedId] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<UserPlugin | null>(null);
  const [testing, setTesting] = useState<UserPlugin | null>(null);
  const [query, setQuery] = useState("");
  const [reply, setReply] = useState<{ text: string; cost: number } | null>(null);
  if (!data) return null;
  const selectedModel = data.assistants.find((a) => a.id === form.modelId);
  const update = <K extends keyof WebResearchInput>(key: K, value: WebResearchInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const open = (p: UserPlugin | "new") => {
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
    setForm(
      p === "new" ? { ...initial, modelId: data.assistants[0]?.id ?? "" } : { ...p, apiKey: "" },
    );
  };
  const configure = (kind: PluginKind) => {
    if (kind === "wechatai/openclaw" || kind === "wechatai/hermes") {
      setAgentKind(kind === "wechatai/hermes" ? "hermes" : "openclaw");
      setClawEditor("new");
    } else if (kind === "wechatai/image-generation") setImageEditor("new");
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
        description="给微信添一点新能力。所有插件均为 Plus 专享。"
        action={
          <Link className="text-link" to="/guide#plugins">
            使用指南 <ArrowRight size={15} />
          </Link>
        }
      />
      <PluginLibrary
        onConfigure={configure}
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
        输入与最终回复按 token 计费，生成图片另计 5 credits / 张；插件内部调用不重复计收。上游 API
        费用由你的服务商另行收取。
      </p>
      {viewing && !editor && !imageEditor && !clawEditor && !testing && !deleting && (
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
          onDelete={setDeleting}
          onAction={(id, operation) => void action(id, operation)}
        />
      )}
      {clawEditor && (
        <OpenClawEditor
          key={agentKind}
          kind={agentKind}
          plugin={clawEditor}
          onClose={() => setClawEditor(null)}
          onSaved={(id) => {
            setViewedId(id);
            setViewing(`wechatai/${agentKind}`);
          }}
          onComplete={(id) => {
            setViewedId(id);
            setClawEditor(null);
            setViewing(null);
          }}
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
                    value={form.shortcut}
                    onChange={(e) => update("shortcut", e.target.value)}
                  />
                  <small>例如「DS」：@DS 问题 单次使用，/use DS 设为默认</small>
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
                  {data.assistants.map((a) => (
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
              <button className="button" disabled={Boolean(busy)}>
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
              : testing.pluginId === "wechatai/image-generation"
                ? "会实际生成一张图片，消耗 5 credits 加描述文字的输入费用；图片保留 30 天。"
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
                      : "例如：查一下 DeepSeek Harness 的功能，并附上来源"
                  }
                />
              </label>
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
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
          description="将删除插件配置，已有会话记录保留，但无法继续调用此插件。"
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
