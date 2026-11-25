import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell, CheckCheck, ChevronRight, Megaphone, X } from "lucide-react";
import { useApp } from "./context";
import { json } from "./api";
import { Modal } from "./ui";
import { ChatMarkdown } from "./chat-markdown";
import { noticeDate, type UserNotice, type UserNotices } from "../shared/site-notices";
import { unreadNoticeCount } from "../shared/site-notices";
import { connectorUpgradePath, type ConnectorUpdateNotice } from "../shared/connector-update";
import { ConnectorUpdateCard } from "./connector-update-notice";
import { useLocale } from "./locale";
import { dashboardCopy, formatCopy } from "../shared/i18n/dashboard";
import "./notices.css";

type NoticeState = {
  feed: UserNotices | null;
  error: string;
  busy: boolean;
  version: number;
  refresh: () => Promise<void>;
  open: (notice: UserNotice) => void;
  markRead: (notice: UserNotice) => Promise<void>;
  readAll: (snapshot: UserNotices) => Promise<void>;
  readConnectorUpdate: (notice: ConnectorUpdateNotice) => Promise<void>;
};
const NoticesContext = createContext<NoticeState | null>(null);
export function useNotices() {
  const value = useContext(NoticesContext);
  if (!value) throw new Error("Missing notices context");
  return value;
}

export function NoticeProvider({ children }: { children: ReactNode }) {
  const { locale } = useLocale();
  const { notices: copy, shell } = dashboardCopy[locale];
  const { request, notify, user } = useApp();
  const [feed, setFeed] = useState<UserNotices | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState<UserNotice | null>(null);
  const controller = useRef<AbortController | null>(null);
  const operations = useRef(new Set<string>());
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    try {
      const result = await request<UserNotices>("/notices?limit=5", { signal: current.signal });
      if (!current.signal.aborted) {
        setFeed(result);
        setError("");
        setVersion((v) => v + 1);
      }
    } catch (e) {
      if (!current.signal.aborted) setError((e as Error).message);
    }
  }, [request]);
  useEffect(() => {
    generation.current++;
    operations.current.clear();
    setBusy(false);
    setFeed(null);
    setSelected(null);
    setError("");
    void refresh();
    const visibleRefresh = () => {
      if (!document.hidden) void refresh();
    };
    const timer = window.setInterval(visibleRefresh, 60000);
    document.addEventListener("visibilitychange", visibleRefresh);
    window.addEventListener("online", visibleRefresh);
    return () => {
      generation.current++;
      controller.current?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visibleRefresh);
      window.removeEventListener("online", visibleRefresh);
    };
  }, [refresh, user.email]);
  const mark = async (
    notice: UserNotice | null,
    action: "read" | "read-all",
    readThrough?: number,
    connectorVersion?: string,
  ) => {
    const key = notice
      ? `${notice.id}:${notice.revision}:${action}`
      : `all:${readThrough}:${connectorVersion ?? ""}`;
    if (operations.current.has(key)) return;
    const epoch = generation.current;
    operations.current.add(key);
    setBusy(true);
    try {
      await request(notice ? `/notices/${notice.id}/${action}` : "/notices/read-all", {
        ...json(notice ? { revision: notice.revision } : { readThrough, connectorVersion }),
        signal: AbortSignal.timeout(15000),
      });
      if (epoch !== generation.current) return;
      setSelected((value) =>
        value &&
        (notice
          ? value.id === notice.id && value.revision === notice.revision
          : value.publishedRevision <= (readThrough ?? -1))
          ? { ...value, isRead: true }
          : value,
      );
      await refresh();
    } catch (e) {
      if (epoch !== generation.current) return;
      notify(locale === "zh-CN" ? (e as Error).message : copy.updateFailed, true);
      await refresh();
    } finally {
      if (epoch === generation.current) {
        operations.current.delete(key);
        setBusy(operations.current.size > 0);
      }
    }
  };
  const open = (notice: UserNotice) => {
    // Viewing is local and never waits for another notification's read request.
    setSelected(notice);
    if (!notice.isRead) void mark(notice, "read");
  };
  const readConnectorUpdate = async (notice: ConnectorUpdateNotice) => {
    const key = `connector:${notice.version}`;
    if (notice.isRead || operations.current.has(key)) return;
    const epoch = generation.current;
    operations.current.add(key);
    setBusy(true);
    try {
      await request("/notices/connector-update/read", {
        ...json({ version: notice.version }),
        signal: AbortSignal.timeout(15000),
      });
      if (epoch !== generation.current) return;
      await refresh();
    } catch (e) {
      if (epoch !== generation.current) return;
      notify(locale === "zh-CN" ? (e as Error).message : copy.updateFailed, true);
      await refresh();
    } finally {
      if (epoch === generation.current) {
        operations.current.delete(key);
        setBusy(operations.current.size > 0);
      }
    }
  };
  return (
    <NoticesContext.Provider
      value={{
        feed,
        error,
        busy,
        version,
        refresh,
        open,
        markRead: (notice) => mark(notice, "read"),
        readAll: (snapshot) =>
          mark(null, "read-all", snapshot.readThrough, snapshot.connectorUpdate?.version),
        readConnectorUpdate,
      }}
    >
      {children}
      {selected && (
        <Modal
          title={selected.title}
          description={`${selected.priority === "important" ? copy.important + " · " : ""}${noticeDate(selected.publishedAt ?? selected.createdAt, locale)}`}
          closeLabel={shell.close}
          wide
          onClose={() => setSelected(null)}
        >
          <div className="notice-detail">
            <ChatMarkdown content={selected.content} id={`notice-${selected.id}`} />
          </div>
          <div className="modal-actions">
            {!selected.isRead && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void mark(selected, "read")}
              >
                {copy.read}
              </button>
            )}
            <button className="button" onClick={() => setSelected(null)}>
              {copy.dismiss}
            </button>
          </div>
        </Modal>
      )}
    </NoticesContext.Provider>
  );
}

