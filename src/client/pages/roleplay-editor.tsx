import {
  defaultUserName,
  presetInstructions as koPresetInstructions,
} from "../../shared/i18n/ko/copy/roleplay-characters";
import { roleplayInstructions as ptInstructions } from "../../shared/i18n/pt/copy/roleplay";
import { workspaceError, workspaceLabel } from "../workspace-copy";
import { useLocale } from "../locale";
import { copy as sourceCopy } from "../../shared/i18n/zh-CN/copy/roleplay-editor-page";
import { copy as koCopy } from "../../shared/i18n/ko/copy/roleplay-editor-page";
import { workspaceCopy as ptCopy } from "../../shared/i18n/pt/copy/workspace";
import { formatCopy } from "../../shared/i18n/dashboard";
import {
  pluginShortcutForEdit,
  pluginShortcutPatternForEdit,
  isLegacyNumericShortcut,
  LEGACY_NUMERIC_SHORTCUT_HINT,
  PLUGIN_SHORTCUT_HINT,
} from "../../shared/plugin-shortcut";
import { isChatModel } from "../../shared/model-compatibility";
import { useRef, useState, type FormEvent } from "react";
import { BookOpen, Download, LayoutGrid, Plus, Theater, Trash2, Upload } from "lucide-react";
import { useApp } from "../context";
import { Modal } from "../ui";
import { json } from "../api";
import {
  roleplayInputSchema,
  type RoleplayInput,
  type RoleplayPlugin,
} from "../../shared/roleplay";
import { exportCharacterCard, readCharacterCard } from "../../shared/character-card";
import { createRoleplayFromPreset, type RoleplayPreset } from "../../shared/roleplay-presets";
import { RoleplayPresetPicker } from "./roleplay-presets";
import {
  pluginIconSource,
  roleAvatarChoices,
  roleAvatarSource,
  type RoleAvatarId,
} from "../../shared/plugin-visuals";
import "./roleplay.css";

