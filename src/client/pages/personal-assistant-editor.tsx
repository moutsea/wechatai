import { modelKind } from "../../shared/model-kind";
import { useState, type FormEvent } from "react";
import { useApp } from "../context";
import { Modal } from "../ui";
import { json } from "../api";
import {
  personalAssistantInputSchema,
  type PersonalAssistantInput,
  type PersonalAssistantPlugin,
} from "../../shared/personal-assistant";

export function PersonalAssistantEditor({
  plugin,
  onClose,
  onSaved,
}: {
  plugin: PersonalAssistantPlugin | "new";
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { data, request, refresh, notify } = useApp();
  const [form, setForm] = useState<PersonalAssistantInput>(() =>
    personalAssistantInputSchema.parse(
      plugin === "new"
        ? {
            modelId: data?.assistants.find((a) => modelKind(a) === "text")?.id ?? "unselected",
            reminderConnectionId: data?.selectedConnectionId ?? "",
          }
        : plugin,
    ),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!data) return null;
  const textModels = data.assistants.filter((a) => modelKind(a) === "text");
  const update = <K extends keyof PersonalAssistantInput>(
    key: K,
    value: PersonalAssistantInput[K],
  ) => setForm((f) => ({ ...f, [key]: value }));
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const value = personalAssistantInputSchema.parse(form);
      const saved = await request<PersonalAssistantPlugin>(
        plugin === "new" ? "/plugins" : `/plugins/${plugin.id}`,
        json(
          { ...value, pluginId: "wechatai/personal-assistant" },
          plugin === "new" ? "POST" : "PATCH",
        ),
      );
      await refresh();
      notify("个人助理已保存，发送 /use " + saved.shortcut + " 即可进入");
      onSaved(saved.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={plugin === "new" ? "配置个人助理" : "编辑个人助理"}
      description="把笔记、待办清单、账本和提醒放在同一个微信对话里。"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="form-body personal-editor" onSubmit={save}>
        <div className="form-grid">
          <label>
            助理名称
            <input
              value={form.name}
              maxLength={40}
              onChange={(e) => update("name", e.target.value)}
              required
            />
          </label>
          <label>
            @ 快捷名称
            <input
              value={form.shortcut}
              maxLength={24}
              onChange={(e) => update("shortcut", e.target.value)}
              required
            />
          </label>
        </div>
        <label>
          回答模型
          <select value={form.modelId} onChange={(e) => update("modelId", e.target.value)} required>
            {!textModels.some((a) => a.id === form.modelId) && (
              <option value={form.modelId} disabled>
                请选择文本模型
              </option>
            )}
            {textModels.map((a) => (
              <option key={a.id} value={a.id}>
                {a.channelName} / {a.name} · {a.model}
              </option>
            ))}
          </select>
          <small>
            支持三种 LLM 协议；所选模型需要支持工具调用。沿用模型的输入、输出和 credits 上限。
          </small>
        </label>
        <div className="form-grid">
          <label>
            默认记账币种
            <select
              value={form.currency}
              onChange={(e) =>
                update("currency", e.target.value as PersonalAssistantInput["currency"])
              }
            >
              {["CNY", "USD", "HKD", "EUR", "GBP", "JPY"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            提醒发送到
            <select
              value={form.reminderConnectionId}
              onChange={(e) => update("reminderConnectionId", e.target.value)}
            >
              <option value="">暂不设置提醒</option>
              {data.connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="form-hint">
          时间均按北京时间。支持一次性、每天和每周提醒；提醒不调用模型、不扣
          credits。更换微信绑定或提醒链接后，需要重新设置原有提醒的时间。
        </p>
        <label className="personal-enabled">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => update("enabled", e.target.checked)}
          />
          启用个人助理
        </label>
        <div className="personal-examples">
          <span>可以这样说</span>
          <p>“记一下，周末想去看摄影展”</p>
          <p>“今天午饭花了 35 元，这个月吃饭花了多少？”</p>
          <p>“明天下午三点提醒我寄快递”</p>
          <p>“每天早上九点提醒我今日待办”</p>
        </div>
        <p className="form-hint">
          同一配置的记录跨聊天会话保存。每份配置有独立的笔记、账本和提醒，最多 10,000
          条；清空聊天不会删除这些记录。
        </p>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button
            className="button"
            disabled={busy || !textModels.some((a) => a.id === form.modelId)}
          >
            {busy ? "正在保存…" : "保存配置"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
