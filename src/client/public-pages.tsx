import { ArrowRight, Check, ChevronDown, Minus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { DAILY_CREDIT_DEFAULTS } from "../shared/credits";
import { LANDING_FAQ } from "../shared/landing-faq";
import { PLUGIN_LIMITS } from "../shared/plugin-access";
import { PLUS_MONTHLY_YUAN, PLUS_YEARLY_YUAN, approxYuan } from "../shared/pricing-copy";
import { WECHAT_LINK_LIMITS } from "../shared/wechat-links";
import { authReturnPath } from "../shared/auth";
import { trackFunnel } from "./analytics-client";
import { useAuth } from "./auth";
import { LandingSteps } from "./landing-steps";
import { LandingUseCases } from "./landing-use-cases";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
const landingPlans = [
  {
    id: "free",
    name: "免费版",
    description: "从日常问答开始",
    price: 0,
    unit: "永久免费",
    note: "无需购买会员，即可开始使用",
    badge: "基础体验",
    action: "免费开始",
  },
  {
    id: "month",
    name: "Plus 月付",
    description: "更多额度，更多可能",
    price: PLUS_MONTHLY_YUAN,
    unit: "/ 月",
    note: "按月购买，按需续费",
    badge: "灵活选择",
    action: "选择月付 Plus",
  },
  {
    id: "year",
    name: "Plus 年付",
    description: "每天都有 AI 相伴",
    price: PLUS_YEARLY_YUAN,
    unit: "/ 年",
    note: `折合约 ${approxYuan((PLUS_YEARLY_YUAN * 100) / 12)} / 月`,
    badge: `比按月买省 ¥${Number((PLUS_MONTHLY_YUAN * 12 - PLUS_YEARLY_YUAN).toFixed(1))}`,
    action: "选择年付 Plus",
  },
] as const;

function LandingPlanFeatures({ plus }: { plus: boolean }) {
  return (
    <ul>
      <li>
        <Check size={16} aria-hidden="true" />
        <span>
          每天 <strong>{DAILY_CREDIT_DEFAULTS[plus ? "plus" : "free"]}</strong> credits
        </span>
      </li>
      <li>
        <Check size={16} aria-hidden="true" />
        <span>
          <strong>{WECHAT_LINK_LIMITS[plus ? "plus" : "free"]}</strong> 个微信连接
        </span>
      </li>
      <li>
        <Check size={16} aria-hidden="true" />
        <span>
          {plus ? (
            <>
              插件配置 <strong>不限</strong>
            </>
          ) : (
            <>
              <strong>{PLUGIN_LIMITS.free}</strong> 个插件配置
            </>
          )}
        </span>
      </li>
      <li className={plus ? undefined : "landing-plan-unavailable"}>
        {plus ? <Check size={16} aria-hidden="true" /> : <Minus size={16} aria-hidden="true" />}
        <span>{plus ? "支持图片与文件输入" : "暂不支持图片与文件输入"}</span>
      </li>
      <li className={plus ? "landing-plan-xiaowei" : "landing-plan-unavailable"}>
        {plus ? (
          <>
            <img
              src="/images/plugins/xiaowei-96.webp"
              width={26}
              height={26}
              alt=""
              loading="lazy"
            />
            <Link to="/docs/cloud-agent">
              <strong>小薇 AI</strong> 云端助手
            </Link>
          </>
        ) : (
          <>
            <Minus size={16} aria-hidden="true" />
            <span>不含小薇 AI</span>
          </>
        )}
      </li>
    </ul>
  );
}
function StartLink({
  className,
  children,
  authenticatedTo = "/app",
  onClick,
}: {
  className: string;
  children: ReactNode;
  authenticatedTo?: string;
  onClick?: () => void;
}) {
  const { data: session } = useAuth();
  const destination = authReturnPath(authenticatedTo);
  return (
    <Link
      className={className}
      to={session ? destination : `/register?returnTo=${encodeURIComponent(destination)}`}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}
function LandingPlanCard({
  plan,
  id = plan.id,
  className = "",
  children,
}: {
  plan: (typeof landingPlans)[number];
  id?: string;
  className?: string;
  children?: ReactNode;
}) {
  const { data: session } = useAuth();
  return (
    <article
      className={`landing-plan landing-plan-${plan.id}${plan.id === "free" ? "" : " landing-plan-plus"} ${className}`}
      aria-labelledby={`landing-plan-${id}-title`}
    >
      {children}
      <header>
        <span className="landing-plan-badge">{plan.badge}</span>
        <h3 id={`landing-plan-${id}-title`}>{plan.name}</h3>
        <p className="landing-plan-description">{plan.description}</p>
        <p className="landing-plan-price">
          <strong>¥{plan.price}</strong>
          <span>{plan.unit}</span>
        </p>
        <p className="landing-plan-note">{plan.note}</p>
      </header>
      <LandingPlanFeatures plus={plan.id !== "free"} />
      {plan.id === "free" ? (
        <StartLink className="button secondary landing-plan-action">
          {session ? "进入工作台" : plan.action}
          <ArrowRight size={17} aria-hidden="true" />
        </StartLink>
      ) : (
        <Link
          className="button landing-plan-action"
          to={`/pricing?interval=${plan.id}#plans-title`}
        >
          {plan.action}
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
      )}
    </article>
  );
}

export function Landing() {
  const [mobileInterval, setMobileInterval] = useState<"month" | "year">("year");
  const { data: session } = useAuth();
  return (
    <div className="landing">
      <SiteHeader />
      <main>
        <section className="landing-hero">
          <div className="landing-copy">
            <h1>
              把你的 AI，<span>接入微信</span>
            </h1>
            <p>
              微伴将模型与 Agent 接入微信，支持聊天、生图，以及云端助手小薇的文件与任务处理。
              DeepSeek、Claude、GPT、Muse、Hermes、OpenClaw，一个账号按需连接。
            </p>
            <div className="hero-actions">
              <StartLink
                className="button"
                authenticatedTo="/app"
                onClick={() =>
                  trackFunnel("hero_cta_click", { cta: "primary", auth: session ? "in" : "out" })
                }
              >
                {session ? "进入工作台" : "开始配置"}
                <ArrowRight size={18} aria-hidden="true" />
              </StartLink>
              <Link
                className="hero-how"
                to="/#how"
                onClick={() =>
                  trackFunnel("hero_cta_click", { cta: "how", auth: session ? "in" : "out" })
                }
              >
                看看怎么连接
                <ChevronDown size={16} aria-hidden="true" />
              </Link>
            </div>
            <p className="hero-note">
              每天赠送 {DAILY_CREDIT_DEFAULTS.free} credits；模型需自备 API Key，费用另付。
            </p>
          </div>
          <figure className="hero-connections">
            <img
              src="/images/landing/ai-wechat-connections.webp"
              srcSet="/images/landing/ai-wechat-connections-640.webp 640w, /images/landing/ai-wechat-connections.webp 1280w"
              sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1200px) 45vw, 520px"
              width={1280}
              height={1024}
              fetchPriority="high"
              alt="DeepSeek、Claude、GPT、Muse、Hermes、OpenClaw 在上方，通过连接线汇入下方的微信。"
            />
          </figure>
        </section>
        <LandingUseCases />
        <LandingSteps
          startAction={
            <StartLink className="button">
              免费开始
              <ArrowRight size={18} aria-hidden="true" />
            </StartLink>
          }
        />
        <section className="landing-pricing" aria-labelledby="landing-pricing-title">
          <div className="landing-pricing-head">
            <h2 id="landing-pricing-title">免费开始，Plus 解锁更多</h2>
            <p>日常问答先用免费版。更多额度、多微信连接和小薇 AI，选择 Plus。</p>
          </div>
          <div className="landing-pricing-grid">
            {landingPlans.map((plan) => (
              <LandingPlanCard key={plan.id} plan={plan} />
            ))}
            <LandingPlanCard
              plan={mobileInterval === "year" ? landingPlans[2] : landingPlans[1]}
              id="mobile-plus"
              className="landing-plan-mobile-plus"
            >
              <div className="landing-plan-switch" role="group" aria-label="Plus 购买周期">
                {(["month", "year"] as const).map((interval) => (
                  <button
                    key={interval}
                    type="button"
                    aria-pressed={mobileInterval === interval}
                    onClick={() => setMobileInterval(interval)}
                  >
                    {interval === "month" ? "月付" : "年付 · 更划算"}
                  </button>
                ))}
              </div>
            </LandingPlanCard>
          </div>
          <p className="landing-pricing-note">
            credits
            是微伴的平台用量额度，按使用量扣除。会员单次购买，不自动续费；每日赠额不累积。模型 API
            费用另付服务商。
            <br />
            小薇 AI 使用你配置的模型，执行次数与服务状态以插件页为准。月付与年付享有相同权益。
          </p>
          <p className="landing-pricing-more">
            <Link to="/pricing#estimate">
              额度怎么用？估算每日用量
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <Link to="/pricing">
              看完整价格与额度明细
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </p>
        </section>
        <section className="landing-faq" id="faq" aria-labelledby="landing-faq-title">
          <div className="landing-faq-head">
            <h2 id="landing-faq-title">常见问题</h2>
            <p className="landing-faq-intro">关于费用、配置和使用，你可能还想了解这些。</p>
            <p className="landing-faq-more">
              <Link to="/docs/faq">
                查看完整常见问题
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </p>
          </div>
          <div className="landing-faq-list">
            {LANDING_FAQ.map((item) => (
              <details key={item.question}>
                <summary>
                  <span>{item.question}</span>
                  <span className="landing-faq-toggle" aria-hidden="true">
                    <ChevronDown size={18} />
                  </span>
                </summary>
                <p>
                  {item.answer}
                  <Link className="landing-faq-guide" to={item.guide.href}>
                    {item.guide.label}
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                </p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
