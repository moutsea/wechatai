import { useWorkspaceText, useWorkspaceError } from "../workspace-copy";
import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";
import { useApp } from "../context";
import { ApiError, json } from "../api";
import { trackChannelModelImport, trackFunnel } from "../analytics-client";
import type { ModelImportResult } from "../../shared/types";
import { kimiseekEmailError } from "../../shared/kimiseek-errors";
import { dashboardCopy, formatCopy } from "../../shared/i18n/dashboard";
import { useLocale } from "../locale";

type ConnectError = { message: string; code?: string; timedOut?: boolean };
type ConnectResult = { message?: string; modelImport?: ModelImportResult };

export function useKimiseekConnect(onComplete: () => void) {
  const errorText = useWorkspaceError();
  const { request, refresh, notify } = useApp();
  const { locale } = useLocale();
  const copy = dashboardCopy[locale].onboarding;
  const [pending, setPending] = useState<{
    id: string;
    url: string;
    expires: number;
    operation: "connect" | "recharge";
  } | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<ConnectError | null>(null);
  const showResult = useRef<{
    success: (operation: "connect" | "recharge", result: ConnectResult) => void;
    failure: (failure: ConnectError) => void;
  }>({ success: () => {}, failure: () => {} });
  showResult.current = {
    success: (operation, { message, modelImport }) => {
      if (locale === "zh-CN" && message) return notify(message);
      if (operation === "recharge") return notify(copy.kimiseekRecharged);
      const details = [copy.kimiseekLinked];
      if (modelImport) {
        details.push(formatCopy(copy.kimiseekImported, { count: modelImport.imported }));
        if (modelImport.existing)
          details.push(formatCopy(copy.kimiseekExisting, { count: modelImport.existing }));
        if (modelImport.limited)
          details.push(formatCopy(copy.kimiseekLimited, { count: modelImport.limited }));
      }
      notify(details.join(" · "));
    },
    failure: (failure) => notify(connectErrorMessage(failure, locale), true),
  };
  const complete = useRef(onComplete);
  complete.current = onComplete;
  useEffect(() => {
    if (!pending) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const fail = (failure: ConnectError) => {
      setPending(null);
      setError(failure);
      showResult.current.failure(failure);
    };
    const poll = async () => {
      try {
        const result = await request<{
          status: string;
          message?: string;
          errorCode?: string;
          modelImport?: ModelImportResult;
        }>(`/kimiseek/status/${pending.id}`);
        if (stopped) return;
        if (result.status === "complete") {
          if (pending.operation === "connect") {
            trackFunnel("channel_saved", { provider: "kimiseek" });
            trackChannelModelImport("kimiseek", result.modelImport);
          }
          setPending(null);
          complete.current();
          await refresh();
          showResult.current.success(pending.operation, result);
          window.dispatchEvent(new Event("kimiseek-balance-refresh"));
          return;
        }
        if (result.status === "failed") {
          fail({
            message: result.message ?? dashboardCopy["zh-CN"].onboarding.kimiseekFailed,
            code: result.errorCode,
          });
          return;
        }
        if (Date.now() > pending.expires) {
          fail({ message: dashboardCopy["zh-CN"].onboarding.kimiseekTimeout, timedOut: true });
          return;
        }
        timer = setTimeout(() => void poll(), 1500);
      } catch (e) {
        if (!stopped)
          fail({ message: errorText(e), code: e instanceof ApiError ? e.code : undefined });
      }
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pending, request, refresh]);
  const start = async (operation: "connect" | "recharge") => {
    if (pending || starting) return;
    setError(null);
    const popup = window.open("about:blank", "_blank");
    if (popup) {
      popup.opener = null;
      popup.document.title = copy.kimiseekPopupTitle;
      popup.document.body.textContent = copy.kimiseekPopupBody;
    }
    setStarting(true);
    try {
      const result = await request<{ flowId: string; url: string }>(
        "/kimiseek/start",
        json({ operation }),
      );
      setPending({ id: result.flowId, url: result.url, expires: Date.now() + 300000, operation });
      if (popup) popup.location.replace(result.url);
    } catch (e) {
      popup?.close();
      const failure = {
        message: errorText(e),
        code: e instanceof ApiError ? e.code : undefined,
      };
      setError(failure);
      showResult.current.failure(failure);
    } finally {
      setStarting(false);
    }
  };
  return {
    busy: starting || Boolean(pending),
    start,
    pendingUrl: pending?.url,
    error: error ? connectErrorMessage(error, locale) : "",
    errorCode: error?.code,
  };
}

function connectErrorMessage(error: ConnectError, locale: keyof typeof dashboardCopy) {
  if (locale === "zh-CN") return error.message;
  const copy = dashboardCopy[locale].onboarding;
  if (error.code === "EMAIL_VERIFICATION_REQUIRED") return copy.kimiseekVerify;
  if (error.code === "EMAIL_DOMAIN_BLOCKED") return copy.kimiseekDomain;
  return error.timedOut ? copy.kimiseekTimeout : copy.kimiseekFailed;
}

export function KimiseekConnectError({ message, code }: { message: string; code?: string }) {
  const { locale } = useLocale();
  const copy = dashboardCopy[locale].onboarding;
  const policy = kimiseekEmailError(code);
  return (
    <span className="form-error" role="alert">
      {message}
      {policy && (
        <>
          {" "}
          <a className="text-link" href={policy.href} target="_blank" rel="noopener noreferrer">
            {policy.code === "EMAIL_VERIFICATION_REQUIRED" ? copy.verifyEmail : copy.manualSetup}
          </a>
        </>
      )}
    </span>
  );
}

export function KimiseekBalance({
  onRecharge,
  disabled,
}: {
  onRecharge: () => void;
  disabled: boolean;
}) {
  const copyText = useWorkspaceText();
  const { request } = useApp();
  const [balance, setBalance] = useState<{ amount: number; checkedAt: number } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      setBalance(await request("/kimiseek/balance"));
      setError("");
    } catch {
      setError(copyText("余额暂不可用"));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [request]);
  useEffect(() => {
    void refresh();
    const update = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener("focus", update);
    window.addEventListener("kimiseek-balance-refresh", update);
    const timer = setInterval(update, 60000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
      window.removeEventListener("kimiseek-balance-refresh", update);
    };
  }, [refresh]);
  return (
    <div className="kimiseek-balance">
      <div>
        <span>{copyText("KimiSeek 余额")}</span>
        <strong>
          {error || (balance ? `¥${balance.amount.toFixed(2)}` : copyText("读取中…"))}
        </strong>
      </div>
      <button
        className="icon-button"
        aria-label={copyText("刷新 KimiSeek 余额")}
        title={
          balance
            ? copyText("最近更新 {value0}", {
                value0: new Date(balance.checkedAt).toLocaleTimeString(),
              })
            : copyText("刷新余额")
        }
        disabled={loading}
        onClick={() => void refresh()}
      >
        {loading ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />}
      </button>
      <button className="text-button" disabled={disabled} onClick={onRecharge}>
        {copyText("充值 ")}
        <ExternalLink size={13} />
      </button>
    </div>
  );
}
