import { z } from "zod";
import {
  amountCents,
  centsAmount,
  beijingDate,
  dailyTasksReminderSchema,
  nextDailyReminderAt,
  personalQuerySchema,
  personalRecordInputSchema,
  type PersonalQuery,
  type PersonalRecord,
  type PersonalRecordInput,
  type PersonalRecords,
  type ReminderFailure,
  type ReminderFailureReason,
  type ReminderBlockReason,
} from "../shared/personal-assistant";
import { AppError } from "./config";
import type { ReminderSchedule } from "./reminder-scheduler";

type Row = {
  id: string;
  pluginId: string;
  revision: number;
  data: string;
  createdAt: number;
  updatedAt: number;
  reminderState?: string;
  reminderError?: string;
  reminderErrorDueAt?: number | null;
  reminderBlockReason?: string | null;
  reminderLastFailure?: string | null;
  nextReminderAt?: number | null;
};
export type Reminder = {
  id: string;
  pluginId: string;
  recordId: string;
  revision: number;
  dueAt: number;
  repeatMs: number;
  connectionId: string;
  recordConnectionId: string;
  generation: string;
  state: string;
  retryAt: number;
  attempts: number;
  error: string;
  errorDueAt: number | null;
  blockReason: string | null;
  lastFailure: string | null;
};
type ReminderTarget = Pick<Reminder, "connectionId" | "generation">;
type Change = { before: PersonalRecord | null; after: PersonalRecord | null };
export type PersonalDraftState = {
  changes: [string, Change][];
  seen: string[];
  recordsRevision?: number;
  recordModelVersion?: number;
  connectionId?: string;
};
type RecordChange = {
  id: string;
  kind: PersonalRecord["kind"];
  title: string;
  date: string;
  remindAt: string | null;
  completed: boolean;
  action: "created" | "updated" | "deleted";
  source: "web" | "assistant";
  at: number;
};
const CHANGE_RETENTION_MS = 7 * 86400000;
const decode = (row: Row): PersonalRecord => ({
  ...personalRecordInputSchema.parse(JSON.parse(row.data)),
  id: row.id,
  revision: row.revision,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  reminderState: row.reminderState,
  reminderError: row.reminderError,
  reminderErrorDueAt: row.reminderErrorDueAt,
  reminderBlockReason: row.reminderBlockReason
    ? (JSON.parse(row.reminderBlockReason) as ReminderBlockReason)
    : undefined,
  reminderLastFailure: row.reminderLastFailure
    ? (JSON.parse(row.reminderLastFailure) as ReminderFailure)
    : undefined,
  nextReminderAt: row.nextReminderAt,
});
function sameReminderTime(a: string | null, b: string | null) {
  return a === b || (a !== null && b !== null && Date.parse(a) === Date.parse(b));
}
function reminderScheduleChanged(before: PersonalRecordInput | null, after: PersonalRecordInput) {
  return (
    !before ||
    !sameReminderTime(before.remindAt, after.remindAt) ||
    before.repeat !== after.repeat ||
    before.reminderEnabled !== after.reminderEnabled
  );
}
function matches(record: PersonalRecord, query: PersonalQuery) {
  return (
    (!query.kind || record.kind === query.kind) &&
    (!query.reminderType ||
      (record.kind === "reminder" && (record.reminderType ?? "message") === query.reminderType)) &&
    (!query.from || record.date >= query.from) &&
    (!query.to || record.date <= query.to) &&
    (query.completed === undefined || record.completed === query.completed) &&
    (!query.query ||
      [record.title, record.content, record.category, record.id].some((v) =>
        v.toLowerCase().includes(query.query.toLowerCase()),
      ))
  );
}
export class PersonalRecordsStore {
  constructor(private sql: SqlStorage) {}
  init() {
    this.sql
      .exec(`CREATE TABLE IF NOT EXISTS personal_records (id TEXT PRIMARY KEY, pluginId TEXT NOT NULL, revision INTEGER NOT NULL, kind TEXT NOT NULL, date TEXT NOT NULL, amountCents INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS personal_records_plugin ON personal_records(pluginId,kind,date);
      CREATE UNIQUE INDEX IF NOT EXISTS personal_daily_tasks_unique ON personal_records(pluginId) WHERE kind='reminder' AND json_extract(data,'$.reminderType')='daily_tasks';
      CREATE TABLE IF NOT EXISTS personal_record_state (pluginId TEXT PRIMARY KEY, revision INTEGER NOT NULL, changes TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS personal_reminders (id TEXT PRIMARY KEY, pluginId TEXT NOT NULL, recordId TEXT NOT NULL UNIQUE, revision INTEGER NOT NULL, dueAt INTEGER NOT NULL, repeatMs INTEGER NOT NULL, connectionId TEXT NOT NULL, generation TEXT NOT NULL, state TEXT NOT NULL, retryAt INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '');
      CREATE INDEX IF NOT EXISTS personal_reminders_due ON personal_reminders(state,retryAt);
      CREATE TABLE IF NOT EXISTS personal_reminder_schedule (id INTEGER PRIMARY KEY CHECK (id=1), revision INTEGER NOT NULL, acknowledged INTEGER NOT NULL);
      INSERT OR IGNORE INTO personal_reminder_schedule VALUES (1, CASE WHEN EXISTS(SELECT 1 FROM personal_reminders) THEN 1 ELSE 0 END, 0);
      CREATE TABLE IF NOT EXISTS personal_record_migrations (version INTEGER PRIMARY KEY);`);
    if (
      !this.sql.exec("SELECT 1 FROM personal_record_migrations WHERE version=2").toArray().length
    ) {
      // init() runs in a synchronous transaction. Reclassify legacy reminder tasks
      // without recreating deliveries: preserve occurrence IDs, due times and state.
      this.sql.exec(`
        INSERT OR IGNORE INTO personal_record_state (pluginId,revision,changes)
          SELECT DISTINCT pluginId,0,'[]' FROM personal_records WHERE kind='task' AND json_extract(data,'$.remindAt') IS NOT NULL;
        UPDATE personal_record_state SET revision=revision+1,changes='[]'
          WHERE pluginId IN (SELECT pluginId FROM personal_records WHERE kind='task' AND json_extract(data,'$.remindAt') IS NOT NULL);
        UPDATE personal_records SET kind='reminder',revision=revision+1,
          data=json_set(data,'$.kind','reminder','$.reminderEnabled',json(CASE WHEN json_extract(data,'$.completed') THEN 'false' ELSE 'true' END),'$.completed',json('false'))
          WHERE kind='task' AND json_extract(data,'$.remindAt') IS NOT NULL;
        UPDATE personal_reminders SET revision=(SELECT revision FROM personal_records WHERE id=recordId)
          WHERE recordId IN (SELECT id FROM personal_records WHERE kind='reminder');
        INSERT INTO personal_record_migrations VALUES (2);
      `);
    }
    if (
      !this.sql.exec("SELECT 1 FROM personal_record_migrations WHERE version=3").toArray().length
    ) {
      // Existing records stay in the shared library. Never guess a note's originating link.
      this.sql.exec(`
        ALTER TABLE personal_records ADD COLUMN connectionId TEXT NOT NULL DEFAULT '';
        ALTER TABLE personal_reminders ADD COLUMN recordConnectionId TEXT NOT NULL DEFAULT '';
        DROP INDEX personal_daily_tasks_unique;
        CREATE UNIQUE INDEX personal_daily_tasks_unique ON personal_records(pluginId,connectionId)
          WHERE kind='reminder' AND json_extract(data,'$.reminderType')='daily_tasks';
        CREATE INDEX personal_records_scope ON personal_records(pluginId,connectionId,kind,date);
        ALTER TABLE personal_record_state RENAME TO personal_record_state_legacy;
        CREATE TABLE personal_record_state (
          pluginId TEXT NOT NULL, connectionId TEXT NOT NULL DEFAULT '',
          revision INTEGER NOT NULL, changes TEXT NOT NULL, PRIMARY KEY(pluginId,connectionId)
        );
        INSERT INTO personal_record_state(pluginId,revision,changes)
          SELECT pluginId,revision,changes FROM personal_record_state_legacy;
        DROP TABLE personal_record_state_legacy;
        INSERT INTO personal_record_migrations VALUES (3);
      `);
    }
    if (
      !this.sql.exec("SELECT 1 FROM personal_record_migrations WHERE version=4").toArray().length
    ) {
      this.sql.exec(`
        ALTER TABLE personal_reminders ADD COLUMN lastFailure TEXT;
        UPDATE personal_reminders SET lastFailure=json_object(
          'code','legacy','message',error,'at',NULL,'dueAt',dueAt
        ) WHERE state IN ('retry','waiting_context','paused','blocked')
          AND error NOT IN ('','正在发送提醒');
        INSERT INTO personal_record_migrations VALUES (4);
      `);
    }
    if (
      !this.sql.exec("SELECT 1 FROM personal_record_migrations WHERE version=5").toArray().length
    ) {
      // A scheduled legacy row has already advanced its dueAt; its missed
      // occurrence cannot be reconstructed reliably. Keep that association unknown.
      this.sql.exec(`
        ALTER TABLE personal_reminders ADD COLUMN errorDueAt INTEGER;
        UPDATE personal_reminders SET errorDueAt=dueAt
          WHERE state IN ('retry','waiting_context','paused','blocked','expired') AND error<>'';
        INSERT INTO personal_record_migrations VALUES (5);
      `);
    }
    if (
      !this.sql.exec("SELECT 1 FROM personal_record_migrations WHERE version=6").toArray().length
    ) {
      this.sql.exec(`
        ALTER TABLE personal_reminders ADD COLUMN blockReason TEXT;
        INSERT INTO personal_record_migrations VALUES (6);
      `);
    }
    if (
      !this.sql.exec("SELECT 1 FROM personal_record_migrations WHERE version=7").toArray().length
    ) {
      // A skipped legacy recurrence may carry a much older block. Only active
      // blocks and terminal one-off blocks have an unambiguous occurrence.
      this.sql.exec(`
        UPDATE personal_reminders SET blockReason=CASE
          WHEN json_type(blockReason,'$.dueAt')='integer' THEN blockReason
          WHEN state IN ('paused','waiting_context','blocked','expired') AND errorDueAt=dueAt
            THEN json_set(blockReason,'$.dueAt',dueAt)
          ELSE NULL END
          WHERE blockReason IS NOT NULL;
        INSERT INTO personal_record_migrations VALUES (7);
      `);
    }
  }
  private changedSchedule() {
    this.sql.exec("UPDATE personal_reminder_schedule SET revision=revision+1 WHERE id=1");
  }
  recordState(pluginId: string, connectionId = "") {
    const row = this.sql
      .exec<{ revision: number; changes: string }>(
        "SELECT revision,changes FROM personal_record_state WHERE pluginId=? AND connectionId=?",
        pluginId,
        connectionId,
      )
      .toArray()[0];
    return {
      revision: row?.revision ?? 0,
      changes: (JSON.parse(row?.changes ?? "[]") as RecordChange[]).filter(
        (change) => change.at >= Date.now() - CHANGE_RETENTION_MS,
      ),
    };
  }
  forgetContextChanges() {
    this.sql.exec("UPDATE personal_record_state SET changes='[]',revision=revision+1");
  }
  scopes(pluginId: string) {
    // State survives deletion of the last record, so an emptied historical
    // library remains readable even after its WeChat link has been removed.
    return this.sql
      .exec<{ connectionId: string }>(
        "SELECT connectionId FROM personal_records WHERE pluginId=? UNION SELECT connectionId FROM personal_record_state WHERE pluginId=? ORDER BY connectionId",
        pluginId,
        pluginId,
      )
      .toArray()
      .map((row) => row.connectionId);
  }
  schedule(): ReminderSchedule {
    const { revision } = this.sql
      .exec<{ revision: number }>("SELECT revision FROM personal_reminder_schedule WHERE id=1")
      .one();
    return { revision, nextAt: this.nextReminder() };
  }
  schedulePending() {
    return (
      this.sql
        .exec<{ pending: number }>(
          "SELECT revision>acknowledged pending FROM personal_reminder_schedule WHERE id=1",
        )
        .one().pending !== 0
    );
  }
  acknowledgeSchedule(revision: number) {
    this.sql.exec(
      "UPDATE personal_reminder_schedule SET acknowledged=MAX(acknowledged,?) WHERE id=1 AND revision>=?",
      revision,
      revision,
    );
  }
  get(pluginId: string, id: string, connectionId = "") {
    const row = this.sql
      .exec<Row>(
        "SELECT r.*,m.state reminderState,m.error reminderError,m.errorDueAt reminderErrorDueAt,m.blockReason reminderBlockReason,m.lastFailure reminderLastFailure,m.dueAt nextReminderAt FROM personal_records r LEFT JOIN personal_reminders m ON m.recordId=r.id WHERE r.pluginId=? AND r.id=? AND r.connectionId=?",
        pluginId,
        id,
        connectionId,
      )
      .toArray()[0];
    if (!row) throw new AppError("record_missing", "没有找到这条记录，请重新查询", 404);
    return decode(row);
  }
  query(
    pluginId: string,
    raw: unknown,
    changes = new Map<string, Change>(),
    connectionId = "",
  ): PersonalRecords {
    const q = personalQuerySchema.parse(raw);
    const conditions = ["r.pluginId=?", "r.connectionId=?"],
      values: (string | number)[] = [pluginId, connectionId];
    if (q.kind) {
      conditions.push("r.kind=?");
      values.push(q.kind);
    }
    if (q.reminderType) {
      conditions.push(
        "r.kind='reminder' AND COALESCE(json_extract(r.data,'$.reminderType'),'message')=?",
      );
      values.push(q.reminderType);
    }
    if (q.from) {
      conditions.push("r.date>=?");
      values.push(q.from);
    }
    if (q.to) {
      conditions.push("r.date<=?");
      values.push(q.to);
    }
    if (q.completed !== undefined) {
      conditions.push("json_extract(r.data,'$.completed')=?");
      values.push(Number(q.completed));
    }
    if (q.query) {
      conditions.push(
        "(instr(lower(json_extract(r.data,'$.title')),lower(?))>0 OR instr(lower(json_extract(r.data,'$.content')),lower(?))>0 OR instr(lower(json_extract(r.data,'$.category')),lower(?))>0 OR instr(r.id,?)>0)",
      );
      values.push(q.query, q.query, q.query, q.query);
    }
    const where = conditions.join(" AND ");
    let total = this.sql
      .exec<{ n: number }>(`SELECT count(*) n FROM personal_records r WHERE ${where}`, ...values)
      .one().n;
    const base = this.sql
      .exec<Row>(
        `SELECT r.*,m.state reminderState,m.error reminderError,m.errorDueAt reminderErrorDueAt,m.blockReason reminderBlockReason,m.lastFailure reminderLastFailure,m.dueAt nextReminderAt FROM personal_records r LEFT JOIN personal_reminders m ON m.recordId=r.id WHERE ${where} ORDER BY r.updatedAt DESC,r.id LIMIT ? OFFSET ?`,
        ...values,
        q.limit + changes.size,
        changes.size ? 0 : q.offset,
      )
      .toArray()
      .map(decode);
    const records = base.filter((r) => !changes.has(r.id));
    const totals = new Map<string, { income: number; expense: number }>();
    for (const row of this.sql
      .exec<{ currency: string; direction: string; amount: number }>(
        `SELECT json_extract(r.data,'$.currency') currency,json_extract(r.data,'$.direction') direction,SUM(r.amountCents) amount FROM personal_records r WHERE ${where} AND r.kind='entry' GROUP BY currency,direction`,
        ...values,
      )
      .toArray()) {
      const t = totals.get(row.currency) ?? { income: 0, expense: 0 };
      t[row.direction === "income" ? "income" : "expense"] += row.amount;
      totals.set(row.currency, t);
    }
    for (const { before, after } of changes.values()) {
      for (const [r, sign] of [
        [before, -1],
        [after, 1],
      ] as const) {
        if (!r || !matches(r, q)) continue;
        total += sign;
        if (r.kind === "entry") {
          const t = totals.get(r.currency) ?? { income: 0, expense: 0 };
          t[r.direction] += sign * amountCents(r.amount!);
          totals.set(r.currency, t);
        }
      }
      if (after && matches(after, q)) records.push(after);
    }
    records.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
    return {
      records: records.slice(changes.size ? q.offset : 0, (changes.size ? q.offset : 0) + q.limit),
      total,
      totals: [...totals].map(([currency, v]) => ({
        currency,
        income: centsAmount(v.income),
        expense: centsAmount(v.expense),
        net: centsAmount(v.income - v.expense),
      })),
    };
  }
  draft(
    pluginId: string,
    reminderTarget: ReminderTarget | null = null,
    currency: PersonalRecord["currency"] = "CNY",
    connectionId = "",
  ) {
    return new PersonalDraft(this, pluginId, reminderTarget, currency, connectionId);
  }
  reminderTargetChanged(
    pluginId: string,
    recordId: string,
    connectionId: string,
    target: ReminderTarget,
  ) {
    return (
      this.sql
        .exec(
          "SELECT 1 FROM personal_reminders WHERE pluginId=? AND recordId=? AND recordConnectionId=? AND (connectionId<>? OR generation<>?)",
          pluginId,
          recordId,
          connectionId,
          target.connectionId,
          target.generation,
        )
        .toArray().length > 0
    );
  }
  commit(
    pluginId: string,
    changes: Map<string, Change>,
    target: ReminderTarget | null,
    source: RecordChange["source"] = "assistant",
    connectionId = "",
  ) {
    // Called inside the same synchronous transaction as the run receipt and billing.
    const count = this.sql
      .exec<{ n: number }>("SELECT count(*) n FROM personal_records WHERE pluginId=?", pluginId)
      .one().n;
    const delta = [...changes.values()].reduce(
      (n, c) => n + Number(!c.before && !!c.after) - Number(!!c.before && !c.after),
      0,
    );
    if (count + delta > 10000)
      throw new AppError(
        "record_limit",
        "这份助理最多保存 10,000 条记录，请先导出并整理旧记录",
        403,
      );
    if (changes.size) this.changedSchedule();
    for (const [id, { before, after }] of changes) {
      if (before && this.get(pluginId, id, connectionId).revision !== before.revision)
        throw new AppError("record_changed", "记录已修改，请重新查询后再操作", 409);
      if (!after) {
        this.sql.exec(
          "DELETE FROM personal_records WHERE id=? AND pluginId=? AND connectionId=?",
          id,
          pluginId,
          connectionId,
        );
        this.sql.exec(
          "DELETE FROM personal_reminders WHERE recordId=? AND pluginId=?",
          id,
          pluginId,
        );
        continue;
      }
      const data = personalRecordInputSchema.parse(after);
      this.sql.exec(
        "INSERT INTO personal_records (id,pluginId,revision,kind,date,amountCents,data,createdAt,updatedAt,connectionId) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,kind=excluded.kind,date=excluded.date,amountCents=excluded.amountCents,data=excluded.data,updatedAt=excluded.updatedAt",
        id,
        pluginId,
        after.revision,
        data.kind,
        data.date,
        data.amount ? amountCents(data.amount) : 0,
        JSON.stringify(data),
        after.createdAt,
        after.updatedAt,
        connectionId,
      );
      const reminderChanged = reminderScheduleChanged(before, after);
      const previous = this.sql
        .exec<Reminder>("SELECT * FROM personal_reminders WHERE recordId=?", id)
        .toArray()[0];
      // An explicit save can confirm a new recipient without changing the time.
      // Rebinding a link alone never migrates existing reminders.
      const targetChanged =
        target &&
        previous &&
        (previous.connectionId !== target.connectionId ||
          previous.generation !== target.generation);
      if (data.kind !== "reminder" || !data.remindAt || !data.reminderEnabled)
        this.sql.exec("DELETE FROM personal_reminders WHERE recordId=?", id);
      else if (!target || (connectionId && target.connectionId !== connectionId))
        throw new AppError(
          "reminder_link",
          connectionId
            ? "这份记录所属的微信链接尚未连接，请连接后再设置提醒"
            : "请在个人助理配置中选择已连接的微信链接，再设置提醒",
        );
      else if (reminderChanged || !previous || targetChanged || previous.state === "blocked") {
        const dueAt = Date.parse(data.remindAt);
        if (dueAt <= Date.now() || dueAt > Date.now() + 2 * 366 * 86400000)
          throw new AppError("reminder_time", "提醒时间需在未来两年内，请明确日期和时间");
        this.sql.exec("DELETE FROM personal_reminders WHERE recordId=?", id);
        this.sql.exec(
          "INSERT INTO personal_reminders (id,pluginId,recordId,revision,dueAt,repeatMs,connectionId,generation,state,retryAt,recordConnectionId) VALUES (?,?,?,?,?,?,?,?,'scheduled',?,?)",
          crypto.randomUUID(),
          pluginId,
          id,
          after.revision,
          dueAt,
          data.repeat === "daily" ? 86400000 : data.repeat === "weekly" ? 7 * 86400000 : 0,
          target.connectionId,
          target.generation,
          dueAt,
          connectionId,
        );
      } else
        this.sql.exec(
          "UPDATE personal_reminders SET revision=? WHERE recordId=?",
          after.revision,
          id,
        );
    }
    if (changes.size) {
      const state = this.recordState(pluginId, connectionId);
      const recent: RecordChange[] = [...changes].flatMap(([id, { before, after }]) => {
        const record = after ?? before;
        // Keep only a short change receipt, never deleted note/file contents or amounts.
        return record
          ? [
              {
                id,
                kind: record.kind,
                title: record.title.slice(0, 80),
                date: record.date,
                remindAt: record.remindAt,
                completed: record.completed,
                action: !after
                  ? ("deleted" as const)
                  : before
                    ? ("updated" as const)
                    : ("created" as const),
                source,
                at: Date.now(),
              },
            ]
          : [];
      });
      this.sql.exec(
        "INSERT INTO personal_record_state (pluginId,revision,changes,connectionId) VALUES (?,?,?,?) ON CONFLICT(pluginId,connectionId) DO UPDATE SET revision=excluded.revision,changes=excluded.changes",
        pluginId,
        state.revision + 1,
        JSON.stringify(
          [...recent, ...state.changes.filter((c) => !changes.has(c.id))].slice(0, 20),
        ),
        connectionId,
      );
    }
  }
  deletePlugin(pluginId: string) {
    this.changedSchedule();
    this.sql.exec("DELETE FROM personal_reminders WHERE pluginId=?", pluginId);
    this.sql.exec("DELETE FROM personal_records WHERE pluginId=?", pluginId);
    this.sql.exec("DELETE FROM personal_record_state WHERE pluginId=?", pluginId);
  }
  nextReminder() {
    return this.sql
      .exec<{ due: number | null }>(
        "SELECT MIN(retryAt) due FROM personal_reminders WHERE state IN ('scheduled','retry','waiting_context','paused')",
      )
      .one().due;
  }
  due(now = Date.now()) {
    return this.sql
      .exec<Reminder>(
        "SELECT * FROM personal_reminders WHERE state IN ('scheduled','retry','waiting_context','paused') AND retryAt<=? ORDER BY retryAt LIMIT 10",
        now,
      )
      .toArray();
  }
  isCurrent(r: Reminder) {
    return (
      this.sql
        .exec(
          "SELECT 1 FROM personal_reminders WHERE id=? AND dueAt=? AND revision=? AND state IN ('scheduled','retry','waiting_context','paused') AND retryAt<=?",
          r.id,
          r.dueAt,
          r.revision,
          Date.now(),
        )
        .toArray().length > 0
    );
  }
  defer(r: Reminder, state: string, error: string, delay = 60000) {
    this.updateDelivery(r, state, error, delay);
  }
  block(r: Reminder, state: string, reason: ReminderFailureReason) {
    this.updateDelivery(r, state, reason.message, 60000, { blockReason: reason });
  }
  fail(r: Reminder, state: string, failure: ReminderFailureReason, delay = 60000) {
    this.updateDelivery(r, state, failure.message, delay, { failure });
  }
  private updateDelivery(
    r: Reminder,
    state: string,
    error: string,
    delay: number,
    {
      failure,
      blockReason,
    }: { failure?: ReminderFailureReason; blockReason?: ReminderFailureReason } = {},
  ) {
    this.changedSchedule();
    this.sql.exec(
      "UPDATE personal_reminders SET state=?,error=?,errorDueAt=?,retryAt=?,lastFailure=COALESCE(?,lastFailure),blockReason=? WHERE id=? AND dueAt=?",
      state,
      error,
      r.dueAt,
      Date.now() + delay,
      failure
        ? JSON.stringify({ ...failure, at: Date.now(), dueAt: r.dueAt } satisfies ReminderFailure)
        : null,
      blockReason
        ? JSON.stringify({ ...blockReason, dueAt: r.dueAt } satisfies ReminderBlockReason)
        : null,
      r.id,
      r.dueAt,
    );
  }
  startAttempt(r: Reminder) {
    // Lease and counter are persisted together before the outbound request.
    // Pauses, preparation failures and empty digests do not count as sends.
    this.defer(r, "retry", "正在发送提醒", 30000);
    return this.sql
      .exec<{ attempts: number }>(
        "UPDATE personal_reminders SET attempts=attempts+1 WHERE id=? AND dueAt=? RETURNING attempts",
        r.id,
        r.dueAt,
      )
      .one().attempts;
  }
  finish(r: Reminder) {
    this.complete(r, "", null);
  }
  expire(
    r: Reminder,
    notBefore = Date.now() - 86400000,
    error = r.repeatMs ? "已跳过过期提醒，保留下一次提醒" : "提醒已超过 24 小时，未再补发",
  ) {
    this.complete(r, error, notBefore);
  }
  private complete(r: Reminder, error: string, notBefore: number | null) {
    this.changedSchedule();
    if (!r.repeatMs)
      this.sql.exec(
        "UPDATE personal_reminders SET state=?,error=?,errorDueAt=?,blockReason=CASE WHEN ?<>'' AND json_extract(blockReason,'$.dueAt')=? THEN blockReason ELSE NULL END WHERE id=? AND dueAt=?",
        notBefore === null ? "sent" : "expired",
        error,
        error ? r.dueAt : null,
        error,
        r.dueAt,
        r.id,
        r.dueAt,
      );
    else {
      const elapsed = Math.floor((Date.now() - r.dueAt) / r.repeatMs);
      let next = r.dueAt + Math.max(1, elapsed) * r.repeatMs;
      // Retain the most recent occurrence if it is still deliverable. Do not
      // replay a backlog, or discard today's reminder with yesterday's failure.
      // A successful request can also cross the next occurrence's deadline.
      // Keep that newly due occurrence instead of advancing past it.
      if (next < (notBefore ?? Date.now() - 86400000)) next += r.repeatMs;
      this.sql.exec(
        "UPDATE personal_reminders SET dueAt=?,retryAt=?,state='scheduled',attempts=0,error=?,errorDueAt=?,blockReason=CASE WHEN ?<>'' AND json_extract(blockReason,'$.dueAt')=? THEN blockReason ELSE NULL END WHERE id=? AND dueAt=?",
        next,
        next,
        error,
        error ? r.dueAt : null,
        error,
        r.dueAt,
        r.id,
        r.dueAt,
      );
    }
  }
}
export class PersonalDraft {
  readonly changes = new Map<string, Change>();
  private seen = new Set<string>();
  private recordsRevision: number;
  constructor(
    private store: PersonalRecordsStore,
    readonly pluginId: string,
    private reminderTarget: ReminderTarget | null,
    private currency: PersonalRecord["currency"],
    readonly connectionId = "",
  ) {
    this.recordsRevision = store.recordState(pluginId, connectionId).revision;
  }
  assertCurrent() {
    if (this.recordsRevision !== this.store.recordState(this.pluginId, this.connectionId).revision)
      throw new AppError(
        "personal_records_changed",
        "记录已修改或删除，本轮操作未保存、未扣 credits，请重新发送以读取最新记录",
        409,
      );
  }
  resetForRetry() {
    // Discard this attempt without accepting a newer database revision or
    // weakening the version checks used to restore persisted drafts.
    this.assertCurrent();
    this.changes.clear();
    this.seen.clear();
  }
  reminderStatus(record: PersonalRecord) {
    if (record.kind !== "reminder" || !record.reminderEnabled || !record.remindAt)
      return { rescheduled: false, state: "none", nextAt: null };
    const change = this.changes.get(record.id);
    // Delivery progresses independently of record revisions and staged edits.
    // Read it afresh, including when restoring a draft after a restart.
    const latest = change?.before
      ? this.store.get(this.pluginId, record.id, this.connectionId)
      : record;
    const rescheduled =
      !!change &&
      (reminderScheduleChanged(change.before, record) ||
        !latest.reminderState ||
        latest.reminderState === "blocked" ||
        (!!this.reminderTarget &&
          this.store.reminderTargetChanged(
            this.pluginId,
            record.id,
            this.connectionId,
            this.reminderTarget,
          )));
    return {
      rescheduled,
      state: rescheduled ? "staged" : (latest.reminderState ?? "none"),
      nextAt: rescheduled
        ? Date.parse(record.remindAt)
        : (latest.nextReminderAt ?? Date.parse(record.remindAt)),
    };
  }
  currentContext() {
    this.assertCurrent();
    // This mandatory read does not grant write permission: updates/deletions still
    // require an explicit personal_query, preserving the existing ID/revision gate.
    return {
      ...this.store.recordState(this.pluginId, this.connectionId),
      records: this.store.query(this.pluginId, { limit: 12 }, this.changes, this.connectionId),
      tasks: this.store.query(
        this.pluginId,
        { kind: "task", limit: 20 },
        this.changes,
        this.connectionId,
      ),
      reminders: this.store.query(
        this.pluginId,
        { kind: "reminder", limit: 20 },
        this.changes,
        this.connectionId,
      ),
    };
  }
  snapshot(): PersonalDraftState {
    return {
      changes: [...this.changes],
      seen: [...this.seen],
      recordsRevision: this.recordsRevision,
      recordModelVersion: 2,
      connectionId: this.connectionId,
    };
  }
  restore(state: PersonalDraftState) {
    if (state.recordModelVersion !== 2 || (state.connectionId ?? "") !== this.connectionId)
      throw new AppError(
        "personal_records_changed",
        "记录分类已更新，本次未扣 credits，请重新发送",
        409,
      );
    this.recordsRevision = state.recordsRevision ?? this.recordsRevision;
    this.assertCurrent();
    this.changes.clear();
    for (const [id, change] of state.changes) this.changes.set(id, change);
    this.seen = new Set(state.seen);
  }
  query(raw: unknown) {
    const q = personalQuerySchema.parse(raw);
    if (q.offset) throw new AppError("query_offset", "微信查询请缩小日期或关键词范围");
    const result = this.store.query(this.pluginId, q, this.changes, this.connectionId);
    result.records.forEach((r) => this.seen.add(r.id));
    return result;
  }
  configureDailyTasks(raw: unknown) {
    const config = dailyTasksReminderSchema.parse(raw);
    const existing = this.query({ kind: "reminder", reminderType: "daily_tasks", limit: 1 })
      .records[0];
    if (!config.enabled && !existing) return null;
    return this.save(
      config.enabled
        ? {
            kind: "reminder",
            reminderType: "daily_tasks",
            title: "今日待办",
            date: beijingDate(),
            remindAt: nextDailyReminderAt(config.time!),
            repeat: "daily",
            reminderEnabled: true,
          }
        : { reminderEnabled: false },
      existing?.id,
      existing?.revision,
    );
  }
  save(raw: unknown, id?: string, revision?: number, requireSeen = false) {
    if (id && requireSeen && !this.seen.has(id))
      throw new AppError(
        "record_lookup_required",
        "修改前请先查询并确认准确的记录 ID 与版本，不可猜测",
      );
    const original = id
      ? this.changes.has(id)
        ? this.changes.get(id)!.before
        : this.store.get(this.pluginId, id, this.connectionId)
      : null;
    const current = id ? (this.changes.has(id) ? this.changes.get(id)!.after : original) : null;
    if (id && (!current || current.revision !== revision))
      throw new AppError("record_changed", "记录已变更，请重新查询", 409);
    const data = personalRecordInputSchema.parse(
      raw && typeof raw === "object" ? { currency: this.currency, ...current, ...raw } : raw,
    );
    if (current && data.kind !== current.kind)
      throw new AppError("record_kind", "更换记录类型请新建记录");
    if (current && data.reminderType !== (current.reminderType ?? "message"))
      throw new AppError("record_kind", "更换提醒类型请新建记录");
    if (
      data.reminderType === "daily_tasks" &&
      this.store
        .query(
          this.pluginId,
          {
            kind: "reminder",
            reminderType: "daily_tasks",
            limit: 2,
          },
          this.changes,
          this.connectionId,
        )
        .records.some((r) => r.id !== id)
    )
      throw new AppError(
        "daily_tasks_exists",
        "已设置每日待办提醒，请查询原记录后修改时间或重新启用",
      );
    if (data.kind === "reminder" && data.remindAt && data.reminderEnabled) {
      if (!this.reminderTarget)
        throw new AppError(
          "reminder_link",
          this.connectionId
            ? "当前微信链接尚未连接，请连接后再设置提醒"
            : "请在个人助理配置中选择已连接的微信链接，再设置提醒",
        );
      const recovering =
        current &&
        (current.reminderState === "blocked" ||
          this.store.reminderTargetChanged(
            this.pluginId,
            current.id,
            this.connectionId,
            this.reminderTarget,
          ));
      // Explicitly saving after a block or binding change confirms the receiver.
      // Keep the original daily/weekly cadence, but never replay its backlog.
      if (
        recovering &&
        sameReminderTime(data.remindAt, current.remindAt) &&
        data.repeat === current.repeat &&
        data.repeat !== "none" &&
        Date.parse(data.remindAt) <= Date.now()
      ) {
        const interval = data.repeat === "daily" ? 86400000 : 7 * 86400000;
        const anchor = current.nextReminderAt ?? Date.parse(data.remindAt);
        const next =
          anchor + Math.max(0, Math.floor((Date.now() - anchor) / interval) + 1) * interval;
        data.remindAt = new Date(next).toISOString();
      }
      if (recovering || reminderScheduleChanged(current, data)) {
        const due = Date.parse(data.remindAt);
        if (due <= Date.now() || due > Date.now() + 2 * 366 * 86400000)
          throw new AppError("reminder_time", "提醒时间需在未来两年内，请明确日期和时间");
      }
    }
    const record: PersonalRecord = {
      ...data,
      id: id ?? crypto.randomUUID(),
      revision: (current?.revision ?? 0) + 1,
      createdAt: current?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    this.changes.set(record.id, { before: original, after: record });
    this.seen.add(record.id);
    return record;
  }
  remove(id: string, revision: number, requireSeen = false) {
    if (requireSeen && !this.seen.has(id))
      throw new AppError("record_lookup_required", "删除前请先查询并确认准确记录，不可猜测");
    const original = this.changes.has(id)
      ? this.changes.get(id)!.before
      : this.store.get(this.pluginId, id, this.connectionId);
    const current = this.changes.has(id) ? this.changes.get(id)!.after : original;
    if (!current || current.revision !== revision)
      throw new AppError("record_changed", "记录已变更，请重新查询", 409);
    this.changes.set(id, { before: original, after: null });
    return { deleted: true, id };
  }
}
export const recordUpdateSchema = z.object({
  id: z.string().uuid(),
  revision: z.number().int().positive(),
  changes: z.record(z.string(), z.unknown()),
});
