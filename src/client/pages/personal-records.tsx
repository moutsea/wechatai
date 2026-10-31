import { pluginAvailable } from "../../shared/plugin-access";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Check,
  Download,
  FileText,
  Plus,
  Search,
  Trash2,
  Pencil,
  Wallet,
  Bell,
} from "lucide-react";
import { useApp } from "../context";
import { Modal } from "../ui";
import { json } from "../api";
import { ChatMarkdown } from "../chat-markdown";
import { DailyTasksReminder } from "./personal-daily-reminder";
import {
  beijingDate,
  beijingTime,
  personalRecordInputSchema,
  type PersonalAssistantPlugin,
  type PersonalRecord,
  type PersonalRecordInput,
  type PersonalRecords as RecordPage,
} from "../../shared/personal-assistant";
import "./personal-assistant.css";
const labels = { note: "普通笔记", entry: "账目", task: "待办", reminder: "提醒" };
const statuses: Record<string, string> = {
  scheduled: "等待提醒",
  sent: "已提醒",
  paused: "已暂停",
  retry: "发送重试中",
  waiting_context: "等待微信恢复",
  blocked: "需重新设置",
  expired: "提醒已过期",
};
const blank = (
  kind: PersonalRecordInput["kind"],
  currency: PersonalRecordInput["currency"],
): PersonalRecordInput => ({
  kind,
  title: "",
  content: "",
  date: beijingDate(),
  category: "",
  amount: kind === "entry" ? "" : null,
  direction: "expense",
  currency,
  completed: false,
  reminderEnabled: true,
  reminderType: "message",
  remindAt: null,
  repeat: "none",
});
const localTime = (value: string | null) =>
  value ? new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 16) : "";
const csvCell = (value: unknown) =>
  `"${String(value ?? "")
    .replace(/^[=+\-@\t\r]/, "'$&")
    .replace(/"/g, '""')}"`;
export function PersonalRecords({
  plugin,
  onClose,
}: {
  plugin: PersonalAssistantPlugin;
  onClose: () => void;
}) {
  const { data, request, notify } = useApp();
  const [connectionId, setConnectionId] = useState(
    plugin.recordScope === "connection" && data?.connections.length
      ? data.selectedConnectionId
      : "",
  );
  const [savedScopes, setSavedScopes] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    void request<string[]>(`/plugins/${plugin.id}/records/scopes`)
      .then((scopes) => {
        if (!cancelled) setSavedScopes(scopes);
      })
      .catch((error) => {
        if (!cancelled) notify(error.message, true);
      });
    return () => {
      cancelled = true;
    };
  }, [plugin.id, request, notify]);
  return (
    <ScopedPersonalRecords
      key={`${plugin.id}:${connectionId}`}
      plugin={plugin}
      onClose={onClose}
      connectionId={connectionId}
      onConnectionChange={setConnectionId}
      savedScopes={savedScopes}
    />
  );
}

