import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, QrCode } from "lucide-react";
import { CHANNEL_PROVIDERS } from "../shared/channel-providers";
import { homeCopyFor } from "../shared/i18n/copy";
import { providerLabels as providerLabelsKo } from "../shared/i18n/ko/copy/home";
import { localizedHref, useLocale } from "./locale";
import "./landing-steps.css";

const steps = [
  {
    title: "接入你常用的模型",
    tab: "配置模型",
    description:
      "支持 DeepSeek、硅基流动、阿里云、OpenAI、Anthropic 等渠道，填入 API Key，一键同步模型。",
    guide: "/docs/channels-models",
    guideLabel: "查看模型配置教程",
  },
  {
    title: "连接你的微信",
    tab: "连接微信",
    description:
      "在工作台获取二维码，用微信 ClawBot 扫码确认。手机浏览时，可用另一台设备展示二维码。",
    guide: "/docs/wechat-connection#connect",
    guideLabel: "查看微信连接教程",
  },
  {
    title: "像平常一样聊天",
    tab: "开始聊天",
    description: "打开微信对话，直接向 AI 提问。切换模型、开启新话题，一条命令就能完成。",
    guide: "/docs/commands",
    guideLabel: "查看微信命令速查",
  },
];

const providerLabels: Record<string, string> = {
  kimi: "Kimi",
  qwen: "阿里云百炼",
  volcengine: "火山方舟",
  anthropic: "Anthropic",
  gemini: "Gemini",
  xai: "Grok / xAI",
};

const providerLabelsEn: Record<string, string> = {
  kimi: "Kimi",
  zhipu: "Zhipu GLM",
  qwen: "Alibaba Cloud Model Studio",
  volcengine: "Volcengine Ark",
  anthropic: "Anthropic",
  gemini: "Gemini",
  xai: "Grok / xAI",
  siliconflow: "SiliconFlow",
};

const providerLogos: Record<string, string> = {
  deepseek: "/images/channels/deepseek.png",
  kimi: "/images/channels/kimi.png",
  zhipu: "/images/channels/zhipu.png",
  qwen: "/images/channels/qwen.png",
  volcengine: "/images/channels/volcengine.png",
  minimax: "/images/channels/minimax.webp",
  siliconflow: "/images/channels/siliconflow.png",
  openai: "/images/channels/openai.png",
  anthropic: "/images/channels/anthropic.png",
  gemini: "/images/channels/gemini.png",
  openrouter: "/images/channels/openrouter.webp",
  xai: "/images/channels/xai.png",
};

const stepsCopyZh = {
  eyebrow: "轻松开始",
  title: "2 分钟配置，免费开始",
  guide: "查看入门教程",
  requirementsPrefix: "请先确认微信已有",
  requirementsLink: "ClawBot 入口",
  requirementsSuffix: "； 普通聊天需自备模型 API Key。手机扫码请用电脑或另一台设备展示二维码。",
  tabsLabel: "使用步骤",
  preview: {
    providersTitle: "支持的模型渠道",
    providersNote: "也支持 Coding Plan 与自定义兼容渠道",
    connectLabel: "连接示意",
    connectTitle: "扫码连接你的微信",
    connectHint: "微信 ClawBot 扫一扫 · 在手机上确认",
    connectNote: "示意图，请在工作台获取二维码",
    connectSuccess: "个人专属连接",
    chatBrand: "微伴",
    chatSent: "帮我想三个周末出游的点子。",
    chatReceived: "当然。你想去户外走走，还是在城市里慢慢逛？",
    chatNote: "已开始新会话，原会话已保留。",
  },
  previous: "上一步",
  next: "下一步",
  status: (index: number, total: number, title: string) => `第 ${index} 步，共 ${total} 步：${title}`,
  alternativesPrefix: "配置模型、连接微信、开始聊天。也可以",
  alternativesAgent: "连接已有 Agent",
  alternativesMiddle: "或",
  alternativesNotifications: "接收服务通知",
  alternativesEnd: "。",
};

