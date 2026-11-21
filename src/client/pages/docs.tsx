import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bot,
  ChevronDown,
  ChevronRight,
  Clock3,
  List,
  MessageSquare,
  Coins,
  Network,
  Search,
  Terminal,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DOC_ARTICLES, DOC_GROUPS, docPath, guideSectionRedirect } from "../../shared/docs";
import type { DocArticle, DocContent, DocSection } from "../../shared/docs";
import { EN_DOC_ARTICLES, EN_DOC_GROUPS } from "../../shared/i18n/en/docs";
import type { Locale } from "../../shared/i18n";
import { EN_DOC_CONTENT } from "../../shared/i18n/en/data/docs-content-en";
import { SiteHeader } from "../site-header";
import { SiteFooter } from "../site-footer";
import { NotFound } from "../not-found";
import { useLocale } from "../locale";
import { useDocumentInputs } from "../document-handoff";
import { DOC_CONTENT } from "./docs-content";
import { docsCopy, type DocsCopy } from "./docs-copy";
import {
  DocChannelExample,
  DocCustomChannelExample,
  DocModelSyncExample,
} from "./doc-channel-example";
import { DocModelCommands, DocModelSettings } from "./doc-model-guide";
import { DocBridgeDiagram } from "./doc-bridge-diagram";
import { DocModelProviders } from "./doc-model-providers";
import { DocKimiseekImport } from "./doc-kimiseek-import";
import { DocWechatCode, DocWechatConnection, DocWechatStatus } from "./doc-wechat-connection";
import { DocPluginSetup } from "./doc-plugin-setup";
import { DocNotificationDelivery, DocPluginGuide, DocRoleplayLore } from "./doc-plugin-guides";
import { DocAgentPairing, DocOpenClawConfigs, DocTutorialChat } from "./doc-agent-tutorials";
import {
  DocAttachmentFlow,
  DocCreditExample,
  DocMembershipPlans,
  DocVoiceExample,
} from "./doc-usage-examples";

function docsHref(locale: Locale, slug: string): string {
  return locale === "en" ? `/en/docs/${slug}` : docPath(slug as DocArticle["slug"]);
}

function docsIndexHref(locale: Locale): string {
  return locale === "en" ? "/en/docs" : "/docs";
}

function articlesFor(locale: Locale): readonly DocArticle[] {
  return locale === "en" ? EN_DOC_ARTICLES : DOC_ARTICLES;
}

function groupsFor(locale: Locale): readonly { id: string; title: string }[] {
  return locale === "en" ? EN_DOC_GROUPS : DOC_GROUPS;
}

function contentFor(locale: Locale, slug: string): DocContent {
  return locale === "en"
    ? EN_DOC_CONTENT[slug as keyof typeof EN_DOC_CONTENT]
    : DOC_CONTENT[slug as DocArticle["slug"]];
}

