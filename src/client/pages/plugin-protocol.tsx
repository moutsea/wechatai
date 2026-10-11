import { Children, isValidElement, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUpRight, Check, Code2, Copy, FileJson, FileText, Terminal } from "lucide-react";
import { Brand } from "../ui";
import { useAuth } from "../auth";
import { PLUGIN_PROTOCOL_VERSION } from "../../shared/plugins";
import {
  PLUGIN_API_PATH,
  PLUGIN_MARKDOWN_PATH,
  PLUGIN_SCHEMA_PATH,
  agentDevelopmentPrompt,
  protocolSections,
} from "../../shared/plugin-docs";
import "./guide.css";

function CopyButton({ text, children = "复制" }: { text: string; children?: ReactNode }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (status === "idle") return;
    const timer = setTimeout(() => setStatus("idle"), 3500);
    return () => clearTimeout(timer);
  }, [status]);
  return (
    <button
      className="protocol-copy"
      aria-label={textContent(children)}
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
        {status === "copied" ? "已复制" : status === "failed" ? "请选中文字复制" : children}
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
  return (
    <div className="protocol-code-block">
      <div className="protocol-code-toolbar">
        <span>示例 / REFERENCE</span>
        <CopyButton text={textContent(children)} />
      </div>
      <pre tabIndex={0}>{children}</pre>
    </div>
  );
}

export function PluginProtocol() {
  const { data: session } = useAuth();
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);
  return (
    <div className="guide-page protocol-page">
      <header className="guide-header">
        <Link to="/" aria-label="微伴首页">
          <Brand />
        </Link>
        <div>
          <Link to="/docs">文档</Link>
          <Link className="button small" to={session ? "/app" : "/register"}>
            {session ? "进入工作台" : "开始使用"}
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </header>
      <main>
        <section className="protocol-hero">
          <div>
            <span className="eyebrow">
              <Code2 size={15} /> WECHATAI DEVELOPERS
            </span>
            <h1>
              插件协议，
              <br />
              从这里开始。
            </h1>
            <p>
              让不同的模型、工具与 Agent 使用同一种调用格式。
              <br />
              定义输入与结果，把连接和计量交给平台。
            </p>
            <div className="protocol-badges">
              <span>Protocol {PLUGIN_PROTOCOL_VERSION}</span>
              <span>公开文档 · 无需登录</span>
            </div>
          </div>
          <div className="protocol-agent-card">
            <span className="protocol-card-label">
              <Terminal size={17} /> BUILT FOR YOU & YOUR AGENT
            </span>
            <h2>把协议交给你的 AI</h2>
            <p>复制开发指令，让 AI 先读协议、校验规则和示例，再开始写适配器。</p>
            <CopyButton text={agentDevelopmentPrompt}>复制给 AI agent</CopyButton>
            <a href="#quickstart">
              查看完整指令与读取方式 <ArrowUpRight size={14} />
            </a>
          </div>
        </section>
        <div className="protocol-resources" aria-label="协议文档格式">
          <a href={PLUGIN_MARKDOWN_PATH}>
            <FileText size={21} />
            <span>
              <strong>Markdown 原文</strong>
              <small>给 AI agent 直接读取</small>
            </span>
            <ArrowUpRight size={17} />
          </a>
          <a href={PLUGIN_API_PATH}>
            <Code2 size={21} />
            <span>
              <strong>JSON API</strong>
              <small>版本、状态与完整示例</small>
            </span>
            <ArrowUpRight size={17} />
          </a>
          <a href={PLUGIN_SCHEMA_PATH}>
            <FileJson size={21} />
            <span>
              <strong>JSON Schema</strong>
              <small>从实际校验规则生成</small>
            </span>
            <ArrowUpRight size={17} />
          </a>
        </div>
        <div className="protocol-availability" role="note">
          <strong>当前开放范围</strong>
          <p>
            内置 LLM 对话、DS Chat 内置插件与平台计量已实现，AI
            生图支持图片交付。第三方注册、远程执行、代码上传及第三方媒体接入尚未开放；现在可以按协议编写并在本地验证适配器。
          </p>
        </div>
        <div className="guide-layout protocol-layout">
          <aside className="guide-toc">
            <nav aria-label="插件协议目录">
              <span>协议目录 / V{PLUGIN_PROTOCOL_VERSION}</span>
              {protocolSections.map((section, i) => (
                <a key={section.id} href={`#${section.id}`}>
                  <small>{String(i + 1).padStart(2, "0")}</small>
                  {section.title}
                </a>
              ))}
            </nav>
            <p>
              读取文档免费，不消耗 credits。
              <br />
              <a href="/llms.txt">
                查看 llms.txt <ArrowUpRight size={12} />
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
        <span>独立产品 · 非微信官方服务</span>
        <Link to="/docs">
          阅读使用文档 <ArrowUpRight size={14} />
        </Link>
      </footer>
    </div>
  );
}