function StepPreview({ step }: { step: number }) {
  const { locale } = useLocale();
  const copy = homeCopyFor(locale)?.steps.preview ?? stepsCopyZh.preview;
  const labels =
    locale === "ko" ? providerLabelsKo : locale === "en" || locale === "ja" || locale === "pt" ? providerLabelsEn : providerLabels;
  if (step === 0)
    return (
      <div className="steps-preview">
        <div className="steps-providers">
          <strong>{copy.providersTitle}</strong>
          <ul className="steps-provider-grid">
            {CHANNEL_PROVIDERS.filter((provider) => !provider.codingPlan).map((provider) => (
              <li key={provider.id}>
                <img
                  src={providerLogos[provider.id]}
                  width={28}
                  height={28}
                  alt=""
                  loading="lazy"
                />
                <span>{labels[provider.id] ?? provider.name}</span>
              </li>
            ))}
          </ul>
          <p>{copy.providersNote}</p>
        </div>
      </div>
    );
  if (step === 1)
    return (
      <div className="steps-preview" aria-hidden="true">
        <div className="steps-connect">
          <span className="steps-preview-label">{copy.connectLabel}</span>
          <strong>{copy.connectTitle}</strong>
          <div className="steps-qr">
            <QrCode size={116} strokeWidth={1.3} />
          </div>
          <span>{copy.connectHint}</span>
          <p className="steps-qr-note">{copy.connectNote}</p>
          <div className="steps-preview-success">
            <Check size={15} /> {copy.connectSuccess}
          </div>
        </div>
      </div>
    );
  return (
    <div className="steps-preview" aria-hidden="true">
      <div className="steps-chat">
        <div className="steps-chat-heading">
          <img src="/favicon.svg" width={22} height={22} alt="" />{" "}
          {copy.chatBrand} <span>DeepSeek</span>
        </div>
        <div className="steps-chat-body">
          <div className="steps-chat-sent">{copy.chatSent}</div>
          <div className="steps-chat-received">{copy.chatReceived}</div>
          <div className="steps-chat-command">/wx new</div>
          <div className="steps-chat-note">{copy.chatNote}</div>
        </div>
      </div>
    </div>
  );
}

export function LandingSteps({ startAction }: { startAction: ReactNode }) {
  const { locale } = useLocale();
  const localized = homeCopyFor(locale);
  const copy = localized?.steps ?? stepsCopyZh;
  const localizedSteps = localized
    ? steps.map((step, index) => ({ ...step, ...localized.steps.items[index]! }))
    : steps;
  const [activeStep, setActiveStep] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (offset: number) =>
    setActiveStep((current) => (current + offset + localizedSteps.length) % localizedSteps.length);
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = (index + 1) % localizedSteps.length;
        break;
      case "ArrowLeft":
        next = (index + localizedSteps.length - 1) % localizedSteps.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = localizedSteps.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    setActiveStep(next);
    tabs.current[next]?.focus();
  };

  return (
    <section className="landing-steps" id="how" aria-labelledby="how-title">
      <div className="steps-heading">
        <div className="eyebrow">{copy.eyebrow}</div>
        <h2 id="how-title">{copy.title}</h2>
        <div className="steps-actions">
          {startAction}
          <Link className="button secondary" to={localizedHref(locale, "/docs/getting-started")}>
            {copy.guide}
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <p className="steps-requirements">
          {copy.requirementsPrefix}
          <Link to={localizedHref(locale, "/docs/getting-started#clawbot-entry")}>
            {copy.requirementsLink}
          </Link>
          {copy.requirementsSuffix}
        </p>
      </div>
      <div className="steps-tabs" role="tablist" aria-label={copy.tabsLabel}>
        {localizedSteps.map((step, index) => (
          <button
            key={step.title}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`step-tab-${index}`}
            aria-selected={activeStep === index}
            aria-controls={`step-panel-${index}`}
            tabIndex={activeStep === index ? 0 : -1}
            onClick={() => setActiveStep(index)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            {step.tab}
          </button>
        ))}
      </div>
      <div className="steps-pages">
        {localizedSteps.map((step, index) => (
          <div
            key={step.title}
            className="steps-slide"
            id={`step-panel-${index}`}
            role="tabpanel"
            aria-labelledby={`step-tab-${index}`}
            tabIndex={0}
            hidden={activeStep !== index}
          >
            <div className="steps-copy">
              <span className="steps-page-number">STEP {String(index + 1).padStart(2, "0")}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
              <Link className="text-link" to={localizedHref(locale, step.guide)}>
                {step.guideLabel}
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <StepPreview step={index} />
          </div>
        ))}
      </div>
      <div className="steps-controls">
        <span role="status" aria-live="polite" aria-atomic="true">
          <span className="steps-screen-reader">
            {copy.status(activeStep + 1, localizedSteps.length, localizedSteps[activeStep].title)}
          </span>
          <span aria-hidden="true">
            <b>{String(activeStep + 1).padStart(2, "0")}</b> / 03
          </span>
        </span>
        <div>
          <button
            type="button"
            aria-label={copy.previous}
            onClick={() => move(-1)}
          >
            <ArrowLeft size={19} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={copy.next}
            onClick={() => move(1)}
          >
            <ArrowRight size={19} aria-hidden="true" />
          </button>
        </div>
      </div>
      <p className="steps-alternatives">
        {copy.alternativesPrefix}
        <Link to="/wechat-agent">{copy.alternativesAgent}</Link>
        {copy.alternativesMiddle}
        <Link to={localizedHref(locale, "/docs/notifications")}>
          {copy.alternativesNotifications}
        </Link>
        {copy.alternativesEnd}
      </p>
    </section>
  );
}