export function NoticeItem({
  notice,
  onOpen,
  disabled = false,
}: {
  notice: UserNotice;
  onOpen: () => void;
  disabled?: boolean;
}) {
  const { locale } = useLocale();
  const copy = dashboardCopy[locale].notices;
  return (
    <button
      className={`notice-item ${notice.isRead ? "" : "unread"}`}
      onClick={onOpen}
      disabled={disabled}
    >
      <span className={`notice-item-icon ${notice.priority}`}>
        <Megaphone size={17} />
      </span>
      <span className="notice-item-copy">
        <span className="notice-item-title">
          {notice.title}
          {!notice.isRead && <span className="notice-unread-dot" aria-label={copy.unread} />}
        </span>
        <span className="notice-item-preview">
          {notice.content.replace(/[#*`>[\]]/g, "").slice(0, 110)}
        </span>
        <span className="notice-item-date">
          {noticeDate(notice.publishedAt ?? notice.createdAt, locale)}
          {notice.priority === "important" && ` · ${copy.important}`}
        </span>
      </span>
      <ChevronRight size={16} className="notice-chevron" />
    </button>
  );
}

export function NoticeBell() {
  const { locale } = useLocale();
  const { notices: copy, shell } = dashboardCopy[locale];
  const { feed, error, busy, refresh, open, readAll, readConnectorUpdate } = useNotices();
  const { base } = useApp();
  const [expanded, setExpanded] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const unread = unreadNoticeCount(feed);
  useEffect(() => setExpanded(false), [location.pathname]);
  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setExpanded(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpanded(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [expanded]);
  return (
    <div className="notice-bell" ref={root}>
      <button
        ref={button}
        className="icon-button notice-bell-button"
        aria-label={unread ? formatCopy(copy.unreadCount, { count: unread }) : shell.notices}
        aria-expanded={expanded}
        aria-controls="notice-popover"
        onClick={() => {
          setExpanded(!expanded);
          if (!expanded) void refresh();
        }}
      >
        <Bell size={19} />
        {Boolean(unread) && <span className="notice-badge">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {expanded && (
        <section id="notice-popover" className="notice-popover" aria-label={copy.siteNotices}>
          <div className="notice-popover-heading">
            <h2>{shell.notices}</h2>
            {Boolean(unread) && (
              <button
                className="text-link"
                disabled={busy}
                onClick={() => feed && void readAll(feed)}
              >
                <CheckCheck size={15} />
                {copy.readAll}
              </button>
            )}
          </div>
          {error ? (
            <div className="notice-empty" role="alert">
              <p>{locale === "zh-CN" ? error : copy.loadFailed}</p>
              <button className="text-link" onClick={() => void refresh()}>
                {shell.reload}
              </button>
            </div>
          ) : !feed ? (
            <p className="notice-empty" role="status">
              {copy.loading}
            </p>
          ) : !feed.items.length && !feed.connectorUpdate ? (
            <p className="notice-empty">{copy.empty}</p>
          ) : (
            <>
              {feed.connectorUpdate && (
                <ConnectorUpdateCard
                  notice={feed.connectorUpdate}
                  base={base}
                  busy={busy}
                  onRead={() => void readConnectorUpdate(feed.connectorUpdate!)}
                  onNavigate={() => setExpanded(false)}
                />
              )}
              {feed.items.map((notice) => (
                <NoticeItem
                  key={notice.id}
                  notice={notice}
                  onOpen={() => {
                    setExpanded(false);
                    open(notice);
                  }}
                />
              ))}
            </>
          )}
          <Link
            className="notice-view-all"
            to={`${base}/notices`}
            onClick={() => setExpanded(false)}
          >
            {copy.viewAll} <ChevronRight size={15} />
          </Link>
        </section>
      )}
    </div>
  );
}

export function ImportantNotice() {
  const { locale } = useLocale();
  const copy = dashboardCopy[locale].notices;
  const { feed, busy, open, markRead, readConnectorUpdate } = useNotices();
  const { base } = useApp();
  const notice = feed?.important;
  const update = feed?.connectorUpdate;
  if (!notice && update && !update.isRead && update.connections.length) {
    return (
      <aside className="notice-banner" aria-label={copy.upgradeNotice}>
        <Megaphone size={18} />
        <Link
          className="notice-banner-title"
          to={connectorUpgradePath(update.connections[0].id, base)}
          onClick={() => void readConnectorUpdate(update)}
        >
          <span>{copy.connectorUpdate}</span>
          <strong>
            {formatCopy(copy.versionAvailable, { version: update.version })}
            {update.connections.length > 1
              ? ` · ${formatCopy(copy.linkCount, { count: update.connections.length })}`
              : ""}
          </strong>
          <span>{copy.upgrade} →</span>
        </Link>
        <button
          className="icon-button"
          disabled={busy}
          aria-label={copy.dismissVersion}
          onClick={() => void readConnectorUpdate(update)}
        >
          <X size={17} />
        </button>
      </aside>
    );
  }
  if (!notice) return null;
  return (
    <aside className="notice-banner" aria-label={copy.important}>
      <Megaphone size={18} />
      <button className="notice-banner-title" onClick={() => open(notice)}>
        <span>{copy.important}</span>
        <strong>{notice.title}</strong>
        <span>{copy.viewDetails} →</span>
      </button>
      <button
        className="icon-button"
        disabled={busy}
        aria-label={formatCopy(copy.markReadAndClose, { title: notice.title })}
        onClick={() => void markRead(notice)}
      >
        <X size={17} />
      </button>
    </aside>
  );
}
