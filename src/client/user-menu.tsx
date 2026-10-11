import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ChevronDown,
  Coins,
  Crown,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { api } from "./api";
import { authClient, useAuth } from "./auth";
import { membershipExpiry } from "./membership";
import { formatCredits, type Snapshot } from "../shared/types";
import "./user-menu.css";

type MenuUser = { id: string; name: string; email: string; image?: string | null };
type AccountSummary = Pick<Snapshot, "plan" | "planUntil"> & { balance: number };

export function UserMenu({ user }: { user: MenuUser }) {
  const { refetch } = useAuth();
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const dashboardLink = useRef<HTMLAnchorElement>(null);
  const menuId = useId();

  useEffect(() => setImageFailed(false), [user.image]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setIsAdmin(false);
    void api<{ isAdmin: boolean }>("/admin/access", { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setIsAdmin(result.isAdmin);
      })
      .catch(() => {});
    // Fetch on every opening; do not put private account data in the public page's HTML or cache.
    void api<Snapshot>("/dashboard", { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted)
          setSummary({ plan: data.plan, planUntil: data.planUntil, balance: data.wallet.balance });
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("账户信息暂时未能加载");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, retry, user.id]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const avatar = (
    <span className="account-avatar" aria-hidden="true">
      {user.image && !imageFailed ? (
        <img
          src={user.image}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      ) : (
        Array.from(user.name.trim() || user.email || "你")[0].toLocaleUpperCase()
      )}
    </span>
  );
  const plus = summary?.plan === "plus";
  return (
    <div
      className="account-menu"
      ref={container}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node))
          setOpen(false);
      }}
    >
      <button
        type="button"
        className="account-menu-trigger"
        ref={trigger}
        aria-label="用户菜单"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            requestAnimationFrame(() => dashboardLink.current?.focus());
          }
        }}
      >
        {avatar}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="account-dropdown" id={menuId} role="dialog" aria-label="账户菜单">
          <div className="account-dropdown-profile">
            {avatar}
            <div>
              <strong>{user.name || "我的账户"}</strong>
              <span title={user.email}>{user.email}</span>
            </div>
          </div>
          <Link
            className="account-menu-item"
            to="/app"
            ref={dashboardLink}
            onClick={() => setOpen(false)}
          >
            <LayoutDashboard size={17} aria-hidden="true" />
            进入工作台
            <ArrowUpRight size={15} className="account-menu-arrow" aria-hidden="true" />
          </Link>
          <div className="account-dropdown-summary" aria-busy={loading} aria-live="polite">
            {loading ? (
              <p className="account-menu-loading">正在加载会员与 credits…</p>
            ) : error ? (
              <div className="account-menu-error">
                <span>{error}</span>
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setRetry((value) => value + 1)}
                >
                  重新加载
                </button>
              </div>
            ) : summary ? (
              <>
                <Link
                  className="account-credit-balance"
                  to="/app/credits"
                  onClick={() => setOpen(false)}
                >
                  <span>
                    <Coins size={16} aria-hidden="true" />
                    Credits 余额
                  </span>
                  <strong>
                    {formatCredits(summary.balance)}
                    <ChevronDown size={13} aria-hidden="true" />
                  </strong>
                </Link>
                <div className={`account-membership ${plus ? "is-plus" : ""}`}>
                  <div className="account-membership-heading">
                    <span>
                      <Crown size={17} aria-hidden="true" />
                      {plus ? "Plus 会员" : "Free 免费账户"}
                    </span>
                    <span className="account-plan-badge">{plus ? "PLUS" : "FREE"}</span>
                  </div>
                  <p>
                    {plus ? (
                      <>
                        有效期至{" "}
                        <time dateTime={new Date(summary.planUntil).toISOString()}>
                          {membershipExpiry(summary.planUntil, true)}
                        </time>
                        <small>（北京时间）</small>
                      </>
                    ) : summary.planUntil > 0 ? (
                      "会员已到期，升级后继续使用 Plus 权益。"
                    ) : (
                      "升级后使用全部插件与更多微信链接。"
                    )}
                  </p>
                  <Link
                    className="button small full"
                    to="/app/billing"
                    onClick={() => setOpen(false)}
                  >
                    {plus ? "续费会员" : "升级会员"}
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </Link>
                </div>
              </>
            ) : null}
          </div>
          {isAdmin && (
            <Link className="account-menu-item" to="/app/admin" onClick={() => setOpen(false)}>
              <ShieldCheck size={17} />
              管理后台
              <ArrowUpRight size={15} className="account-menu-arrow" />
            </Link>
          )}
          <button
            type="button"
            className="account-menu-item account-sign-out"
            disabled={signingOut}
            onClick={async () => {
              setSigningOut(true);
              try {
                const result = await authClient.signOut();
                if (result.error) throw new Error("Sign out failed");
                await refetch();
              } catch {
                setError("退出登录失败，请重试");
              } finally {
                setSigningOut(false);
              }
            }}
          >
            <LogOut size={16} aria-hidden="true" />
            {signingOut ? "正在退出…" : "退出登录"}
          </button>
        </div>
      )}
    </div>
  );
}
