import { useEffect, useRef, useState } from "react";
import { AUTH_EMAIL_TOKEN_HEADER, type AuthEmailAction } from "../../shared/auth";
import { api } from "../api";
import { loadTurnstile } from "../turnstile";

export function useAuthEmailChallenge(action: AuthEmailAction, enabled = true) {
  const container = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  function restart() {
    setToken(null);
    setError("");
    setLoading(true);
    setAttempt((previous) => previous + 1);
  }

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const { signal } = controller;
    let removeWidget: (() => void) | undefined;
    const failed = () => {
      if (signal.aborted) return;
      setLoading(false);
      setToken(null);
      setError("暂时无法完成人机验证，请重试。");
    };
    async function start() {
      const config = await api<{ delivery: string; siteKey?: string }>("/auth/email-config", {
        signal,
      });
      if (signal.aborted) return;
      if (config.delivery === "preview") {
        setToken("");
        setLoading(false);
        return;
      }
      if (config.delivery !== "email" || !config.siteKey) {
        setError("邮件服务暂时不可用，请稍后重试。");
        setLoading(false);
        return;
      }
      const widget = await loadTurnstile();
      if (signal.aborted || !container.current) return;
      const id = widget.render(container.current, {
        sitekey: config.siteKey,
        action,
        size: "flexible",
        callback: (value) => {
          if (signal.aborted) return;
          setError("");
          setToken(value || null);
        },
        "expired-callback": () => {
          if (signal.aborted) return;
          setToken(null);
          setError("人机验证已过期，请重新验证。");
        },
        "timeout-callback": failed,
        "error-callback": failed,
      });
      removeWidget = () => widget.remove(id);
      setLoading(false);
    }
    void start().catch(failed);
    return () => {
      controller.abort();
      removeWidget?.();
    };
  }, [enabled, action, attempt]);

  const headers: Record<string, string> = token ? { [AUTH_EMAIL_TOKEN_HEADER]: token } : {};
  const field = enabled && (
    <div>
      <div ref={container} />
      {loading && (
        <p className="auth-delivery-note" role="status">
          正在加载人机验证…
        </p>
      )}
      {token === "" && (
        <p className="auth-delivery-note">本地开发模式：邮件链接会输出到本地服务终端。</p>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}{" "}
          <button className="text-button" type="button" onClick={restart}>
            重新加载
          </button>
        </div>
      )}
    </div>
  );
  return {
    field,
    ready: token !== null,
    headers,
    reset: () => {
      if (token) restart();
    },
  };
}
