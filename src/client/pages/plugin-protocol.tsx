import { Children, isValidElement, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUpRight, Check, Code2, Copy, FileJson, FileText, Terminal } from "lucide-react";
import { Brand } from "../ui";
import { SiteHeader } from "../site-header";
import { localizedHref, useLocale } from "../locale";
import { PLUGIN_PROTOCOL_VERSION } from "../../shared/plugins";
import {
  PLUGIN_API_PATH,
  PLUGIN_MARKDOWN_PATH,
  PLUGIN_SCHEMA_PATH,
  agentDevelopmentPrompt,
  protocolSections as protocolSectionsZh,
} from "../../shared/plugin-docs";
import {
  agentDevelopmentPromptEn,
  pluginProtocolSectionsEn,
} from "../../shared/i18n/en/data/plugin-protocol-en";
import "./guide.css";

interface ProtocolCopy {
  readonly copy: string;
  readonly copied: string;
  readonly copyFailed: string;
  readonly reference: string;
  readonly tocLabel: string;
  readonly tocHeadingPrefix: string;
  readonly readingFree: string;
  readonly llmsLink: string;
  readonly heroLine1: string;
  readonly heroLine2: string;
  readonly heroBody1: string;
  readonly heroBody2: string;
  readonly publicDocs: string;
  readonly agentCardTitle: string;
  readonly agentCardBody: string;
  readonly copyForAgent: string;
  readonly readInstructions: string;
  readonly resourcesLabel: string;
  readonly markdownTitle: string;
  readonly markdownHint: string;
  readonly apiHint: string;
  readonly schemaHint: string;
  readonly availabilityTitle: string;
  readonly availabilityBefore: string;
  readonly museLink: string;
  readonly availabilityAfter: string;
  readonly footerDisclaimer: string;
  readonly footerDocs: string;
}

const protocolCopyZh: ProtocolCopy = {
  copy: "复制",
  copied: "已复制",
  copyFailed: "请选中文字复制",
  reference: "示例 / REFERENCE",
  tocLabel: "插件协议目录",
  tocHeadingPrefix: "协议目录 / V",
  readingFree: "读取文档免费，不消耗 credits。",
  llmsLink: "查看 llms.txt",
  heroLine1: "插件协议，",
  heroLine2: "从这里开始。",
  heroBody1: "让不同的模型、工具与 Agent 使用同一种调用格式。",
  heroBody2: "定义输入与结果，把连接和计量交给平台。",
  publicDocs: "公开文档 · 无需登录",
  agentCardTitle: "把协议交给你的 AI",
  agentCardBody: "复制开发指令，让 AI 先读协议、校验规则和示例，再开始写适配器。",
  copyForAgent: "复制给 AI agent",
  readInstructions: "查看完整指令与读取方式",
  resourcesLabel: "协议文档格式",
  markdownTitle: "Markdown 原文",
  markdownHint: "给 AI agent 直接读取",
  apiHint: "版本、状态与完整示例",
  schemaHint: "从实际校验规则生成",
  availabilityTitle: "当前开放范围",
  availabilityBefore:
    "内置 LLM 对话、DS Chat 内置插件与平台计量已实现，AI 生图支持图片交付。第三方注册、远程执行、代码上传及第三方媒体接入尚未开放；现在可以按协议编写并在本地验证适配器。 已有 Muse 托管助理？按",
  museLink: "Muse 接入指南",
  availabilityAfter:
    "把它的 hook 接到微信；这是用户自备 Agent 的接入说明，不属于本协议。",
  footerDisclaimer: "独立产品 · 非微信官方服务",
  footerDocs: "阅读使用文档",
};

const protocolCopyEn: ProtocolCopy = {
  copy: "Copy",
  copied: "Copied",
  copyFailed: "Select the text to copy",
  reference: "EXAMPLE / REFERENCE",
  tocLabel: "Plugin protocol contents",
  tocHeadingPrefix: "Protocol contents / V",
  readingFree: "Reading the docs is free and consumes no credits.",
  llmsLink: "View llms.txt",
  heroLine1: "The plugin protocol,",
  heroLine2: "starting here.",
  heroBody1: "Let different models, tools and agents use one invocation format.",
  heroBody2: "Define input and results; leave connection and metering to the platform.",
  publicDocs: "Public docs · no sign-in",
  agentCardTitle: "Hand the protocol to your AI",
  agentCardBody:
    "Copy the development instruction so your AI reads the protocol, validation rules and examples before writing an adapter.",
  copyForAgent: "Copy for your AI agent",
  readInstructions: "See the full instruction and how to read it",
  resourcesLabel: "Protocol document formats",
  markdownTitle: "Markdown source",
  markdownHint: "Read directly by an AI agent",
  apiHint: "Version, status and complete examples",
  schemaHint: "Generated from the actual validation rules",
  availabilityTitle: "Current availability",
  availabilityBefore:
    "Built-in LLM chat, the built-in DS Chat plugin and platform metering are implemented, and AI image generation supports image delivery. Third-party registration, remote execution, code upload and third-party media access are not open yet; you can write an adapter against the protocol and verify it locally now. Already have a hosted Muse assistant? Follow the",
  museLink: "Muse connection guide",
  availabilityAfter:
    "to connect its hook to WeChat; that is setup for a user-supplied Agent and is not part of this protocol.",
  footerDisclaimer: "Independent product · not an official WeChat service",
  footerDocs: "Read the documentation",
};

function protocolCopyFor(locale: string): ProtocolCopy {
  return locale === "en" ? protocolCopyEn : protocolCopyZh;
}

