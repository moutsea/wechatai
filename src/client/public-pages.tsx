import {
  ArrowRight,
  AudioLines,
  Check,
  ChevronDown,
  ChevronLeft,
  CirclePlus,
  Ellipsis,
  KeyRound,
  MessageSquareText,
  MessagesSquare,
  Smile,
  Sparkles,
  Sprout,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { DAILY_CREDIT_DEFAULTS } from "../shared/credits";
import { LANDING_FAQ } from "../shared/landing-faq";
import { PLUGIN_LIMITS } from "../shared/plugin-access";
import { PLUS_MONTHLY_YUAN } from "../shared/pricing-copy";
import { WECHAT_LINK_LIMITS } from "../shared/wechat-links";
import { authReturnPath } from "../shared/auth";
import { trackFunnel } from "./analytics-client";
import { useAuth } from "./auth";
import { GettingStartedPreview } from "./getting-started-preview";
import { LandingReal } from "./landing-real";
import { LandingSteps } from "./landing-steps";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
// 首页价格锚只显示月付价；与 BILLING_OFFERS 的一致性由 test/seo.test.ts 断言保证。
const plusMonthlyYuan = String(PLUS_MONTHLY_YUAN);
/** 首屏三句 microcopy：拆成数组是为了让分隔符能按「非末项」渲染。 */
const HOMEPAGE_HERO_NOTES = [
  `每天 ${DAILY_CREDIT_DEFAULTS.free} credits 免费`,
  "不绑卡",
  "聊天记录可随时删除",
];
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
            <span className="eyebrow">
              <span className="tiny-dot" /> WECHAT AI · YOUR MODELS, IN WECHAT
            </span>
            <h1>
              在微信里，<span>用上你的大模型</span>
            </h1>
            <p>
              把自选模型接入微信，让日常问答、写作和整理更顺手。
              <br />
              之后就在微信里说话，DeepSeek / Claude / GPT 随时切换。
            </p>
            <div className="hero-actions">
              <StartLink
                className="button"
                authenticatedTo="/app/channels"
                onClick={() =>
                  trackFunnel("hero_cta_click", { cta: "primary", auth: session ? "in" : "out" })
                }
              >
                {session ? "配置我的模型" : "免费开始配置"}
                <ArrowRight size={18} />
              </StartLink>
              {/* 次按钮不离开首页：直接滚到下面三步，用户看完就知道要做什么，
                  比跳到一个陌生页面再让用户自己找更清楚。 */}
              <Link
                className="button secondary hero-secondary"
                to="/#how"
                onClick={() =>
                  trackFunnel("hero_cta_click", {
                    cta: "how",
                    auth: session ? "in" : "out",
                  })
                }
              >
                看看三步怎么配
                <ChevronDown size={16} />
              </Link>
            </div>
            {/* 分隔符用真实节点 + aria-hidden：伪元素的 content 会进可访问性树，读屏会念出「·」。 */}
            <p className="hero-note">
              {HOMEPAGE_HERO_NOTES.map((line, index) => (
                <span key={line}>
                  {line}
                  {index < HOMEPAGE_HERO_NOTES.length - 1 && (
                    <span className="hero-note-dot" aria-hidden="true">
                      ·
                    </span>
                  )}
                </span>
              ))}
            </p>
            <p className="hero-prerequisite">
              先<Link to="/#start">检查微信 ClawBot 入口</Link>。免费 credits
              仅覆盖平台中转，模型费用另付；也可<Link to="/#try">免 Key 预览示例任务</Link>。
            </p>
            <div className="hero-trust">
              <span>
                <Check size={14} />
                自带 API Key，我们不卖 token
              </span>
              <span>
                <Check size={14} />
                支持三种常见协议
              </span>
              <span>
                <Check size={14} />
                开源仓库可查
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
        <LandingSteps />
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
