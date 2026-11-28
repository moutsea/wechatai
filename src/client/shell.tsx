import { NoticeBell, ImportantNotice } from "./notices";
import { useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Cpu,
  Link2,
  MessagesSquare,
  Coins,
  ReceiptText,
  ArrowUpRight,
  ChevronRight,
  Menu,
  LogOut,
  ShieldCheck,
  Trash2,
  Settings2,
  CircleHelp,
  Gift,
  Puzzle,
  Bell,
  Cloud,
} from "lucide-react";
import { authClient } from "./auth";
import { useApp } from "./context";
import { Brand, Modal } from "./ui";
import { formatCredits } from "../shared/types";
import { MembershipNotice } from "./membership-notice";
import { localizedHref, useLocale } from "./locale";
import { LanguageSwitcher } from "./language-switcher";
import { dashboardCopy } from "../shared/i18n/dashboard";
const items = [
  { path: "", label: "overview", icon: LayoutDashboard },
  { path: "/channels", label: "channels", icon: Cpu },
  { path: "/plugins", label: "plugins", icon: Puzzle },
  { path: "/tasks", label: "tasks", icon: Cloud },
  { path: "/wechat", label: "wechat", icon: Link2 },
  { path: "/sessions", label: "sessions", icon: MessagesSquare },
  { path: "/billing", label: "billing", icon: Coins },
  { path: "/credits", label: "credits", icon: ReceiptText },
  { path: "/notices", label: "notices", icon: Bell },
  { path: "/invite", label: "invite", icon: Gift },
] as const;
export function Shell({
  children,
  onHistoryCleared,
}: {
  children: ReactNode;
  onHistoryCleared?: () => void;
}) {
  const { data, base, isAdmin, user, request, refresh, notify } = useApp();
  const { locale } = useLocale();
  const { shell: copy, dashboard } = dashboardCopy[locale];
  const overview = localizedHref(locale, base);
  const navigation = isAdmin
    ? [...items, { path: "/admin", label: "admin" as const, icon: ShieldCheck }]
    : items;
  const [mobile, setMobile] = useState(false);
  const [settings, setSettings] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const page =
    navigation.find((i) =>
      i.path
        ? location.pathname === base + i.path || location.pathname.startsWith(`${base}${i.path}/`)
        : location.pathname === overview,
    ) || items[0];
  const clear = async () => {
    setBusy(true);
    try {
      await request("/privacy/history", { method: "DELETE" });
      onHistoryCleared?.();
      await refresh();
      setConfirm(false);
      setSettings(false);
      notify(copy.deleted);
    } catch (e) {
      notify(locale === "zh-CN" ? (e as Error).message : copy.deleteFailed, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="workspace">
      {mobile && (
        <button
          className="sidebar-overlay"
          aria-label={copy.collapseNav}
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <Link to={localizedHref(locale, "/")} className="sidebar-brand">
          <Brand name={locale === "zh-CN" ? undefined : copy.brand} />
        </Link>
        <div className="workspace-label">
          <span className="tiny-dot" /> {copy.personalWorkspace}
          <span>PERSONAL</span>
        </div>
        <nav aria-label={copy.navigation}>
          {navigation.map((item) => (
            <NavLink
              key={item.path}
              to={item.path ? base + item.path : overview}
              end={!item.path}
              onClick={() => setMobile(false)}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
              <item.icon size={19} />
              <span>{copy[item.label]}</span>
              {item.path === "/sessions" && <span className="nav-plus">PLUS</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="balance-card">
            <div>
              <span>{dashboard.availableCredits}</span>
              <span className="tiny-dot" />
            </div>
            <strong>{formatCredits(data?.wallet.balance ?? 0, locale)}</strong>
            <p>{copy.balanceTagline}</p>
            <Link to={`${base}/billing`}>
              {copy.manageCredits}
              <ArrowUpRight size={15} />
            </Link>
          </div>
          <Link
            className="sidebar-help"
            to={localizedHref(locale, "/docs")}
            onClick={() => setMobile(false)}
          >
            <CircleHelp size={17} />
            {copy.docs}
            <ArrowUpRight size={14} />
          </Link>
          <button className="user-row" onClick={() => setSettings(true)}>
            <span className="avatar">{user.name.slice(0, 1) || copy.avatar}</span>
            <span>
              <strong>{user.name || copy.account}</strong>
              <small>{data?.plan === "plus" ? copy.plusAccount : copy.freeAccount}</small>
            </span>
            <Settings2 size={16} />
          </button>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label={copy.expandNav}
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span>{copy.workspace}</span>
            <ChevronRight size={14} />
            <strong>{copy[page.label]}</strong>
          </div>
          <div className="topbar-actions">
            <Link
              to={`${base}/wechat`}
              className={`connection-pill ${data?.connection.status === "connected" ? "connected" : ""}`}
            >
              <span className="tiny-dot" />
              {data?.connection.status === "connected" ? copy.connected : copy.disconnected}
            </Link>
            <NoticeBell />
            <LanguageSwitcher />
            <span className="topbar-divider" />
            <span className="plan-label">{data?.plan === "plus" ? "PLUS" : "FREE"}</span>
          </div>
        </header>
        <main className="main-content">
          {data ? (
            <>
              <ImportantNotice />
              <MembershipNotice />
              {children}
            </>
          ) : (
            <div className="loading-state">
              <span className="spinner" />
              <p>{copy.loading}</p>
            </div>
          )}
        </main>
        <footer className="workspace-footer">
          <span>{copy.footerTagline}</span>
          <span>{copy.independent}</span>
          <span>© {new Date().getFullYear()} Wechatai</span>
        </footer>
      </div>
      {settings && (
        <Modal
          title={copy.account}
          description={user.email}
          closeLabel={copy.close}
          onClose={() => setSettings(false)}
        >
          <div className="settings-body">
            <div className="settings-note">
              <ShieldCheck />
              <div>
                <strong>{copy.dataControl}</strong>
                <p>{copy.deleteNote}</p>
              </div>
            </div>
            <button className="button danger-outline" onClick={() => setConfirm(true)}>
              <Trash2 size={16} />
              {copy.deleteHistory}
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await authClient.signOut();
                  if (result.error) throw new Error(copy.signOutFailed);
                  navigate(localizedHref(locale, "/"), { replace: true });
                } catch {
                  notify(copy.signOutFailed, true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <LogOut size={16} />
              {copy.signOut}
            </button>
          </div>
        </Modal>
      )}
      {confirm && (
        <Modal
          title={copy.deleteTitle}
          description={copy.deleteDescription}
          closeLabel={copy.close}
          onClose={() => setConfirm(false)}
        >
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setConfirm(false)}>
              {copy.keepHistory}
            </button>
            <button className="button danger" disabled={busy} onClick={() => void clear()}>
              {busy ? copy.deleting : copy.confirmDelete}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
