import { useLocale } from "../locale";
import { IMAGE_CREDITS } from "../../shared/credits";
import { useWorkspaceText, useWorkspaceError } from "../workspace-copy";
import {
  pluginShortcutForEdit,
  pluginShortcutPatternForEdit,
  isLegacyNumericShortcut,
  LEGACY_NUMERIC_SHORTCUT_HINT,
  PLUGIN_SHORTCUT_HINT,
} from "../../shared/plugin-shortcut";
import { useState, type FormEvent } from "react";
import { Cloud } from "lucide-react";
import { Link } from "react-router-dom";
import { isChatModel } from "../../shared/model-compatibility";
import { useApp } from "../context";
import { Modal } from "../ui";
import { json } from "../api";
import {
  CLOUD_AGENT_PLUGIN_ID,
  CLOUD_AGENT_NAME,
  CLOUD_AGENT_SHORTCUT,
  CLOUD_AGENT_STORAGE_BYTES,
  CLOUD_AGENT_FILE_LIMITS_NOTE,
  CLOUD_AGENT_WAITING_MESSAGE,
  cloudAgentAvailabilityIssue,
  cloudAgentInputSchema,
  resolveCloudAgentModel,
  type CloudAgentInput,
  type CloudAgentPlugin,
} from "../../shared/cloud-agent";
import { waitingMessageDefaults } from "../../shared/waiting-message";
import { WaitingMessageField } from "./waiting-message-field";
import { CLOUD_AGENT_COST_NOTE } from "../../shared/pricing-copy";

