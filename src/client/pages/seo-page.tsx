import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowRight, Check, ChevronDown, Copy, Sprout } from "lucide-react";
import type { SeoPage } from "../../shared/seo-pages";
import { SiteHeader } from "../site-header";
import { localizedHref, useLocale } from "../locale";
import { PricingPage } from "./pricing-page";
import { SeoRelated } from "./seo-related";
import { seoPageLabels, type SeoPageLabels } from "./seo-page-labels";
import { SiteFooter } from "../site-footer";

/** Markdown with router-aware links, the same treatment the documentation uses. */
function SeoMarkdown({
  children,
  labels,
  localizeHref,
}: {
  children: string;
  labels: SeoPageLabels;
  localizeHref: (href: string) => string;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children: label }) => {
          if (href?.startsWith("#")) return <a href={href}>{label}</a>;
          if (href?.startsWith("/")) return <Link to={localizeHref(href)}>{label}</Link>;
          return (
            <a href={href} rel="noreferrer noopener" target="_blank">
              {label}
            </a>
          );
        },
        table: ({ children: table }) => (
          <div
            className="seopage-table-scroll"
            tabIndex={0}
            role="region"
            aria-label={labels.comparisonTable}
          >
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

function SeoCommands({
  items,
  labels,
}: {
  items: NonNullable<SeoPage["commands"]>;
  labels: SeoPageLabels;
}) {
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
    <div className="seopage-commands" role="group" aria-label={labels.commands}>
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
              aria-label={labels.copyCommand(command)}
              onClick={() => void copy(command)}
            >
              {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
              <span role="status">
                {copied ? labels.copied : failed ? labels.copyFailed : labels.copy}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function SeoCompareTable({
  comparison,
  labels,
}: {
  comparison: NonNullable<SeoPage["comparison"]>;
  labels: SeoPageLabels;
}) {
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
                          title={labels.compareMissing}
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

function SeoFaq({ items, labels }: { items: SeoPage["faq"]; labels: SeoPageLabels }) {
  return (
    <section className="seopage-faq" id="faq" aria-labelledby="seopage-faq-title">
      <h2 id="seopage-faq-title">{labels.faq}</h2>
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

export function SeoPageView({ page, children }: { page: SeoPage; children?: ReactNode }) {
  const { locale } = useLocale();
  const labels = seoPageLabels(locale);
  const localizeHref = (href: string) => localizedHref(locale, href);
  if (page.path === "/pricing") return <PricingPage page={page}>{children}</PricingPage>;
  const related = page.related.map((link) => ({
    ...link,
    href: localizeHref(link.href),
  }));
  return (
    <div className="seopage">
      <a className="seopage-skip" href="#seopage-content">
        {labels.skipToContent}
      </a>
      <SiteHeader active={page.path === "/pricing" ? "/pricing" : undefined} />
      <main id="seopage-content">
        <nav className="seopage-breadcrumb" aria-label={labels.breadcrumb}>
          <Link to={localizeHref("/")}>{labels.home}</Link>
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
            <Link className="button" to={localizeHref(page.ctaHref ?? "/register")}>
              {page.ctaLabel ?? labels.startFree}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link
              className="button secondary"
              to={localizeHref(
                page.secondaryCta?.href ??
                  (page.ctaHref ? "/pricing#estimate" : "/docs/getting-started"),
              )}
            >
              {page.secondaryCta?.label ?? (page.ctaHref ? labels.estimateFirst : labels.setupGuide)}
            </Link>
          </div>
          <p className="hero-prerequisite">
            <Link to={localizeHref("/wechat-clawbot")}>{labels.checkRequirements}</Link> ·{" "}
            <Link to={localizeHref("/pricing#estimate")}>{labels.estimateCosts}</Link>
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
        {page.comparison && <SeoCompareTable comparison={page.comparison} labels={labels} />}
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
        {page.commands && <SeoCommands items={page.commands} labels={labels} />}
        <article className="seopage-prose">
          {page.sections.length > 2 && (
            <details className="seopage-toc">
              <summary>
                {labels.contents}
                <ChevronDown size={14} aria-hidden="true" />
              </summary>
              <nav aria-label={labels.tableOfContents}>
                {page.sections.map((section) => (
                  <a key={section.id} href={`#${section.id}`}>
                    {section.title}
                  </a>
                ))}
                <a href="#faq">{labels.faq}</a>
              </nav>
            </details>
          )}
          {page.sections.map((section) => (
            <section key={section.id} id={section.id}>
              <h2>{section.title}</h2>
              <SeoMarkdown labels={labels} localizeHref={localizeHref}>
                {section.body}
              </SeoMarkdown>
              {section.details && (
                <details className="seopage-details">
                  <summary>
                    {section.details.summary}
                    <ChevronDown size={16} aria-hidden="true" />
                  </summary>
                  <SeoMarkdown labels={labels} localizeHref={localizeHref}>
                    {section.details.body}
                  </SeoMarkdown>
                </details>
              )}
            </section>
          ))}
          <SeoFaq items={page.faq} labels={labels} />
          <SeoRelated links={related} />
          <section className="seopage-cta" aria-labelledby="seopage-cta-title">
            <Sprout size={28} aria-hidden="true" />
            <h2 id="seopage-cta-title">{labels.ctaTitle}</h2>
            <p>{labels.ctaBody}</p>
            <Link className="button" to="/register">
              {labels.ctaAction}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </section>
          <p className="seopage-updated">
            {labels.updated}{" "}
            <time dateTime={page.updatedAt}>{page.updatedAt.replaceAll("-", ".")}</time>
          </p>
        </article>
      </main>
      <SiteFooter />
      {children}
    </div>
  );
}
