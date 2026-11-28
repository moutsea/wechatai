import { workspaceCopy as ptCopy } from "../shared/i18n/pt/copy/workspace";
import { IMAGE_CREDITS } from "../shared/credits";
import { CLOUD_AGENT_COST_NOTE, IMAGE_CREDIT_COST_NOTE } from "../shared/pricing-copy";
import { formatCopy } from "../shared/i18n/dashboard";
import type { Locale } from "../shared/i18n";
import { ledgerCopy, workspaceErrors, workspaceLabels } from "../shared/i18n/ko/copy/workspace";

// Apply only to product-owned labels. User names, messages and notice bodies stay verbatim.
export function workspaceLabel(locale: Locale, value: string): string {
  if (locale === "pt") {
    if (value === CLOUD_AGENT_COST_NOTE)
      return formatCopy(ptCopy["费用说明.cloud"], { credits: IMAGE_CREDITS });
    if (value === IMAGE_CREDIT_COST_NOTE)
      return formatCopy(ptCopy["费用说明.images"], { credits: IMAGE_CREDITS });
    return Object.hasOwn(ptCopy, value) ? ptCopy[value] : value;
  }
  return locale === "ko"
    ? Object.hasOwn(workspaceLabels, value)
      ? workspaceLabels[value]
      : value
    : value;
}

const portugueseMessages = new Set(Object.values(ptCopy));

export function workspaceError(error: unknown, locale: Locale): string {
  const detail =
    typeof error === "object" && error !== null
      ? (error as { message?: string; code?: string; status?: number })
      : { message: typeof error === "string" ? error : undefined };
  const message = detail.message ?? "";
  if (locale === "pt") {
    if (Object.hasOwn(ptCopy, message)) return ptCopy[message];
    if (portugueseMessages.has(message)) return message;
    if (detail.code && Object.hasOwn(ptCopy, `error.${detail.code}`))
      return ptCopy[`error.${detail.code}`];
    if (detail.status === 401) return ptCopy["error.unauthorized"];
    if (detail.status === 403) return ptCopy["error.forbidden"];
    if (detail.status === 404) return ptCopy["error.not_found"];
    if (detail.status === 400 || detail.status === 422) return ptCopy["error.invalid_input"];
    return ptCopy["操作未完成，请重试"];
  }
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

const ledgerNotes = new Set([
  "每日赠送",
  "每日赠送补足",
  "请求额度预留",
  "未完成请求，释放预留额度",
  "每日赠送额度到期",
  "会员周期额度到期",
  "Credits 充值",
  "邀请好友奖励 · 永久有效",
  "受邀注册奖励 · 永久有效",
]);

export function ledgerNote(locale: Locale, note: string): string {
  if (locale === "pt") {
    const debt = /^(.*)；抵扣欠额 (\d+(?:\.\d+)?) credits$/.exec(note);
    const description = debt ? debt[1] : note;
    const usage = /^(实际消耗|上下文整理) (\d+(?:\.\d+)?) credits$/.exec(description);
    const translated = usage
      ? `${ptCopy[usage[1]]} ${usage[2]} credits`
      : ledgerNotes.has(description)
        ? ptCopy[description]
        : description;
    if (translated === description) return note;
    return debt
      ? translated + formatCopy(ptCopy["；抵扣欠额 {amount} credits"], { amount: debt[2] })
      : translated;
  }
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
