import { ArrowDownUp, ArrowUpRight, Check, Drama, FileText, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { homeCopy } from "../shared/i18n/en/copy/home";
import { homeCopyPt } from "../shared/i18n/pt/copy/home";
import type { Locale } from "../shared/i18n";
import { localizedHref, useLocale } from "./locale";
import "./landing-use-cases.css";

const useCasesCopyZh = {
  title: "多种 AI，更多选择",
  intro: "从聊一句，到做完一件事。",
  caption: "以上对话、模型选择与任务结果为功能示意。",
  scenes: {
    creative: {
      title: "AI 生图",
      chat: "微信对话",
      prompt: "@draw 画一张城市街头人像，3:4",
      done: "图片已生成",
      resultLead: "你的灵感，",
      resultAccent: "在微信里成画。",
      resultNote: "生成图片直接回到对话",
      roleplay: "角色扮演",
      roleplayNote: "自定义人设与剧情",
    },
    modelsAria: "在微信里使用 DeepSeek：查看模型接入教程",
    currentModel: "当前模型",
    agentGuide: (name: string) => `${name} 接入指南`,
    wechat: "微信",
    bridge: "发任务 · 收结果",
    cloud: {
      title: "小薇",
      subtitle: "住在微伴云端的做事助手",
      task: "交给小薇",
      done: "已完成",
      prompt: "@小薇 把这份 Markdown 转成 Word",
      fileName: "项目说明.docx",
      fileNote: "生成文件，发回微信",
    },
  },
};

function useCasesCopyFor(locale: Locale) {
  return locale === "pt" ? homeCopyPt.useCases : locale === "en" ? homeCopy.useCases : useCasesCopyZh;
}

function CreativeScene() {
  const { locale } = useLocale();
  const copy = useCasesCopyFor(locale).scenes.creative;
  return (
    <div className="scene-creative">
      <div className="scene-image-chat">
        <div className="scene-window-bar">
          <Sparkles size={18} />
          <strong>{copy.title}</strong>
          <span>{copy.chat}</span>
        </div>
        <div className="scene-chat-bubble scene-chat-user">{copy.prompt}</div>
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
              {copy.done}
            </span>
            <strong>
              {copy.resultLead}
              <br />
              {copy.resultAccent}
            </strong>
            <small>{copy.resultNote}</small>
          </div>
        </div>
      </div>
      <div className="scene-roleplay-tag">
        <Drama size={16} />
        {copy.roleplay}
        <span>{copy.roleplayNote}</span>
      </div>
    </div>
  );
}

function ModelsScene() {
  const { locale } = useLocale();
  const copy = useCasesCopyFor(locale).scenes;
  return (
    <Link
      className="scene-model-stack"
      to={localizedHref(locale, "/docs/deepseek-in-wechat")}
      aria-label={copy.modelsAria}
    >
      <div className="scene-model scene-model-selected">
        <img src="/images/channels/deepseek.png" width={28} height={28} alt="" loading="lazy" />
        <strong>DeepSeek</strong>
        <span>{copy.currentModel}</span>
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
  const { locale } = useLocale();
  const copy = useCasesCopyFor(locale).scenes;
  return (
    <div className="scene-bridge">
      <div className="scene-agent-names">
        {[
          { name: "Muse", logo: "/images/plugins/muse.svg", href: "/wechat-muse" },
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
          <Link
            key={name}
            to={localizedHref(locale, href)}
            aria-label={copy.agentGuide(name)}
          >
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
        <strong>{copy.wechat}</strong>
        <span>
          <ArrowDownUp size={14} aria-hidden="true" />
          {copy.bridge}
        </span>
      </div>
    </div>
  );
}

function CloudScene() {
  const { locale } = useLocale();
  const copy = useCasesCopyFor(locale).scenes.cloud;
  return (
    <div className="scene-xiaowei">
      <div className="scene-xiaowei-intro">
        <img src="/images/plugins/xiaowei.webp" width={384} height={384} alt="" loading="lazy" />
        <div>
          <strong>{copy.title}</strong>
          <span>{copy.subtitle}</span>
        </div>
      </div>
      <div className="scene-task">
        <div className="scene-task-header">
          <span>
            <Sparkles size={18} />
            {copy.task}
          </span>
          <span>
            <Check size={14} />
            {copy.done}
          </span>
        </div>
        <p className="scene-task-prompt">{copy.prompt}</p>
        <div className="scene-task-result">
          <span className="scene-file-icon">
            <FileText size={25} />
          </span>
          <span className="scene-file-details">
            <strong>{copy.fileName}</strong>
            <small>{copy.fileNote}</small>
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
    lead: "一句描述",
    title: "在微信里生成图片",
    description: "在微信里描述画面、接收图片；也可启用角色扮演，自定义人设与剧情。",
    note: "生图需配置图片模型，API 费用另付服务商",
    href: "/wechat-ai-image",
    action: "探索 AI 生图",
    scene: CreativeScene,
  },
  {
    kind: "models",
    lead: "DeepSeek、Claude、GPT",
    title: "顶级模型自由接入",
    description: "接入自己的模型 API，在同一个微信里切换模型，随时问答、写作、翻译。",
    note: "自备 API Key，模型费用另付服务商",
    href: "/docs/channels-models",
    action: "查看模型配置",
    scene: ModelsScene,
  },
  {
    kind: "cloud",
    lead: "小薇，你的云端助手",
    title: "处理文件，生成文档",
    description: "在微信交代任务、接收文件。无需安装或部署，配置模型即可启用。",
    note: "仅对 Plus 会员开放",
    href: "/docs/cloud-agent",
    action: "认识小薇，开始使用",
    scene: CloudScene,
  },
];

const useCasesEn = useCases.map((item, index) => ({
  ...item,
  ...homeCopy.useCases.items[index]!,
}));
const useCasesPt = useCases.map((item, index) => ({
  ...item,
  ...homeCopyPt.useCases.items[index]!,
}));

export function LandingUseCases() {
  const { locale } = useLocale();
  const copy = useCasesCopyFor(locale);
  const cases = locale === "pt" ? useCasesPt : locale === "en" ? useCasesEn : useCases;
  return (
    <section className="landing-use-cases" aria-labelledby="use-cases-title">
      <div className="use-cases-heading">
        <h2 id="use-cases-title">{copy.title}</h2>
        <p>{copy.intro}</p>
      </div>
      <div className="use-cases-grid">
        {cases.map(({ kind, lead, title, description, note, href, action, scene: Scene }) => {
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
                <Link className="use-case-action" to={localizedHref(locale, href)}>
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
              to={localizedHref(locale, href)}
              key={kind}
              aria-labelledby={`use-case-${kind}-title use-case-${kind}-action`}
            >
              {content}
            </Link>
          );
        })}
      </div>
      <p className="use-cases-caption">{copy.caption}</p>
    </section>
  );
}
