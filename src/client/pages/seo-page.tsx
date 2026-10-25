import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowRight, Check, ChevronDown, Sprout } from "lucide-react";
import type { SeoPage } from "../../shared/seo-pages";
import { SiteHeader } from "../site-header";
import { PricingPlans } from "./pricing-plans";
import { SiteFooter } from "../site-footer";

/** Markdown with router-aware links, the same treatment the documentation uses. */
function SeoMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children: label }) =>
          href?.startsWith("/") ? (
            <Link to={href}>{label}</Link>
          ) : (
            <a href={href} rel="noreferrer noopener" target="_blank">
              {label}
            </a>
          ),
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
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    let id: string;
    try {
      id = decodeURIComponent(hash.slice(1));
    } catch {
      return;
    }
    // Wait for the shared route scroll reset before positioning this section.
    const frame = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
    return () => cancelAnimationFrame(frame);
  }, [page.path, hash]);

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
            <Link className="button" to="/register">
              {page.ctaLabel ?? "免费开始"}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link className="button secondary" to="/docs/getting-started">
              查看使用指南
            </Link>
          </div>
          <ul className="seopage-highlights">
            {page.highlights.map((item) => (
              <li key={item}>
                <Check size={14} aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
          {/* 价格页把这段「直接回答」放到方案卡下面：卡已经给了可扫的数字，
              先念一遍整段会把首屏占满。 */}
          {page.path !== "/pricing" && <p className="seopage-answer">{page.answer}</p>}
        </header>
        {page.path === "/pricing" && (
          <>
            <PricingPlans />
            {/* 这段是给摘要/AEO 用的完整句子，排在卡后面，视觉上降级为注释，不再抢卡片。 */}
            <p className="seopage-answer seopage-answer-compact">{page.answer}</p>
          </>
        )}
        {page.steps && <SeoSteps steps={page.steps} />}
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
            </section>
          ))}
          <SeoFaq items={page.faq} />
          <SeoRelated links={page.related} />
          <section className="seopage-cta" aria-labelledby="seopage-cta-title">
            <Sprout size={28} aria-hidden="true" />
            <h2 id="seopage-cta-title">用自己的 API Key，今晚就能在微信里用上</h2>
            <p>注册后添加模型渠道，扫码连接微信。模型调用费用由你的 API 服务商另行收取。</p>
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
