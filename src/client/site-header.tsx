import { lazy, Suspense, useEffect, useId, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight, Menu, RefreshCw, X } from "lucide-react";
import { Brand } from "./ui";
import { useAuth } from "./auth";
import { LoadErrorBoundary, reloadPage } from "./load-error-boundary";
import { LanguageSwitcher } from "./language-switcher";
import { useLocale } from "./locale";
import { DEFAULT_LOCALE, hasRegisteredTranslation, localizedPath } from "../shared/i18n";

const UserMenu = lazy(() => import("./user-menu").then((module) => ({ default: module.UserMenu })));

/**
 * 全站唯一页头。
 *
 * 之前每个版块各有一套页头（landing / seo / docs / info / guide），
 * 导航项、CTA 文案、容器宽度、顶栏高度都不一样，跨页跳转时 logo 会横向位移。
 * 现在统一成这一套：
 *  - 导航项固定为「首页 / 价格 / 文档 / 如何使用」，营销页与文档页共用；
 *  - CTA 文案只有一种（免费开始 / 进入工作台），并按登录态切换；
 *  - 容器宽度取 --container-w，与主内容同一个左边缘；
 *  - 窄屏折叠成抽屉菜单，修复营销站在手机上没有任何导航入口的问题。
 */
const NAV = [
  { to: "/", label: "首页", en: "Home", match: "/" },
  { to: "/pricing", label: "价格", en: "Pricing", match: "/pricing" },
  { to: "/docs", label: "文档", en: "Docs", match: "/docs" },
  { to: "/#how", label: "如何使用", en: "How it works", match: "/#how" },
] as const;

const headerCopyEn = {
  homeAria: "Wechatai home",
  topNav: "Main navigation",
  account: "Account",
  login: "Log in",
  start: "Get started",
  workspace: "Open workspace",
  openMenu: "Open menu",
  closeMenu: "Close menu",
  menuFailed: "The account menu could not load",
  reloadMenu: "Reload the account menu",
} as const;

type SiteHeaderProps = {
  /** 当前页面路径，用于给对应导航项加 aria-current。 */
  active?: string;
  /** 追加在导航末尾的页面专属链接（例如开发者页的 Markdown 版本）。 */
  extra?: ReactNode;
};

/**
 * The wordmark is part of the brand, but the Chinese glyphs are page copy on
 * English routes. Keep the same mark and typography with an English wordmark.
 */
export function SiteBrand({ light = false, english }: { light?: boolean; english: boolean }) {
  if (!english) return <Brand light={light} />;
  return (
    <span className={`brand ${light ? "light" : ""}`}>
      <span className="brand-mark">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M4 7h6l5 18H9zm10 0h6l5 18h-6zm12 0h5l-6 18h-6z" fill="currentColor" />
        </svg>
      </span>
      <span>
        Wechatai<small>AI IN WECHAT</small>
      </span>
    </span>
  );
}

export function SiteHeader({ active, extra }: SiteHeaderProps) {
  const { data: session } = useAuth();
  const { pathname, hash } = useLocation();
  const { locale, path } = useLocale();
  const english = locale === "en";
  const copy = headerCopyEn;
  const current = active ?? (path === "/" ? (hash === "#how" ? "/#how" : "/") : undefined);
  const [open, setOpen] = useState(false);
  const menuId = useId();

  // Prefer the translated target only when that exact page is published;
  // otherwise keep the existing Chinese link instead of producing a 404 prefix.
  const localeHref = (to: string) => {
    if (locale === DEFAULT_LOCALE) return to;
    const [targetPath, targetHash] = to.split("#");
    const base = targetPath || "/";
    if (!hasRegisteredTranslation(locale, base)) return to;
    return `${localizedPath(locale, base)}${targetHash ? `#${targetHash}` : ""}`;
  };

  const links = (
    <>
      {NAV.map((item) => (
        <Link
          key={item.to}
          to={localeHref(item.to)}
          aria-current={current === item.match ? "page" : undefined}
        >
          {english ? item.en : item.label}
        </Link>
      ))}
      {extra}
    </>
  );

  // 路由变化后收起抽屉，避免导航到新页面时菜单还盖在上面。
  useEffect(() => setOpen(false), [pathname, hash]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const account = session ? (
    <LoadErrorBoundary
      key={session.user.id}
      fallback={
        <>
          <span className="visually-hidden" role="alert">
            {english ? copy.menuFailed : "账户菜单未能加载"}
          </span>
          <a href="/app">{english ? copy.workspace : "工作台"}</a>
          <button
            type="button"
            className="icon-button"
            aria-label={english ? copy.reloadMenu : "重新加载账户菜单"}
            title={english ? copy.reloadMenu : "重新加载账户菜单"}
            onClick={reloadPage}
          >
            <RefreshCw size={16} aria-hidden="true" />
          </button>
        </>
      }
    >
      <Suspense
        fallback={
          <Link className="button small" to="/app">
            {english ? copy.workspace : "进入工作台"}
          </Link>
        }
      >
        <UserMenu key={session.user.id} user={session.user} />
      </Suspense>
    </LoadErrorBoundary>
  ) : (
    <>
      <Link to="/login">{english ? copy.login : "登录"}</Link>
      <Link className="button small" to="/register">
        {english ? copy.start : "免费开始"}
        <ArrowUpRight size={15} aria-hidden="true" />
      </Link>
    </>
  );

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link to={localeHref("/")} aria-label={english ? copy.homeAria : "微伴首页"}>
          <SiteBrand english={english} />
        </Link>
        <nav aria-label={english ? copy.topNav : "顶部导航"} className="site-header-nav">
          {links}
        </nav>
        <div className="site-header-aside">
          <LanguageSwitcher />
          <nav
            aria-label={english ? copy.account : "账户"}
            className={`site-header-account${session ? " is-authenticated" : ""}`}
          >
            {account}
          </nav>
          <button
            type="button"
            className="site-menu-toggle"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={
              open
                ? english
                  ? copy.closeMenu
                  : "关闭菜单"
                : english
                  ? copy.openMenu
                  : "打开菜单"
            }
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>
      <div
        id={menuId}
        className={`site-mobile-menu${open ? " is-open" : ""}`}
        onClick={(event) => {
          // 同一页面或锚点不会改变 pathname/hash；普通链接与附加链接都在点击时收起。
          if (event.target instanceof Element && event.target.closest("a[href]")) setOpen(false);
        }}
      >
        {NAV.map((item) => (
          <Link
            key={item.to}
            to={localeHref(item.to)}
            aria-current={current === item.match ? "page" : undefined}
          >
            {english ? item.en : item.label}
          </Link>
        ))}
        {extra}
        <LanguageSwitcher mobile />
        {!session && (
          <>
            <Link to="/login">{english ? copy.login : "登录"}</Link>
            <Link className="button site-mobile-cta" to="/register">
              {english ? copy.start : "免费开始"}
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
