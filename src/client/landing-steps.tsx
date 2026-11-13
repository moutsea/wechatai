import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, QrCode } from "lucide-react";
import { CHANNEL_PROVIDERS } from "../shared/channel-providers";
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

function StepPreview({ step }: { step: number }) {
  if (step === 0)
    return (
      <div className="steps-preview">
        <div className="steps-providers">
          <strong>支持的模型渠道</strong>
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
                <span>{providerLabels[provider.id] ?? provider.name}</span>
              </li>
            ))}
          </ul>
          <p>也支持 Coding Plan 与自定义兼容渠道</p>
        </div>
      </div>
    );
  if (step === 1)
    return (
      <div className="steps-preview" aria-hidden="true">
        <div className="steps-connect">
          <span className="steps-preview-label">连接示意</span>
          <strong>扫码连接你的微信</strong>
          <div className="steps-qr">
            <QrCode size={116} strokeWidth={1.3} />
          </div>
          <span>微信 ClawBot 扫一扫 · 在手机上确认</span>
          <p className="steps-qr-note">示意图，请在工作台获取二维码</p>
          <div className="steps-preview-success">
            <Check size={15} /> 个人专属连接
          </div>
        </div>
      </div>
    );
  return (
    <div className="steps-preview" aria-hidden="true">
      <div className="steps-chat">
        <div className="steps-chat-heading">
          <img src="/favicon.svg" width={22} height={22} alt="" /> 微伴 <span>DeepSeek</span>
        </div>
        <div className="steps-chat-body">
          <div className="steps-chat-sent">帮我想三个周末出游的点子。</div>
          <div className="steps-chat-received">当然。你想去户外走走，还是在城市里慢慢逛？</div>
          <div className="steps-chat-command">/wx new</div>
          <div className="steps-chat-note">已开始新会话，原会话已保留。</div>
        </div>
      </div>
    </div>
  );
}

export function LandingSteps({ startAction }: { startAction: ReactNode }) {
  const [activeStep, setActiveStep] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (offset: number) =>
    setActiveStep((current) => (current + offset + steps.length) % steps.length);
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = (index + 1) % steps.length;
        break;
      case "ArrowLeft":
        next = (index + steps.length - 1) % steps.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = steps.length - 1;
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
        <div className="eyebrow">轻松开始</div>
        <h2 id="how-title">2 分钟配置，免费开始</h2>
        <div className="steps-actions">
          {startAction}
          <Link className="button secondary" to="/docs/getting-started">
            查看入门教程
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <div className="steps-tabs" role="tablist" aria-label="使用步骤">
        {steps.map((step, index) => (
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
        {steps.map((step, index) => (
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
              <Link className="text-link" to={step.guide}>
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
            第 {activeStep + 1} 步，共 {steps.length} 步：{steps[activeStep].title}
          </span>
          <span aria-hidden="true">
            <b>{String(activeStep + 1).padStart(2, "0")}</b> / 03
          </span>
        </span>
        <div>
          <button type="button" aria-label="上一步" onClick={() => move(-1)}>
            <ArrowLeft size={19} aria-hidden="true" />
          </button>
          <button type="button" aria-label="下一步" onClick={() => move(1)}>
            <ArrowRight size={19} aria-hidden="true" />
          </button>
        </div>
      </div>
      <p className="steps-alternatives">
        配置模型、连接微信、开始聊天。也可以<Link to="/wechat-agent">连接已有 Agent</Link>或
        <Link to="/docs/notifications">接收服务通知</Link>。
      </p>
    </section>
  );
}
