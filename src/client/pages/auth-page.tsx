import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { DAILY_CREDIT_DEFAULTS } from "../../shared/credits";
import { ANALYTICS_SESSION_HEADER } from "../../shared/analytics";
import {
  authReturnPath,
  authErrorMessage,
  passwordValidationError,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "../../shared/auth";
import { browserPageViewReporter, trackFunnel } from "../analytics-client";
import { api } from "../api";
import { authClient, useAuth } from "../auth";
import { AuthLayout } from "../auth-layout";
import { AuthEmailNotice, verificationCallback } from "./auth-recovery";
type LoginProvider = "google" | "github";
const providerNames = { google: "Google", github: "GitHub" };
function oauthError(code: string | null) {
  if (!code) return "";
  return (
    (
      {
        access_denied: "授权已取消，你可以重试或使用邮箱登录。",
        account_not_linked: "该邮箱已有账户，请使用原来的登录方式。",
        email_not_found: "未能获取账户邮箱，请确认已允许读取邮箱后重试。",
        email_not_verified: "请先在登录平台验证你的邮箱，再回来重试。",
        state_mismatch: "登录请求已过期或已失效，请重新开始登录。",
        state_not_found: "登录请求已过期，请重新开始登录。",
        oauth_provider_not_found: "此登录方式暂时不可用，请使用邮箱登录。",
      } as Record<string, string>
    )[code] || "快捷登录未完成，请重试或使用邮箱登录。"
  );
}
function ProviderIcon({ provider }: { provider: LoginProvider }) {
  return provider === "google" ? (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.03v2.52h3.24c1.9-1.75 2.98-4.33 2.98-7.38Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.9 6.62-2.39l-3.24-2.52c-.9.6-2.05.97-3.38.97-2.6 0-4.8-1.76-5.59-4.12H3.07v2.6A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.41 13.94a6 6 0 0 1 0-3.88v-2.6H3.07a10 10 0 0 0 0 9.08l3.34-2.6Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.94c1.47 0 2.78.5 3.82 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.46l3.34 2.6A5.98 5.98 0 0 1 12 5.94Z"
      />
    </svg>
  ) : (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .75a11.25 11.25 0 0 0-3.56 21.92c.56.1.77-.24.77-.54v-2.1c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.03-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1.01 1.72 2.64 1.22 3.29.93.1-.73.4-1.22.71-1.5-2.5-.28-5.13-1.25-5.13-5.56 0-1.23.44-2.23 1.16-3.02-.12-.28-.5-1.43.11-2.98 0 0 .95-.3 3.1 1.15a10.8 10.8 0 0 1 5.64 0c2.15-1.46 3.1-1.15 3.1-1.15.61 1.55.23 2.7.11 2.98.72.79 1.16 1.79 1.16 3.02 0 4.32-2.63 5.27-5.14 5.55.4.35.76 1.03.76 2.08v3.11c0 .3.2.65.78.54A11.25 11.25 0 0 0 12 .75Z" />
    </svg>
  );
}
export function AuthPage({ register = false }: { register?: boolean }) {
  const { data: session, isPending, error, refetch } = useAuth();
  const [params] = useSearchParams();
  const returnTo = authReturnPath(params.get("returnTo"));
  if (isPending)
    return (
      <div className="full-state" role="status">
        <span className="spinner" />
        <p>正在确认登录状态…</p>
      </div>
    );
  if (error)
    return (
      <div className="full-state" role="alert">
        <h2>暂时无法确认登录状态</h2>
        <p>请稍后重试。</p>
        <button className="button" onClick={() => void refetch()}>
          重新加载
        </button>
      </div>
    );
  if (session) return <Navigate to={returnTo} replace />;
  return <AuthForm key={register ? "register" : "login"} register={register} />;
}
function AuthForm({ register }: { register: boolean }) {
  const { completeSignIn } = useAuth();
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  // 只在实际展示注册表单时记录，排除会话加载、失败和已登录跳转。
  const viewReported = useRef(false);
  useEffect(() => {
    if (!register || viewReported.current) return;
    viewReported.current = true;
    trackFunnel("register_view");
  }, [register]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<LoginProvider[] | null>(null);
  const [socialBusy, setSocialBusy] = useState<LoginProvider | null>(null);
  const [providerFailure, setProviderFailure] = useState(false);
  const [invited, setInvited] = useState(false);
  const [error, setError] = useState("");
  const [params] = useSearchParams();
  const returnTo = authReturnPath(params.get("returnTo"));
  const returnQuery = returnTo === "/app" ? "" : `?returnTo=${encodeURIComponent(returnTo)}`;
  const errorCode = params.get("error");
  const navigate = useNavigate();
  useEffect(() => setError(oauthError(errorCode)), [errorCode]);
  useEffect(() => {
    const controller = new AbortController();
    void api<{ active: boolean }>("/referrals/attribution", { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setInvited(result.active);
      })
      .catch(() => {});
    void api<{ providers: LoginProvider[] }>("/auth/providers", { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setProviders(data.providers);
      })
      .catch(() => {
        if (!controller.signal.aborted) setProviderFailure(true);
      });
    return () => controller.abort();
  }, []);
  const startSocial = async (provider: LoginProvider) => {
    if (!providers?.includes(provider) || busy || socialBusy !== null) return;
    trackFunnel("oauth_click", { provider });
    setSocialBusy(provider);
    setError("");
    try {
      const response = await authClient.signIn.social({
        provider,
        callbackURL: returnTo,
        newUserCallbackURL: returnTo,
        errorCallbackURL: `/login${returnQuery}`,
        additionalData: browserPageViewReporter().signupAttribution(),
      });
      if (response.error || !response.data?.url)
        throw new Error("快捷登录暂时不可用，请稍后重试或使用邮箱登录。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "登录未完成，请重试。");
      setSocialBusy(null);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || socialBusy) return;
    if (register) {
      const message = passwordValidationError(password, confirmation);
      if (message) {
        setError(message);
        return;
      }
      if (!name.trim()) {
        setError("请输入你的名字。");
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      if (register) trackFunnel("signup_submit");
      const attribution = register ? browserPageViewReporter().signupAttribution() : {};
      const response = register
        ? await authClient.signUp.email({
            name: name.trim(),
            email: email.trim(),
            password,
            callbackURL: verificationCallback(returnTo),
            fetchOptions: {
              headers: attribution.analyticsSessionId
                ? { [ANALYTICS_SESSION_HEADER]: attribution.analyticsSessionId }
                : {},
            },
          })
        : await authClient.signIn.email({
            email: email.trim(),
            password,
            fetchOptions: { disableSignal: true },
          });
      if (response.error) {
        if (response.error.code === "EMAIL_NOT_VERIFIED") {
          navigate(`/verify-email?returnTo=${encodeURIComponent(returnTo)}`, {
            state: { email: email.trim() },
          });
          return;
        }
        throw new Error(authErrorMessage(response.error));
      }
      if (register) {
        trackFunnel("verify_sent");
        setPassword("");
        setConfirmation("");
        navigate(`/verify-email?returnTo=${encodeURIComponent(returnTo)}`, {
          state: { email: email.trim(), sent: true },
        });
        return;
      }
      if (!response.data?.token) throw new Error("暂时无法确认新的登录会话，请重新登录。");
      await completeSignIn({ userId: response.data.user.id, token: response.data.token });
      if (active.current) navigate(returnTo, { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={(e) => void submit(e)}>
        <span className="eyebrow">YOUR PERSONAL AI SPACE</span>
        <h1>{register ? "从这里，开启微伴。" : "欢迎回来。"}</h1>
        <p>
          {register
            ? `创建账户后按指引配置。每天 ${DAILY_CREDIT_DEFAULTS.free} credits 免费，不绑卡。`
            : "你的模型和未完的对话，都在这里。"}
        </p>
        {register && (
          <p className="auth-policies">
            注册前请先<Link to="/wechat-clawbot">检查手机微信 ClawBot 入口</Link>。聊模型需自备
            Key，服务商费用另计；没有入口时可先<Link to="/#try">体验模拟预览</Link>。
          </p>
        )}
        <p className="auth-policies">
          注册或使用前，请阅读<Link to="/terms">服务协议</Link>和<Link to="/privacy">隐私政策</Link>
          。
        </p>
        {invited && (
          <div className="auth-invitation">
            你已接受好友邀请。新用户注册后，完成首次微信 AI 对话，你和好友各得{" "}
            <strong>500 credits</strong>，永久有效。
          </div>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="social-logins" aria-label="快捷登录">
          {(["google", "github"] as const).map((provider) => (
            <button
              className="button secondary social-login"
              type="button"
              key={provider}
              disabled={!providers?.includes(provider) || busy || socialBusy !== null}
              onClick={() => void startSocial(provider)}
            >
              <ProviderIcon provider={provider} />
              <span>
                {socialBusy === provider ? "正在前往授权…" : `使用 ${providerNames[provider]} 继续`}
              </span>
              {!providers?.includes(provider) && (
                <small className="social-login-status">
                  {providerFailure ? "暂不可用" : providers === null ? "正在检查…" : "暂未开放"}
                </small>
              )}
            </button>
          ))}
        </div>
        {(providerFailure || providers?.length === 0) && (
          <p className="auth-provider-notice" role="status">
            {providerFailure
              ? "快捷登录暂时不可用，可以继续使用邮箱。"
              : "第三方登录暂未开放，可以先使用邮箱。"}
          </p>
        )}
        <div className="auth-divider">
          <span>或使用邮箱{register ? "注册" : "登录"}</span>
        </div>
        {register && (
          <label>
            怎么称呼你
            <input
              autoComplete="name"
              required
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="你的名字"
            />
          </label>
        )}
        <label>
          邮箱地址
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label>
          密码
          <input
            type="password"
            minLength={register ? PASSWORD_MIN_LENGTH : undefined}
            maxLength={register ? PASSWORD_MAX_LENGTH : undefined}
            required
            autoComplete={register ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={register ? "至少 10 个字符" : "输入你的密码"}
          />
        </label>
        {register && (
          <label>
            确认密码
            <input
              type="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder="再次输入密码"
            />
          </label>
        )}
        {!register && (
          <div className="auth-forgot">
            <Link to={`/forgot-password${returnQuery}`}>忘记密码？</Link>
          </div>
        )}
        <button className="button full" disabled={busy || socialBusy !== null}>
          {busy ? "请稍候…" : register ? "注册并验证邮箱" : "登录工作台"}
          <ArrowRight size={17} />
        </button>
        {register && <AuthEmailNotice />}
        <p className="auth-switch">
          {register ? "已经有账户了？" : "第一次来到微伴？"}
          <Link to={`${register ? "/login" : "/register"}${returnQuery}`}>
            {register ? "去登录" : "免费注册"}
          </Link>
        </p>
        <div className="auth-note">
          <ShieldCheck size={16} />
          <span>API Key 加密保存在服务端，仅在调用你的模型时使用。</span>
        </div>
      </form>
    </AuthLayout>
  );
}
