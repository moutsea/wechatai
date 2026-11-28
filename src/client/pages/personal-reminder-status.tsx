import { workspaceError } from "../workspace-copy";
import { useLocale } from "../locale";
import { copy as sourceCopy } from "../../shared/i18n/zh-CN/copy/personal-reminder-status-page";
import { copy as koCopy } from "../../shared/i18n/ko/copy/personal-reminder-status-page";
import { workspaceCopy as ptCopy } from "../../shared/i18n/pt/copy/workspace";
import { formatCopy } from "../../shared/i18n/dashboard";
import { AlertTriangle } from "lucide-react";
import {
  beijingTime,
  type PersonalRecord,
  type ReminderFailureReason,
} from "../../shared/personal-assistant";

export function reminderStatusesFor(locale = "zh-CN"): Record<string, string> {
  const pageCopy =
    locale === "ko" ? koCopy : locale === "pt" ? ptCopy : sourceCopy;
  return {
    scheduled: pageCopy["等待提醒"],
    sent: pageCopy["已提醒"],
    paused: pageCopy["已暂停"],
    retry: pageCopy["发送重试中"],
    waiting_context: pageCopy["等待微信恢复"],
    blocked: pageCopy["需重新设置"],
    expired: pageCopy["未送达，已过期"],
  };
}

export const reminderStatuses = reminderStatusesFor();

function nextStep(
  record: PersonalRecord,
  failure: ReminderFailureReason | undefined,
  pageCopy: typeof sourceCopy = sourceCopy,
) {
  const state = record.reminderState;
  if (state === "expired")
    return pageCopy["已停止补发。若仍需提醒，请编辑并保存一个新的提醒时间。"];
  if (state === "blocked")
    return record.repeat === "none"
      ? pageCopy["请检查接收微信，再编辑并保存一个新的提醒时间。"]
      : pageCopy["请检查接收微信，再编辑并重新保存提醒；系统将按原周期恢复下一次未来提醒。"];
  if (failure?.code === "wechat_expired")
    return pageCopy["请在微信链接页面重新扫码连接，再编辑并重新保存提醒。"];
  if (failure?.code === "reminder_plugin_paused")
    return pageCopy["请启用个人助理或恢复套餐；恢复后会继续尝试尚未过期的提醒。"];
  if (state === "paused")
    return pageCopy["请检查接收微信的连接和套餐；恢复后会继续尝试尚未过期的提醒。"];
  if (state === "scheduled")
    return pageCopy["本次已停止补发，下一次仍会按计划尝试。请检查接收微信的连接。"];
  const dailyTasks = record.reminderType === "daily_tasks";
  const retryWindow = dailyTasks
    ? pageCopy["预定提醒当天（北京时间）"]
    : pageCopy["预定时间后的 24 小时内"];
  const cutoff = dailyTasks ? pageCopy["，跨天后不再补发"] : "";
  if (state === "waiting_context" || failure?.ret === -2 || failure?.errcode === -2)
    return formatCopy(pageCopy["请先向接收微信发送一条消息。系统会在{value0}继续重试{value1}。"], {
      value0: retryWindow,
      value1: cutoff,
    });
  return formatCopy(
    pageCopy["系统会在{value0}自动重试{value1}；持续失败请检查微信连接或联系管理员。"],
    { value0: retryWindow, value1: cutoff },
  );
}

export function ReminderFailureNotice({ record }: { record: PersonalRecord }) {
  const { locale } = useLocale();
  const pageCopy =
    locale === "ko" ? koCopy : locale === "pt" ? ptCopy : sourceCopy;

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
      ? pageCopy["这条提醒未送达，已过期"]
      : state === "scheduled"
        ? pageCopy["上次提醒未送达"]
        : state === "retry"
          ? pageCopy["提醒发送失败，正在重试"]
          : pageCopy["提醒尚未送达，需要处理"];
  return (
    <div className={`personal-reminder-failure${problem ? " needs-attention" : ""}`}>
      {problem && (
        <div role="status" className="personal-reminder-warning">
          <AlertTriangle size={16} aria-hidden="true" />
          <div>
            <strong>{title}</strong>
            <p>
              {(currentReason
                ? workspaceError(currentReason, locale)
                : record.reminderError
                  ? workspaceError(record.reminderError, locale)
                  : undefined) || pageCopy["暂未记录具体原因。"]}
            </p>
            <p>{nextStep(record, currentReason, pageCopy)}</p>
            {state === "expired" && !currentReason && (
              <p>{pageCopy["这条历史提醒未保留原始失败原因。"]}</p>
            )}
          </div>
        </div>
      )}
      {failure && (
        <details>
          <summary>{pageCopy["查看最近失败详情"]}</summary>
          <p>
            {pageCopy["对应提醒时间："]}
            {beijingTime(failure.dueAt)}
            {pageCopy["（北京时间）"]}
          </p>
          <p>
            {pageCopy["失败时间："]}
            {failure.at === null
              ? pageCopy["历史记录未保存时间"]
              : formatCopy(pageCopy["{value0}（北京时间）"], { value0: beijingTime(failure.at) })}
          </p>
          <p>
            {pageCopy["失败原因："]}
            {workspaceError(failure, locale)}
          </p>
          <p>
            {pageCopy["错误标识："]}
            <code>{failure.code}</code>
            {failure.upstreamStatus !== undefined && ` · HTTP ${failure.upstreamStatus}`}
            {failure.ret !== undefined && ` · ret=${failure.ret}`}
            {failure.errcode !== undefined && ` · errcode=${failure.errcode}`}
          </p>
          {(!problem || !currentFailure || !!currentBlock) && (
            <p>{pageCopy["以上为历史失败记录，当前提醒状态以页面显示为准。"]}</p>
          )}
        </details>
      )}
    </div>
  );
}