export function CloudAgentEditor({
  plugin,
  onClose,
  onSaved,
}: {
  plugin: CloudAgentPlugin | "new";
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const { locale } = useLocale();
  const errorText = useWorkspaceError();
  const copyText = useWorkspaceText();
  const { data, base, request, refresh, notify } = useApp();
  const editSchema = cloudAgentInputSchema.safeExtend({
    shortcut: pluginShortcutForEdit(plugin === "new" ? undefined : plugin.shortcut),
  });
  const [form, setForm] = useState<CloudAgentInput>(() =>
    plugin === "new"
      ? {
          name: copyText(CLOUD_AGENT_NAME),
          modelId: "",
          shortcut: copyText(CLOUD_AGENT_SHORTCUT),
          enabled: true,
          ...waitingMessageDefaults(copyText(CLOUD_AGENT_WAITING_MESSAGE)),
        }
      : editSchema.parse(plugin),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const previousShortcut = plugin === "new" ? undefined : plugin.shortcut;
  const keepingLegacyShortcut =
    isLegacyNumericShortcut(previousShortcut) && form.shortcut === previousShortcut;
  if (!data) return null;
  const availability = cloudAgentAvailabilityIssue(data.plan, data.cloudAgent);
  const textModels = data.assistants.filter(isChatModel);
  const defaultModel = resolveCloudAgentModel({ modelId: "" }, textModels, data.defaultModelId);
  const model = resolveCloudAgentModel(form, textModels, data.defaultModelId);
  const missingModel = (plugin === "new" || form.enabled) && !model;
  const blocked = plugin === "new" || form.enabled ? availability : null;
  const update = <K extends keyof CloudAgentInput>(key: K, value: CloudAgentInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  async function save(event: FormEvent) {
    event.preventDefault();
    if (blocked || missingModel) return;
    setBusy(true);
    setError("");
    try {
      const saved = await request<CloudAgentPlugin>(
        plugin === "new" ? "/plugins" : `/plugins/${plugin.id}`,
        json({ ...form, pluginId: CLOUD_AGENT_PLUGIN_ID }, plugin === "new" ? "POST" : "PATCH"),
      );
      await refresh();
      onSaved?.(saved.id);
      notify(
        form.enabled
          ? copyText("小薇已保存，发送 @{value0} 问题 或 /use {value1} 使用", {
              value0: form.shortcut,
              value1: form.shortcut,
            })
          : copyText("小薇配置已保存，当前已停用"),
      );
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={plugin === "new" ? copyText("添加小薇") : copyText("编辑小薇")}
      description={copyText(
        "小薇是运行在微伴云端的助手。不用安装或部署，选好模型后，就能在微信交代任务。",
      )}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={(e) => void save(e)}>
        <div className="form-body">
          <div className="form-grid">
            <label>
              {copyText("插件名称")}
              <input
                required
                maxLength={40}
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
              />
            </label>
            <label>
              {copyText("微信快捷名称")}
              <input
                required
                maxLength={24}
                pattern={pluginShortcutPatternForEdit(previousShortcut)}
                title={copyText(PLUGIN_SHORTCUT_HINT)}
                value={form.shortcut}
                onChange={(e) => update("shortcut", e.target.value)}
              />
              <small>
                {keepingLegacyShortcut
                  ? copyText(LEGACY_NUMERIC_SHORTCUT_HINT)
                  : copyText("@{value0} 问题 仅本次调用；/use {value1} 设为默认", {
                      value0: form.shortcut,
                      value1: form.shortcut,
                    })}
              </small>
            </label>
          </div>
          <label>
            {copyText("执行模型")}
            <select value={form.modelId} onChange={(e) => update("modelId", e.target.value)}>
              <option value="">
                {copyText("使用默认模型")}
                {defaultModel
                  ? `（${defaultModel.channelName} / ${defaultModel.name}）`
                  : copyText("（尚未配置文本模型）")}
              </option>
              {form.modelId && !model && (
                <option value={form.modelId} disabled>
                  {copyText("原模型不可用，请重新选择")}
                </option>
              )}
              {textModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.channelName} / {model.name}（{model.model}）
                </option>
              ))}
            </select>
            <small>
              {copyText(
                "未指定时跟随当前微信选中的普通模型；进入插件后沿用上一次普通模型。也可为此插件单独选择模型。 沿用该模型的渠道、密钥、系统提示词和输入、输出及 credits 上限。模型需支持工具调用。 输入上限包含每轮调用的历史与工具信息；无原生计数接口时保守估算，可能提前达到上限。",
              )}
            </small>
            {!textModels.length && (
              <small>
                {copyText("请先")}
                <Link to={`${base}/channels`}>{copyText("配置渠道与文本模型")}</Link>。
              </small>
            )}
          </label>
          <label>
            {copyText("状态")}
            <select
              value={form.enabled ? "enabled" : "disabled"}
              onChange={(e) => update("enabled", e.target.value === "enabled")}
            >
              <option value="enabled">{copyText("启用")}</option>
              <option value="disabled">{copyText("停用")}</option>
            </select>
          </label>
          <p className="form-note">
            <Cloud size={14} aria-hidden="true" />{" "}
            {copyText(
              "请在「微信连接」扫码，已连接时可直接使用。支持文字、图片、可提取文字的 PDF、DOCX 和文本文件，以及带微信转写文本的语音。先发附件，再补充处理要求；图片需所用模型支持视觉输入，单张最大 2 MB。 结果会回复微信；切换会话后，请在任务页查看原任务结果。 /wx stop 请求停止当前会话的云端任务。",
            )}
          </p>
          <p className="form-note">
            {copyText("每账号提供 ")}
            {CLOUD_AGENT_STORAGE_BYTES / (1024 * 1024)}
            {copyText(" MiB 云端空间，同账号的小薇配置共用。 可在")}
            <Link to={`${base}/tasks`}>{copyText("云端任务页")}</Link>
            {copyText("查看用量。")}
          </p>
          <p className="form-note">{copyText(CLOUD_AGENT_FILE_LIMITS_NOTE)}</p>
          <p className="form-note">
            {data.cloudAgent.adminPreview && copyText("当前仅对管理员开放内测。")}
            {locale === "es"
              ? copyText("费用说明.cloud", { credits: IMAGE_CREDITS })
              : CLOUD_AGENT_COST_NOTE}
            {copyText(
              "内部模型和工具消耗不额外扣 credits。 失败或确认取消不扣 credits；已发生的模型 API 费用仍由服务商收取。请求停止后仍可能完成，平台费用以最终结果为准。",
            )}
            {data.cloudAgent.ready
              ? copyText(
                  " 当前每账号同时 {value0} 个任务，每日最多 {value1} 次，{value2} 分钟后请求停止。",
                  {
                    value0: data.cloudAgent.maxActive,
                    value1: data.cloudAgent.dailyLimit,
                    value2: data.cloudAgent.deadlineMinutes,
                  },
                )
              : copyText("执行次数与时限以保存后的插件状态为准。")}
          </p>
          <p className="form-note">
            {copyText(
              "任务内容会发送至微伴运营方的 AGT 服务及你选择的模型供应商；所选模型的渠道配置与密钥会加密同步至 AGT 用于执行。删除微伴任务记录不会同步删除 AGT 模型渠道、历史或记忆，请勿提交不希望发送的敏感信息。",
            )}
          </p>
          <WaitingMessageField
            value={form}
            defaultMessage={copyText(CLOUD_AGENT_WAITING_MESSAGE)}
            onChange={(value) => setForm((f) => ({ ...f, ...value }))}
          />
          {(error || blocked || missingModel) && (
            <p className="form-error" role="alert">
              {error ||
                (blocked ? errorText(blocked) : undefined) ||
                (form.modelId
                  ? copyText("所选模型不可用，请重新选择文本模型。")
                  : copyText("请先在「渠道与模型」配置文本模型。"))}
            </p>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            {copyText("取消")}
          </button>
          <button className="button" disabled={busy || Boolean(blocked) || missingModel}>
            {busy ? copyText("正在保存…") : copyText("保存配置")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
