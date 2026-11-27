import { workspaceError, workspaceLabel } from "../workspace-copy";
import { useLocale } from "../locale";
import { copy as sourceCopy } from "../../shared/i18n/zh-CN/copy/image-plugin-editor-page";
import { copy as koCopy } from "../../shared/i18n/ko/copy/image-plugin-editor-page";
import { formatCopy } from "../../shared/i18n/dashboard";
import {
  pluginShortcutForEdit,
  pluginShortcutPatternForEdit,
  isLegacyNumericShortcut,
  LEGACY_NUMERIC_SHORTCUT_HINT,
  PLUGIN_SHORTCUT_HINT,
} from "../../shared/plugin-shortcut";
import { useState, type FormEvent } from "react";
import { ImagePlus } from "lucide-react";
import { useApp } from "../context";
import { Modal } from "../ui";
import { json } from "../api";
import {
  imageGenerationInputSchema,
  type ImageGenerationInput,
  type ImageGenerationPlugin,
} from "../../shared/image-generation";
import { IMAGE_WAITING_MESSAGE, waitingMessageDefaults } from "../../shared/waiting-message";
import { WaitingMessageField } from "./waiting-message-field";
import { modelKind, modelKindLabels } from "../../shared/model-kind";
import { IMAGE_CREDITS } from "../../shared/credits";

export function ImagePluginEditor({
  plugin,
  onClose,
  onSaved,
}: {
  plugin: ImageGenerationPlugin | "new";
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const { locale } = useLocale();
  const pageCopy = locale === "ko" ? koCopy : sourceCopy;

  const { data, request, refresh, notify } = useApp();
  const editSchema = imageGenerationInputSchema.safeExtend({
    shortcut: pluginShortcutForEdit(plugin === "new" ? undefined : plugin.shortcut),
  });
  const [form, setForm] = useState<ImageGenerationInput>(() =>
    plugin === "new"
      ? {
          name: pageCopy["AI 生图"],
          shortcut: pageCopy["画图"],
          modelId:
            data?.assistants.find((a) => modelKind(a) === "image")?.id ??
            data?.assistants[0]?.id ??
            "",
          enabled: true,
          ...waitingMessageDefaults(workspaceLabel(locale, IMAGE_WAITING_MESSAGE)),
        }
      : editSchema.parse(plugin),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const previousShortcut = plugin === "new" ? undefined : plugin.shortcut;
  const keepingLegacyShortcut =
    isLegacyNumericShortcut(previousShortcut) && form.shortcut === previousShortcut;
  if (!data) return null;
  const selected = data.assistants.find((a) => a.id === form.modelId);
  const update = <K extends keyof ImageGenerationInput>(key: K, value: ImageGenerationInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const saved = await request<ImageGenerationPlugin>(
        plugin === "new" ? "/plugins" : `/plugins/${plugin.id}`,
        json(
          { ...form, pluginId: "wechatai/image-generation" },
          plugin === "new" ? "POST" : "PATCH",
        ),
      );
      await refresh();
      onSaved?.(saved.id);
      notify(
        isLegacyNumericShortcut(form.shortcut)
          ? pageCopy["生图插件已保存；使用 /use 前请修改纯数字别名"]
          : formatCopy(pageCopy["生图插件已保存，发送 @{value0} 画面描述 即可使用"], {
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
  return (
    <Modal
      title={plugin === "new" ? pageCopy["添加 AI 生图"] : pageCopy["编辑 AI 生图"]}
      description={pageCopy["描述你想看到的画面，在微信里收到图片。"]}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={(e) => void save(e)}>
        <div className="form-body">
          <div className="form-grid">
            <label>
              {pageCopy["插件名称"]}
              <input
                required
                maxLength={40}
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
              />
            </label>
            <label>
              {pageCopy["微信快捷名称"]}
              <input
                required
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
                      pageCopy["别名不能是纯数字。@{value0} 描述 单次生成；/use {value1} 默认使用"],
                      { value0: form.shortcut, value1: form.shortcut },
                    )}
              </small>
            </label>
          </div>
          <label>
            {pageCopy["生图模型"]}
            <select
              required
              disabled={plugin !== "new"}
              value={form.modelId}
              onChange={(e) => update("modelId", e.target.value)}
            >
              {(["image", "text", "other"] as const).map(
                (kind) =>
                  data.assistants.some((a) => modelKind(a) === kind) && (
                    <optgroup key={kind} label={workspaceLabel(locale, modelKindLabels[kind])}>
                      {data.assistants
                        .filter((a) => modelKind(a) === kind)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.channelName} / {a.name}
                            {a.name !== a.model ? `（${a.model}）` : ""}
                          </option>
                        ))}
                    </optgroup>
                  ),
              )}
            </select>
            <small>
              {pageCopy["实际模型 ID："]}
              <code>{selected?.model}</code>
              {pageCopy["。请先在「渠道与模型」配置你自己的生图服务地址、API Key 和模型 ID。"]}
            </small>
            <small>
              {pageCopy["微伴不提供生图 API。所选渠道需支持 /v1/images/generations 接口。"]}
            </small>
          </label>
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
          <WaitingMessageField
            value={form}
            defaultMessage={workspaceLabel(locale, IMAGE_WAITING_MESSAGE)}
            onChange={(value) => setForm((f) => ({ ...f, ...value }))}
          />
          <div className="guide-note">
            {
              pageCopy[
                "可在描述末尾写明比例，例如“城市街景，3:4”。支持 1:1、3:4、4:3、2:3、3:2、9:16、16:9、4:5、5:4、21:9 和 9:21，平台会自动转换为尺寸参数；未写比例时使用上游默认设置。所选生图服务需支持对应尺寸。"
              ]
            }
          </div>
          <div className="guide-note">
            {pageCopy["平台每张图片收取 "]}
            {IMAGE_CREDITS}
            {
              pageCopy[
                " credits，描述文字按输入 token 计费；上游生图费用由你的渠道另行收取。 沿用所选模型的输入和单次 credits 上限。每条描述独立生成，暂不支持参考图或连续改图；网页图片保留 30 天，请及时下载。"
              ]
            }
          </div>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            {pageCopy["取消"]}
          </button>
          <button className="button" disabled={busy || !form.modelId}>
            {busy ? pageCopy["正在保存…"] : pageCopy["保存配置"]}
            <ImagePlus size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
