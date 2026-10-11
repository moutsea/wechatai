import { useEffect, useState, type FormEvent } from "react";
import { Bell } from "lucide-react";
import { useApp } from "../context";
import { json } from "../api";
import {
  beijingDate,
  dailyTasksReminderSchema,
  nextDailyReminderAt,
  type PersonalAssistantPlugin,
  type PersonalRecord,
  type PersonalRecords,
} from "../../shared/personal-assistant";

export function DailyTasksReminder({
  plugin,
  writable,
  busy,
  setBusy,
  refreshKey,
  onSaved,
}: {
  plugin: PersonalAssistantPlugin;
  writable: boolean;
  busy: boolean;
  setBusy: (value: boolean) => void;
  refreshKey: number;
  onSaved: () => void;
}) {
  const { request, notify } = useApp();
  const [record, setRecord] = useState<PersonalRecord | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [time, setTime] = useState("09:00");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setLoaded(false);
    request<PersonalRecords>(
      `/plugins/${plugin.id}/records/query`,
      json({ kind: "reminder", reminderType: "daily_tasks", limit: 1 }),
    )
      .then((page) => {
        if (cancelled) return;
        const current = page.records[0] ?? null;
        setRecord(current);
        setEnabled(current?.reminderEnabled ?? false);
        setTime(
          current?.remindAt
            ? new Date(Date.parse(current.remindAt) + 8 * 3600000).toISOString().slice(11, 16)
            : "09:00",
        );
        setLoaded(true);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [plugin.id, refreshKey, request]);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const parsed = dailyTasksReminderSchema.safeParse({ enabled, ...(enabled ? { time } : {}) });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (!enabled && !record) {
      notify("每日待办提醒未启用");
      return;
    }
    setBusy(true);
    try {
      await request(
        `/plugins/${plugin.id}/records`,
        json({
          record: enabled
            ? {
                kind: "reminder",
                reminderType: "daily_tasks",
                title: "今日待办",
                date: beijingDate(),
                repeat: "daily",
                reminderEnabled: true,
                remindAt: nextDailyReminderAt(time),
              }
            : { reminderEnabled: false },
          recordId: record?.id,
          revision: record?.revision,
        }),
      );
      notify(enabled ? `已设置每天 ${time} 提醒今日待办` : "每日待办提醒已关闭");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="personal-daily-reminder" onSubmit={save}>
      <div className="personal-daily-heading">
        <Bell size={16} />
        <strong>每日待办提醒</strong>
      </div>
      <p>每天汇总当天未完成的待办，通过微信发送；没有待办就不打扰，不消耗 credits。</p>
      <div className="personal-daily-controls">
        <label className="personal-enabled">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={!writable || busy || loading || !loaded}
          />
          启用
        </label>
        <label>
          北京时间
          <input
            type="time"
            required={enabled}
            value={time}
            onChange={(e) => setTime(e.target.value)}
            disabled={!enabled || !writable || busy || loading || !loaded}
          />
        </label>
        <button
          className="button secondary small"
          disabled={!writable || busy || loading || !loaded}
        >
          {loading ? "正在读取…" : "保存设置"}
        </button>
      </div>
      {record?.reminderEnabled && record.reminderError && <p>发送状态：{record.reminderError}</p>}
      {!plugin.reminderConnectionId && <p>请先在助理配置中选择接收提醒的微信链接。</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </form>
  );
}
