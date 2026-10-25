import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ShieldCheck,
  Sparkles,
  MessagesSquare,
  Sprout,
  KeyRound,
  ChevronLeft,
  ChevronDown,
  Ellipsis,
  UserRound,
  AudioLines,
  Smile,
  CirclePlus,
  MessageSquareText,
} from "lucide-react";
import { SiteHeader } from "./site-header";
import { LandingSteps } from "./landing-steps";
import { SiteFooter } from "./site-footer";
import { LANDING_FAQ } from "../shared/landing-faq";
import { DAILY_CREDIT_DEFAULTS } from "../shared/credits";
import { PLUGIN_LIMITS } from "../shared/plugin-access";
import { WECHAT_LINK_LIMITS } from "../shared/wechat-links";
import { PLUS_MONTHLY_YUAN } from "../shared/pricing-copy";
import { browserPageViewReporter, trackFunnel } from "./analytics-client";
import { ANALYTICS_SESSION_HEADER } from "../shared/analytics";
import { api } from "./api";
import { authClient, useAuth } from "./auth";
import {
  authReturnPath,
  authErrorMessage,
  passwordValidationError,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "../shared/auth";
import { AuthLayout } from "./auth-layout";
import { AuthEmailNotice, verificationCallback } from "./pages/auth-recovery";
type LoginProvider = "google" | "github";
const providerNames = { google: "Google", github: "GitHub" };
// 首页价格锚只显示月付价；与 BILLING_OFFERS 的一致性由 test/seo.test.ts 断言保证。
const plusMonthlyYuan = String(PLUS_MONTHLY_YUAN);
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
function StartLink({
  className,
  children,
  authenticatedTo = "/app",
}: {
  className: string;
  children: ReactNode;
  authenticatedTo?: string;
}) {
  const { data: session, isPending } = useAuth();
  if (isPending)
    return (
      <button className={className} disabled aria-busy="true">
        正在加载…
      </button>
    );
  return (
    <Link className={className} to={session ? authenticatedTo : "/register"}>
      {children}
    </Link>
  );
}
export function Landing() {
  const { data: session } = useAuth();
  return (
    <div className="landing">
      <SiteHeader />
      <main>
        <section className="landing-hero">
          <div className="landing-copy">
            <span className="eyebrow">
              <span className="tiny-dot" /> WECHAT AI · YOUR MODELS, IN WECHAT
            </span>
            <h1>
              把你的 AI <span>接入微信</span>
            </h1>
            <p>
              用自己的 API Key 和服务地址，开启微信 AI 对话。
              <br />
              连接喜欢的大模型，随时切换，继续你的话题。
            </p>
            <div className="hero-actions">
              <StartLink className="button" authenticatedTo="/app/channels">
                {session ? "配置我的模型" : "连接我的大模型"}
                <ArrowRight size={18} />
              </StartLink>
              <Link className="text-link" to="/demo">
                先看看工作台
                <ArrowUpRight size={16} />
              </Link>
            </div>
            <div className="hero-trust">
              <span>
                <Check size={14} />
                自定义渠道与模型
              </span>
              <span>
                <Check size={14} />
                微信内随时切换
              </span>
              <span>
                <Check size={14} />
                每日免费额度
              </span>
            </div>
          </div>
          <div
            className="conversation-illustration"
            role="img"
            aria-label="微信对话示意：使用自己的 API Key 连接大模型，在 DeepSeek、Claude、GPT 等模型之间按需切换。"
          >
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <span className="floating-label">
              <KeyRound size={17} />
              使用自己的 API Key
            </span>
            <div className="illustration-window">
              <div className="illustration-window-top">
                <ChevronLeft size={23} />
                <strong>微伴</strong>
                <Ellipsis size={23} />
              </div>
              <div className="illustration-messages">
                <div className="illustration-date">微信对话示意 · 14:28</div>
                <div className="illustration-message outgoing">
                  <div className="illustration-bubble">帮我把会议记录整理成待办清单。</div>
                  <span className="illustration-avatar person">
                    <UserRound size={23} />
                  </span>
                </div>
                <div className="illustration-message incoming">
                  <span className="illustration-avatar assistant">
                    <Sprout size={23} />
                  </span>
                  <div className="illustration-reply">
                    <span className="illustration-model-name">微伴 · DeepSeek</span>
                    <div className="illustration-bubble">
                      可以，把会议记录发给我。
                      <br />
                      <br />
                      我会按任务、负责人和截止时间整理，方便你逐项跟进。
                    </div>
                  </div>
                </div>
              </div>
              <div className="illustration-input">
                <span className="illustration-voice">
                  <AudioLines size={17} />
                </span>
                <span className="illustration-input-field">发消息…</span>
                <Smile size={24} />
                <CirclePlus size={24} />
              </div>
            </div>
            <div className="floating-models">
              <span>同一微信，按需切换模型</span>
              <strong>
                DeepSeek <i>·</i> Claude <i>·</i> GPT
              </strong>
            </div>
          </div>
        </section>
        <section className="landing-strip">
          <span>支持常见 LLM 协议</span>
          <strong>
            <MessagesSquare size={20} aria-hidden="true" />
            OpenAI Chat Completions
          </strong>
          <strong>
            <Sparkles size={20} aria-hidden="true" />
            OpenAI Responses
          </strong>
          <strong>
            <MessageSquareText size={20} aria-hidden="true" />
            Anthropic Messages
          </strong>
        </section>
        <LandingSteps />
        <section className="landing-preview" aria-labelledby="landing-preview-title">
          <div className="landing-preview-copy">
            <p className="eyebrow">工作台</p>
            <h2 id="landing-preview-title">配置在网页，聊天在微信</h2>
            <p>
              模型渠道、插件、微信链接、额度与记录都在同一个页面里；改完即时生效，
              手机上不用装任何东西，微信那边照常说话就行。
            </p>
            <div className="landing-preview-actions">
              <Link className="button secondary" to="/demo">
                打开演示工作台
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <p className="landing-preview-note">演示里是可点的真实界面，数据是假的，不用注册。</p>
          </div>
          <figure className="landing-preview-shot">
            <img
              src="/images/workspace-overview.jpg"
              width={1440}
              height={900}
              loading="lazy"
              decoding="async"
              alt="微伴工作台概览页：左侧导航是渠道与模型、插件、微信连接、会话记录；右侧是会员、可用额度、渠道数与对话数四张统计卡，下方是模型渠道卡片和微信链接状态。"
            />
          </figure>
        </section>
        <section className="landing-guides" aria-labelledby="landing-guides-title">
          <h2 id="landing-guides-title">按你的问题找入口</h2>
          <div className="landing-guides-grid">
            <Link to="/wechat-ai">
              <strong>微信 AI 能做什么</strong>
              <span>能对话、生图、接 Agent 的完整能力清单</span>
            </Link>
            <Link to="/wechat-clawbot">
              <strong>ClawBot 插件在哪、不回复怎么办</strong>
              <span>入口位置、扫一扫绑定步骤与五类排查</span>
            </Link>
            <Link to="/bring-your-own-api-key">
              <strong>用自己的 API Key</strong>
              <span>不卖 token 的中转方式，Key 存哪、账单谁付</span>
            </Link>
            <Link to="/wechat-deepseek">
              <strong>在微信里用 DeepSeek</strong>
              <span>托管聊天与本机 Agent 的配置、费用对比</span>
            </Link>
            <Link to="/wechat-agent">
              <strong>在微信里接 Agent</strong>
              <span>OpenClaw、Hermes 与主动推送</span>
            </Link>
            <Link to="/wechat-ai-options">
              <strong>先对比几种方案</strong>
              <span>官方内置、商业平台、开源自建与自带 Key</span>
            </Link>
          </div>
          <p className="landing-guides-more">
            也可以直接看 <Link to="/pricing">价格与免费额度</Link>，或从
            <Link to="/docs">文档中心</Link>开始配置。
          </p>
          <ul className="landing-guides-tags" aria-label="更多主题">
            <li>
              <Link to="/wechat-ai-partner">微信 AI 搭档</Link>
            </li>
            <li>
              <Link to="/wechat-character-card">微信聊天人物卡</Link>
            </li>
            <li>
              <Link to="/wechat-bot">微信机器人</Link>
            </li>
            <li>
              <Link to="/wechat-ai-image">微信 AI 生图</Link>
            </li>
            <li>
              <Link to="/wechat-ai-privacy">微信 AI 隐私</Link>
            </li>
          </ul>
        </section>
        <section className="landing-pricing" aria-labelledby="landing-pricing-title">
          <div className="landing-pricing-head">
            <h2 id="landing-pricing-title">免费能用到什么程度</h2>
            <p>不卖 token：模型费付给你的服务商，我们只收消息中转的 credits。</p>
          </div>
          <div className="landing-pricing-grid">
            <div className="landing-plan">
              <p className="landing-plan-name">免费版</p>
              <p className="landing-plan-price">
                <strong>¥0</strong>
                <span>永久免费</span>
              </p>
              <ul>
                <li>
                  <Check size={14} aria-hidden="true" />每天 {DAILY_CREDIT_DEFAULTS.free} credits
                </li>
                <li>
                  <Check size={14} aria-hidden="true" />
                  {WECHAT_LINK_LIMITS.free} 个微信链接
                </li>
                <li>
                  <Check size={14} aria-hidden="true" />
                  {PLUGIN_LIMITS.free} 个插件
                </li>
              </ul>
            </div>
            <div className="landing-plan landing-plan-plus">
              <p className="landing-plan-name">Plus</p>
              <p className="landing-plan-price">
                <strong>¥{plusMonthlyYuan}</strong>
                <span>/ 月起</span>
              </p>
              <ul>
                <li>
                  <Check size={14} aria-hidden="true" />每天 {DAILY_CREDIT_DEFAULTS.plus} credits
                </li>
                <li>
                  <Check size={14} aria-hidden="true" />
                  {WECHAT_LINK_LIMITS.plus} 个微信链接
                </li>
                <li>
                  <Check size={14} aria-hidden="true" />
                  插件不限 + 附件
                </li>
              </ul>
            </div>
          </div>
          <p className="landing-pricing-more">
            <Link to="/pricing">
              看完整价格与额度明细
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </p>
        </section>
        <section className="landing-faq" aria-labelledby="landing-faq-title">
          <h2 id="landing-faq-title">常见问题</h2>
          <div className="landing-faq-list">
            {LANDING_FAQ.map((item) => (
              <details key={item.question}>
                <summary>
                  {item.question}
                  <ChevronDown size={16} aria-hidden="true" />
                </summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
          <p className="landing-faq-more">
            更多问题见<Link to="/docs/faq">常见问题文档</Link>。
          </p>
        </section>
        <section className="landing-cta">
          <Sprout size={30} />
          <h2>免费使用，马上开始</h2>
          <StartLink className="button">
            免费开始
            <ArrowRight size={18} />
          </StartLink>
          <p>
            免费版每天 {DAILY_CREDIT_DEFAULTS.free} credits；模型调用费用由你的 API 供应商另行收取。
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
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
        : await authClient.signIn.email({ email: email.trim(), password });
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
      navigate(returnTo, { replace: true });
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
        <p>{register ? "创建账户，连接你的第一个模型。" : "你的模型和未完的对话，都在这里。"}</p>
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
        <Link className="demo-link" to="/demo">
          暂不注册，先浏览界面预览
          <ArrowUpRight size={14} />
        </Link>
      </form>
    </AuthLayout>
  );
}
