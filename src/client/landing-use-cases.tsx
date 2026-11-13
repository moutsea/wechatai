import { ArrowDownUp, ArrowUpRight, Check, Drama, FileText, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import "./landing-use-cases.css";

function CreativeScene() {
  return (
    <div className="scene-creative">
      <div className="scene-image-chat">
        <div className="scene-window-bar">
          <Sparkles size={18} />
          <strong>AI 生图</strong>
          <span>微信对话</span>
        </div>
        <div className="scene-chat-bubble scene-chat-user">@draw 画一张城市街头人像，3:4</div>
        <div className="scene-image-result">
          <img
            src="/images/landing/ai-image-example.webp"
            width={318}
            height={425}
            alt=""
            loading="lazy"
          />
          <div>
            <span className="scene-image-status">
              <Check size={13} />
              图片已生成
            </span>
            <strong>
              你的灵感，
              <br />
              在微信里成画。
            </strong>
            <small>生成图片直接回到对话</small>
          </div>
        </div>
      </div>
      <div className="scene-roleplay-tag">
        <Drama size={16} />
        角色扮演
        <span>自定义人设与剧情</span>
      </div>
    </div>
  );
}

function ModelsScene() {
  return (
    <Link
      className="scene-model-stack"
      to="/docs/deepseek-in-wechat"
      aria-label="在微信里使用 DeepSeek：查看模型接入教程"
    >
      <div className="scene-model scene-model-selected">
        <img src="/images/channels/deepseek.png" width={28} height={28} alt="" loading="lazy" />
        <strong>DeepSeek</strong>
        <span>当前模型</span>
        <Check size={16} />
      </div>
      <div className="scene-model">
        <img src="/images/channels/claude.png" width={28} height={28} alt="" loading="lazy" />
        <strong>Claude</strong>
        <ArrowUpRight size={16} />
      </div>
      <div className="scene-model">
        <img src="/images/channels/openai.png" width={28} height={28} alt="" loading="lazy" />
        <strong>GPT</strong>
        <ArrowUpRight size={16} />
      </div>
    </Link>
  );
}

function AgentsScene() {
  return (
    <div className="scene-bridge">
      <div className="scene-agent-names">
        {[
          { name: "Muse", logo: "/images/plugins/muse.svg", href: "/developers/muse" },
          {
            name: "Hermes",
            logo: "/images/plugins/hermes-brand.webp",
            href: "/docs/hermes-in-wechat",
          },
          {
            name: "OpenClaw",
            logo: "/images/plugins/openclaw-brand.webp",
            href: "/docs/multiple-openclaw-in-wechat",
          },
        ].map(({ name, logo, href }) => (
          <Link key={name} to={href} aria-label={`${name} 接入指南`}>
            <img src={logo} width={56} height={56} alt="" loading="lazy" />
            {name}
          </Link>
        ))}
      </div>
      <svg
        className="scene-bridge-lines"
        viewBox="0 0 300 52"
        fill="none"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M50 0v17q0 7 7 7h186q7 0 7-7V0M150 0v52" />
      </svg>
      <div className="scene-wechat">
        <img src="/images/landing/wechat-logo.svg" width={28} height={23} alt="" loading="lazy" />
        <strong>微信</strong>
        <span>
          <ArrowDownUp size={14} aria-hidden="true" />
          发任务 · 收结果
        </span>
      </div>
    </div>
  );
}

function CloudScene() {
  return (
    <div className="scene-xiaowei">
      <div className="scene-xiaowei-intro">
        <img src="/images/plugins/xiaowei.webp" width={384} height={384} alt="" loading="lazy" />
        <div>
          <strong>小薇</strong>
          <span>住在微伴云端的做事助手</span>
        </div>
      </div>
      <div className="scene-task">
        <div className="scene-task-header">
          <span>
            <Sparkles size={18} />
            交给小薇
          </span>
          <span>
            <Check size={14} />
            已完成
          </span>
        </div>
        <p className="scene-task-prompt">@小薇 把这份 Markdown 转成 Word</p>
        <div className="scene-task-result">
          <span className="scene-file-icon">
            <FileText size={25} />
          </span>
          <span className="scene-file-details">
            <strong>项目说明.docx</strong>
            <small>生成文件，发回微信</small>
          </span>
          <Check size={18} />
        </div>
      </div>
    </div>
  );
}

const useCases = [
  {
    kind: "agents",
    lead: "一个微信",
    title: "接入多个 agent",
    description: "Muse、Hermes、OpenClaw，沿用已有工具与配置，在微信发任务、收结果。",
    href: "/wechat-agent",
    action: "连接已有 Agent",
    scene: AgentsScene,
  },
  {
    kind: "creative",
    lead: "AI 生图、角色扮演",
    title: "更多功能丰富拓展",
    description:
      "发一句描述，让 AI 把灵感画出来；也能设定角色人设、展开剧情，用插件拓展微信里的玩法。",
    note: "生图需配置图片模型，API 费用另付服务商",
    href: "/wechat-ai-image",
    action: "探索 AI 生图",
    scene: CreativeScene,
  },
  {
    kind: "models",
    lead: "DeepSeek、Claude、GPT",
    title: "顶级模型自由接入",
    description: "接入自己的模型 API，在同一个微信里按需切换。问答、写作、翻译，选择适合你的模型。",
    note: "自备 API Key，模型费用另付服务商",
    href: "/docs/channels-models",
    action: "查看模型配置",
    scene: ModelsScene,
  },
  {
    kind: "cloud",
    lead: "小薇，你的云端助手",
    title: "不用安装，不用折腾",
    description:
      "像用云端 OpenClaw、WorkBuddy 一样，在微信交代任务，让小薇帮你处理文件、生成文档。选好模型，启用即用。",
    note: "仅对 Plus 会员开放",
    href: "/docs/cloud-agent",
    action: "认识小薇，开始使用",
    scene: CloudScene,
  },
];

export function LandingUseCases() {
  return (
    <section className="landing-use-cases" aria-labelledby="use-cases-title">
      <div className="use-cases-heading">
        <h2 id="use-cases-title">多种 AI，更多选择</h2>
        <p>从聊一句，到做完一件事。</p>
      </div>
      <div className="use-cases-grid">
        {useCases.map(({ kind, lead, title, description, note, href, action, scene: Scene }) => {
          const separateLinks = kind === "agents" || kind === "models";
          const actionContent = (
            <>
              {action}
              <span>
                <ArrowUpRight size={18} aria-hidden="true" />
              </span>
            </>
          );
          const content = (
            <>
              <div className="use-case-copy">
                <h3 id={`use-case-${kind}-title`}>
                  <span>{lead}</span> <span>{title}</span>
                </h3>
                <p>{description}</p>
                {note && <small>{note}</small>}
              </div>
              <div className="use-case-scene" aria-hidden={separateLinks ? undefined : true}>
                <Scene />
              </div>
              {separateLinks ? (
                <Link className="use-case-action" to={href}>
                  {actionContent}
                </Link>
              ) : (
                <span className="use-case-action" id={`use-case-${kind}-action`}>
                  {actionContent}
                </span>
              )}
            </>
          );
          return separateLinks ? (
            <article
              className={`use-case-card use-case-${kind}`}
              key={kind}
              aria-labelledby={`use-case-${kind}-title`}
            >
              {content}
            </article>
          ) : (
            <Link
              className={`use-case-card use-case-${kind}`}
              to={href}
              key={kind}
              aria-labelledby={`use-case-${kind}-title use-case-${kind}-action`}
            >
              {content}
            </Link>
          );
        })}
      </div>
      <p className="use-cases-caption">以上对话、模型选择与任务结果为功能示意。</p>
    </section>
  );
}
