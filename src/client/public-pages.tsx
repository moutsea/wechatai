import {
  ArrowRight,
  Check,
  ChevronDown,
  CodeXml,
  ExternalLink,
  KeyRound,
  Minus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { DAILY_CREDIT_DEFAULTS } from "../shared/credits";
import { landingFaq } from "../shared/landing-faq";
import { homeCopy } from "../shared/i18n/en/copy/home";
import {
  DEFAULT_LOCALE,
  hasRegisteredTranslation,
  localizedPath,
  type Locale,
} from "../shared/i18n";
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
import { useLocale } from "./locale";
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

const landingPlansEn = [
  {
    id: "free",
    ...homeCopy.plans.free,
    price: 0,
  },
  {
    id: "month",
    ...homeCopy.plans.month,
    price: PLUS_MONTHLY_YUAN,
  },
  {
    id: "year",
    ...homeCopy.plans.year,
    price: PLUS_YEARLY_YUAN,
  },
] as const;

type LandingPlan = (typeof landingPlans)[number] | (typeof landingPlansEn)[number];

const homeCopyZh = {
  plans: {
    features: {
      creditsPrefix: "每天",
      creditsSuffix: "credits",
      wechatConnections: () => "个微信连接",
      unlimitedPlugins: "插件配置",
      unlimitedPluginsEmphasis: "不限",
      pluginConfigurations: () => "个插件配置",
      imageInput: "支持图片与文件输入",
      noImageInput: "暂不支持图片与文件输入",
      xiaoweiName: "小薇 AI",
      xiaoweiCloud: "云端助手",
      noXiaowei: "不含小薇 AI",
    },
    switchLabel: "Plus 购买周期",
    monthly: "月付",
    yearly: "年付 · 更划算",
  },
  hero: {
    titleLead: "把你的 AI，",
    titleAccent: "接入微信",
    body: "微伴将模型与 Agent 接入微信，支持聊天、生图，以及云端助手小薇的文件与任务处理。 DeepSeek、Claude、GPT、Muse、Hermes、OpenClaw，一个账号按需连接。",
    ctaWorkspace: "进入工作台",
    ctaStart: "开始配置",
    how: "看看怎么连接",
    note: `每天赠送 ${DAILY_CREDIT_DEFAULTS.free} credits；模型需自备 API Key，费用另付。`,
    imageAlt: "DeepSeek、Claude、GPT、Muse、Hermes、OpenClaw 在上方，通过连接线汇入下方的微信。",
  },
  ctaSteps: "免费开始",
  pricingSection: {
    title: "免费开始，Plus 解锁更多",
    intro: "日常问答先用免费版。更多额度、多微信连接和小薇 AI，选择 Plus。",
    note: "credits 是微伴的平台用量额度，按使用量扣除。会员单次购买，不自动续费；每日赠额不累积。模型 API 费用另付服务商。",
    noteSecond: "小薇 AI 使用你配置的模型，执行次数与服务状态以插件页为准。月付与年付享有相同权益。",
    estimate: "额度怎么用？估算每日用量",
    details: "看完整价格与额度明细",
  },
  privacy: {
    title: "数据安全与隐私保护",
    intro: "了解密钥如何保存、聊天如何处理，以及记录如何删除。",
    policy: "查看隐私政策",
    items: {
      keys: {
        title: "密钥加密保存",
        body: "API Key 与微信连接凭据在服务端加密存储，已保存的密钥不会回传到浏览器。",
      },
      inspection: {
        title: "不查看用户数据",
        body: "我们不主动人工查看你的聊天和附件内容。消息由系统自动处理并转交接入服务，必要的会话与任务记录按隐私政策保存。",
      },
      deletion: {
        title: "会话记录可删除",
        body: "在工作台清理微伴中的会话记录；微信和第三方服务保留的副本需另行处理。",
      },
    },
    openSource: {
      title: "开源在 GitHub",
      body: "微伴以 MIT 协议开源，欢迎查看实现、反馈问题或参与改进。",
      repositoryAria: "查看 GitHub 开源仓库 moutsea/wechatai（新窗口打开）",
    },
  },
  faqSection: {
    title: "常见问题",
    intro: "关于费用、配置和使用，你可能还想了解这些。",
    more: "查看完整常见问题",
  },
};

/**
 * Keeps query strings and fragments while prefixing only translated pages.
 * Unregistered destinations stay on their real unprefixed Chinese URL.
 */
function localizedHref(locale: Locale, href: string) {
  if (locale === DEFAULT_LOCALE) return href;
  const [beforeHash, hash] = href.split("#");
  const [path, query] = beforeHash.split("?");
  const base = path || "/";
  if (!hasRegisteredTranslation(locale, base)) return href;
  return `${localizedPath(locale, base)}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
}

function LandingPlanFeatures({ plus }: { plus: boolean }) {
  const { locale } = useLocale();
  const copy = (locale === "en" ? homeCopy : homeCopyZh).plans.features;
  const links = WECHAT_LINK_LIMITS[plus ? "plus" : "free"];
  const plugins = PLUGIN_LIMITS.free;
  return (
    <ul>
      <li>
        <Check size={16} aria-hidden="true" />
        <span>
          {copy.creditsPrefix} <strong>{DAILY_CREDIT_DEFAULTS[plus ? "plus" : "free"]}</strong>{" "}
          {copy.creditsSuffix}
        </span>
      </li>
      <li>
        <Check size={16} aria-hidden="true" />
        <span>
          <strong>{links}</strong> {copy.wechatConnections(links)}
        </span>
      </li>
      <li>
        <Check size={16} aria-hidden="true" />
        <span>
          {plus ? (
            <>
              {copy.unlimitedPlugins}
              {copy.unlimitedPluginsEmphasis && (
                <>
                  {" "}
                  <strong>{copy.unlimitedPluginsEmphasis}</strong>
                </>
              )}
            </>
          ) : (
            <>
              <strong>{plugins}</strong> {copy.pluginConfigurations(plugins)}
            </>
          )}
        </span>
      </li>
      <li className={plus ? undefined : "landing-plan-unavailable"}>
        {plus ? <Check size={16} aria-hidden="true" /> : <Minus size={16} aria-hidden="true" />}
        <span>{plus ? copy.imageInput : copy.noImageInput}</span>
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
              <strong>{copy.xiaoweiName}</strong> {copy.xiaoweiCloud}
            </Link>
          </>
        ) : (
          <>
            <Minus size={16} aria-hidden="true" />
            <span>{copy.noXiaowei}</span>
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
  plan: LandingPlan;
  id?: string;
  className?: string;
  children?: ReactNode;
}) {
  const { data: session } = useAuth();
  const { locale } = useLocale();
  const { hero } = locale === "en" ? homeCopy : homeCopyZh;
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
          {session ? hero.ctaWorkspace : plan.action}
          <ArrowRight size={17} aria-hidden="true" />
        </StartLink>
      ) : (
        <Link
          className="button landing-plan-action"
          to={localizedHref(locale, `/pricing?interval=${plan.id}#plan-${plan.id}`)}
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
  const { locale } = useLocale();
  const english = locale === "en";
  const copy = english ? homeCopy : homeCopyZh;
  const plans = english ? landingPlansEn : landingPlans;
  const faq = landingFaq(locale);
  return (
    <div className="landing">
      <SiteHeader />
      <main>
        <section className="landing-hero">
          <div className="landing-copy">
            <h1>
              {copy.hero.titleLead}
              {english && " "}
              <span>{copy.hero.titleAccent}</span>
            </h1>
            <p>{copy.hero.body}</p>
            <div className="hero-actions">
              <StartLink
                className="button"
                authenticatedTo="/app"
                onClick={() =>
                  trackFunnel("hero_cta_click", { cta: "primary", auth: session ? "in" : "out" })
                }
              >
                {session ? copy.hero.ctaWorkspace : copy.hero.ctaStart}
                <ArrowRight size={18} aria-hidden="true" />
              </StartLink>
              <Link
                className="hero-how"
                to={localizedHref(locale, "/#how")}
                onClick={() =>
                  trackFunnel("hero_cta_click", { cta: "how", auth: session ? "in" : "out" })
                }
              >
                {copy.hero.how}
                <ChevronDown size={16} aria-hidden="true" />
              </Link>
            </div>
            <p className="hero-note">{copy.hero.note}</p>
          </div>
          <figure className="hero-connections">
            <img
              src="/images/landing/ai-wechat-connections.webp"
              srcSet="/images/landing/ai-wechat-connections-640.webp 640w, /images/landing/ai-wechat-connections.webp 1280w"
              sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1500px) 43vw, 640px"
              width={1280}
              height={1024}
              fetchPriority="high"
              alt={copy.hero.imageAlt}
            />
          </figure>
        </section>
        <LandingUseCases />
        <LandingSteps
          startAction={
            <StartLink className="button">
              {copy.ctaSteps}
              <ArrowRight size={18} aria-hidden="true" />
            </StartLink>
          }
        />
        <section className="landing-pricing" aria-labelledby="landing-pricing-title">
          <div className="landing-pricing-head">
            <h2 id="landing-pricing-title">{copy.pricingSection.title}</h2>
            <p>{copy.pricingSection.intro}</p>
          </div>
          <div className="landing-pricing-grid">
            {plans.map((plan) => (
              <LandingPlanCard key={plan.id} plan={plan} />
            ))}
            <LandingPlanCard
              plan={mobileInterval === "year" ? plans[2] : plans[1]}
              id="mobile-plus"
              className="landing-plan-mobile-plus"
            >
              <div
                className="landing-plan-switch"
                role="group"
                aria-label={copy.plans.switchLabel}
              >
                {(["month", "year"] as const).map((interval) => (
                  <button
                    key={interval}
                    type="button"
                    aria-pressed={mobileInterval === interval}
                    onClick={() => setMobileInterval(interval)}
                  >
                    {interval === "month" ? copy.plans.monthly : copy.plans.yearly}
                  </button>
                ))}
              </div>
            </LandingPlanCard>
          </div>
          <p className="landing-pricing-note">
            {copy.pricingSection.note}
            <br />
            {copy.pricingSection.noteSecond}
          </p>
          <p className="landing-pricing-more">
            <Link to={localizedHref(locale, "/pricing#estimate")}>
              {copy.pricingSection.estimate}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <Link to={localizedHref(locale, "/pricing")}>
              {copy.pricingSection.details}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </p>
        </section>
        <section className="landing-privacy" aria-labelledby="landing-privacy-title">
          <div className="landing-privacy-head">
            <div>
              <h2 id="landing-privacy-title">{copy.privacy.title}</h2>
              <p>{copy.privacy.intro}</p>
            </div>
            <Link className="landing-privacy-policy" to={localizedHref(locale, "/privacy")}>
              {copy.privacy.policy}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <div className="landing-privacy-grid">
            <div className="landing-privacy-item">
              <KeyRound size={22} aria-hidden="true" />
              <div>
                <h3>{copy.privacy.items.keys.title}</h3>
                <p>{copy.privacy.items.keys.body}</p>
              </div>
            </div>
            <div className="landing-privacy-item">
              <ShieldCheck size={22} aria-hidden="true" />
              <div>
                <h3>{copy.privacy.items.inspection.title}</h3>
                <p>{copy.privacy.items.inspection.body}</p>
              </div>
            </div>
            <div className="landing-privacy-item">
              <Trash2 size={22} aria-hidden="true" />
              <div>
                <h3>{copy.privacy.items.deletion.title}</h3>
                <p>{copy.privacy.items.deletion.body}</p>
              </div>
            </div>
          </div>
          <div className="landing-open-source">
            <div className="landing-open-source-copy">
              <CodeXml size={26} aria-hidden="true" />
              <div>
                <h3>{copy.privacy.openSource.title}</h3>
                <p>{copy.privacy.openSource.body}</p>
              </div>
            </div>
            <a
              className="landing-repository"
              href="https://github.com/moutsea/wechatai"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={copy.privacy.openSource.repositoryAria}
            >
              <span>moutsea/wechatai</span>
              <ExternalLink size={16} aria-hidden="true" />
            </a>
          </div>
        </section>
        <section className="landing-faq" id="faq" aria-labelledby="landing-faq-title">
          <div className="landing-faq-head">
            <h2 id="landing-faq-title">{copy.faqSection.title}</h2>
            <p className="landing-faq-intro">{copy.faqSection.intro}</p>
            <p className="landing-faq-more">
              <Link to="/docs/faq">
                {copy.faqSection.more}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </p>
          </div>
          <div className="landing-faq-list">
            {faq.map((item) => (
              <details key={item.question}>
                <summary>
                  <span>{item.question}</span>
                  <span className="landing-faq-toggle" aria-hidden="true">
                    <ChevronDown size={18} />
                  </span>
                </summary>
                <p>
                  {item.answer}
                  <Link className="landing-faq-guide" to={localizedHref(locale, item.guide.href)}>
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
