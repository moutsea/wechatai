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
import { useLocale } from "./locale";
import { membershipExpiry } from "./membership";
import { formatCredits, type Snapshot } from "../shared/types";
import { userMenuCopy as userMenuCopyJa } from "../shared/i18n/ja/copy/user-menu";
import { userMenuCopy as userMenuCopyKo } from "../shared/i18n/ko/copy/user-menu";
import { userMenuCopy as userMenuCopyPt } from "../shared/i18n/pt/copy/user-menu";
import "./user-menu.css";

type MenuUser = { id: string; name: string; email: string; image?: string | null };
type AccountSummary = Pick<Snapshot, "plan" | "planUntil"> & { balance: number };

const userMenuCopyEn = {
  avatarFallback: "?",
  userMenu: "User menu",
  accountMenu: "Account menu",
  account: "My account",
  workspace: "Open workspace",
  loading: "Loading membership and credits…",
  loadFailed: "Could not load account details",
  reload: "Reload",
  balance: "Credit balance",
  plus: "Plus membership",
  free: "Free account",
  expiresOn: "Expires on",
  timeZone: " (Beijing time)",
  expired: "Your membership has expired. Upgrade to regain Plus benefits.",
  upgradeBenefits: "Upgrade to use all plugins and more WeChat connections.",
  renew: "Renew membership",
  upgrade: "Upgrade membership",
  admin: "Admin console",
  signingOut: "Logging out…",
  signOut: "Log out",
  signOutFailed: "Could not log out. Please try again.",
} as const;

const userMenuCopyEs = {
  avatarFallback: "?",
  userMenu: "Menú de usuario",
  accountMenu: "Menú de la cuenta",
  account: "Mi cuenta",
  workspace: "Abrir el espacio de trabajo",
  loading: "Cargando membresía y créditos…",
  loadFailed: "No se pudieron cargar los datos de la cuenta",
  reload: "Recargar",
  balance: "Saldo de créditos",
  plus: "Membresía Plus",
  free: "Cuenta gratuita",
  expiresOn: "Vence el",
  timeZone: " (hora de Pekín)",
  expired: "Tu membresía ha caducado. Actualiza para recuperar los beneficios Plus.",
  upgradeBenefits: "Actualiza para usar todos los plugins y más conexiones de WeChat.",
  renew: "Renovar membresía",
  upgrade: "Mejorar membresía",
  admin: "Consola de administración",
  signingOut: "Cerrando sesión…",
  signOut: "Cerrar sesión",
  signOutFailed: "No se pudo cerrar sesión. Inténtalo de nuevo.",
} as const;

const userMenuCopyZh = {
  avatarFallback: "你",
  userMenu: "用户菜单",
  accountMenu: "账户菜单",
  account: "我的账户",
  workspace: "进入工作台",
  loading: "正在加载会员与 credits…",
  loadFailed: "账户信息暂时未能加载",
  reload: "重新加载",
  balance: "Credits 余额",
  plus: "Plus 会员",
  free: "Free 免费账户",
  expiresOn: "有效期至",
  timeZone: "（北京时间）",
  expired: "会员已到期，升级后继续使用 Plus 权益。",
  upgradeBenefits: "升级后使用全部插件与更多微信链接。",
  renew: "续费会员",
  upgrade: "升级会员",
  admin: "管理后台",
  signingOut: "正在退出…",
  signOut: "退出登录",
  signOutFailed: "退出登录失败，请重试",
} as const;

export function UserMenu({ user }: { user: MenuUser }) {
  const { refetch } = useAuth();
  const { locale } = useLocale();
  const copy =
    locale === "en" ? userMenuCopyEn
    : locale === "ja" ? userMenuCopyJa
    : locale === "ko" ? userMenuCopyKo
    : locale === "pt" ? userMenuCopyPt
    : locale === "es" ? userMenuCopyEs
    : userMenuCopyZh;
  const formatLocale = locale === "pt" ? "pt-BR" : locale === "es" ? "es-ES" : undefined;
  const { loadFailed } = copy;
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
        if (!controller.signal.aborted) setError(loadFailed);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, retry, user.id, loadFailed]);

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
        Array.from(user.name.trim() || user.email || copy.avatarFallback)[0].toLocaleUpperCase()
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
        aria-label={copy.userMenu}
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
        <div
          className="account-dropdown"
          id={menuId}
          role="dialog"
          aria-label={copy.accountMenu}
        >
          <div className="account-dropdown-profile">
            {avatar}
            <div>
              <strong>{user.name || copy.account}</strong>
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
            {copy.workspace}
            <ArrowUpRight size={15} className="account-menu-arrow" aria-hidden="true" />
          </Link>
          <div className="account-dropdown-summary" aria-busy={loading} aria-live="polite">
            {loading ? (
              <p className="account-menu-loading">{copy.loading}</p>
            ) : error ? (
              <div className="account-menu-error">
                <span>{error}</span>
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setRetry((value) => value + 1)}
                >
                  {copy.reload}
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
                    {copy.balance}
                  </span>
                  <strong>
                    {formatCredits(summary.balance, formatLocale)}
                    <ChevronDown size={13} aria-hidden="true" />
                  </strong>
                </Link>
                <div className={`account-membership ${plus ? "is-plus" : ""}`}>
                  <div className="account-membership-heading">
                    <span>
                      <Crown size={17} aria-hidden="true" />
                      {plus ? copy.plus : copy.free}
                    </span>
                    <span className="account-plan-badge">{plus ? "PLUS" : "FREE"}</span>
                  </div>
                  <p>
                    {plus ? (
                      <>
                        {copy.expiresOn}{" "}
                        <time dateTime={new Date(summary.planUntil).toISOString()}>
                          {membershipExpiry(summary.planUntil, true, formatLocale)}
                        </time>
                        <small>{copy.timeZone}</small>
                      </>
                    ) : summary.planUntil > 0 ? (
                      copy.expired
                    ) : (
                      copy.upgradeBenefits
                    )}
                  </p>
                  <Link
                    className="button small full"
                    to="/app/billing"
                    onClick={() => setOpen(false)}
                  >
                    {plus ? copy.renew : copy.upgrade}
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </Link>
                </div>
              </>
            ) : null}
          </div>
          {isAdmin && (
            <Link className="account-menu-item" to="/app/admin" onClick={() => setOpen(false)}>
              <ShieldCheck size={17} />
              {copy.admin}
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
                setError(copy.signOutFailed);
              } finally {
                setSigningOut(false);
              }
            }}
          >
            <LogOut size={16} aria-hidden="true" />
            {signingOut ? copy.signingOut : copy.signOut}
          </button>
        </div>
      )}
    </div>
  );
}