function DocMarkdown({ children, copy }: { children: string; copy: DocsCopy }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children }) =>
          href?.startsWith("/") ? (
            <Link to={href}>{children}</Link>
          ) : (
            <a href={href} rel="noreferrer" target="_blank">
              {children}
              <span className="docs-sr-only">{copy.externalLinkSuffix}</span>
            </a>
          ),
        table: ({ children }) => (
          <div className="docs-table-scroll" tabIndex={0} role="region" aria-label={copy.tableAria}>
            <table>{children}</table>
          </div>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

function DocsNavigation({
  activePath,
  inputId,
  locale,
  copy,
  articles,
  groups,
}: {
  activePath: string;
  inputId: string;
  locale: Locale;
  copy: DocsCopy;
  articles: readonly DocArticle[];
  groups: readonly { id: string; title: string }[];
}) {
  // 文档一共二十来篇，本地过滤就够；不做全文检索，只匹配标题、分类和摘要，
  // 免得给出一个「搜得到但答不上」的结果。
  const inputs = useDocumentInputs();
  const [query, setQuery] = useState(() => inputs?.get(inputId) ?? "");
  const keyword = query.trim().toLowerCase();
  const matches = (entry: DocArticle | string) => {
    if (!keyword) return true;
    const text =
      typeof entry === "string"
        ? entry
        : `${entry.title} ${entry.navTitle ?? ""} ${entry.category} ${entry.description}`;
    return text.toLowerCase().includes(keyword);
  };
  const navigationGroups = groups.map((group) => ({
    group,
    articles: articles.filter(
      (article) =>
        article.slug !== "model-providers" &&
        article.group === group.id &&
        matches(article as DocArticle),
    ),
  }));
  const providersArticle = articles.find((article) => article.slug === "model-providers");
  const showProviders = providersArticle && matches(providersArticle);
  const museTitle = copy.museTitle;
  const showMuse = matches(museTitle);
  const hits =
    navigationGroups.reduce((total, item) => total + item.articles.length, 0) +
    Number(showProviders) +
    Number(showMuse);
  return (
    <nav aria-label={copy.navAria} data-handoff-focus-fallback={inputId}>
      <label className="docs-search">
        <Search size={15} aria-hidden="true" />
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={copy.searchPlaceholder}
          aria-label={copy.searchAria}
        />
      </label>
      <Link
        id={`${inputId}-overview`}
        className="docs-nav-overview"
        to={docsIndexHref(locale)}
        aria-current={activePath === docsIndexHref(locale) ? "page" : undefined}
      >
        <BookOpen size={16} />
        {copy.overview}
      </Link>
      {navigationGroups.map(({ group, articles }) =>
        articles.length === 0 ? null : (
          <div className="docs-nav-group" key={group.id}>
            <p>{group.title}</p>
            <ul>
              {articles.map((article) => (
                <li key={article.slug}>
                  <Link
                    id={`${inputId}-${article.slug}`}
                    to={docsHref(locale, article.slug)}
                    aria-current={
                      activePath === docsHref(locale, article.slug) ? "page" : undefined
                    }
                    onClick={() => setQuery("")}
                  >
                    {article.navTitle ?? article.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ),
      )}
      {keyword && hits === 0 && (
        <p className="docs-search-empty" role="status">
          {copy.emptyResult(query.trim())}
        </p>
      )}
      <div className="docs-nav-developer">
        {showProviders && (
          <Link
            id={`${inputId}-model-providers`}
            to={docsHref(locale, providersArticle.slug)}
            aria-current={
              activePath === docsHref(locale, providersArticle.slug) ? "page" : undefined
            }
            onClick={() => setQuery("")}
          >
            <Network size={15} />
            {providersArticle.title}
            <ChevronRight size={13} />
          </Link>
        )}
        {showMuse && (
          <Link id={`${inputId}-muse`} to="/developers/muse">
            <Bot size={15} />
            {museTitle}
            <ArrowUpRight size={13} />
          </Link>
        )}
        <Link id={`${inputId}-developer`} to="/developers/plugins">
          <Terminal size={15} />
          {copy.developerDocs}
          <ArrowUpRight size={13} />
        </Link>
      </div>
    </nav>
  );
}

function DocTableOfContents({
  slug,
  sections,
  copy,
  mobile = false,
}: {
  slug: string;
  sections: readonly DocSection[];
  copy: DocsCopy;
  mobile?: boolean;
}) {
  return (
    <details
      id={`docs-toc-${mobile ? "mobile" : "desktop"}`}
      className={`docs-article-toc${mobile ? " docs-article-toc-mobile" : ""}`}
      key={slug}
      open={mobile ? undefined : true}
      onKeyDown={(event) => {
        if (mobile && event.key === "Escape") {
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}
    >
      <summary>
        <List size={16} aria-hidden="true" />
        {copy.tocTitle}
        <ChevronDown size={14} aria-hidden="true" />
      </summary>
      <nav aria-label={copy.tocAria}>
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              if (mobile) event.currentTarget.closest("details")!.open = false;
              document.getElementById(section.id)?.focus({ preventScroll: true });
            }}
          >
            {section.title}
          </a>
        ))}
      </nav>
    </details>
  );
}

function DocsLayout({
  article,
  locale,
  copy,
  sections,
  children,
}: {
  article?: DocArticle;
  locale: Locale;
  copy: DocsCopy;
  sections?: readonly DocSection[];
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const activePath = article ? docsHref(locale, article.slug) : docsIndexHref(locale);
  const articles = articlesFor(locale);
  const groups = groupsFor(locale);
  return (
    <div className="docs-page">
      <a className="docs-skip-link" href="#doc-content">
        {copy.skipToContent}
      </a>
      <SiteHeader active="/docs" />
      <div className="docs-layout">
        <aside id="docs-sidebar" className="docs-sidebar">
          {article && sections && (
            <DocTableOfContents slug={article.slug} sections={sections} copy={copy} />
          )}
          <DocsNavigation
            activePath={activePath}
            inputId="docs-search-desktop"
            locale={locale}
            copy={copy}
            articles={articles}
            groups={groups}
          />
        </aside>
        <details id="docs-mobile-navigation" className="docs-mobile-navigation" key={pathname}>
          <summary>
            <List size={17} />
            <span>{copy.mobileNav}</span>
            <span className="docs-mobile-current">
              {article?.navTitle ?? article?.title ?? copy.overviewFallback}
            </span>
            <ChevronDown size={15} />
          </summary>
          <DocsNavigation
            activePath={activePath}
            inputId="docs-search-mobile"
            locale={locale}
            copy={copy}
            articles={articles}
            groups={groups}
          />
        </details>
        <main id="doc-content" className="docs-main" tabIndex={-1}>
          <nav className="docs-breadcrumb" aria-label={copy.breadcrumbAria}>
            <Link to={docsIndexHref(locale)}>{copy.breadcrumbDocs}</Link>
            <ChevronRight size={13} />
            <span>{article?.category ?? copy.breadcrumbOverview}</span>
          </nav>
          {children}
        </main>
        {article && sections && (
          <DocTableOfContents slug={article.slug} sections={sections} copy={copy} mobile />
        )}
      </div>
      <SiteFooter />
    </div>
  );
}

export function DocsIndex() {
  const { locale } = useLocale();
  const copy = docsCopy(locale);
  const articles = articlesFor(locale);
  const groups = groupsFor(locale);
  const tutorials = articles.filter((article) => article.group === "tutorials");
  const quickIcons = [Terminal, MessageSquare, BookOpen, Coins];
  return (
    <DocsLayout locale={locale} copy={copy}>
      <header className="docs-index-header">
        <span className="docs-kicker">{copy.kicker}</span>
        <h1>{copy.indexTitle}</h1>
        <p>{copy.indexIntro}</p>
        <p className="docs-index-lede">{copy.indexLede}</p>
      </header>
      <Link className="docs-start-card" to={docsHref(locale, "getting-started")}>
        <span className="docs-start-icon">
          <BookOpen size={24} />
        </span>
        <span>
          <strong>{copy.startStrong}</strong>
          <small>{copy.startSmall}</small>
        </span>
        <ArrowRight size={20} />
      </Link>
      <section className="docs-index-section" aria-labelledby="quick-title">
        <h2 id="quick-title">{copy.quickTitle}</h2>
        <div className="docs-quick-grid">
          {copy.quickLinks.map(({ slug, title, text }, index) => {
            const Icon = quickIcons[index];
            return (
              <Link to={docsHref(locale, slug)} key={slug}>
                <Icon size={19} />
                <strong>{title}</strong>
                <span>{text}</span>
                <ChevronRight size={15} />
              </Link>
            );
          })}
        </div>
      </section>
      <section className="docs-index-section" aria-labelledby="tutorials-title">
        <h2 id="tutorials-title">{copy.tutorialsTitle}</h2>
        <p>
          {copy.tutorialsIntroBefore}
          <Link to="/wechat-deepseek">{copy.tutorialsIntroLink}</Link>
          {copy.tutorialsIntroAfter}
        </p>
        <div className="docs-tutorial-list">
          {tutorials.map((article) => (
            <Link to={docsHref(locale, article.slug)} key={article.slug}>
              <img src={article.image} alt="" width="42" height="42" />
              <span>
                <strong>{article.title}</strong>
                <small>{article.outcome}</small>
              </span>
              <ArrowUpRight size={18} />
            </Link>
          ))}
        </div>
      </section>
      <section className="docs-index-section" aria-labelledby="all-docs-title">
        <h2 id="all-docs-title">{copy.allDocsTitle}</h2>
        <p className="docs-index-lede">{copy.allDocsLede}</p>
        {groups.map((group) => {
          const groupArticles = articles.filter((article) => article.group === group.id);
          if (!groupArticles.length) return null;
          return (
            <div className="docs-index-group" key={group.id}>
              <h3>{group.title}</h3>
              <ul className="docs-index-doc-list">
                {groupArticles.map((article) => (
                  <li key={article.slug}>
                    <Link to={docsHref(locale, article.slug)}>
                      <span>
                        <strong>{article.title}</strong>
                        <small>{article.description}</small>
                      </span>
                      <ChevronRight size={15} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>
      <div className="docs-index-help">
        <span>
          {copy.helpBefore}
          <Link to={docsHref(locale, "faq")}>{copy.helpFaq}</Link>
          {copy.helpMiddle}
          <Link to="/contact">{copy.helpContact}</Link>
        </span>
      </div>
    </DocsLayout>
  );
}

export function DocArticlePage({ slug: suppliedSlug }: { slug?: string }) {
  const params = useParams();
  const { hash, pathname } = useLocation();
  const navigate = useNavigate();
  const { locale } = useLocale();
  const copy = docsCopy(locale);
  const articles = articlesFor(locale);
  const legacyTarget = guideSectionRedirect(pathname, hash);
  const article = articles.find((item) => item.slug === (suppliedSlug ?? params.slug));
  useEffect(() => {
    if (legacyTarget) {
      navigate(legacyTarget, { replace: true });
      return;
    }
  }, [legacyTarget, navigate]);
  if (!article) return <NotFound />;
  const content = contentFor(locale, article.slug);
  const currentIndex = articles.findIndex((item) => item.slug === article.slug);
  const previous = articles[currentIndex - 1];
  const next = articles[currentIndex + 1];
  return (
    <DocsLayout article={article} locale={locale} copy={copy} sections={content.sections}>
      <header className="docs-article-header">
        <div className="docs-article-label">
          {article.image && (
            <img src={article.image} alt={article.imageAlt} width="36" height="36" />
          )}
          <span className="docs-kicker">{article.category}</span>
          {article.requirement && <span className="docs-plan-tag">{article.requirement}</span>}
        </div>
        <h1>{article.seoTitle ?? article.title}</h1>
        <p>{article.outcome}</p>
        <div className="docs-article-meta">
          <span>
            <Clock3 size={13} />
            {copy.minutes(article.minutes)}
          </span>
          <span>
            {copy.updated}{" "}
            <time dateTime={article.updatedAt}>{article.updatedAt.replaceAll("-", ".")}</time>
          </span>
        </div>
      </header>
      <article className="docs-prose" aria-label={article.title}>
        {content.intro && <p className="docs-intro">{content.intro}</p>}
        {content.sections.map((section, index) => (
          <section key={section.id} id={section.id} tabIndex={-1}>
            {section.group && section.group !== content.sections[index - 1]?.group && (
              <p className="docs-kicker docs-faq-group">{section.group}</p>
            )}
            <h2>{section.title}</h2>
            {section.illustration === "wechat-ai-bridge" && <DocBridgeDiagram />}
            <DocMarkdown copy={copy}>{section.body}</DocMarkdown>
            {section.illustration === "channel-form" && <DocChannelExample />}
            {section.illustration === "channel-models" && <DocModelSyncExample showTools />}
            {section.illustration === "model-settings" && <DocModelSettings />}
            {section.illustration === "model-commands" && <DocModelCommands />}
            {section.illustration === "channel-setup" && (
              <>
                <DocChannelExample />
                <ol start={2}>
                  <li>
                    {locale === "en" ? (
                      <>
                        Enter the provider's <strong>API Key</strong> (“API Key”) and click “Save
                        and fetch models” (“保存并获取模型”); Wechatai tries to sync the available
                        models.
                      </>
                    ) : (
                      <>
                        填入该服务商的 <strong>API Key</strong>
                        ，点击「保存并获取模型」，系统会尝试同步可用模型。
                      </>
                    )}
                  </li>
                </ol>
                <DocModelSyncExample />
                <ol start={3}>
                  <li>
                    {locale === "en" ? (
                      <>
                        Confirm the channel now has the text model you want. If syncing failed, add
                        it manually following the{" "}
                        <Link to="/en/docs/channels-models#import">channels and models guide</Link>.
                      </>
                    ) : (
                      <>
                        确认渠道下已有想用的文本模型。若同步失败，按
                        <Link to="/docs/channels-models#import">渠道与模型教程</Link>手动添加即可。
                      </>
                    )}
                  </li>
                </ol>
              </>
            )}
            {section.illustration === "model-providers" && <DocModelProviders />}
            {section.illustration === "kimiseek-import" && <DocKimiseekImport />}
            {section.illustration === "wechat-connection" && <DocWechatConnection />}
            {section.illustration === "wechat-code" && <DocWechatCode />}
            {section.illustration === "wechat-status" && <DocWechatStatus />}
            {section.illustration === "plugin-setup" && <DocPluginSetup />}
            {section.illustration === "plugin-cloud" && <DocPluginGuide kind="cloud" />}
            {section.illustration === "plugin-search" && <DocPluginGuide kind="search" />}
            {section.illustration === "plugin-roleplay" && <DocPluginGuide kind="roleplay" />}
            {section.illustration === "roleplay-lore" && <DocRoleplayLore />}
            {section.illustration === "plugin-assistant" && <DocPluginGuide kind="assistant" />}
            {section.illustration === "plugin-notification" && (
              <DocPluginGuide kind="notification" />
            )}
            {section.illustration === "notification-delivery" && <DocNotificationDelivery />}
            {section.illustration === "agent-pairing-openclaw" && (
              <DocAgentPairing kind="openclaw" />
            )}
            {section.illustration === "agent-pairing-hermes" && <DocAgentPairing kind="hermes" />}
            {section.illustration === "openclaw-configs" && <DocOpenClawConfigs />}
            {section.illustration === "tutorial-deepseek-chat" && (
              <DocTutorialChat kind="deepseek" />
            )}
            {section.illustration === "tutorial-openclaw-chat" && (
              <DocTutorialChat kind="openclaw" />
            )}
            {section.illustration === "tutorial-hermes-chat" && <DocTutorialChat kind="hermes" />}
            {section.illustration === "attachment-flow" && <DocAttachmentFlow />}
            {section.illustration === "voice-example" && <DocVoiceExample />}
            {section.illustration === "membership-plans" && <DocMembershipPlans />}
            {section.illustration === "credit-example" && <DocCreditExample />}
            {section.screenshots?.map((shot) => (
              <figure key={shot.src} className="docs-screenshot" style={{ maxWidth: shot.width }}>
                <a
                  href={shot.src}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={copy.viewLarge(shot.alt)}
                >
                  <img
                    src={shot.src}
                    alt={shot.alt}
                    width={shot.width}
                    height={shot.height}
                    loading="lazy"
                    decoding="async"
                  />
                  <span>
                    {copy.viewLargeLabel}
                    <ArrowUpRight size={14} />
                  </span>
                </a>
                <figcaption>{shot.caption}</figcaption>
              </figure>
            ))}
            {section.afterIllustration && (
              <DocMarkdown copy={copy}>{section.afterIllustration}</DocMarkdown>
            )}
            {section.followUpIllustration === "kimiseek-import" && <DocKimiseekImport />}
            {section.followUpIllustration === "wechat-connection" && <DocWechatConnection />}
            {section.details && (
              <div className="docs-disclosures">
                {section.details.map((detail) => (
                  <details className="docs-disclosure" key={detail.title}>
                    <summary>
                      <span>{detail.title}</span>
                      <ChevronDown size={17} aria-hidden="true" />
                    </summary>
                    <div className="docs-disclosure-content">
                      <DocMarkdown copy={copy}>{detail.body}</DocMarkdown>
                      {detail.illustration === "custom-channel" && <DocCustomChannelExample />}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </section>
        ))}
      </article>
      <nav className="docs-pagination" aria-label={copy.adjacentAria}>
        {previous ? (
          <Link to={docsHref(locale, previous.slug)}>
            <ArrowLeft size={16} />
            <span>
              <small>{copy.previous}</small>
              <strong>{previous.title}</strong>
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link to={docsHref(locale, next.slug)}>
            <span>
              <small>{copy.next}</small>
              <strong>{next.title}</strong>
            </span>
            <ArrowRight size={16} />
          </Link>
        )}
      </nav>
    </DocsLayout>
  );
}
