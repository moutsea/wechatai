import { beijingTime, type PersonalRecord } from "../../shared/personal-assistant";
import type { PersonalDraft } from "../personal-records";

// Operation confirmations are application output, not a model's interpretation of
// history. Only this turn's validated changes may appear in the receipt.
const plain = (text: string) =>
  text.replace(/[\r\n\t]+/g, " ").replace(/([\\`*_{}[\]<>])/g, "\\$1");
const kindName = { note: "笔记", entry: "账目", task: "待办", reminder: "提醒" };
function recordDetails(record: PersonalRecord, before: PersonalRecord | null) {
  const lines = [`- ${kindName[record.kind]}：${plain(record.title)}`];
  if (record.kind === "entry") {
    lines.push(
      `- ${record.direction === "income" ? "收入" : "支出"}：${record.amount} ${record.currency}`,
    );
    lines.push(`- 日期：${record.date}`);
  } else if (record.kind === "task") {
    lines.push(`- 状态：${record.completed ? "已完成" : "待完成"}`);
    lines.push("- 已保存到笔记 · 待办清单");
  } else if (record.kind === "reminder") {
    if (record.reminderType === "daily_tasks")
      lines.push("- 内容：当天最新的未完成待办；没有待办时不发送");
    if (!record.reminderEnabled) lines.push("- 提醒：已取消");
    else if (record.remindAt) {
      const changed =
        !before ||
        !before.reminderEnabled ||
        before.remindAt !== record.remindAt ||
        before.repeat !== record.repeat;
      const state = changed ? "scheduled" : before.reminderState;
      if (state === "sent") lines.push("- 提醒：已发送");
      else if (state === "expired") lines.push("- 提醒：已过期，未再补发");
      else {
        const next = changed
          ? Date.parse(record.remindAt)
          : (before.nextReminderAt ?? Date.parse(record.remindAt));
        lines.push(`- 提醒时间：${beijingTime(next)}（北京时间）`);
        lines.push(
          `- ${record.repeat === "daily" ? "每天重复" : record.repeat === "weekly" ? "每周重复" : "一次性提醒"}`,
        );
        if (["blocked", "paused", "waiting_context", "retry"].includes(state ?? ""))
          lines.push("- 发送状态：等待微信连接恢复或重试，请在网页检查连接");
      }
    }
  }
  return lines;
}

export function personalReceipt(draft: PersonalDraft, failures: string[] = []) {
  if (!draft.changes.size && !failures.length) return undefined;
  const sections: string[] = [];
  let cancelled = 0;
  for (const { before, after } of draft.changes.values()) {
    if (!after) {
      if (before)
        sections.push(
          `已删除${kindName[before.kind]}\n\n- ${plain(before.title)}${before.kind === "reminder" ? "\n- 对应提醒已取消" : ""}`,
        );
      else cancelled++;
      continue;
    }
    const heading =
      after.kind === "task" && after.completed
        ? "待办已完成"
        : after.kind === "reminder" && !after.reminderEnabled
          ? "提醒已取消"
          : after.kind === "reminder" &&
              after.remindAt &&
              (!before ||
                !before.reminderEnabled ||
                before.remindAt !== after.remindAt ||
                before.repeat !== after.repeat)
            ? before
              ? "提醒已更新"
              : "提醒已设置"
            : `${before ? "已更新" : "已保存"}${kindName[after.kind]}`;
    sections.push(`${heading}\n\n${recordDetails(after, before).join("\n")}`);
  }
  if (cancelled) sections.push(`本轮有 ${cancelled} 条新建记录已取消，未保留。`);
  if (failures.length)
    sections.push(
      `${draft.changes.size ? "另有操作未完成" : "本轮操作未完成、未保存记录"}，请补充说明后重试：\n${[...new Set(failures)].map((e) => `- ${plain(e).slice(0, 200)}`).join("\n")}`,
    );
  return sections.join("\n\n");
}
