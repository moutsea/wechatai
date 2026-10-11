import { useEffect, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock3,
  List,
  MessageSquare,
  Coins,
  Terminal,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  DOC_ARTICLES,
  DOC_GROUPS,
  DOC_TUTORIALS,
  DOCS_UPDATED_AT,
  docPath,
  findDocArticle,
  guideSectionRedirect,
} from "../../shared/docs";
import type { DocArticle } from "../../shared/docs";
import { useAuth } from "../auth";
import { Brand } from "../ui";
import { SiteFooter } from "../site-footer";
import { NotFound } from "../not-found";
import { DOC_CONTENT } from "./docs-content";

function DocsHeader() {
  const { data: session } = useAuth();
  return (
    <header className="docs-header">
      <div className="docs-header-inner">
        <Link to="/" aria-label="微伴首页">
          <Brand />
        </Link>
        <nav aria-label="顶部导航">
          <Link to="/docs" aria-current="true">
            文档
          </Link>
          <Link className="button small" to={session ? "/app" : "/register"}>
            {session ? "进入工作台" : "开始使用"}
            <ArrowUpRight size={15} />
          </Link>
        </nav>
      </div>
    </header>
  );
}

function DocsNavigation({ activePath }: { activePath: string }) {
  return (
    <nav aria-label="文档导航">
      <Link
        className="docs-nav-overview"
        to="/docs"
        aria-current={activePath === "/docs" ? "page" : undefined}
      >
        <BookOpen size={16} />
        文档概览
      </Link>
      {DOC_GROUPS.map((group) => (
        <div className="docs-nav-group" key={group.id}>
          <p>{group.title}</p>
          <ul>
            {DOC_ARTICLES.filter((article) => article.group === group.id).map((item) => {
              const article: DocArticle = item;
              return (
                <li key={article.slug}>
                  <Link
                    to={docPath(article.slug)}
                    aria-current={activePath === docPath(article.slug) ? "page" : undefined}
                  >
                    {article.navTitle ?? article.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div className="docs-nav-developer">
        <Link to="/developers/plugins">
          <Terminal size={15} />
          插件开发文档
          <ArrowUpRight size={13} />
        </Link>
      </div>
    </nav>
  );
}

function DocsLayout({ article, children }: { article?: DocArticle; children: ReactNode }) {
  const { pathname } = useLocation();
  const activePath = article ? docPath(article.slug) : "/docs";
  return (
    <div className="docs-page">
      <a className="docs-skip-link" href="#doc-content">
        跳到正文
      </a>
      <DocsHeader />
      <div className="docs-layout">
        <aside className="docs-sidebar">
          <DocsNavigation activePath={activePath} />
        </aside>
        <details className="docs-mobile-navigation" key={pathname}>
          <summary>
            <List size={17} />
            <span>文档导航</span>
            <span className="docs-mobile-current">
              {article?.navTitle ?? article?.title ?? "文档概览"}
            </span>
            <ChevronDown size={15} />
          </summary>
          <DocsNavigation activePath={activePath} />
        </details>
        <main id="doc-content" className="docs-main" tabIndex={-1}>
          <nav className="docs-breadcrumb" aria-label="面包屑导航">
            <Link to="/docs">文档</Link>
            <ChevronRight size={13} />
            <span>{article?.category ?? "概览"}</span>
          </nav>
          {children}
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}

export function DocsIndex() {
  return (
    <DocsLayout>
      <header className="docs-index-header">
        <span className="docs-kicker">微伴使用文档</span>
        <h1>在微信里，用好你的 AI。</h1>
        <p>从第一次连接，到模型、插件与会话管理。按步骤上手，或直接查找需要的功能。</p>
      </header>
      <Link className="docs-start-card" to="/docs/getting-started">
        <span className="docs-start-icon">
          <BookOpen size={24} />
        </span>
        <span>
          <strong>第一次使用？从这里开始</strong>
          <small>添加模型 → 扫码连接 → 发出第一条消息</small>
        </span>
        <ArrowRight size={20} />
      </Link>
      <section className="docs-index-section" aria-labelledby="quick-title">
        <h2 id="quick-title">常用功能</h2>
        <div className="docs-quick-grid">
          {[
            {
              to: "/docs/commands",
              title: "微信命令速查",
              text: "查看状态、切换模型和插件",
              icon: Terminal,
            },
            {
              to: "/docs/sessions",
              title: "会话与上下文",
              text: "管理话题、记录和长对话",
              icon: MessageSquare,
            },
            {
              to: "/docs/attachments",
              title: "图片、文件与语音",
              text: "先发附件，再补充要求",
              icon: BookOpen,
            },
            {
              to: "/docs/credits",
              title: "会员与 credits",
              text: "了解额度、计费和邀请奖励",
              icon: Coins,
            },
          ].map(({ to, title, text, icon: Icon }) => (
            <Link to={to} key={to}>
              <Icon size={19} />
              <strong>{title}</strong>
              <span>{text}</span>
              <ChevronRight size={15} />
            </Link>
          ))}
        </div>
      </section>
      <section className="docs-index-section" aria-labelledby="tutorials-title">
        <h2 id="tutorials-title">跟着教程配置</h2>
        <div className="docs-tutorial-list">
          {DOC_TUTORIALS.map((article) => (
            <Link to={docPath(article.slug)} key={article.slug}>
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
      <div className="docs-index-help">
        <span>
          遇到问题？先看看<Link to="/docs/faq">常见问题</Link>，也可以
          <Link to="/contact">联系我们</Link>。
        </span>
      </div>
    </DocsLayout>
  );
}

export function DocArticlePage({ slug: suppliedSlug }: { slug?: string }) {
  const params = useParams();
  const { hash, pathname } = useLocation();
  const navigate = useNavigate();
  const legacyTarget = guideSectionRedirect(pathname, hash);
  const article = findDocArticle(suppliedSlug ?? params.slug);
  useEffect(() => {
    if (legacyTarget) {
      navigate(legacyTarget, { replace: true });
      return;
    }
    if (hash) {
      // Run after the shared route scroll reset, including direct section links.
      const frame = requestAnimationFrame(() =>
        document.getElementById(hash.slice(1))?.scrollIntoView(),
      );
      return () => cancelAnimationFrame(frame);
    }
  }, [article?.slug, hash, legacyTarget, navigate]);
  if (!article) return <NotFound />;
  const content = DOC_CONTENT[article.slug];
  const currentIndex = DOC_ARTICLES.findIndex((item) => item.slug === article.slug);
  const previous = DOC_ARTICLES[currentIndex - 1];
  const next = DOC_ARTICLES[currentIndex + 1];
  return (
    <DocsLayout article={article}>
      <header className="docs-article-header">
        <div className="docs-article-label">
          {article.image && (
            <img src={article.image} alt={article.imageAlt} width="36" height="36" />
          )}
          <span className="docs-kicker">{article.category}</span>
          {article.requirement && <span className="docs-plan-tag">{article.requirement}</span>}
        </div>
        <h1>{article.title}</h1>
        <p>{article.outcome}</p>
        <div className="docs-article-meta">
          <span>
            <Clock3 size={13} />约 {article.minutes} 分钟
          </span>
          <span>
            更新于 <time dateTime={DOCS_UPDATED_AT}>{DOCS_UPDATED_AT.replaceAll("-", ".")}</time>
          </span>
        </div>
      </header>
      <article className="docs-prose" aria-label={article.title}>
        <p className="docs-intro">{content.intro}</p>
        <details className="docs-article-toc" key={article.slug}>
          <summary>
            本页内容
            <ChevronDown size={14} />
          </summary>
          <nav aria-label="本文目录">
            {content.sections.map((section) => (
              <a key={section.id} href={`#${section.id}`}>
                {section.title}
              </a>
            ))}
          </nav>
        </details>
        {content.sections.map((section) => (
          <section key={section.id} id={section.id}>
            <h2>{section.title}</h2>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children }) =>
                  href?.startsWith("/") ? (
                    <Link to={href}>{children}</Link>
                  ) : (
                    <a href={href} rel="noreferrer" target="_blank">
                      {children}
                      <span className="docs-sr-only">（新窗口打开）</span>
                    </a>
                  ),
                table: ({ children }) => (
                  <div
                    className="docs-table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="配置与命令对照表"
                  >
                    <table>{children}</table>
                  </div>
                ),
              }}
            >
              {section.body}
            </ReactMarkdown>
            {section.screenshot && (
              <figure className="docs-screenshot" style={{ maxWidth: section.screenshot.width }}>
                <a
                  href={section.screenshot.src}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`查看大图：${section.screenshot.alt}（新窗口打开）`}
                >
                  <img
                    src={section.screenshot.src}
                    alt={section.screenshot.alt}
                    width={section.screenshot.width}
                    height={section.screenshot.height}
                    loading="lazy"
                    decoding="async"
                  />
                  <span>
                    查看大图
                    <ArrowUpRight size={14} />
                  </span>
                </a>
                <figcaption>{section.screenshot.caption}</figcaption>
              </figure>
            )}
          </section>
        ))}
      </article>
      <nav className="docs-pagination" aria-label="相邻文档">
        {previous ? (
          <Link to={docPath(previous.slug)}>
            <ArrowLeft size={16} />
            <span>
              <small>上一篇</small>
              <strong>{previous.title}</strong>
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link to={docPath(next.slug)}>
            <span>
              <small>下一篇</small>
              <strong>{next.title}</strong>
            </span>
            <ArrowRight size={16} />
          </Link>
        )}
      </nav>
    </DocsLayout>
  );
}
