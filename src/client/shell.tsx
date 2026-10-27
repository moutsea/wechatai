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
} from "lucide-react";
import { authClient } from "./auth";
import { useApp } from "./context";
import { Brand, Modal } from "./ui";
import { formatCredits } from "../shared/types";
const items = [
  { path: "", label: "概览", en: "Overview", icon: LayoutDashboard },
  { path: "/channels", label: "渠道与模型", en: "Channels", icon: Cpu },
  { path: "/plugins", label: "插件", en: "Plugins", icon: Puzzle },
  { path: "/wechat", label: "微信连接", en: "Connection", icon: Link2 },
  { path: "/sessions", label: "会话记录", en: "Conversations", icon: MessagesSquare },
  { path: "/billing", label: "会员与 credits", en: "Membership", icon: Coins },
  { path: "/credits", label: "额度明细", en: "Credit history", icon: ReceiptText },
  { path: "/notices", label: "通知", en: "Notices", icon: Bell },
  { path: "/invite", label: "邀请好友", en: "Invite friends", icon: Gift },
];
export function Shell({ children }: { children: ReactNode }) {
  const { data, base, isAdmin, user, request, refresh, notify } = useApp();
  const navigation = isAdmin
    ? [...items, { path: "/admin", label: "管理后台", en: "Admin", icon: ShieldCheck }]
    : items;
  const [mobile, setMobile] = useState(false);
  const [settings, setSettings] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const page = navigation.find((i) => location.pathname === base + i.path) || items[0];
  const clear = async () => {
    setBusy(true);
    try {
      await request("/privacy/history", { method: "DELETE" });
      await refresh();
      setConfirm(false);
      setSettings(false);
      notify("平台上的会话记录已删除");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="workspace">
      {mobile && (
        <button
          className="sidebar-overlay"
          aria-label="收起导航"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <Link to="/" className="sidebar-brand">
          <Brand />
        </Link>
        <div className="workspace-label">
          <span className="tiny-dot" /> 个人工作台<span>PERSONAL</span>
        </div>
        <nav aria-label="主导航">
          {navigation.map((item) => (
            <NavLink
              key={item.path}
              to={base + item.path}
              end={!item.path}
              onClick={() => setMobile(false)}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.path === "/sessions" && <span className="nav-plus">PLUS</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="balance-card">
            <div>
              <span>可用 Credits</span>
              <span className="tiny-dot" />
            </div>
            <strong>{formatCredits(data?.wallet.balance ?? 0)}</strong>
            <p>让每一次好奇，都有回应。</p>
            <Link to={`${base}/billing`}>
              管理额度
              <ArrowUpRight size={15} />
            </Link>
          </div>
          <Link className="sidebar-help" to="/docs" onClick={() => setMobile(false)}>
            <CircleHelp size={17} />
            文档
            <ArrowUpRight size={14} />
          </Link>
          <button className="user-row" onClick={() => setSettings(true)}>
            <span className="avatar">{user.name.slice(0, 1) || "你"}</span>
            <span>
              <strong>{user.name || "我的账户"}</strong>
              <small>{data?.plan === "plus" ? "Plus 会员" : "Free 账户"}</small>
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
              aria-label="展开导航"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span>工作台</span>
            <ChevronRight size={14} />
            <strong>{page.label}</strong>
          </div>
          <div className="topbar-actions">
            <Link
              to={`${base}/wechat`}
              className={`connection-pill ${data?.connection.status === "connected" ? "connected" : ""}`}
            >
              <span className="tiny-dot" />
              {data?.connection.status === "connected" ? "微信已连接" : "微信待连接"}
            </Link>
            <NoticeBell />
            <span className="topbar-divider" />
            <span className="plan-label">{data?.plan === "plus" ? "PLUS" : "FREE"}</span>
          </div>
        </header>
        <main className="main-content">
          {data ? (
            <>
              <ImportantNotice />
              {children}
            </>
          ) : (
            <div className="loading-state">
              <span className="spinner" />
              <p>正在准备你的工作台…</p>
            </div>
          )}
        </main>
        <footer className="workspace-footer">
          <span>微伴，让 AI 走进日常。</span>
          <span>独立开发产品，与微信及腾讯无官方关联</span>
          <span>© {new Date().getFullYear()} Wechatai</span>
        </footer>
      </div>
      {settings && (
        <Modal title="我的账户" description={user.email} onClose={() => setSettings(false)}>
          <div className="settings-body">
            <div className="settings-note">
              <ShieldCheck />
              <div>
                <strong>你的数据，由你掌握</strong>
                <p>删除平台记录不会删除微信里的消息，也不会退回已使用的 credits。</p>
              </div>
            </div>
            <button className="button danger-outline" onClick={() => setConfirm(true)}>
              <Trash2 size={16} />
              删除全部会话记录
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await authClient.signOut();
                  if (result.error) throw new Error("退出登录失败，请重试。");
                  navigate("/", { replace: true });
                } catch {
                  notify("退出登录失败，请重试。", true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <LogOut size={16} />
              退出登录
            </button>
          </div>
        </Modal>
      )}
      {confirm && (
        <Modal
          title="删除全部会话记录？"
          description="所有会话、归档和聊天内容将从平台删除。此操作无法恢复。"
          onClose={() => setConfirm(false)}
        >
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setConfirm(false)}>
              保留记录
            </button>
            <button className="button danger" disabled={busy} onClick={() => void clear()}>
              {busy ? "正在删除…" : "确认永久删除"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
