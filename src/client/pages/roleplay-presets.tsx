import { characters } from "../../shared/i18n/ko/copy/roleplay-characters";
import { useLocale } from "../locale";
import { copy as sourceCopy } from "../../shared/i18n/zh-CN/copy/roleplay-presets-page";
import { copy as koCopy } from "../../shared/i18n/ko/copy/roleplay-presets-page";
import { formatCopy } from "../../shared/i18n/dashboard";
import { useState } from "react";
import { ArrowRight, Check, PenLine, Upload } from "lucide-react";
import { roleplayPresets, type RoleplayPreset } from "../../shared/roleplay-presets";
import { ChatMarkdown } from "../chat-markdown";
import { roleAvatarSource } from "../../shared/plugin-visuals";

export function RoleplayPresetPicker({
  onSelect,
  onCustom,
  onImport,
  importing,
  hasDraft,
  error,
}: {
  onSelect: (preset: RoleplayPreset) => void;
  onCustom: () => void;
  onImport: () => void;
  importing: boolean;
  hasDraft: boolean;
  error: string;
}) {
  const { locale } = useLocale();
  const pageCopy = locale === "ko" ? koCopy : sourceCopy;

  const presets =
    locale === "ko"
      ? roleplayPresets.map((preset) => ({ ...preset, ...characters[preset.id] }))
      : roleplayPresets;
  const [selectedId, setSelectedId] = useState(presets[0]!.id);
  const selected = presets.find((preset) => preset.id === selectedId)!;
  return (
    <>
      <div className="form-body role-presets">
        <div className="role-preset-grid" aria-label={pageCopy["原创角色模板"]}>
          {presets.map((preset) => (
            <button
              type="button"
              className={`role-preset-card ${selected.id === preset.id ? "selected" : ""}`}
              key={preset.id}
              aria-pressed={selected.id === preset.id}
              disabled={importing}
              onClick={() => setSelectedId(preset.id)}
            >
              <span className={`role-preset-mark ${preset.tone}`} aria-hidden="true">
                <img
                  src={roleAvatarSource(preset.id)}
                  alt=""
                  width={64}
                  height={64}
                  decoding="async"
                />
              </span>
              <span className="role-preset-title">
                <strong>{preset.character.name}</strong>
                <small>{preset.category}</small>
              </span>
              {selected.id === preset.id && <Check size={15} className="role-preset-check" />}
              <span className="role-preset-tagline">{preset.tagline}</span>
            </button>
          ))}
        </div>
        <section
          className="role-preset-preview"
          aria-label={pageCopy["角色预览"]}
          aria-live="polite"
        >
          <img
            className="role-preview-avatar"
            src={roleAvatarSource(selected.id)}
            alt={formatCopy(pageCopy["{value0}头像"], { value0: selected.character.name })}
            width={72}
            height={72}
          />
          <div className="role-preview-copy">
            <div className="role-preset-preview-head">
              <strong>
                {selected.character.name}
                {pageCopy["的开场白"]}
              </strong>
              <span>
                {selected.category}
                {pageCopy[" · 原创角色"]}
              </span>
            </div>
            <ChatMarkdown
              id={`preset-${selected.id}`}
              content={selected.character.firstMessage || ""}
            />
          </div>
        </section>
        <div className="role-preset-alternatives">
          <button type="button" disabled={importing} onClick={onCustom}>
            <PenLine size={15} />{" "}
            {hasDraft ? pageCopy["继续编辑当前角色"] : pageCopy["自己创建角色"]}
          </button>
          <button type="button" disabled={importing} onClick={onImport}>
            <Upload size={15} /> {importing ? pageCopy["正在读取…"] : pageCopy["导入角色卡"]}
          </button>
        </div>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="modal-actions role-presets-actions">
        <small>
          {hasDraft
            ? pageCopy["使用模板会替换当前草稿的人设"]
            : pageCopy["人设、开场白和背景均可修改"]}
        </small>
        <button
          type="button"
          className="button"
          disabled={importing}
          onClick={() => onSelect(selected)}
        >
          {pageCopy["使用这个角色 "]}
          <ArrowRight size={16} />
        </button>
      </div>
    </>
  );
}
