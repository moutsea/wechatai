import { formatCopy } from "../shared/i18n/dashboard";
import type { Locale } from "../shared/i18n";
import { ledgerCopy, workspaceErrors, workspaceLabels } from "../shared/i18n/ko/copy/workspace";

// Apply only to product-owned labels. User names, messages and notice bodies stay verbatim.
export function workspaceLabel(locale: Locale, value: string): string {
  return locale === "ko"
    ? Object.hasOwn(workspaceLabels, value)
      ? workspaceLabels[value]
      : value
    : value;
}

export function workspaceError(error: unknown, locale: Locale): string {
  const detail =
    typeof error === "object" && error !== null
      ? (error as { message?: string; code?: string; status?: number })
      : { message: typeof error === "string" ? error : undefined };
  const message = detail.message ?? "";
  if (locale !== "ko") return message;
  if (detail.code && Object.hasOwn(workspaceErrors, detail.code))
    return workspaceErrors[detail.code];
  if (Object.hasOwn(workspaceLabels, message)) return workspaceLabels[message];
  if (/[가-힣]/.test(message) && !/\p{Script=Han}/u.test(message)) return message;
  if (detail.status === 401) return workspaceErrors.unauthorized;
  if (detail.status === 403) return workspaceErrors.forbidden;
  if (detail.status === 404) return workspaceErrors.not_found;
  if (detail.status === 400 || detail.status === 422) return workspaceErrors.invalid_input;
  return workspaceErrors.request_failed;
}

export function ledgerNote(locale: Locale, note: string): string {
  if (locale !== "ko") return note;
  const repayment = /^(.*)；抵扣欠额 (\d+(?:\.\d+)?) credits$/.exec(note);
  const description = repayment ? repayment[1] : note;
  const usage = /^(实际消耗|上下文整理) (\d+(?:\.\d+)?) credits$/.exec(description);
  const labels: Record<string, string> = {
    "邀请好友奖励 · 永久有效": ledgerCopy.inviter,
    "受邀注册奖励 · 永久有效": ledgerCopy.invitee,
    "Credits 充值": ledgerCopy.purchase,
  };
  const translated = usage
    ? formatCopy(usage[1] === "实际消耗" ? ledgerCopy.usage : ledgerCopy.summary, {
        amount: usage[2],
      })
    : Object.hasOwn(labels, description)
      ? labels[description]
      : workspaceLabel(locale, description);
  if (translated === description) return note;
  return repayment
    ? translated + formatCopy(ledgerCopy.repaid, { amount: repayment[2] })
    : translated;
}
