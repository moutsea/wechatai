import { ArrowRight, Check, ChevronDown, Sprout } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { DAILY_CREDIT_DEFAULTS } from "../shared/credits";
import { LANDING_FAQ } from "../shared/landing-faq";
import { PLUGIN_LIMITS } from "../shared/plugin-access";
import { PLUS_MONTHLY_YUAN, OWN_API_COST_NOTE } from "../shared/pricing-copy";
import { WECHAT_LINK_LIMITS } from "../shared/wechat-links";
import { authReturnPath } from "../shared/auth";
import { trackFunnel } from "./analytics-client";
import { useAuth } from "./auth";
import { GettingStartedPreview, WechatPrerequisite } from "./getting-started-preview";
import { LandingReal } from "./landing-real";
import { LandingSteps } from "./landing-steps";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
// 首页价格锚只显示月付价；与 BILLING_OFFERS 的一致性由 test/seo.test.ts 断言保证。
const plusMonthlyYuan = String(PLUS_MONTHLY_YUAN);
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
export function Landing() {
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
              一个账号，连接 DeepSeek、Claude、GPT 等模型，也能接入 Muse、Hermes、OpenClaw 等
              Agent。
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
                查看三步教程
                <ChevronDown size={16} aria-hidden="true" />
              </Link>
            </div>
            <p className="hero-note">
              每天赠送 {DAILY_CREDIT_DEFAULTS.free} credits；模型需自备 API Key，费用另付。
            </p>
          </div>
          <figure className="hero-demo" aria-label="微信对话示意">
            <figcaption>
              <span>
                <Sprout size={20} aria-hidden="true" /> 微伴 · DeepSeek
              </span>
              <span>对话示意</span>
            </figcaption>
            <p className="hero-demo-question">帮我润色这句话：明天把方案给我。</p>
            <p className="hero-demo-answer">方便的话，请在明天前把方案发给我，谢谢。</p>
          </figure>
        </section>
        <div className="landing-start" id="start">
          <WechatPrerequisite />
        </div>
        <LandingSteps />
        <GettingStartedPreview />
        <section className="deepseek-entry" aria-labelledby="deepseek-entry-title">
          <img src="/images/channels/deepseek.png" alt="" width={52} height={52} loading="lazy" />
          <div>
            <span className="eyebrow">模型使用专题</span>
            <h2 id="deepseek-entry-title">想在微信里使用 DeepSeek？</h2>
            <p>
              从 API Key 到第一条微信回复，了解接入条件、费用和联网方式。微伴也支持 Claude、GPT
              等模型。
            </p>
          </div>
          <div className="deepseek-entry-links">
            <Link to="/wechat-deepseek">
              了解 DeepSeek 微信接入 <ArrowRight size={16} />
            </Link>
            <Link to="/docs/deepseek-in-wechat">已有 Key？直接看截图教程 →</Link>
          </div>
        </section>
        <LandingReal />
        <section className="landing-preview" id="workspace" aria-labelledby="landing-preview-title">
          <div className="landing-preview-copy">
            <p className="eyebrow">工作台</p>
            <h2 id="landing-preview-title">配置在网页，聊天在微信</h2>
            <p>
              模型渠道、插件、微信链接、额度与记录都在同一个页面里；改完即时生效，
              手机上不用装任何东西，微信那边照常说话就行。
            </p>
            <div className="landing-preview-actions">
              <StartLink className="button secondary" authenticatedTo="/app/channels">
                开始配置我的模型
                <ArrowRight size={16} aria-hidden="true" />
              </StartLink>
            </div>
            <p className="landing-preview-note">截图来自真实工作台，图中数据为示例。</p>
          </div>
          <figure className="landing-preview-shot">
            <img
              src="/images/real/workspace-overview.jpg"
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
            <p>{OWN_API_COST_NOTE}</p>
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
                  <Check size={14} aria-hidden="true" />
                  每天 {DAILY_CREDIT_DEFAULTS.free} credits
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
                  <Check size={14} aria-hidden="true" />
                  每天 {DAILY_CREDIT_DEFAULTS.plus} credits
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
