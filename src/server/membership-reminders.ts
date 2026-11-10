import type { ReminderSchedule } from "./reminder-scheduler";

export const MEMBERSHIP_REMINDER_DAYS = [7, 3] as const;
export const MEMBERSHIP_DAY_MS = 86400000;
type Days = (typeof MEMBERSHIP_REMINDER_DAYS)[number];
type State = "pending" | "sending" | "retry" | "waiting" | "sent" | "skipped" | "cancelled";
export type MembershipReminderTarget = { connectionId: string; generation: string };
type Item = {
  days: Days;
  dueAt: number;
  cutoffAt: number;
  state: State;
  retryAt: number;
  attempts: number;
  target?: MembershipReminderTarget;
  text?: string;
};
export type MembershipReminder = Item & { planUntil: number };
type Store = { planUntil: number; revision: number; acknowledged: number; items: Item[] };
const active = (state: State) => ["pending", "sending", "retry", "waiting"].includes(state);

// Two bounded delivery records per membership term. A renewal replaces the old
// term atomically; callbacks from an earlier send cannot change the new records.
export class MembershipReminders {
  constructor(private sql: SqlStorage) {}
  init() {
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS membership_reminders (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)",
    );
    this.sql.exec(
      "INSERT OR IGNORE INTO membership_reminders VALUES (1,?)",
      JSON.stringify({ planUntil: 0, revision: 0, acknowledged: 0, items: [] } satisfies Store),
    );
  }
  private read(): Store {
    return JSON.parse(
      this.sql.exec<{ data: string }>("SELECT data FROM membership_reminders WHERE id=1").one()
        .data,
    ) as Store;
  }
  private save(store: Store) {
    store.revision++;
    this.sql.exec("UPDATE membership_reminders SET data=? WHERE id=1", JSON.stringify(store));
  }
  sync(planUntil: number, now = Date.now(), catchUp = false) {
    const store = this.read();
    let changed = false;
    if (store.planUntil !== planUntil) {
      store.planUntil = planUntil;
      store.items =
        planUntil > now
          ? MEMBERSHIP_REMINDER_DAYS.map((days) => {
              const dueAt = planUntil - days * MEMBERSHIP_DAY_MS;
              const cutoffAt = days === 7 ? planUntil - 3 * MEMBERSHIP_DAY_MS : planUntil;
              return {
                days,
                dueAt,
                cutoffAt,
                state: dueAt < now ? "skipped" : "pending",
                retryAt: dueAt,
                attempts: 0,
              };
            })
          : [];
      changed = true;
    }
    for (const item of store.items) {
      if (catchUp && item.state === "skipped" && item.dueAt <= now && now < item.cutoffAt) {
        item.state = "pending";
        item.retryAt = now;
        changed = true;
      }
      if (active(item.state) && item.cutoffAt <= now) {
        item.state = "skipped";
        changed = true;
      }
    }
    if (changed) this.save(store);
  }
  schedule(): ReminderSchedule {
    const store = this.read();
    const times = store.items
      .filter((item) => active(item.state))
      .map((item) =>
        item.state === "waiting" ? item.cutoffAt : Math.min(item.retryAt, item.cutoffAt),
      );
    return { revision: store.revision, nextAt: times.length ? Math.min(...times) : null };
  }
  pendingSync() {
    const store = this.read();
    return store.revision > store.acknowledged;
  }
  acknowledge(revision: number) {
    const store = this.read();
    store.acknowledged = Math.max(store.acknowledged, Math.min(revision, store.revision));
    this.sql.exec("UPDATE membership_reminders SET data=? WHERE id=1", JSON.stringify(store));
  }
  due(now = Date.now()): MembershipReminder[] {
    const store = this.read();
    return store.items
      .filter(
        (item) =>
          active(item.state) &&
          item.state !== "waiting" &&
          item.retryAt <= now &&
          now < item.cutoffAt,
      )
      .map((item) => ({ ...item, planUntil: store.planUntil }));
  }
  private current(store: Store, job: MembershipReminder) {
    if (store.planUntil !== job.planUntil) return undefined;
    return store.items.find(
      (item) => item.days === job.days && item.attempts === job.attempts && active(item.state),
    );
  }
  isCurrent(job: MembershipReminder, now = Date.now()) {
    return !!this.current(this.read(), job) && now < job.cutoffAt;
  }
  claim(job: MembershipReminder, target: MembershipReminderTarget, text: string, now = Date.now()) {
    const store = this.read();
    const item = this.current(store, job);
    if (!item || item.retryAt > now || now >= item.cutoffAt) return null;
    item.target ??= target;
    item.text ??= text;
    item.state = "sending";
    item.attempts++;
    item.retryAt = now + 30000;
    this.save(store);
    return { ...item, planUntil: store.planUntil };
  }
  settle(
    job: MembershipReminder,
    state: "sent" | "waiting" | "cancelled" | "retry",
    now = Date.now(),
  ) {
    const store = this.read();
    const item = this.current(store, job);
    if (!item) return;
    item.state = state;
    if (state === "retry")
      item.retryAt = now + Math.min(300000, 5000 * 2 ** Math.min(item.attempts, 6));
    this.save(store);
  }
  wake(now = Date.now()) {
    const store = this.read();
    let changed = false;
    for (const item of store.items) {
      if (["waiting", "retry"].includes(item.state) && item.dueAt <= now && now < item.cutoffAt) {
        item.state = "pending";
        item.retryAt = now;
        changed = true;
      }
    }
    if (changed) this.save(store);
  }
  status() {
    const store = this.read();
    return {
      planUntil: store.planUntil,
      stages: store.items.map(({ days, state, dueAt }) => ({ days, state, dueAt })),
    };
  }
}
