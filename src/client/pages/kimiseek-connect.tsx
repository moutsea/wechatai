import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";
import { useApp } from "../context";
import { json } from "../api";
import { trackChannelModelImport, trackFunnel } from "../analytics-client";
import type { ModelImportResult } from "../../shared/types";

export function useKimiseekConnect(onComplete: () => void) {
  const { request, refresh, notify } = useApp();
  const [pending, setPending] = useState<{
    id: string;
    url: string;
    expires: number;
    operation: "connect" | "recharge";
  } | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const complete = useRef(onComplete);
  complete.current = onComplete;
  useEffect(() => {
    if (!pending) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await request<{
          status: string;
          message?: string;
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
          notify(result.message ?? "KimiSeek 已关联");
          window.dispatchEvent(new Event("kimiseek-balance-refresh"));
          return;
        }
        if (result.status === "failed") throw new Error(result.message ?? "关联未完成，请重试");
        if (Date.now() > pending.expires) throw new Error("关联已超时，请重新点击导入");
        timer = setTimeout(() => void poll(), 1500);
      } catch (e) {
        if (!stopped) {
          setPending(null);
          setError((e as Error).message);
          notify((e as Error).message, true);
        }
      }
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pending, request, refresh, notify]);
  const start = async (operation: "connect" | "recharge") => {
    setError("");
    if (pending || starting) return;
    const popup = window.open("about:blank", "_blank");
    if (popup) {
      popup.opener = null;
      popup.document.title = "正在连接 KimiSeek…";
      popup.document.body.textContent = "正在连接 KimiSeek，请稍候…";
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
      setError((e as Error).message);
      notify((e as Error).message, true);
    } finally {
      setStarting(false);
    }
  };
  return { busy: starting || Boolean(pending), start, pendingUrl: pending?.url, error };
}

export function KimiseekBalance({
  onRecharge,
  disabled,
}: {
  onRecharge: () => void;
  disabled: boolean;
}) {
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
      setError("余额暂不可用");
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
        <span>KimiSeek 余额</span>
        <strong>{error || (balance ? `¥${balance.amount.toFixed(2)}` : "读取中…")}</strong>
      </div>
      <button
        className="icon-button"
        aria-label="刷新 KimiSeek 余额"
        title={
          balance ? `最近更新 ${new Date(balance.checkedAt).toLocaleTimeString()}` : "刷新余额"
        }
        disabled={loading}
        onClick={() => void refresh()}
      >
        {loading ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />}
      </button>
      <button className="text-button" disabled={disabled} onClick={onRecharge}>
        充值 <ExternalLink size={13} />
      </button>
    </div>
  );
}