function ScopedPersonalRecords({
  plugin,
  onClose,
  connectionId,
  onConnectionChange,
  savedScopes,
}: {
  plugin: PersonalAssistantPlugin;
  onClose: () => void;
  connectionId: string;
  onConnectionChange: (id: string) => void;
  savedScopes: string[];
}) {
  const { data, request, notify } = useApp();
  const [kind, setKind] = useState<PersonalRecordInput["kind"]>("note"),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [offset, setOffset] = useState(0);
  const [noteKind, setNoteKind] = useState<"note" | "task">("note");
  const [todayOnly, setTodayOnly] = useState(true);
  const [today, setToday] = useState(beijingDate());
  useEffect(() => {
    const timer = window.setInterval(() => setToday(beijingDate()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (todayOnly) setOffset(0);
  }, [today, todayOnly]);
  const queryFrom = kind === "task" && todayOnly ? today : from;
  const queryTo = kind === "task" && todayOnly ? today : to;
  const [page, setPage] = useState<RecordPage>({ records: [], total: 0, totals: [] }),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [editing, setEditing] = useState<PersonalRecord | "new" | null>(null),
    [form, setForm] = useState(() => blank("note", plugin.currency)),
    [deleting, setDeleting] = useState<PersonalRecord | null>(null),
    [refresh, setRefresh] = useState(0);
  const sequence = useRef(0);
  const workspace = useRef<HTMLDivElement>(null);
  useEffect(() => {
    workspace.current?.closest("dialog")?.scrollTo({ top: 0 });
  }, [editing, kind]);
  const writable =
    !!data && pluginAvailable(data.plan, data.plugins ?? [], plugin.id) && plugin.enabled;
  useEffect(() => {
    const id = ++sequence.current;
    setLoading(true);
    setError("");
    request<RecordPage>(
      `/plugins/${plugin.id}/records/query`,
      json({
        connectionId,
        kind,
        query: search,
        from: queryFrom || undefined,
        to: queryTo || undefined,
        offset,
        limit: 20,
      }),
    )
      .then((value) => {
        if (id === sequence.current) setPage(value);
      })
      .catch((e) => {
        if (id === sequence.current) setError(e.message);
      })
      .finally(() => {
        if (id === sequence.current) setLoading(false);
      });
  }, [plugin.id, connectionId, kind, search, queryFrom, queryTo, offset, refresh, request]);
  const update = <K extends keyof PersonalRecordInput>(key: K, value: PersonalRecordInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const open = (record: PersonalRecord | "new") => {
    setEditing(record);
    setForm(
      record === "new" ? blank(kind, plugin.currency) : personalRecordInputSchema.parse(record),
    );
    setDeleting(null);
    setError("");
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const parsed = personalRecordInputSchema.safeParse(form);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "请检查填写内容");
      const record = parsed.data;
      await request(
        `/plugins/${plugin.id}/records`,
        json({
          connectionId,
          record,
          recordId: editing !== "new" ? editing?.id : undefined,
          revision: editing !== "new" ? editing?.revision : undefined,
        }),
      );
      setEditing(null);
      setRefresh((n) => n + 1);
      notify("记录已保存");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const complete = async (record: PersonalRecord) => {
    setBusy(true);
    try {
      await request(
        `/plugins/${plugin.id}/records`,
        json({
          connectionId,
          record: { completed: !record.completed },
          recordId: record.id,
          revision: record.revision,
        }),
      );
      setRefresh((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await request(
        `/plugins/${plugin.id}/records/${deleting.id}`,
        json({ revision: deleting.revision, connectionId }, "DELETE"),
      );
      setDeleting(null);
      setOffset(0);
      setRefresh((n) => n + 1);
      notify("记录已删除");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const exportRecords = async () => {
    setBusy(true);
    setError("");
    try {
      if (page.total > 1000) throw new Error("一次最多导出 1,000 条，请按日期或关键词缩小范围");
      const records: PersonalRecord[] = [];
      for (let at = 0; at < page.total; at += 50) {
        const result = await request<RecordPage>(
          `/plugins/${plugin.id}/records/query`,
          json({
            connectionId,
            kind,
            query: search,
            from: queryFrom || undefined,
            to: queryTo || undefined,
            offset: at,
            limit: 50,
          }),
        );
        records.push(...result.records);
      }
      const rows = [
        [
          "类型",
          "标题",
          "内容",
          "日期",
          "分类",
          "收支",
          "币种",
          "金额",
          "完成",
          "提醒状态",
          "提醒时间（北京时间）",
          "重复",
        ],
        ...records.map((r) => [
          r.reminderType === "daily_tasks" ? "每日待办提醒" : labels[r.kind],
          r.title,
          r.content,
          r.date,
          r.category,
          r.kind === "entry" ? (r.direction === "income" ? "收入" : "支出") : "",
          r.kind === "entry" ? r.currency : "",
          r.amount ?? "",
          r.kind === "task" ? (r.completed ? "已完成" : "未完成") : "",
          r.kind === "reminder"
            ? !r.reminderEnabled
              ? "已取消"
              : (statuses[r.reminderState ?? ""] ?? "等待设置")
            : "",
          r.remindAt ? beijingTime(Date.parse(r.remindAt)) : "",
          r.repeat,
        ]),
      ];
      const url = URL.createObjectURL(
        new Blob(["\ufeff" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n")], {
          type: "text/csv;charset=utf-8",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `个人助理-${labels[kind]}-${beijingDate()}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      wide
      title={`${plugin.name} · 我的记录`}
      description={
        plugin.recordScope === "connection"
          ? "微信按链接使用各自的记录。时间按北京时间，账目按币种分别统计。"
          : "微信使用共享记录。时间按北京时间，账目按币种分别统计。"
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="personal-workspace" ref={workspace}>
        <label className="personal-scope-selector">
          记录范围
          <select
            aria-label="记录范围"
            value={connectionId}
            disabled={busy}
            onChange={(e) => onConnectionChange(e.target.value)}
          >
            <option value="">
              共享记录{plugin.recordScope === "connection" ? "（当前微信不使用）" : ""}
            </option>
            {data?.connections.map((link) => (
              <option key={link.id} value={link.id}>
                {link.name} · 独立记录
              </option>
            ))}
            {savedScopes
              .filter((id) => id && !data?.connections.some((link) => link.id === id))
              .map((id) => (
                <option key={id} value={id}>
                  已删除的微信链接 · {id.slice(0, 8)}
                </option>
              ))}
          </select>
        </label>
        {(plugin.recordScope === "connection") !== !!connectionId && (
          <p className="personal-section-hint">
            此范围的记录已保留，微信当前不会读取。已有提醒仍会按原接收链接发送。
          </p>
        )}
        <nav className="personal-tabs" aria-label="记录类型">
          {(
            [
              ["note", FileText],
              ["reminder", Bell],
              ["entry", Wallet],
            ] as const
          ).map(([value, Icon]) => (
            <button
              key={value}
              className={(kind === "task" ? "note" : kind) === value ? "active" : ""}
              onClick={() => {
                setKind(value === "note" ? noteKind : value);
                setOffset(0);
                setEditing(null);
                setDeleting(null);
              }}
              disabled={busy}
            >
              <Icon size={17} />
              {value === "note" ? "笔记" : value === "entry" ? "账本" : "提醒"}
            </button>
          ))}
        </nav>
        {(kind === "note" || kind === "task") && (
          <div className="personal-note-types" role="group" aria-label="笔记类型">
            {(
              [
                ["note", "普通笔记"],
                ["task", "待办清单"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                aria-pressed={kind === value}
                disabled={busy}
                onClick={() => {
                  setKind(value);
                  setNoteKind(value);
                  setOffset(0);
                  setEditing(null);
                  setDeleting(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <p className="personal-section-hint">
          {kind === "task"
            ? "按计划日期安排待办，完成后勾选。开启每日提醒，就能在微信收到当天未完成的清单。"
            : kind === "reminder"
              ? "到点通过微信通知你，提醒不会加入待办清单。"
              : kind === "note"
                ? "随手记下想法和信息，也可以切换到待办清单。"
                : "按币种分别统计收入和支出。"}
        </p>
        {kind === "task" && !editing && (
          <>
            <DailyTasksReminder
              plugin={plugin}
              connectionId={connectionId}
              writable={!!writable}
              busy={busy}
              setBusy={setBusy}
              refreshKey={refresh}
              onSaved={() => setRefresh((n) => n + 1)}
            />
            <div className="personal-task-filter" role="group" aria-label="待办范围">
              <button
                aria-pressed={todayOnly}
                disabled={busy}
                onClick={() => {
                  setTodayOnly(true);
                  setOffset(0);
                  setDeleting(null);
                }}
              >
                今日待办
              </button>
              <button
                aria-pressed={!todayOnly}
                disabled={busy}
                onClick={() => {
                  setTodayOnly(false);
                  setOffset(0);
                  setDeleting(null);
                }}
              >
                全部待办
              </button>
              {todayOnly && <span>{today} · 北京时间</span>}
            </div>
          </>
        )}
        {editing ? (
          <form className="personal-record-form" onSubmit={save}>
            <h3>
              {editing === "new" ? "新增" : "编辑"}
              {labels[form.kind]}
            </h3>
            <label>
              标题
              <input
                required
                maxLength={160}
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder={
                  kind === "entry"
                    ? "例如：午饭"
                    : kind === "task"
                      ? "例如：寄快递"
                      : kind === "reminder"
                        ? "例如：喝水"
                        : "给这条笔记起个名字"
                }
              />
            </label>
            <div className="form-grid">
              <label>
                {kind === "task" ? "计划日期" : "日期"}
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => update("date", e.target.value)}
                />
              </label>
              <label>
                分类
                <input
                  maxLength={40}
                  value={form.category}
                  onChange={(e) => update("category", e.target.value)}
                  placeholder="可选"
                />
              </label>
            </div>
            {kind === "entry" && (
              <div className="personal-money-fields">
                <label>
                  收支
                  <select
                    value={form.direction}
                    onChange={(e) => update("direction", e.target.value as "income" | "expense")}
                  >
                    <option value="expense">支出</option>
                    <option value="income">收入</option>
                  </select>
                </label>
                <label>
                  币种
                  <select
                    value={form.currency}
                    onChange={(e) =>
                      update("currency", e.target.value as PersonalRecordInput["currency"])
                    }
                  >
                    {["CNY", "USD", "HKD", "EUR", "GBP", "JPY"].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  金额
                  <input
                    required
                    inputMode="decimal"
                    value={form.amount ?? ""}
                    onChange={(e) => update("amount", e.target.value)}
                    placeholder="0.00"
                  />
                </label>
              </div>
            )}
            <label>
              {kind === "note" ? "笔记内容" : "备注"}
              <textarea
                rows={kind === "note" ? 6 : 3}
                maxLength={6000}
                value={form.content}
                onChange={(e) => update("content", e.target.value)}
              />
            </label>
            {kind === "task" && (
              <label className="personal-enabled">
                <input
                  type="checkbox"
                  checked={form.completed}
                  onChange={(e) => update("completed", e.target.checked)}
                />
                已完成
              </label>
            )}
            {kind === "reminder" && (
              <>
                <div className="form-grid">
                  <label>
                    提醒时间（北京时间）
                    <input
                      type="datetime-local"
                      required
                      value={localTime(form.remindAt)}
                      onChange={(e) => {
                        update("remindAt", e.target.value ? e.target.value + ":00+08:00" : null);
                        if (!e.target.value && form.reminderType !== "daily_tasks")
                          update("repeat", "none");
                      }}
                    />
                  </label>
                  <label>
                    重复
                    <select
                      disabled={!form.remindAt || form.reminderType === "daily_tasks"}
                      value={form.repeat}
                      onChange={(e) =>
                        update("repeat", e.target.value as PersonalRecordInput["repeat"])
                      }
                    >
                      <option value="none">一次性</option>
                      <option value="daily">每天</option>
                      <option value="weekly">每周</option>
                    </select>
                  </label>
                </div>
                <label className="personal-enabled">
                  <input
                    type="checkbox"
                    checked={form.reminderEnabled}
                    onChange={(e) => update("reminderEnabled", e.target.checked)}
                  />
                  启用提醒（取消勾选后保留记录，停止发送）
                </label>
                {form.reminderType === "daily_tasks" && (
                  <p className="form-hint">
                    这是每日今日待办汇总，到点读取当天最新的未完成待办；标题和备注不会作为提醒正文发送。
                  </p>
                )}
              </>
            )}
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                返回列表
              </button>
              <button className="button" disabled={busy || !writable}>
                {busy ? "正在保存…" : "保存记录"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="personal-toolbar">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSearch(query);
                  setOffset(0);
                }}
              >
                <Search size={16} />
                <input
                  aria-label="搜索记录"
                  placeholder="搜索标题、内容或分类"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button type="submit" className="text-link">
                  搜索
                </button>
              </form>
              <button
                className="button secondary small"
                onClick={() => void exportRecords()}
                disabled={busy || loading || !page.total}
              >
                <Download size={15} />
                导出
              </button>
              <button
                className="button small"
                disabled={!writable || busy}
                onClick={() => open("new")}
              >
                <Plus size={15} />
                新增{labels[kind]}
              </button>
            </div>
            {kind === "task" && todayOnly ? (
              <p className="personal-section-hint">共 {page.total} 项今日待办（含已完成）</p>
            ) : (
              <div className="personal-dates">
                <label>
                  开始
                  <input
                    aria-label="开始日期"
                    type="date"
                    value={queryFrom}
                    disabled={kind === "task" && todayOnly}
                    onChange={(e) => {
                      setFrom(e.target.value);
                      setOffset(0);
                    }}
                  />
                </label>
                <span>—</span>
                <label>
                  结束
                  <input
                    aria-label="结束日期"
                    type="date"
                    value={queryTo}
                    disabled={kind === "task" && todayOnly}
                    onChange={(e) => {
                      setTo(e.target.value);
                      setOffset(0);
                    }}
                  />
                </label>
                <span>{page.total} 条记录</span>
              </div>
            )}
            {kind === "entry" &&
              page.totals.map((t) => (
                <div className="personal-totals" key={t.currency}>
                  <span>
                    {t.currency}
                    <small>当前筛选范围</small>
                  </span>
                  <span>
                    收入<strong className="income">{t.income}</strong>
                  </span>
                  <span>
                    支出<strong>{t.expense}</strong>
                  </span>
                  <span>
                    结余<strong>{t.net}</strong>
                  </span>
                </div>
              ))}
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            {deleting && (
              <div className="personal-delete">
                <span>
                  删除「{deleting.title}」？
                  {deleting.kind === "reminder" ? "此提醒将停止发送。" : "此操作无法撤销。"}
                </span>
                <button className="text-link" disabled={busy} onClick={() => setDeleting(null)}>
                  取消
                </button>
                <button
                  className="button danger small"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  确认删除
                </button>
              </div>
            )}
            {loading ? (
              <p className="personal-empty">正在读取记录…</p>
            ) : !page.records.length ? (
              <div className="personal-empty">
                <FileText size={30} />
                <h3>还没有{labels[kind]}</h3>
                <p>
                  在微信发送{" "}
                  <code>
                    @{plugin.shortcut}{" "}
                    {kind === "note"
                      ? "记一下，下周想读一本新书"
                      : kind === "entry"
                        ? "今天咖啡花了 22 元"
                        : kind === "task"
                          ? "添加待办：整理这周的会议记录"
                          : "明天下午三点提醒我寄快递"}
                  </code>
                </p>
              </div>
            ) : (
              <div className="personal-record-list">
                {page.records.map((r) => (
                  <article key={r.id} className={r.completed ? "is-complete" : ""}>
                    <div className="personal-record-heading">
                      {kind === "task" && (
                        <button
                          className={`personal-check ${r.completed ? "checked" : ""}`}
                          aria-label={r.completed ? "标为未完成" : "完成待办"}
                          disabled={!writable || busy}
                          onClick={() => void complete(r)}
                        >
                          {r.completed && <Check size={14} />}
                        </button>
                      )}
                      <h3>{r.title}</h3>
                      {kind === "entry" && (
                        <strong className={`personal-amount ${r.direction}`}>
                          {r.direction === "income" ? "+" : "−"}
                          {r.amount} <small>{r.currency}</small>
                        </strong>
                      )}
                      <div className="personal-record-actions">
                        <button
                          className="icon-button"
                          aria-label={`编辑${r.title}`}
                          disabled={!writable || busy}
                          onClick={() => open(r)}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`删除${r.title}`}
                          disabled={busy}
                          onClick={() => setDeleting(r)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                    <div className="personal-record-meta">
                      <span>{r.date}</span>
                      {r.category && <span>{r.category}</span>}
                      {r.kind === "task" && <span>{r.completed ? "已完成" : "待完成"}</span>}
                      {r.reminderType === "daily_tasks" && <span>每日今日待办汇总</span>}
                    </div>
                    {r.content && (
                      <div className="personal-record-content">
                        <ChatMarkdown content={r.content} id={`personal-${r.id}`} />
                      </div>
                    )}
                    {r.kind === "reminder" && r.remindAt && (
                      <div className="personal-reminder">
                        <Bell size={13} />
                        <span>
                          {beijingTime(r.nextReminderAt ?? Date.parse(r.remindAt))}
                          {r.repeat === "daily"
                            ? " · 每天"
                            : r.repeat === "weekly"
                              ? " · 每周"
                              : ""}{" "}
                          ·{" "}
                          {!r.reminderEnabled
                            ? "已取消"
                            : (statuses[r.reminderState ?? ""] ?? "等待设置")}
                          {r.reminderError ? ` · ${r.reminderError}` : ""}
                        </span>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
            <div className="personal-pagination">
              <button
                className="button secondary small"
                disabled={loading || offset === 0 || busy}
                onClick={() => setOffset((n) => Math.max(0, n - 20))}
              >
                上一页
              </button>
              <span>
                {Math.floor(offset / 20) + 1} / {Math.max(1, Math.ceil(page.total / 20))}
              </span>
              <button
                className="button secondary small"
                disabled={loading || offset + 20 >= page.total || busy}
                onClick={() => setOffset((n) => n + 20)}
              >
                下一页
              </button>
            </div>
            {!writable && (
              <p className="form-hint">
                记录仍可查看、导出或删除；启用助理且配置未超出套餐上限时，可继续新增、编辑和使用提醒。
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
