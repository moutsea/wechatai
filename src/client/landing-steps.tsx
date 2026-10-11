import { useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Cpu, QrCode, Sprout } from "lucide-react";
import "./landing-steps.css";

const steps = [
  {
    title: "配置渠道与模型",
    description: "填入自己的服务地址和 API Key，选择接口协议，再添加想使用的大模型。",
    details: ["支持三种常见 LLM 协议", "一键获取可用模型，也可以手动添加"],
    guide: "/docs/channels-models",
    guideLabel: "查看模型配置教程",
  },
  {
    title: "连接你的微信",
    description: "在工作台获取二维码。打开微信设置，在「功能」分组进入「插件 → 微信 ClawBot → 扫一扫」，扫码并确认连接。",
    details: ["个人专属连接，只回应你绑定的微信", "连接后发出第一条消息，收到欢迎和教程入口"],
    guide: "/docs/wechat-connection#connect",
    guideLabel: "查看微信连接教程",
  },
  {
    title: "像平常一样聊天",
    description: "打开微信里的对话，直接向模型提问。想换一个模型或开启新话题，发送命令就能完成。",
    details: ["发送 /models 查看模型，按需切换", "发送 /new 开始新话题，保留旧记录"],
    guide: "/docs/commands",
    guideLabel: "查看微信命令速查",
  },
];

function StepPreview({ step }: { step: number }) {
  if (step === 0)
    return (
      <div className="steps-preview" aria-hidden="true">
        <div className="steps-config">
          <div className="steps-config-heading">
            <span>
              <Cpu size={21} />
            </span>
            <strong>我的模型渠道</strong>
          </div>
          <div className="steps-config-field">
            <span>服务地址</span>
            <div>https://api.example.com</div>
          </div>
          <div className="steps-config-field">
            <span>API Key</span>
            <div className="steps-key-placeholder">••••••••••••••••••••</div>
          </div>
          <div className="steps-config-models">
            <span>
              <Check size={14} /> DeepSeek
            </span>
            <span>Claude</span>
            <span>GPT</span>
          </div>
          <div className="steps-preview-success">
            <Check size={15} /> 模型已就绪
          </div>
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
          <Sprout size={18} /> 微伴 <span>DeepSeek</span>
        </div>
        <div className="steps-chat-body">
          <div className="steps-chat-sent">帮我想三个周末出游的点子。</div>
          <div className="steps-chat-received">当然。你想去户外走走，还是在城市里慢慢逛？</div>
          <div className="steps-chat-command">/new</div>
          <div className="steps-chat-note">已开始新会话，原会话已保留。</div>
        </div>
      </div>
    </div>
  );
}

export function LandingSteps() {
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
    <section
      className="landing-steps"
      id="how"
      aria-labelledby="how-title"
      aria-roledescription="轮播"
    >
      <div className="steps-heading">
        <div className="eyebrow">THREE SMALL STEPS</div>
        <h2 id="how-title">三步，开启你的日常 AI。</h2>
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
            {step.title}
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
            hidden={activeStep !== index}
          >
            <div className="steps-copy">
              <span className="steps-page-number">STEP {String(index + 1).padStart(2, "0")}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
              <ul>
                {step.details.map((detail) => (
                  <li key={detail}>
                    <Check size={16} />
                    {detail}
                  </li>
                ))}
              </ul>
              <Link className="text-link" to={step.guide}>
                {step.guideLabel}
                <ArrowUpRight size={16} />
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
            <ArrowLeft size={19} />
          </button>
          <button type="button" aria-label="下一步" onClick={() => move(1)}>
            <ArrowRight size={19} />
          </button>
        </div>
      </div>
    </section>
  );
}