function CopyButton({ text, label }: { text: string; label?: ReactNode }) {
  const copy = protocolCopyFor(useLocale().locale);
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (status === "idle") return;
    const timer = setTimeout(() => setStatus("idle"), 3500);
    return () => clearTimeout(timer);
  }, [status]);
  const idleLabel = label ?? copy.copy;
  return (
    <button
      className="protocol-copy"
      aria-label={textContent(label ?? copy.copy)}
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setStatus("copied");
        } catch {
          setStatus("failed");
        }
      }}
    >
      {status === "copied" ? <Check size={14} /> : <Copy size={14} />}
      <span role="status">
        {status === "copied" ? copy.copied : status === "failed" ? copy.copyFailed : idleLabel}
      </span>
    </button>
  );
}

function textContent(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) =>
      isValidElement<{ children?: ReactNode }>(child)
        ? textContent(child.props.children)
        : String(child),
    )
    .join("");
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const copy = protocolCopyFor(useLocale().locale);
  return (
    <div className="protocol-code-block">
      <div className="protocol-code-toolbar">
        <span>{copy.reference}</span>
        <CopyButton text={textContent(children)} />
      </div>
      <pre tabIndex={0}>{children}</pre>
    </div>
  );
}

export function PluginProtocol() {
  const { hash } = useLocation();
  const { locale } = useLocale();
  const copy = protocolCopyFor(locale);
  const english = locale === "en";
  const protocolSections = english ? pluginProtocolSectionsEn : protocolSectionsZh;
  const developmentPrompt = english ? agentDevelopmentPromptEn : agentDevelopmentPrompt;
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);
  return (
    <div className="guide-page protocol-page">
      <SiteHeader />
      <main>
        <section className="protocol-hero">
          <div>
            <span className="eyebrow">
              <Code2 size={15} /> WECHATAI DEVELOPERS
            </span>
            <h1>
              {copy.heroLine1}
              <br />
              {copy.heroLine2}
            </h1>
            <p>
              {copy.heroBody1}
              <br />
              {copy.heroBody2}
            </p>
            <div className="protocol-badges">
              <span>Protocol {PLUGIN_PROTOCOL_VERSION}</span>
              <span>{copy.publicDocs}</span>
            </div>
          </div>
          <div className="protocol-agent-card">
            <span className="protocol-card-label">
              <Terminal size={17} /> BUILT FOR YOU & YOUR AGENT
            </span>
            <h2>{copy.agentCardTitle}</h2>
            <p>{copy.agentCardBody}</p>
            <CopyButton text={developmentPrompt} label={copy.copyForAgent} />
            <a href="#quickstart">
              {`${copy.readInstructions} `}
              <ArrowUpRight size={14} />
            </a>
          </div>
        </section>
        <div className="protocol-resources" aria-label={copy.resourcesLabel}>
          <a href={PLUGIN_MARKDOWN_PATH}>
            <FileText size={21} />
            <span>
              <strong>{copy.markdownTitle}</strong>
              <small>{copy.markdownHint}</small>
            </span>
            <ArrowUpRight size={17} />
          </a>
          <a href={PLUGIN_API_PATH}>
            <Code2 size={21} />
            <span>
              <strong>JSON API</strong>
              <small>{copy.apiHint}</small>
            </span>
            <ArrowUpRight size={17} />
          </a>
          <a href={PLUGIN_SCHEMA_PATH}>
            <FileJson size={21} />
            <span>
              <strong>JSON Schema</strong>
              <small>{copy.schemaHint}</small>
            </span>
            <ArrowUpRight size={17} />
          </a>
        </div>
        <div className="protocol-availability" role="note">
          <strong>{copy.availabilityTitle}</strong>
          <p>
            {copy.availabilityBefore}
            <Link to={localizedHref(locale, "/developers/muse")}>{copy.museLink}</Link>
            {copy.availabilityAfter}
          </p>
        </div>
        <div className="guide-layout protocol-layout">
          <aside className="guide-toc">
            <nav aria-label={copy.tocLabel}>
              <span>{`${copy.tocHeadingPrefix}${PLUGIN_PROTOCOL_VERSION}`}</span>
              {protocolSections.map((section, i) => (
                <a key={section.id} href={`#${section.id}`}>
                  <small>{String(i + 1).padStart(2, "0")}</small>
                  {section.title}
                </a>
              ))}
            </nav>
            <p>
              {copy.readingFree}
              <br />
              <a href="/llms.txt">
                {`${copy.llmsLink} `}
                <ArrowUpRight size={12} />
              </a>
            </p>
          </aside>
          <article className="protocol-article">
            {protocolSections.map((section, i) => (
              <section className="guide-section protocol-section" id={section.id} key={section.id}>
                <span className="guide-section-number">
                  {String(i + 1).padStart(2, "0")} / PROTOCOL
                </span>
                <h2>
                  <a href={`#${section.id}`}>{section.title}</a>
                </h2>
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  skipHtml
                  components={{
                    a: ({ href, children }) => {
                      const target = href?.startsWith("/") ? localizedHref(locale, href) : href;
                      return target && target !== href ? (
                        <Link to={target}>{children}</Link>
                      ) : (
                        <a href={href}>{children}</a>
                      );
                    },
                    pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
                    table: ({ children }) => (
                      <div className="protocol-table-wrap" tabIndex={0}>
                        <table>{children}</table>
                      </div>
                    ),
                  }}
                >
                  {section.markdown}
                </Markdown>
              </section>
            ))}
          </article>
        </div>
      </main>
      <footer className="guide-footer">
        <Brand />
        <span>{copy.footerDisclaimer}</span>
        <Link to={localizedHref(locale, "/docs")}>
          {`${copy.footerDocs} `}
          <ArrowUpRight size={14} />
        </Link>
      </footer>
    </div>
  );
}
