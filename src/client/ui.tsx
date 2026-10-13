import { useEffect, useId, useRef, type ReactNode } from "react";
import { X, ArrowUpRight, Sprout, Feather, Code2, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className={`brand ${light ? "light" : ""}`}>
      <span className="brand-mark">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M4 7h6l5 18H9zm10 0h6l5 18h-6zm12 0h5l-6 18h-6z" fill="currentColor" />
        </svg>
      </span>
      <span>
        微伴<small>WECHATAI</small>
      </span>
    </span>
  );
}
export function AssistantIcon({
  color = "sage",
  small = false,
}: {
  color?: string;
  small?: boolean;
}) {
  const Icon =
    color === "peach"
      ? Feather
      : color === "blue"
        ? Code2
        : color === "lavender"
          ? Sparkles
          : Sprout;
  return (
    <span className={`assistant-icon ${color} ${small ? "small" : ""}`}>
      <Icon size={small ? 18 : 24} />
    </span>
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    const cancel = (event: Event) => {
      event.preventDefault();
      closeRef.current();
    };
    dialog.addEventListener("cancel", cancel);
    return () => {
      dialog.removeEventListener("cancel", cancel);
      dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-head">
        <div>
          <h2 id={titleId}>{title}</h2>
          {description && <p id={descriptionId}>{description}</p>}
        </div>
        <button className="icon-button" aria-label="关闭" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Empty({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function SectionTitle({
  title,
  children,
  link,
  to,
}: {
  title: string;
  children?: ReactNode;
  link?: string;
  to?: string;
}) {
  return (
    <div className="section-title">
      <h2>
        {title}
        {children}
      </h2>
      {link && to && (
        <Link to={to}>
          {link}
          <ArrowUpRight size={15} />
        </Link>
      )}
    </div>
  );
}
export function PageHead({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function relativeTime(value: number) {
  const minutes = Math.floor((Date.now() - value) / 60000);
  return minutes < 1
    ? "刚刚"
    : minutes < 60
      ? `${minutes} 分钟前`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)} 小时前`
        : `${Math.floor(minutes / 1440)} 天前`;
}
