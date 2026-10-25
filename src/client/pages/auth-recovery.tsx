import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, Mail, KeyRound } from "lucide-react";
import { authClient, useAuth } from "../auth";
import { AuthLayout } from "../auth-layout";
import { api } from "../api";
import { trackFunnel } from "../analytics-client";
import {
  AUTH_EMAIL_COOLDOWN_SECONDS,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  authReturnPath,
  authErrorMessage,
  passwordValidationError,
} from "../../shared/auth";
import "./auth-recovery.css";

export function AuthEmailNotice() {
  const [delivery, setDelivery] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void api<{ delivery: string }>("/auth/email-config", { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setDelivery(result.delivery);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  if (delivery === "preview")
    return (
      <p className="auth-delivery-note">
        本地开发模式：邮件不会实际发送，验证或重置链接会输出到本地服务终端。
      </p>
    );
  if (delivery === "unavailable")
    return (
      <p className="form-error" role="alert">
        邮件服务暂时不可用，请稍后再试。
      </p>
    );
  return null;
}

export function verificationCallback(returnTo: string) {
  return `/verify-email?verified=1&returnTo=${encodeURIComponent(authReturnPath(returnTo))}`;
}

function useCooldown(initial: number) {
  const [remaining, setRemaining] = useState(initial);
  useEffect(() => {
    if (!remaining) return;
    const timer = window.setTimeout(() => setRemaining((n) => Math.max(0, n - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining]);
  return { remaining, restart: () => setRemaining(AUTH_EMAIL_COOLDOWN_SECONDS) };
}

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const { data: session } = useAuth();
  const returnTo = authReturnPath(params.get("returnTo"));
  const pending = location.state as { email?: string; sent?: boolean } | null;
  const [email, setEmail] = useState(typeof pending?.email === "string" ? pending.email : "");
  const [sent, setSent] = useState(Boolean(pending?.sent));
  const [busy, setBusy] = useState(false);
  const tokenError = params.get("error");
  const [error, setError] = useState(
    tokenError ? authErrorMessage({ code: tokenError.toUpperCase() }) : "",
  );
  const cooldown = useCooldown(pending?.sent ? AUTH_EMAIL_COOLDOWN_SECONDS : 0);
  const verified = params.get("verified") === "1" && !tokenError;
  // 验证成功落地页：这一跳是「注册漏斗」最关键的完成信号，页面本身没有别的动作可抓。
  useEffect(() => {
    if (verified) trackFunnel("verify_done");
  }, [verified]);
  async function resend(event: FormEvent) {
    event.preventDefault();
    if (busy || cooldown.remaining) return;
    setBusy(true);
    setError("");
    try {
      const result = await authClient.sendVerificationEmail({
        email: email.trim(),
        callbackURL: verificationCallback(returnTo),
      });
      if (result.error) {
        setError(authErrorMessage(result.error));
        if (result.error.status === 429) cooldown.restart();
        return;
      }
      setSent(true);
      cooldown.restart();
    } catch {
      setError("暂时无法发送邮件，请检查网络后重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout>
      {verified ? (
        <div className="auth-form auth-recovery">
          <div className="auth-recovery-icon">
            <Check size={25} />
          </div>
          <h1>邮箱验证成功</h1>
          <p>你的邮箱已验证，可以继续使用微伴。</p>
          <Link
            className="button full"
            to={session ? returnTo : `/login?returnTo=${encodeURIComponent(returnTo)}`}
          >
            {session ? "进入工作台" : "登录工作台"}
            <ArrowRight size={17} />
          </Link>
        </div>
      ) : (
        <form className="auth-form auth-recovery" onSubmit={(e) => void resend(e)}>
          <div className="auth-recovery-icon">
            <Mail size={25} />
          </div>
          <h1>{tokenError ? "重新验证邮箱" : "验证你的邮箱"}</h1>
          <p>
            {sent
              ? "请查看邮箱，按最新邮件中的提示完成验证；如果之前注册过，请通过邮件重新设置密码或登录。"
              : "验证邮箱后，就能登录工作台。请输入注册时填写的邮箱。"}
          </p>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <label>
            邮箱地址
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setSent(false);
              }}
              placeholder="you@example.com"
            />
          </label>
          {sent && (
            <div className="auth-success" role="status">
              请按邮件中的提示操作；已有未验证账号需要重新设置密码。也请检查垃圾邮件文件夹。
            </div>
          )}
          <button className="button full" disabled={busy || cooldown.remaining > 0}>
            {busy
              ? "正在发送…"
              : cooldown.remaining
                ? `${cooldown.remaining} 秒后可重发`
                : sent
                  ? "重新发送验证邮件"
                  : "发送验证邮件"}
          </button>
          <AuthEmailNotice />
          <p className="auth-switch">
            已经验证？<Link to={`/login?returnTo=${encodeURIComponent(returnTo)}`}>去登录</Link>
          </p>
          <p className="auth-switch">
            邮箱填错了？
            <Link to={`/register?returnTo=${encodeURIComponent(returnTo)}`}>重新注册</Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [params] = useSearchParams();
  const returnTo = authReturnPath(params.get("returnTo"));
  const cooldown = useCooldown(0);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || cooldown.remaining) return;
    setBusy(true);
    setError("");
    try {
      const response = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: `/reset-password?returnTo=${encodeURIComponent(returnTo)}`,
      });
      if (response.error) {
        setError(authErrorMessage(response.error));
        if (response.error.status === 429) cooldown.restart();
        return;
      }
      setSent(true);
      cooldown.restart();
    } catch {
      setError("暂时无法发送邮件，请检查网络后重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout>
      <form className="auth-form auth-recovery" onSubmit={(e) => void submit(e)}>
        <div className="auth-recovery-icon">
          <KeyRound size={25} />
        </div>
        <h1>找回密码</h1>
        <p>填写注册邮箱，我们会发送重置密码的链接。链接在 30 分钟内有效。</p>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <label>
          邮箱地址
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setSent(false);
            }}
            placeholder="you@example.com"
          />
        </label>
        {sent && (
          <div className="auth-success" role="status">
            如果该邮箱已注册，你会收到重置邮件。没有收到的话，也请检查垃圾邮件文件夹。
          </div>
        )}
        <button className="button full" disabled={busy || cooldown.remaining > 0}>
          {busy
            ? "正在发送…"
            : cooldown.remaining
              ? `${cooldown.remaining} 秒后可重发`
              : sent
                ? "重新发送"
                : "发送重置邮件"}
          <ArrowRight size={17} />
        </button>
        <AuthEmailNotice />
        <p className="auth-switch">
          <Link to={`/login?returnTo=${encodeURIComponent(returnTo)}`}>返回登录</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const [params, setParams] = useSearchParams();
  const recovery = params.get("recovery") === "1";
  const [token] = useState(() => params.get("token") || "");
  const returnTo = authReturnPath(params.get("returnTo"));
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState(!token || Boolean(params.get("error")));
  const [error, setError] = useState("");
  const { refetch } = useAuth();
  useEffect(() => {
    if (done && params.has("token")) {
      const clean = new URLSearchParams(params);
      clean.delete("token");
      setParams(clean, { replace: true });
    }
  }, [done, params, setParams]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || done) return;
    const message = passwordValidationError(password, confirm);
    if (message) {
      setError(message);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await authClient.resetPassword({ token, newPassword: password });
      if (response.error) {
        setError(authErrorMessage(response.error));
        if (["INVALID_TOKEN", "TOKEN_EXPIRED"].includes(response.error.code || ""))
          setInvalid(true);
        return;
      }
      setDone(true);
      setPassword("");
      setConfirm("");
      void refetch();
    } catch {
      setError("暂时无法保存密码，请检查网络后重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout>
      <form className="auth-form auth-recovery" onSubmit={(e) => void submit(e)}>
        <div className="auth-recovery-icon">
          {done ? <Check size={25} /> : <KeyRound size={25} />}
        </div>
        <h1>
          {done
            ? "密码已更新"
            : invalid
              ? "重置链接已失效"
              : recovery
                ? "确认邮箱并设置密码"
                : "设置新密码"}
        </h1>
        <p>
          {done
            ? "旧的登录会话已退出。请使用新密码重新登录。"
            : invalid
              ? "链接可能已过期或使用过，请重新发送重置邮件。"
              : recovery
                ? "请在这里重新设置密码。保存后完成邮箱验证，并替换此前注册时设置的密码。"
                : "请设置 10–128 个字符的密码，并再次输入确认。"}
        </p>
        {error && !invalid && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        {done ? (
          <Link className="button full" to={`/login?returnTo=${encodeURIComponent(returnTo)}`}>
            重新登录
            <ArrowRight size={17} />
          </Link>
        ) : invalid ? (
          <Link
            className="button full"
            to={`/forgot-password?returnTo=${encodeURIComponent(returnTo)}`}
          >
            重新发送邮件
          </Link>
        ) : (
          <>
            <label>
              新密码
              <input
                type="password"
                required
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 10 个字符"
              />
            </label>
            <label>
              确认新密码
              <input
                type="password"
                required
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="再次输入新密码"
              />
            </label>
            <button className="button full" disabled={busy}>
              {busy ? "正在保存…" : "保存新密码"}
              <ArrowRight size={17} />
            </button>
          </>
        )}
      </form>
    </AuthLayout>
  );
}
