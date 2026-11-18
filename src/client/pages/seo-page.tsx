import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowRight, Check, ChevronDown, Copy, Sprout } from "lucide-react";
import type { SeoPage } from "../../shared/seo-pages";
import { SiteHeader } from "../site-header";
import { PricingPage } from "./pricing-page";
import { SiteFooter } from "../site-footer";

/** Markdown with router-aware links, the same treatment the documentation uses. */
function SeoMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children: label }) => {
          if (href?.startsWith("#")) return <a href={href}>{label}</a>;
          if (href?.startsWith("/")) return <Link to={href}>{label}</Link>;
          return (
            <a href={href} rel="noreferrer noopener" target="_blank">
              {label}
            </a>
          );
        },
        table: ({ children: table }) => (
          <div className="seopage-table-scroll" tabIndex={0} role="region" aria-label="对照表">
            <table>{table}</table>
          </div>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

function SeoSteps({ steps }: { steps: NonNullable<SeoPage["steps"]> }) {
  return (
    <ol className="seopage-steps">
      {steps.map((step, index) => (
        <li key={step.title}>
          <span className="seopage-step-index">{index + 1}</span>
          <span>
            <strong>{step.title}</strong>
            <small>{step.text}</small>
          </span>
        </li>
      ))}
    </ol>
  );
}

function SeoCommands({ items }: { items: NonNullable<SeoPage["commands"]> }) {
  const [status, setStatus] = useState<{ command: string; copied: boolean } | null>(null);
  async function copy(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      setStatus({ command, copied: true });
    } catch {
      setStatus({ command, copied: false });
    }
  }
  return (
    <div className="seopage-commands" role="group" aria-label="常用微信命令">
      {items.map(({ label, command }) => {
        const copied = status?.command === command && status.copied;
        const failed = status?.command === command && !status.copied;
        return (
          <div className="seopage-command" key={command}>
            <span>
              <small>{label}</small>
              <code>{command}</code>
            </span>
            <button
              type="button"
              aria-label={`复制命令 ${command}`}
              onClick={() => void copy(command)}
            >
              {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
              <span role="status">{copied ? "已复制" : failed ? "复制失败" : "复制"}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function SeoCompareTable({ comparison }: { comparison: NonNullable<SeoPage["comparison"]> }) {
  return (
    <section className="seopage-compare" aria-labelledby="seopage-compare-title">
      <h2 id="seopage-compare-title">{comparison.title}</h2>
      <div className="seopage-table-scroll">
        <table className="seopage-compare-table">
          <caption className="visually-hidden">{comparison.title}</caption>
          <thead>
            <tr>
              {comparison.columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {comparison.columns.slice(1).map((column, index) => {
                  const value = row.values[index];
                  return (
                    <td key={column}>
                      {value ?? (
                        <span
                          className="seopage-compare-missing"
                          title="没有找到可公开核实的来源，不代表对方不支持"
                        >
                          —
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="seopage-compare-note">{comparison.note}</p>
    </section>
  );
}

function SeoFaq({ items }: { items: SeoPage["faq"] }) {
  return (
    <section className="seopage-faq" id="faq" aria-labelledby="seopage-faq-title">
      <h2 id="seopage-faq-title">常见问题</h2>
      {items.map((item) => (
        <details key={item.question}>
          <summary>
            {item.question}
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <p>{item.answer}</p>
        </details>
      ))}
    </section>
  );
}

function SeoRelated({ links }: { links: SeoPage["related"] }) {
  if (!links.length) return null;
  return (
    <section className="seopage-related" aria-labelledby="seopage-related-title">
      <h2 id="seopage-related-title">继续了解</h2>
      <div className="seopage-related-grid">
        {links.map((link) => (
          <Link to={link.href} key={link.href}>
            <span>{link.label}</span>
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
}

export function SeoPageView({ page, children }: { page: SeoPage; children?: ReactNode }) {
  if (page.path === "/pricing") return <PricingPage page={page}>{children}</PricingPage>;
  return (
    <div className="seopage">
      <a className="seopage-skip" href="#seopage-content">
        跳到正文
      </a>
      <SiteHeader active={page.path === "/pricing" ? "/pricing" : undefined} />
      <main id="seopage-content">
        <nav className="seopage-breadcrumb" aria-label="面包屑">
          <Link to="/">首页</Link>
          <span aria-hidden="true">/</span>
          <span>{page.title}</span>
        </nav>
        <header className="seopage-hero">
          <span className="eyebrow">
            <span className="tiny-dot" />
            {page.eyebrow}
          </span>
          <h1>{page.h1}</h1>
          <p className="seopage-lede">{page.lede}</p>
          <div className="seopage-actions">
            <Link className="button" to={page.ctaHref ?? "/register"}>
              {page.ctaLabel ?? "免费开始"}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link
              className="button secondary"
              to={
                page.secondaryCta?.href ??
                (page.ctaHref ? "/pricing#estimate" : "/docs/getting-started")
              }
            >
              {page.secondaryCta?.label ?? (page.ctaHref ? "先算使用费用" : "查看使用指南")}
            </Link>
          </div>
          <p className="hero-prerequisite">
            <Link to="/wechat-clawbot">注册前检查接入条件</Link> ·{" "}
            <Link to="/pricing#estimate">估算平台与模型费用</Link>
          </p>
          <ul className="seopage-highlights">
            {page.highlights.map((item) => (
              <li key={item}>
                <Check size={14} aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
          <p className="seopage-answer">{page.answer}</p>
        </header>
        {page.comparison && <SeoCompareTable comparison={page.comparison} />}
        {page.steps &&
          (page.stepsSummary ? (
            <details className="seopage-details seopage-steps-details" open>
              <summary>
                {page.stepsSummary}
                <ChevronDown size={16} aria-hidden="true" />
              </summary>
              <SeoSteps steps={page.steps} />
            </details>
          ) : (
            <SeoSteps steps={page.steps} />
          ))}
        {page.commands && <SeoCommands items={page.commands} />}
        <article className="seopage-prose">
          {page.sections.length > 2 && (
            <details className="seopage-toc">
              <summary>
                本页内容
                <ChevronDown size={14} aria-hidden="true" />
              </summary>
              <nav aria-label="本页目录">
                {page.sections.map((section) => (
                  <a key={section.id} href={`#${section.id}`}>
                    {section.title}
                  </a>
                ))}
                <a href="#faq">常见问题</a>
              </nav>
            </details>
          )}
          {page.sections.map((section) => (
            <section key={section.id} id={section.id}>
              <h2>{section.title}</h2>
              <SeoMarkdown>{section.body}</SeoMarkdown>
              {section.details && (
                <details className="seopage-details">
                  <summary>
                    {section.details.summary}
                    <ChevronDown size={16} aria-hidden="true" />
                  </summary>
                  <SeoMarkdown>{section.details.body}</SeoMarkdown>
                </details>
              )}
            </section>
          ))}
          <SeoFaq items={page.faq} />
          <SeoRelated links={page.related} />
          <section className="seopage-cta" aria-labelledby="seopage-cta-title">
            <Sprout size={28} aria-hidden="true" />
            <h2 id="seopage-cta-title">确认接入条件，开始配置你的微信 AI</h2>
            <p>先检查微信 ClawBot 入口，再按模型、Agent 或通知的路径配置。模型调用费用另计。</p>
            <Link className="button" to="/register">
              免费开始
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </section>
          <p className="seopage-updated">
            本页更新于 <time dateTime={page.updatedAt}>{page.updatedAt.replaceAll("-", ".")}</time>
          </p>
        </article>
      </main>
      <SiteFooter />
      {children}
    </div>
  );
}
