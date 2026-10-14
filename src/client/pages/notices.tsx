import { useEffect, useState } from "react";
import { CheckCheck, ChevronLeft, ChevronRight, Bell } from "lucide-react";
import { useApp } from "../context";
import { NoticeItem, useNotices } from "../notices";
import { PageHead } from "../ui";
import type { UserNotices } from "../../shared/site-notices";

export function Notices() {
  const { request } = useApp();
  const { open, busy, readAll, version } = useNotices();
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
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [request, page, version, retry]);
  return (
    <div className="notices-page page-enter">
      <PageHead
        eyebrow="NOTICES"
        title="通知"
        description="产品更新、使用提示和服务公告，都在这里。"
        action={
          <button
            className="button secondary"
            disabled={busy || loading || !data?.unread}
            onClick={() => data && void readAll(data)}
          >
            <CheckCheck size={16} />
            全部已读
          </button>
        }
      />
      <section className="notice-list-panel" aria-busy={loading}>
        {error ? (
          <div className="notice-empty" role="alert">
            <p>{error}</p>
            <button className="button secondary" onClick={() => setRetry((v) => v + 1)}>
              重新加载
            </button>
          </div>
        ) : loading ? (
          <p className="notice-empty" role="status">
            正在加载通知…
          </p>
        ) : data?.items.length ? (
          data.items.map((notice) => (
            <NoticeItem key={notice.id} notice={notice} onOpen={() => open(notice)} />
          ))
        ) : (
          <div className="notice-empty">
            <Bell size={28} />
            <h2>暂时没有通知</h2>
            <p>有新消息时，右上角的小铃铛会提醒你。</p>
          </div>
        )}
      </section>
      {data && data.totalPages > 1 && (
        <nav className="notice-pagination" aria-label="通知分页">
          <span>共 {data.total} 条</span>
          <button
            className="icon-button"
            aria-label="上一页"
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
            aria-label="下一页"
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
