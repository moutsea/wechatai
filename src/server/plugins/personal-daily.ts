import { beijingDate } from "../../shared/personal-assistant";
import type { PersonalRecordsStore } from "../personal-records";

type DailyTasksMessage =
  | { status: "message"; text: string }
  | { status: "empty" }
  | { status: "expired"; notBefore: number };

// Calendar expiry does not depend on login, plan or conversation context.
export function dailyTasksExpiry(dueAt: number, now = Date.now()) {
  const date = beijingDate(now);
  return beijingDate(dueAt) === date ? null : Date.parse(`${date}T00:00:00+08:00`);
}

// Read immediately before delivery, never cache a model-generated list in a
// repeating message. Only this plugin's current, unfinished tasks are included.
export function dailyTasksMessage(
  store: PersonalRecordsStore,
  pluginId: string,
  dueAt: number,
  now = Date.now(),
  connectionId = "",
): DailyTasksMessage {
  const date = beijingDate(now);
  const notBefore = dailyTasksExpiry(dueAt, now);
  if (notBefore !== null) return { status: "expired", notBefore };
  const tasks = store.query(
    pluginId,
    {
      kind: "task",
      from: date,
      to: date,
      completed: false,
      limit: 20,
    },
    undefined,
    connectionId,
  );
  if (!tasks.total) return { status: "empty" };
  const lines = tasks.records.map(
    (r) => `- ${r.title.replace(/[\r\n\t]+/g, " ").replace(/([\\`*_{}[\]<>])/g, "\\$1")}`,
  );
  const text = [
    `📋 今日待办 · ${date}`,
    `还有 ${tasks.total} 项待办未完成：`,
    lines.join("\n"),
    ...(tasks.total > tasks.records.length
      ? [`另有 ${tasks.total - tasks.records.length} 项，请在网页的「今日待办」中查看。`]
      : []),
    "完成后可告诉个人助理，或在网页勾选完成。",
  ].join("\n\n");
  return { status: "message", text };
}