function download(name: string, value: string) {
  const url = URL.createObjectURL(new Blob([value], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name.replace(/[\\/:*?"<>|]/g, "_");
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function RoleplayEditor({
  plugin,
  onClose,
  onSaved,
}: {
  plugin: RoleplayPlugin | "new";
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { locale } = useLocale();
  const pageCopy =
    locale === "ko" ? koCopy : locale === "pt" ? ptCopy : sourceCopy;

  const { data, request, refresh, notify } = useApp();
  const editSchema = roleplayInputSchema.safeExtend({
    shortcut: pluginShortcutForEdit(plugin === "new" ? undefined : plugin.shortcut),
  });
  const [form, setForm] = useState<RoleplayInput>(() =>
    plugin === "new"
      ? {
          ...editSchema.parse({
            name: pageCopy["新角色"],
            ...(locale === "ko"
              ? { userName: defaultUserName }
              : locale === "pt"
                ? { userName: ptCopy["你"] }
                : {}),
            shortcut: pageCopy["角色"],
            modelId: data?.assistants.find(isChatModel)?.id || "unselected",
            description: pageCopy["待填写"],
          }),
          name: "",
          description: "",
          modelId: data?.assistants.find(isChatModel)?.id || "",
        }
      : editSchema.parse(plugin),
  );
  const [tab, setTab] = useState<"role" | "story" | "lore">("role");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [choosingPreset, setChoosingPreset] = useState(plugin === "new");
  const file = useRef<HTMLInputElement>(null);
  const previousShortcut = plugin === "new" ? undefined : plugin.shortcut;
  const keepingLegacyShortcut =
    isLegacyNumericShortcut(previousShortcut) && form.shortcut === previousShortcut;
  if (!data) return null;
  const textModels = data.assistants.filter(isChatModel);
  const model = textModels.find((a) => a.id === form.modelId);
  const choosePreset = (preset: RoleplayPreset) => {
    setForm(
      createRoleplayFromPreset(preset, {
        instructions:
          locale === "ko" ? koPresetInstructions : locale === "pt" ? ptInstructions : undefined,
        modelId: form.modelId,
        enabled: form.enabled,
        occupiedShortcuts: [
          ...data.assistants.map((a) => a.shortcut || ""),
          ...(data.plugins ?? []).map((p) => p.shortcut),
        ],
      }),
    );
    setTab("role");
    setWarnings([]);
    setError("");
    setChoosingPreset(false);
  };
  const update = <K extends keyof RoleplayInput>(key: K, value: RoleplayInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const updateLore = (index: number, change: Partial<RoleplayInput["lore"][number]>) =>
    setForm((f) => ({
      ...f,
      lore: f.lore.map((entry, i) => (i === index ? { ...entry, ...change } : entry)),
    }));
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const parsed = editSchema.safeParse({
        ...form,
        lore: form.lore.map((e) => ({
          ...e,
          keys: e.keys.map((k) => k.trim()).filter(Boolean),
          secondaryKeys: e.secondaryKeys.map((k) => k.trim()).filter(Boolean),
        })),
      });
      if (!parsed.success)
        throw new Error(
          pageCopy["请检查角色设定："] +
            parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("；"),
        );
      const saved = await request<RoleplayPlugin>(
        plugin === "new" ? "/plugins" : `/plugins/${plugin.id}`,
        json(
          { ...parsed.data, pluginId: "wechatai/roleplay" },
          plugin === "new" ? "POST" : "PATCH",
        ),
      );
      await refresh();
      onSaved(saved.id);
      notify(
        isLegacyNumericShortcut(form.shortcut)
          ? pageCopy["角色已保存；使用 /use 前请修改纯数字别名"]
          : formatCopy(pageCopy["角色已保存，发送 /use {value0} 开始聊天"], {
              value0: form.shortcut,
            }),
      );
      onClose();
    } catch (e) {
      setError(workspaceError(e as Error, locale));
    } finally {
      setBusy(false);
    }
  }
  async function importFile(selected: File) {
    setImporting(true);
    setError("");
    try {
      if (selected.size > 5 * 1024 * 1024) throw new Error(pageCopy["角色卡文件不能超过 5 MB"]);
      const result = readCharacterCard(new Uint8Array(await selected.arrayBuffer()), {
        modelId: form.modelId || "unselected",
        shortcut: keepingLegacyShortcut ? pageCopy["角色"] : form.shortcut || pageCopy["角色"],
      });
      setForm({
        ...result.input,
        shortcut: form.shortcut || result.input.shortcut,
        modelId: form.modelId,
        enabled: form.enabled,
      });
      setWarnings(result.warnings.map((warning) => workspaceLabel(locale, warning)));
      setTab("role");
      setChoosingPreset(false);
    } catch (e) {
      setError(workspaceError(e as Error, locale));
    } finally {
      setImporting(false);
      if (file.current) file.current.value = "";
    }
  }
  function exportCard() {
    const parsed = editSchema.safeParse({
      ...form,
      lore: form.lore.map((e) => ({
        ...e,
        keys: e.keys.map((k) => k.trim()).filter(Boolean),
        secondaryKeys: e.secondaryKeys.map((k) => k.trim()).filter(Boolean),
      })),
    });
    if (!parsed.success) {
      setError(pageCopy["请先填写角色名称、设定和模型，再导出角色卡"]);
      return;
    }
    download(`${form.name}.json`, JSON.stringify(exportCharacterCard(parsed.data), null, 2));
  }
  const field = (
    key:
      | "description"
      | "personality"
      | "userPersona"
      | "scenario"
      | "firstMessage"
      | "examples"
      | "instructions"
      | "postHistoryInstructions",
    label: string,
    placeholder: string,
    max: number,
    rows = 4,
  ) => (
    <label>
      {label}
      <textarea
        value={form[key]}
        maxLength={max}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => update(key, e.target.value)}
      />
    </label>
  );
  return (
    <Modal
      title={
        choosingPreset
          ? pageCopy["选择你的聊天伙伴"]
          : plugin === "new"
            ? pageCopy["创建角色"]
            : formatCopy(pageCopy["编辑 {value0}"], { value0: plugin.name })
      }
      description={
        choosingPreset
          ? pageCopy["六种性格，六个故事开头。接下来，由你续写。"]
          : pageCopy["一个角色，一段属于你的故事。"]
      }
      wide={choosingPreset}
      onClose={() => {
        if (!busy && !importing) onClose();
      }}
    >
      <input
        ref={file}
        type="file"
        accept=".json,.png,application/json,image/png"
        hidden
        disabled={busy || importing}
        onChange={(e) => {
          if (e.target.files?.[0]) void importFile(e.target.files[0]);
        }}
      />
      {choosingPreset ? (
        <RoleplayPresetPicker
          onSelect={choosePreset}
          onCustom={() => {
            setChoosingPreset(false);
            setError("");
          }}
          onImport={() => file.current?.click()}
          importing={importing}
          hasDraft={Boolean(form.name || form.description || form.firstMessage)}
          error={error}
        />
      ) : (
        <form onSubmit={(e) => void save(e)}>
          <div className="form-body role-editor">
            <div className="role-card-tools">
              {plugin === "new" && (
                <button
                  type="button"
                  className="button secondary small"
                  disabled={busy || importing}
                  onClick={() => {
                    setError("");
                    setChoosingPreset(true);
                  }}
                >
                  <LayoutGrid size={15} />
                  {pageCopy[" 选择内置角色"]}
                </button>
              )}
              <button
                type="button"
                className="button secondary small"
                disabled={busy || importing}
                onClick={() => file.current?.click()}
              >
                <Upload size={15} />
                {importing ? pageCopy["正在读取…"] : pageCopy["导入角色卡"]}
              </button>
              <button
                type="button"
                className="text-link"
                disabled={busy || importing}
                onClick={exportCard}
              >
                <Download size={14} />
                {pageCopy["导出 V2 JSON"]}
              </button>
              <small>{pageCopy["V2 JSON / PNG · 文件 ≤ 5 MB，角色文字 ≤ 64 KB"]}</small>
            </div>
            {warnings.length > 0 && (
              <details className="role-import-note" open>
                <summary>{pageCopy["已读入角色卡，请检查后保存"]}</summary>
                <ul>
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </details>
            )}
            <div className="role-tabs" role="tablist" aria-label={pageCopy["角色设置"]}>
              {(
                [
                  ["role", pageCopy["角色"], Theater],
                  ["story", pageCopy["故事与对话"], BookOpen],
                  [
                    "lore",
                    formatCopy(pageCopy["世界书{value0}"], {
                      value0: form.lore.length ? ` · ${form.lore.length}` : "",
                    }),
                    BookOpen,
                  ],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  id={`role-tab-${value}`}
                  aria-selected={tab === value}
                  aria-controls={`role-panel-${value}`}
                  onClick={() => setTab(value)}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>
            <div
              role="tabpanel"
              id={`role-panel-${tab}`}
              aria-labelledby={`role-tab-${tab}`}
              className="role-panel"
            >
              {tab === "role" && (
                <>
                  <div className="role-avatar-picker">
                    <img
                      src={roleAvatarSource(form.avatar) || pluginIconSource("wechatai/roleplay")}
                      alt={pageCopy["角色头像预览"]}
                      width={64}
                      height={64}
                    />
                    <label>
                      {pageCopy["角色头像"]}
                      <select
                        value={form.avatar}
                        onChange={(e) => update("avatar", e.target.value as RoleAvatarId)}
                      >
                        <option value="">{pageCopy["默认图标"]}</option>
                        {roleAvatarChoices.map((a) => (
                          <option key={a.id} value={a.id}>
                            {locale === "pt" ? workspaceLabel(locale, a.name) : a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="form-grid">
                    <label>
                      {pageCopy["角色名称"]}
                      <input
                        maxLength={40}
                        value={form.name}
                        placeholder={pageCopy["例如：林间旅人"]}
                        onChange={(e) => update("name", e.target.value)}
                      />
                    </label>
                    <label>
                      {pageCopy["微信快捷名"]}
                      <input
                        maxLength={24}
                        pattern={pluginShortcutPatternForEdit(
                          plugin === "new" ? undefined : plugin.shortcut,
                        )}
                        title={workspaceLabel(locale, PLUGIN_SHORTCUT_HINT)}
                        value={form.shortcut}
                        onChange={(e) => update("shortcut", e.target.value)}
                      />
                      <small>
                        {keepingLegacyShortcut
                          ? workspaceLabel(locale, LEGACY_NUMERIC_SHORTCUT_HINT)
                          : formatCopy(
                              pageCopy[
                                "别名不能是纯数字。发送 /use {value0} 进入角色；@{value1} 单次对话"
                              ],
                              {
                                value0: form.shortcut || pageCopy["快捷名"],
                                value1: form.shortcut || pageCopy["快捷名"],
                              },
                            )}
                      </small>
                    </label>
                  </div>
                  <label>
                    {pageCopy["对话模型"]}
                    <select
                      value={form.modelId}
                      onChange={(e) => update("modelId", e.target.value)}
                    >
                      {!model && (
                        <option value={form.modelId} disabled>
                          {pageCopy["请选择文本模型"]}
                        </option>
                      )}
                      {textModels.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.channelName} / {a.name}（{a.model}）
                        </option>
                      ))}
                    </select>
                    <small>
                      {pageCopy["实际模型 ID："]}
                      {model?.model || pageCopy["未选择"]}
                      {
                        pageCopy[
                          "。角色设定替代该模型的系统提示词，沿用它的输入、输出和 credits 上限。"
                        ]
                      }
                    </small>
                  </label>
                  {field(
                    "description",
                    pageCopy["角色设定"],
                    pageCopy["描述角色的身份、背景、说话方式，以及你希望 TA 如何与你相处。"],
                    16000,
                    6,
                  )}
                  {field(
                    "personality",
                    pageCopy["性格补充（选填）"],
                    pageCopy["例如：温和、好奇，偶尔有一点冷幽默。"],
                    6000,
                    3,
                  )}
                  <label>
                    {pageCopy["状态"]}
                    <select
                      value={String(form.enabled)}
                      onChange={(e) => update("enabled", e.target.value === "true")}
                    >
                      <option value="true">{pageCopy["启用"]}</option>
                      <option value="false">{pageCopy["停用"]}</option>
                    </select>
                  </label>
                </>
              )}
              {tab === "story" && (
                <>
                  <label>
                    {pageCopy["你在故事中的名字"]}
                    <input
                      maxLength={80}
                      value={form.userName}
                      onChange={(e) => update("userName", e.target.value)}
                    />
                  </label>
                  {field(
                    "userPersona",
                    pageCopy["你的身份与关系（选填）"],
                    pageCopy["例如：你是一位新来的旅行者，与角色初次相识。"],
                    6000,
                  )}
                  {field(
                    "scenario",
                    pageCopy["故事场景（选填）"],
                    pageCopy["这段故事从哪里开始？有什么需要记住的背景？"],
                    8000,
                  )}
                  {field(
                    "firstMessage",
                    pageCopy["开场白（选填）"],
                    pageCopy["角色的第一句话。新建故事时展示，返回已有会话不会重复。"],
                    6000,
                  )}
                  <small>
                    {
                      pageCopy[
                        "开场白本身不扣 credits；作为后续请求的上下文时计入输入。网页建立会话会保存在记录中，微信通过 /use 或 /new 新建故事时直接显示。"
                      ]
                    }
                  </small>
                  {field(
                    "examples",
                    pageCopy["对话示例（选填）"],
                    pageCopy["{{user}}：今晚要去哪里？\n{{char}}：沿着河边走吧，灯刚刚亮起来。"],
                    16000,
                  )}
                  <details className="role-advanced">
                    <summary>{pageCopy["更多角色指令"]}</summary>
                    {field(
                      "instructions",
                      pageCopy["角色指令"],
                      pageCopy["额外的叙事方式、语气或对话规则。"],
                      8000,
                    )}
                    {field(
                      "postHistoryInstructions",
                      pageCopy["回复要求"],
                      pageCopy[
                        "例如：每次回复简短，不替用户说话。V2 的 post_history_instructions 在此作为系统提示的末尾要求。"
                      ],
                      4000,
                    )}
                    <small>
                      {pageCopy["支持 "]}
                      {"{{char}}"}
                      {pageCopy[" 和 "]}
                      {"{{user}}"}
                      {pageCopy[" 替换角色与用户名字。其他宏只作为文字。"]}
                    </small>
                  </details>
                </>
              )}
              {tab === "lore" && (
                <>
                  <div className="role-lore-intro">
                    <BookOpen size={22} />
                    <p>
                      {
                        pageCopy[
                          "让设定在需要时出现。匹配当前消息与最近 3 条对话的关键词，优先带入高优先级条目。"
                        ]
                      }
                    </p>
                  </div>
                  <label>
                    {pageCopy["世界书输入预算（tokens）"]}
                    <input
                      type="number"
                      min={0}
                      max={4000}
                      step={1}
                      value={form.loreTokenBudget}
                      onChange={(e) => update("loreTokenBudget", Number(e.target.value))}
                    />
                    <small>
                      {
                        pageCopy[
                          "默认 1,000，最多 4,000；0 表示不带入。超出世界书预算或当前模型输入空间的条目会跳过，已带入的文字计入 credits。"
                        ]
                      }
                    </small>
                  </label>
                  {form.lore.length === 0 && (
                    <div className="role-lore-empty">
                      {pageCopy["还没有世界书条目。角色本身的设定会一直保留，无需在这里重复。"]}
                    </div>
                  )}
                  {form.lore.map((entry, i) => (
                    <fieldset key={i} className="role-lore-entry">
                      <legend>
                        {pageCopy["条目 "]}
                        {i + 1}
                      </legend>
                      <div className="role-lore-heading">
                        <input
                          aria-label={formatCopy(pageCopy["条目 {value0} 名称"], { value0: i + 1 })}
                          maxLength={100}
                          placeholder={pageCopy["名称，如：月光酒馆"]}
                          value={entry.name}
                          onChange={(e) => updateLore(i, { name: e.target.value })}
                        />
                        <button
                          type="button"
                          className="icon-button danger-text"
                          aria-label={formatCopy(pageCopy["删除条目 {value0}"], { value0: i + 1 })}
                          onClick={() =>
                            update(
                              "lore",
                              form.lore.filter((_, j) => j !== i),
                            )
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <label>
                        {pageCopy["触发关键词"]}
                        <input
                          value={entry.keys.join(",")}
                          maxLength={3030}
                          placeholder={pageCopy["酒馆, 月光酒馆（用逗号分隔）"]}
                          onChange={(e) => updateLore(i, { keys: e.target.value.split(/[,，]/) })}
                        />
                      </label>
                      <label>
                        {pageCopy["补充关键词（选填，同时命中其中一个）"]}
                        <input
                          value={entry.secondaryKeys.join(",")}
                          maxLength={3030}
                          onChange={(e) =>
                            updateLore(i, { secondaryKeys: e.target.value.split(/[,，]/) })
                          }
                        />
                      </label>
                      <label>
                        {pageCopy["设定内容"]}
                        <textarea
                          rows={3}
                          maxLength={6000}
                          value={entry.content}
                          onChange={(e) => updateLore(i, { content: e.target.value })}
                        />
                      </label>
                      <div className="form-grid">
                        <label>
                          {pageCopy["优先级"]}
                          <input
                            type="number"
                            min={-10000}
                            max={10000}
                            value={entry.priority}
                            onChange={(e) => updateLore(i, { priority: Number(e.target.value) })}
                          />
                        </label>
                        <label>
                          {pageCopy["触发方式"]}
                          <select
                            value={entry.constant ? "always" : "keywords"}
                            onChange={(e) =>
                              updateLore(i, { constant: e.target.value === "always" })
                            }
                          >
                            <option value="keywords">{pageCopy["关键词触发"]}</option>
                            <option value="always">{pageCopy["始终带入（仍受预算限制）"]}</option>
                          </select>
                        </label>
                      </div>
                      <div className="role-lore-checks">
                        <label>
                          <input
                            type="checkbox"
                            checked={entry.enabled}
                            onChange={(e) => updateLore(i, { enabled: e.target.checked })}
                          />
                          {pageCopy["启用"]}
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={entry.caseSensitive}
                            onChange={(e) => updateLore(i, { caseSensitive: e.target.checked })}
                          />
                          {pageCopy["区分英文大小写"]}
                        </label>
                      </div>
                    </fieldset>
                  ))}
                  <button
                    type="button"
                    className="button secondary small"
                    disabled={form.lore.length >= 50}
                    onClick={() =>
                      update("lore", [
                        ...form.lore,
                        {
                          name: "",
                          keys: [],
                          secondaryKeys: [],
                          content: "",
                          enabled: true,
                          constant: false,
                          caseSensitive: false,
                          priority: 0,
                        },
                      ])
                    }
                  >
                    <Plus size={15} />
                    {pageCopy["添加世界书条目"]}
                  </button>
                </>
              )}
            </div>
            <p className="role-footnote">
              {
                pageCopy[
                  "每个角色拥有独立会话，/new 开始新故事。长对话自动整理剧情摘要，可在「会话记录」中查看和修正。设定、命中的世界书、摘要和历史计入输入；内部整理不重复收 credits。"
                ]
              }
            </p>
            {form.sourceCard && (
              <button
                type="button"
                className="text-link"
                onClick={() =>
                  download(`${form.name || pageCopy["角色"]}-original.json`, form.sourceCard)
                }
              >
                <Download size={14} />
                {pageCopy["下载原始卡片 JSON（含保留的扩展）"]}
              </button>
            )}
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
              disabled={busy || importing}
              onClick={onClose}
            >
              {pageCopy["取消"]}
            </button>
            <button className="button" disabled={busy || importing || !model}>
              {busy ? pageCopy["正在保存…"] : pageCopy["保存角色"]}
              <Theater size={16} />
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
