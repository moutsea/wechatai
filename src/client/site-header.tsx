import { useEffect, useId, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Brand } from "./ui";
import { UserMenu } from "./user-menu";
import { useAuth } from "./auth";

/**
 * 全站唯一页头。
 *
 * 之前每个版块各有一套页头（landing / seo / docs / info / guide），
 * 导航项、CTA 文案、容器宽度、顶栏高度都不一样，跨页跳转时 logo 会横向位移。
 * 现在统一成这一套：
 *  - 导航项固定为「价格 / 文档 / 如何使用」，营销页与文档页都有价格入口；
 *  - CTA 文案只有一种（免费开始 / 进入工作台），并按登录态切换；
 *  - 容器宽度取 --container-w，与主内容同一个左边缘；
 *  - 窄屏折叠成抽屉菜单，修复营销站在手机上没有任何导航入口的问题。
 */
const NAV = [
  { to: "/pricing", label: "价格", match: "/pricing" },
  { to: "/docs", label: "文档", match: "/docs" },
  { to: "/#how", label: "如何使用", match: "/#how" },
] as const;

type SiteHeaderProps = {
  /** 当前页面路径，用于给对应导航项加 aria-current。 */
  active?: string;
  /** 追加在导航末尾的页面专属链接（例如开发者页的 Markdown 版本）。 */
  extra?: ReactNode;
};

export function SiteHeader({ active, extra }: SiteHeaderProps) {
  const { data: session, isPending } = useAuth();
  const { pathname, hash } = useLocation();
  const [open, setOpen] = useState(false);
  const menuId = useId();

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

  const links = (
    <>
      {NAV.map((item) => (
        <Link key={item.to} to={item.to} aria-current={active === item.match ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
      {extra}
    </>
  );

  const account = isPending ? null : session ? (
    <UserMenu key={session.user.id} user={session.user} />
  ) : (
    <>
      <Link to="/login">登录</Link>
      <Link className="button small" to="/register">
        免费开始
        <ArrowUpRight size={15} aria-hidden="true" />
      </Link>
    </>
  );

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link to="/" aria-label="微伴首页">
          <Brand />
        </Link>
        <nav aria-label="顶部导航" className="site-header-nav">
          {links}
        </nav>
        <div className="site-header-aside">
          <nav
            aria-label="账户"
            className={`site-header-account${session ? " is-authenticated" : ""}`}
          >
            {account}
          </nav>
          <button
            type="button"
            className="site-menu-toggle"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? "关闭菜单" : "打开菜单"}
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
            to={item.to}
            aria-current={active === item.match ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
        {extra}
        {!isPending && !session && (
          <>
            <Link to="/login">登录</Link>
            <Link className="button site-mobile-cta" to="/register">
              免费开始
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
