import { lazy, Suspense, useEffect, useId, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight, Menu, RefreshCw, X } from "lucide-react";
import { Brand } from "./ui";
import { useAuth } from "./auth";
import { LoadErrorBoundary, reloadPage } from "./load-error-boundary";
import { LanguageSwitcher } from "./language-switcher";
import { useLocale } from "./locale";
import { DEFAULT_LOCALE, hasRegisteredTranslation, localizedPath, type Locale } from "../shared/i18n";

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
  { to: "/", label: "首页", en: "Home", ja: "ホーム", ko: "홈", match: "/" },
  { to: "/pricing", label: "价格", en: "Pricing", ja: "料金", ko: "가격", match: "/pricing" },
  { to: "/docs", label: "文档", en: "Docs", ja: "ドキュメント", ko: "문서", match: "/docs" },
  { to: "/#how", label: "如何使用", en: "How it works", ja: "使い方", ko: "사용 방법", match: "/#how" },
] as const;

interface HeaderCopy {
  homeAria: string;
  topNav: string;
  account: string;
  login: string;
  start: string;
  workspace: string;
  workspaceFallback: string;
  openMenu: string;
  closeMenu: string;
  menuFailed: string;
  reloadMenu: string;
}

const headerCopyEn: HeaderCopy = {
  homeAria: "Wechatai home",
  topNav: "Main navigation",
  account: "Account",
  login: "Log in",
  start: "Get started",
  workspace: "Open workspace",
  workspaceFallback: "Open workspace",
  openMenu: "Open menu",
  closeMenu: "Close menu",
  menuFailed: "The account menu could not load",
  reloadMenu: "Reload the account menu",
} as const;

const headerCopyJa = {
  homeAria: "Wechatai のホーム",
  topNav: "メインナビゲーション",
  account: "アカウント",
  login: "ログイン",
  start: "無料で始める",
  workspace: "ワークスペースを開く",
  workspaceFallback: "ワークスペース",
  openMenu: "メニューを開く",
  closeMenu: "メニューを閉じる",
  menuFailed: "アカウントメニューを読み込めませんでした",
  reloadMenu: "アカウントメニューを再読み込み",
} as const;

const headerCopyZh = {
  homeAria: "微伴首页",
  topNav: "顶部导航",
  account: "账户",
  login: "登录",
  start: "免费开始",
  workspace: "进入工作台",
  workspaceFallback: "工作台",
  openMenu: "打开菜单",
  closeMenu: "关闭菜单",
  menuFailed: "账户菜单未能加载",
  reloadMenu: "重新加载账户菜单",
} as const;

const headerCopyKo: HeaderCopy = {
  homeAria: "Wechatai 홈",
  topNav: "주요 메뉴",
  account: "계정",
  login: "로그인",
  start: "무료로 시작",
  workspace: "워크스페이스 열기",
  workspaceFallback: "워크스페이스",
  openMenu: "메뉴 열기",
  closeMenu: "메뉴 닫기",
  menuFailed: "계정 메뉴를 불러오지 못했습니다",
  reloadMenu: "계정 메뉴 새로고침",
};

const headerCopies: Partial<Record<Locale, HeaderCopy>> = {
  en: headerCopyEn,
  ja: headerCopyJa,
  ko: headerCopyKo,
};

type SiteHeaderProps = {
  /** 当前页面路径，用于给对应导航项加 aria-current。 */
  active?: string;
  /** 追加在导航末尾的页面专属链接（例如开发者页的 Markdown 版本）。 */
  extra?: ReactNode;
};

/**
 * The wordmark is part of the brand, but the Chinese glyphs are page copy on
 * non-Chinese routes. Keep the same mark and typography with a Latin wordmark.
 */
export function SiteBrand({ light = false, latin }: { light?: boolean; latin: boolean }) {
  if (!latin) return <Brand light={light} />;
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
  const copy = headerCopies[locale] ?? headerCopyZh;
  const latin = locale !== DEFAULT_LOCALE;
  const navLabelKey = locale === "en" ? "en" : locale === "ko" ? "ko" : locale === "ja" ? "ja" : "label";
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
          {item[navLabelKey]}
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
            {copy.menuFailed}
          </span>
          <a href="/app">{copy.workspaceFallback}</a>
          <button
            type="button"
            className="icon-button"
            aria-label={copy.reloadMenu}
            title={copy.reloadMenu}
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
            {copy.workspace}
          </Link>
        }
      >
        <UserMenu key={session.user.id} user={session.user} />
      </Suspense>
    </LoadErrorBoundary>
  ) : (
    <>
      <Link to="/login">{copy.login}</Link>
      <Link className="button small" to="/register">
        {copy.start}
        <ArrowUpRight size={15} aria-hidden="true" />
      </Link>
    </>
  );

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link to={localeHref("/")} aria-label={copy.homeAria}>
          <SiteBrand latin={latin} />
        </Link>
        <nav aria-label={copy.topNav} className="site-header-nav">
          {links}
        </nav>
        <div className="site-header-aside">
          <LanguageSwitcher />
          <nav
            aria-label={copy.account}
            className={`site-header-account${session ? " is-authenticated" : ""}`}
          >
            {account}
          </nav>
          <button
            type="button"
            className="site-menu-toggle"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? copy.closeMenu : copy.openMenu}
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
            {item[navLabelKey]}
          </Link>
        ))}
        {extra}
        <LanguageSwitcher mobile />
        {!session && (
          <>
            <Link to="/login">{copy.login}</Link>
            <Link className="button site-mobile-cta" to="/register">
              {copy.start}
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
