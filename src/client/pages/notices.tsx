import { workspaceError } from "../workspace-copy";
import { useLocale } from "../locale";
import { copy as sourceCopy } from "../../shared/i18n/zh-CN/copy/notices-page";
import { copy as koCopy } from "../../shared/i18n/ko/copy/notices-page";
import { workspaceCopy as ptCopy } from "../../shared/i18n/pt/copy/workspace";
import { useEffect, useState } from "react";
import { CheckCheck, ChevronLeft, ChevronRight, Bell } from "lucide-react";
import { useApp } from "../context";
import { NoticeItem, useNotices } from "../notices";
import { PageHead } from "../ui";
import { unreadNoticeCount, type UserNotices } from "../../shared/site-notices";
import { ConnectorUpdateCard } from "../connector-update-notice";

export function Notices() {
  const { locale } = useLocale();
  const pageCopy =
    locale === "ko" ? koCopy : locale === "pt" ? ptCopy : sourceCopy;

  const { request, base } = useApp();
  const { open, busy, readAll, version, readConnectorUpdate } = useNotices();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<UserNotices | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void request<UserNotices>(`/notices?page=${page}`, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          if (page > result.totalPages) setPage(result.totalPages);
          else setData(result);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(workspaceError(e, locale));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [request, page, version, retry, locale]);
  return (
    <div className="notices-page page-enter">
      <PageHead
        eyebrow="NOTICES"
        title={pageCopy["通知"]}
        description={pageCopy["产品更新、使用提示和服务公告，都在这里。"]}
        action={
          <button
            className="button secondary"
            disabled={busy || loading || !unreadNoticeCount(data)}
            onClick={() => data && void readAll(data)}
          >
            <CheckCheck size={16} />
            {pageCopy["全部已读"]}
          </button>
        }
      />
      <section className="notice-list-panel" aria-busy={loading}>
        {error ? (
          <div className="notice-empty" role="alert">
            <p>{error}</p>
            <button className="button secondary" onClick={() => setRetry((v) => v + 1)}>
              {pageCopy["重新加载"]}
            </button>
          </div>
        ) : loading ? (
          <p className="notice-empty" role="status">
            {pageCopy["正在加载通知…"]}
          </p>
        ) : data && (data.items.length || data.connectorUpdate) ? (
          <>
            {data.connectorUpdate && (
              <ConnectorUpdateCard
                notice={data.connectorUpdate}
                base={base}
                busy={busy}
                onRead={() => void readConnectorUpdate(data.connectorUpdate!)}
              />
            )}
            {data.items.map((notice) => (
              <NoticeItem key={notice.id} notice={notice} onOpen={() => open(notice)} />
            ))}
          </>
        ) : (
          <div className="notice-empty">
            <Bell size={28} />
            <h2>{pageCopy["暂时没有通知"]}</h2>
            <p>{pageCopy["有新消息时，右上角的小铃铛会提醒你。"]}</p>
          </div>
        )}
      </section>
      {data && data.totalPages > 1 && (
        <nav className="notice-pagination" aria-label={pageCopy["通知分页"]}>
          <span>
            {pageCopy["共 "]}
            {data.total}
            {pageCopy[" 条"]}
          </span>
          <button
            className="icon-button"
            aria-label={pageCopy["上一页"]}
            disabled={loading || page <= 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <span>
            {page} / {data.totalPages}
          </span>
          <button
            className="icon-button"
            aria-label={pageCopy["下一页"]}
            disabled={loading || page >= data.totalPages}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight size={18} />
          </button>
        </nav>
      )}
    </div>
  );
}
