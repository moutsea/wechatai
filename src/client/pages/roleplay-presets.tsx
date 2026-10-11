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
  const [selected, setSelected] = useState(roleplayPresets[0]!);
  return (
    <>
      <div className="form-body role-presets">
        <div className="role-preset-grid" aria-label="原创角色模板">
          {roleplayPresets.map((preset) => (
            <button
              type="button"
              className={`role-preset-card ${selected.id === preset.id ? "selected" : ""}`}
              key={preset.id}
              aria-pressed={selected.id === preset.id}
              disabled={importing}
              onClick={() => setSelected(preset)}
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
        <section className="role-preset-preview" aria-label="角色预览" aria-live="polite">
          <img
            className="role-preview-avatar"
            src={roleAvatarSource(selected.id)}
            alt={`${selected.character.name}头像`}
            width={72}
            height={72}
          />
          <div className="role-preview-copy">
            <div className="role-preset-preview-head">
              <strong>{selected.character.name}的开场白</strong>
              <span>{selected.category} · 原创角色</span>
            </div>
            <ChatMarkdown
              id={`preset-${selected.id}`}
              content={selected.character.firstMessage || ""}
            />
          </div>
        </section>
        <div className="role-preset-alternatives">
          <button type="button" disabled={importing} onClick={onCustom}>
            <PenLine size={15} /> {hasDraft ? "继续编辑当前角色" : "自己创建角色"}
          </button>
          <button type="button" disabled={importing} onClick={onImport}>
            <Upload size={15} /> {importing ? "正在读取…" : "导入角色卡"}
          </button>
        </div>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="modal-actions role-presets-actions">
        <small>{hasDraft ? "使用模板会替换当前草稿的人设" : "人设、开场白和背景均可修改"}</small>
        <button
          type="button"
          className="button"
          disabled={importing}
          onClick={() => onSelect(selected)}
        >
          使用这个角色 <ArrowRight size={16} />
        </button>
      </div>
    </>
  );
}
