import {
  pluginShortcutForEdit,
  pluginShortcutPatternForEdit,
  isLegacyNumericShortcut,
  LEGACY_NUMERIC_SHORTCUT_HINT,
  PLUGIN_SHORTCUT_HINT,
} from "../../shared/plugin-shortcut";
import { useState, type FormEvent } from "react";
import { Cloud } from "lucide-react";
import { useApp } from "../context";
import { Modal } from "../ui";
import { json } from "../api";
import {
  CLOUD_AGENT_PLUGIN_ID,
  CLOUD_AGENT_WAITING_MESSAGE,
  cloudAgentAvailabilityIssue,
  cloudAgentInputSchema,
  type CloudAgentInput,
  type CloudAgentPlugin,
} from "../../shared/cloud-agent";
import { waitingMessageDefaults } from "../../shared/waiting-message";
import { WaitingMessageField } from "./waiting-message-field";

export function CloudAgentEditor({
  plugin,
  onClose,
  onSaved,
}: {
  plugin: CloudAgentPlugin | "new";
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const { data, request, refresh, notify } = useApp();
  const editSchema = cloudAgentInputSchema.safeExtend({
    shortcut: pluginShortcutForEdit(plugin === "new" ? undefined : plugin.shortcut),
  });
  const [form, setForm] = useState<CloudAgentInput>(() =>
    plugin === "new"
      ? {
          name: "云端 Agent",
          shortcut: "云",
          enabled: true,
          ...waitingMessageDefaults(CLOUD_AGENT_WAITING_MESSAGE),
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
  const blocked = plugin === "new" || form.enabled ? availability : null;
  const update = <K extends keyof CloudAgentInput>(key: K, value: CloudAgentInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  async function save(event: FormEvent) {
    event.preventDefault();
    if (blocked) return;
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
          ? `云端 Agent 已保存，发送 @${form.shortcut} 问题 或 /use ${form.shortcut} 使用`
          : "云端 Agent 配置已保存，当前已停用",
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={plugin === "new" ? "添加云端 Agent" : "编辑云端 Agent"}
      description="无需自备模型渠道。由微伴托管模型与工具，任务在后台执行。"
      onClose={() => {
        if (!busy) onClose();
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
                pattern={pluginShortcutPatternForEdit(previousShortcut)}
                title={PLUGIN_SHORTCUT_HINT}
                value={form.shortcut}
                onChange={(e) => update("shortcut", e.target.value)}
              />
              <small>
                {keepingLegacyShortcut
                  ? LEGACY_NUMERIC_SHORTCUT_HINT
                  : `@${form.shortcut} 问题 仅本次调用；/use ${form.shortcut} 设为默认`}
              </small>
            </label>
          </div>
          <label>
            状态
            <select
              value={form.enabled ? "enabled" : "disabled"}
              onChange={(e) => update("enabled", e.target.value === "enabled")}
            >
              <option value="enabled">启用</option>
              <option value="disabled">停用</option>
            </select>
          </label>
          <p className="form-note">
            <Cloud size={14} aria-hidden="true" />{" "}
            请在「微信连接」扫码，已连接时可直接使用。支持文字和带微信转写文本的语音。图片、文件暂不支持；
            需要分析附件时请切换到聊天模型。结果会回复微信；切换会话后，请在任务页查看原任务结果。
            /wx stop 请求停止当前会话的云端任务。
          </p>
          <p className="form-note">
            Plus 专属。托管模型由运营方提供，内部模型成本无需另付供应商；仍按平台输入与最终输出消耗
            credits，失败或取消不扣费。
            {data.cloudAgent.ready
              ? ` 当前每账号同时 ${data.cloudAgent.maxActive} 个任务，每日最多 ${data.cloudAgent.dailyLimit} 次，${data.cloudAgent.deadlineMinutes} 分钟后请求停止。`
              : "执行次数与时限以保存后的插件状态为准。"}
          </p>
          <p className="form-note">
            任务内容会发送至微伴运营方的 AGT
            服务及模型供应商。删除微伴任务记录不会同步删除云端历史或记忆，请勿提交不希望发送的敏感信息。
          </p>
          <WaitingMessageField
            value={form}
            defaultMessage={CLOUD_AGENT_WAITING_MESSAGE}
            onChange={(value) => setForm((f) => ({ ...f, ...value }))}
          />
          {(error || blocked) && (
            <p className="form-error" role="alert">
              {error || blocked?.message}
            </p>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button className="button" disabled={busy || Boolean(blocked)}>
            {busy ? "正在保存…" : "保存配置"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
