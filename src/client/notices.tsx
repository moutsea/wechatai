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
};
const NoticesContext = createContext<NoticeState | null>(null);
export function useNotices() {
  const value = useContext(NoticesContext);
  if (!value) throw new Error("Missing notices context");
  return value;
}

export function NoticeProvider({ children }: { children: ReactNode }) {
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
  ) => {
    const key = notice ? `${notice.id}:${notice.revision}:${action}` : `all:${readThrough}`;
    if (operations.current.has(key)) return;
    const epoch = generation.current;
    operations.current.add(key);
    setBusy(true);
    try {
      await request(notice ? `/notices/${notice.id}/${action}` : "/notices/read-all", {
        ...json(notice ? { revision: notice.revision } : { readThrough }),
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
      notify((e as Error).message, true);
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
        readAll: (snapshot) => mark(null, "read-all", snapshot.readThrough),
      }}
    >
      {children}
      {selected && (
        <Modal
          title={selected.title}
          description={`${selected.priority === "important" ? "重要通知 · " : ""}${noticeDate(selected.publishedAt ?? selected.createdAt)}`}
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
                标为已读
              </button>
            )}
            <button className="button" onClick={() => setSelected(null)}>
              知道了
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
          {!notice.isRead && <span className="notice-unread-dot" aria-label="未读" />}
        </span>
        <span className="notice-item-preview">
          {notice.content.replace(/[#*`>[\]]/g, "").slice(0, 110)}
        </span>
        <span className="notice-item-date">
          {noticeDate(notice.publishedAt ?? notice.createdAt)}
          {notice.priority === "important" && " · 重要通知"}
        </span>
      </span>
      <ChevronRight size={16} className="notice-chevron" />
    </button>
  );
}

export function NoticeBell() {
  const { feed, error, busy, refresh, open, readAll } = useNotices();
  const { base } = useApp();
  const [expanded, setExpanded] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const location = useLocation();
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
        aria-label={`通知${feed?.unread ? `，${feed.unread} 条未读` : ""}`}
        aria-expanded={expanded}
        aria-controls="notice-popover"
        onClick={() => {
          setExpanded(!expanded);
          if (!expanded) void refresh();
        }}
      >
        <Bell size={19} />
        {Boolean(feed?.unread) && (
          <span className="notice-badge">{feed!.unread > 99 ? "99+" : feed!.unread}</span>
        )}
      </button>
      {expanded && (
        <section id="notice-popover" className="notice-popover" aria-label="站内通知">
          <div className="notice-popover-heading">
            <h2>通知</h2>
            {Boolean(feed?.unread) && (
              <button
                className="text-link"
                disabled={busy}
                onClick={() => feed && void readAll(feed)}
              >
                <CheckCheck size={15} />
                全部已读
              </button>
            )}
          </div>
          {error ? (
            <div className="notice-empty" role="alert">
              <p>{error}</p>
              <button className="text-link" onClick={() => void refresh()}>
                重新加载
              </button>
            </div>
          ) : !feed ? (
            <p className="notice-empty" role="status">
              正在加载通知…
            </p>
          ) : !feed.items.length ? (
            <p className="notice-empty">暂时没有新通知</p>
          ) : (
            feed.items.map((notice) => (
              <NoticeItem
                key={notice.id}
                notice={notice}
                onOpen={() => {
                  setExpanded(false);
                  open(notice);
                }}
              />
            ))
          )}
          <Link
            className="notice-view-all"
            to={`${base}/notices`}
            onClick={() => setExpanded(false)}
          >
            查看全部通知 <ChevronRight size={15} />
          </Link>
        </section>
      )}
    </div>
  );
}

export function ImportantNotice() {
  const { feed, busy, open, markRead } = useNotices();
  const notice = feed?.important;
  if (!notice) return null;
  return (
    <aside className="notice-banner" aria-label="重要通知">
      <Megaphone size={18} />
      <button className="notice-banner-title" onClick={() => open(notice)}>
        <span>重要通知</span>
        <strong>{notice.title}</strong>
        <span>查看详情 →</span>
      </button>
      <button
        className="icon-button"
        disabled={busy}
        aria-label={`关闭并标记已读：${notice.title}`}
        onClick={() => void markRead(notice)}
      >
        <X size={17} />
      </button>
    </aside>
  );
}
