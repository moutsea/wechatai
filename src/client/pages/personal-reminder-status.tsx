import { useWorkspaceText, useWorkspaceError } from "../workspace-copy";
import { AlertTriangle } from "lucide-react";
import {
  beijingTime,
  type PersonalRecord,
  type ReminderFailureReason,
} from "../../shared/personal-assistant";

export const reminderStatuses: Record<string, string> = {
  scheduled: "等待提醒",
  sent: "已提醒",
  paused: "已暂停",
  retry: "发送重试中",
  waiting_context: "等待微信恢复",
  blocked: "需重新设置",
  expired: "未送达，已过期",
};

function nextStep(
  record: PersonalRecord,
  failure: ReminderFailureReason | undefined,
  copyText: ReturnType<typeof useWorkspaceText>,
) {
  const state = record.reminderState;
  if (state === "expired")
    return copyText("已停止补发。若仍需提醒，请编辑并保存一个新的提醒时间。");
  if (state === "blocked")
    return record.repeat === "none"
      ? copyText("请检查接收微信，再编辑并保存一个新的提醒时间。")
      : copyText("请检查接收微信，再编辑并重新保存提醒；系统将按原周期恢复下一次未来提醒。");
  if (failure?.code === "wechat_expired")
    return copyText("请在微信链接页面重新扫码连接，再编辑并重新保存提醒。");
  if (failure?.code === "reminder_plugin_paused")
    return copyText("请启用个人助理或恢复套餐；恢复后会继续尝试尚未过期的提醒。");
  if (state === "paused")
    return copyText("请检查接收微信的连接和套餐；恢复后会继续尝试尚未过期的提醒。");
  if (state === "scheduled")
    return copyText("本次已停止补发，下一次仍会按计划尝试。请检查接收微信的连接。");
  const dailyTasks = record.reminderType === "daily_tasks";
  const retryWindow = dailyTasks
    ? copyText("预定提醒当天（北京时间）")
    : copyText("预定时间后的 24 小时内");
  const cutoff = dailyTasks ? copyText("，跨天后不再补发") : "";
  if (state === "waiting_context" || failure?.ret === -2 || failure?.errcode === -2)
    return copyText("请先向接收微信发送一条消息。系统会在{value0}继续重试{value1}。", {
      value0: retryWindow,
      value1: cutoff,
    });
  return copyText("系统会在{value0}自动重试{value1}；持续失败请检查微信连接或联系管理员。", {
    value0: retryWindow,
    value1: cutoff,
  });
}

export function ReminderFailureNotice({ record }: { record: PersonalRecord }) {
  const errorText = useWorkspaceError();
  const copyText = useWorkspaceText();
  const failure = record.reminderLastFailure;
  const state = record.reminderState ?? "";
  // Scheduled rows may describe a missed occurrence before nextReminderAt.
  // Never infer that occurrence from the most recent historical failure.
  const errorDueAt =
    record.reminderErrorDueAt ??
    (state !== "scheduled" ? (record.nextReminderAt ?? Date.parse(record.remindAt ?? "")) : null);
  const currentFailure = failure?.dueAt === errorDueAt ? failure : undefined;
  const currentBlock =
    record.reminderBlockReason?.dueAt === errorDueAt ? record.reminderBlockReason : undefined;
  const currentReason = currentBlock ?? currentFailure;
  const problem =
    record.reminderEnabled &&
    (["expired", "blocked", "paused", "waiting_context"].includes(state) ||
      (state === "retry" &&
        (currentFailure || (!!record.reminderError && record.reminderError !== "正在发送提醒"))) ||
      (state === "scheduled" && !!record.reminderError));
  if (!problem && !failure) return null;
  const title =
    state === "expired"
      ? copyText("这条提醒未送达，已过期")
      : state === "scheduled"
        ? copyText("上次提醒未送达")
        : state === "retry"
          ? copyText("提醒发送失败，正在重试")
          : copyText("提醒尚未送达，需要处理");
  return (
    <div className={`personal-reminder-failure${problem ? " needs-attention" : ""}`}>
      {problem && (
        <div role="status" className="personal-reminder-warning">
          <AlertTriangle size={16} aria-hidden="true" />
          <div>
            <strong>{title}</strong>
            <p>
              {errorText(currentReason ?? record.reminderError ?? copyText("暂未记录具体原因。"))}
            </p>
            <p>{nextStep(record, currentReason, copyText)}</p>
            {state === "expired" && !currentReason && (
              <p>{copyText("这条历史提醒未保留原始失败原因。")}</p>
            )}
          </div>
        </div>
      )}
      {failure && (
        <details>
          <summary>{copyText("查看最近失败详情")}</summary>
          <p>
            {copyText("对应提醒时间：")}
            {beijingTime(failure.dueAt)}
            {copyText("（北京时间）")}
          </p>
          <p>
            {copyText("失败时间：")}
            {failure.at === null
              ? copyText("历史记录未保存时间")
              : copyText("{value0}（北京时间）", { value0: beijingTime(failure.at) })}
          </p>
          <p>
            {copyText("失败原因：")}
            {errorText(failure)}
          </p>
          <p>
            {copyText("错误标识：")}
            <code>{failure.code}</code>
            {failure.upstreamStatus !== undefined && ` · HTTP ${failure.upstreamStatus}`}
            {failure.ret !== undefined && ` · ret=${failure.ret}`}
            {failure.errcode !== undefined && ` · errcode=${failure.errcode}`}
          </p>
          {(!problem || !currentFailure || !!currentBlock) && (
            <p>{copyText("以上为历史失败记录，当前提醒状态以页面显示为准。")}</p>
          )}
        </details>
      )}
    </div>
  );
}
