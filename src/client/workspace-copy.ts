import { useCallback } from "react";
import { useLocale } from "./locale";
import { ApiError } from "./api";
import { formatCopy } from "../shared/i18n/dashboard";
import { workspaceCopy } from "../shared/i18n/es/copy/workspace";

/** Translate product copy at its call site, before it is mixed with user content. */
export function useWorkspaceText() {
  const { locale } = useLocale();
  return useCallback(
    (source: string, values: Record<string, string | number> = {}) =>
      formatCopy(
        locale === "es"
          ? Object.hasOwn(workspaceCopy, source)
            ? workspaceCopy[source]
            : source
          : source,
        values,
      ),
    [locale],
  );
}

const localizedMessages = new Set(Object.values(workspaceCopy));

/** Only API/product errors pass through here. User-authored content stays verbatim. */
export function useWorkspaceError() {
  const { locale } = useLocale();
  return useCallback(
    (error: unknown) => {
      const message =
        typeof error === "string"
          ? error
          : error &&
              typeof error === "object" &&
              "message" in error &&
              typeof error.message === "string"
            ? error.message
            : "操作未完成，请重试";
      if (locale !== "es") return message;
      if (error && typeof error === "object" && ("issues" in error || ("path" in error && "code" in error)))
        return workspaceCopy["请检查填写内容"];
      if (Object.hasOwn(workspaceCopy, message)) return workspaceCopy[message];
      if (localizedMessages.has(message)) return message;
      if (error instanceof TypeError || error instanceof SyntaxError)
        return workspaceCopy["操作未完成，请重试"];
      if (!(error instanceof ApiError) && !/[\u3400-\u9fff]/.test(message)) return message;
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      return workspaceCopy[`error.${String(code)}`] ?? workspaceCopy["操作未完成，请重试"];
    },
    [locale],
  );
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

/** Known immutable ledger notes retain their original amounts and any unrecognized content. */
export function workspaceLedgerNote(note: string, locale: string): string {
  if (locale !== "es") return note;
  const debt = /^(.*)；抵扣欠额 (\d+\.\d{3}) credits$/.exec(note);
  if (debt)
    return `${workspaceLedgerNote(debt[1], locale)}${formatCopy(workspaceCopy["；抵扣欠额 {amount} credits"], { amount: debt[2] })}`;
  const usage = /^(实际消耗|上下文整理) (\d+\.\d{3}) credits$/.exec(note);
  if (usage) return `${workspaceCopy[usage[1]]} ${usage[2]} credits`;
  return ledgerNotes.has(note) ? workspaceCopy[note] : note;
}
