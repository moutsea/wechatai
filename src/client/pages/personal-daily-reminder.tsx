import { workspaceError } from "../workspace-copy";
import { useLocale } from "../locale";
import { copy as sourceCopy } from "../../shared/i18n/zh-CN/copy/personal-daily-reminder-page";
import { copy as koCopy } from "../../shared/i18n/ko/copy/personal-daily-reminder-page";
import { workspaceCopy as ptCopy } from "../../shared/i18n/pt/copy/workspace";
import { formatCopy } from "../../shared/i18n/dashboard";
import { useEffect, useState, type FormEvent } from "react";
import { Bell } from "lucide-react";
import { useApp } from "../context";
import { json } from "../api";
import { ReminderFailureNotice } from "./personal-reminder-status";
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
  connectionId,
  writable,
  busy,
  setBusy,
  refreshKey,
  onSaved,
}: {
  plugin: PersonalAssistantPlugin;
  connectionId: string;
  writable: boolean;
  busy: boolean;
  setBusy: (value: boolean) => void;
  refreshKey: number;
  onSaved: () => void;
}) {
  const { locale } = useLocale();
  const pageCopy =
    locale === "ko" ? koCopy : locale === "pt" ? ptCopy : sourceCopy;

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
      json({ kind: "reminder", reminderType: "daily_tasks", limit: 1, connectionId }),
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
        if (!cancelled) setError(workspaceError(e, locale));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [plugin.id, connectionId, refreshKey, request, locale]);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const parsed = dailyTasksReminderSchema.safeParse({ enabled, ...(enabled ? { time } : {}) });
    if (!parsed.success) {
      setError(
        workspaceError({ message: parsed.error.issues[0].message, code: "invalid_input" }, locale),
      );
      return;
    }
    if (!enabled && !record) {
      notify(pageCopy["每日待办提醒未启用"]);
      return;
    }
    setBusy(true);
    try {
      await request(
        `/plugins/${plugin.id}/records`,
        json({
          connectionId,
          record: enabled
            ? {
                kind: "reminder",
                reminderType: "daily_tasks",
                title: pageCopy["今日待办"],
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
      notify(
        enabled
          ? formatCopy(pageCopy["已设置每天 {value0} 提醒今日待办"], { value0: time })
          : pageCopy["每日待办提醒已关闭"],
      );
      onSaved();
    } catch (e) {
      setError(workspaceError(e as Error, locale));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="personal-daily-reminder" onSubmit={save}>
      <div className="personal-daily-heading">
        <Bell size={16} />
        <strong>{pageCopy["每日待办提醒"]}</strong>
      </div>
      <p>
        {pageCopy["每天汇总当天未完成的待办，通过微信发送；没有待办就不打扰，不消耗 credits。"]}
      </p>
      <p className="form-note">
        {
          pageCopy[
            "受微信最近互动后的 24 小时回复窗口限制，请定期向 ClawBot 发消息。当天发送失败可重试，跨天不再补发；不保证必达。"
          ]
        }
      </p>
      <div className="personal-daily-controls">
        <label className="personal-enabled">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={!writable || busy || loading || !loaded}
          />
          {pageCopy["启用"]}
        </label>
        <label>
          {pageCopy["北京时间"]}
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
          {loading ? pageCopy["正在读取…"] : pageCopy["保存设置"]}
        </button>
      </div>
      {record && <ReminderFailureNotice record={record} />}
      {!connectionId && !plugin.reminderConnectionId && (
        <p>{pageCopy["请先在助理配置中选择接收共享提醒的微信链接。"]}</p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </form>
  );
}
