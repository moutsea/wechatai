import { workspaceError } from "../workspace-copy";
import { useLocale } from "../locale";
import { copy as sourceCopy } from "../../shared/i18n/zh-CN/copy/admin-notices-page";
import { copy as koCopy } from "../../shared/i18n/ko/copy/admin-notices-page";
import { workspaceCopy as ptCopy } from "../../shared/i18n/pt/copy/workspace";
import { formatCopy } from "../../shared/i18n/dashboard";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Eye, Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { useApp } from "../context";
import { json } from "../api";
import { useNotices } from "../notices";
import { Modal } from "../ui";
import { ChatMarkdown } from "../chat-markdown";
import {
  noticeDate,
  noticeInputSchema,
  type NoticeInput,
  type NoticePage,
  type SiteNotice,
} from "../../shared/site-notices";

function NoticeEditor({
  notice,
  onClose,
  onSaved,
}: {
  notice: SiteNotice | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { locale } = useLocale();
  const pageCopy =
    locale === "ko" ? koCopy : locale === "pt" ? ptCopy : sourceCopy;

  const { request, notify } = useApp();
  const [initial] = useState<NoticeInput>(() =>
    notice
      ? {
          title: notice.title,
          content: notice.content,
          priority: notice.priority,
          status: notice.status,
        }
      : { title: "", content: "", priority: "normal", status: "draft" },
  );
  const [draft, setDraft] = useState(initial);
  const [republish, setRepublish] = useState(false);
  const [id] = useState(() => notice?.id ?? crypto.randomUUID());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const saving = useRef(false);
  const dirty = republish || JSON.stringify(draft) !== JSON.stringify(initial);
  const close = () => {
    if (saving.current) return;
    if (dirty) setDiscard(true);
    else onClose();
  };
  const change = (value: Partial<NoticeInput>) => {
    setDraft((previous) => ({ ...previous, ...value }));
    setDiscard(false);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving.current) return;
    const result = noticeInputSchema.safeParse(draft);
    if (!result.success) {
      setError(pageCopy["请填写标题和正文，标题最多 100 字，正文最多 20,000 字。"]);
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await request(
        notice ? `/admin/notices/${id}` : "/admin/notices",
        json(
          {
            ...result.data,
            ...(notice
              ? { revision: notice.revision, republish: draft.status === "published" && republish }
              : { id }),
          },
          notice ? "PATCH" : "POST",
        ),
      );
      notify(
        draft.status !== "published"
          ? pageCopy["通知已保存为草稿"]
          : notice?.status === "published" && !republish
            ? pageCopy["修改已保存，不会再次提醒用户"]
            : pageCopy["通知已发布"],
      );
      onSaved();
      onClose();
    } catch (e) {
      setError(workspaceError(e as Error, locale));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      title={notice ? pageCopy["编辑通知"] : pageCopy["新建通知"]}
      description={pageCopy["向所有用户发布产品更新、使用提示和服务公告。"]}
      onClose={close}
      wide
    >
      <form onSubmit={(event) => void save(event)} className="notice-editor">
        <div className="notice-editor-grid">
          <div className="notice-fields">
            <label>
              {pageCopy["通知标题"]}
              <input
                autoFocus
                required
                maxLength={100}
                value={draft.title}
                disabled={busy}
                placeholder={pageCopy["例如：免费账户也可以使用插件了"]}
                onChange={(e) => change({ title: e.target.value })}
              />
            </label>
            <label>
              {pageCopy["正文"]}
              <textarea
                required
                rows={10}
                maxLength={20000}
                value={draft.content}
                disabled={busy}
                placeholder={pageCopy["支持 Markdown，可插入列表、链接和代码示例。"]}
                onChange={(e) => change({ content: e.target.value })}
              />
            </label>
            <span className="form-hint">
              {draft.content.length.toLocaleString()}
              {pageCopy[" / 20,000 字 · 支持 Markdown"]}
            </span>
            <div className="notice-field-pair">
              <label>
                {pageCopy["优先级"]}
                <select
                  value={draft.priority}
                  disabled={busy}
                  onChange={(e) => change({ priority: e.target.value as NoticeInput["priority"] })}
                >
                  <option value="normal">{pageCopy["普通通知"]}</option>
                  <option value="important">{pageCopy["重要通知"]}</option>
                </select>
              </label>
              <label>
                {pageCopy["发布状态"]}
                <select
                  value={draft.status}
                  disabled={busy}
                  onChange={(e) => change({ status: e.target.value as NoticeInput["status"] })}
                >
                  <option value="draft">{pageCopy["草稿 · 用户不可见"]}</option>
                  <option value="published">{pageCopy["发布 · 所有用户可见"]}</option>
                </select>
              </label>
            </div>
            {notice?.status === "published" && draft.status === "published" && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={republish}
                  disabled={busy}
                  onChange={(event) => {
                    setRepublish(event.target.checked);
                    setDiscard(false);
                  }}
                />
                {pageCopy["重新提醒所有用户"]}
              </label>
            )}
            <p className="form-hint">
              {
                pageCopy[
                  "修改已发布通知默认只更新内容，保留阅读状态和排列位置。勾选「重新提醒所有用户」后，会增加未读提示；重要通知会再次显示在工作台顶部。草稿发布时也会提醒用户。"
                ]
              }
            </p>
          </div>
          <aside className="notice-editor-preview" aria-label={pageCopy["通知预览"]}>
            <h3>
              <Eye size={16} />
              {pageCopy["预览"]}
            </h3>
            <article>
              <span className={`notice-priority ${draft.priority}`}>
                {draft.priority === "important" ? pageCopy["重要通知"] : pageCopy["普通通知"]}
              </span>
              <h2>{draft.title || pageCopy["通知标题"]}</h2>
              <ChatMarkdown
                content={draft.content || pageCopy["正文预览会显示在这里。"]}
                id="notice-preview"
              />
            </article>
          </aside>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          {discard ? (
            <>
              <span>{pageCopy["放弃尚未保存的修改？"]}</span>
              <button type="button" className="button secondary" onClick={() => setDiscard(false)}>
                {pageCopy["继续编辑"]}
              </button>
              <button type="button" className="button danger" onClick={onClose}>
                {pageCopy["放弃修改"]}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="button secondary" disabled={busy} onClick={close}>
                {pageCopy["取消"]}
              </button>
              <button className="button" disabled={busy || (!!notice && !dirty)}>
                {busy
                  ? pageCopy["正在保存…"]
                  : draft.status !== "published"
                    ? pageCopy["保存草稿"]
                    : notice?.status === "published"
                      ? republish
                        ? pageCopy["保存并重新提醒"]
                        : pageCopy["保存修改"]
                      : pageCopy["保存并发布"]}
              </button>
            </>
          )}
        </div>
      </form>
    </Modal>
  );
}

export function AdminNotices() {
  const { locale } = useLocale();
  const pageCopy =
    locale === "ko" ? koCopy : locale === "pt" ? ptCopy : sourceCopy;

  const { request, notify } = useApp();
  const { refresh: refreshNotices } = useNotices();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<NoticePage<SiteNotice> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState<SiteNotice | "new" | null>(null);
  const [deleting, setDeleting] = useState<SiteNotice | null>(null);
  const [busy, setBusy] = useState(false);
  const operation = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void request<NoticePage<SiteNotice>>(`/admin/notices?page=${page}`, {
      signal: controller.signal,
    })
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
  }, [request, page, refresh, locale]);
  const saved = () => {
    setRefresh((v) => v + 1);
    void refreshNotices();
  };
  const mutate = async (notice: SiteNotice, action: "withdraw" | "delete") => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    try {
      await request(
        `/admin/notices/${notice.id}`,
        json(
          action === "delete"
            ? { revision: notice.revision }
            : {
                title: notice.title,
                content: notice.content,
                priority: notice.priority,
                status: "draft",
                revision: notice.revision,
              },
          action === "delete" ? "DELETE" : "PATCH",
        ),
      );
      setDeleting(null);
      saved();
      notify(
        action === "delete" ? pageCopy["通知已删除"] : pageCopy["通知已下架，可在草稿中重新编辑"],
      );
    } catch (e) {
      notify(workspaceError(e as Error, locale), true);
      saved();
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="admin-panel admin-notices-panel">
      <div className="admin-panel-heading">
        <div>
          <h2>{pageCopy["通知管理"]}</h2>
          <p>{pageCopy["发布后，所有用户都能在工作台的小铃铛中查看。"]}</p>
        </div>
        <button className="button" onClick={() => setEditing("new")}>
          <Plus size={16} />
          {pageCopy["新建通知"]}
        </button>
      </div>
      {error ? (
        <div className="notice-empty" role="alert">
          <p>{error}</p>
          <button className="button secondary" onClick={() => setRefresh((v) => v + 1)}>
            {pageCopy["重新加载"]}
          </button>
        </div>
      ) : loading ? (
        <p className="notice-empty" role="status">
          {pageCopy["正在加载通知…"]}
        </p>
      ) : !data?.items.length ? (
        <div className="notice-empty">
          <Megaphone size={28} />
          <h3>{pageCopy["还没有发布过通知"]}</h3>
          <p>{pageCopy["先写一条使用提示，或告诉大家最近有哪些更新。"]}</p>
        </div>
      ) : (
        <div className="admin-table-scroll">
          <table>
            <thead>
              <tr>
                <th>{pageCopy["标题"]}</th>
                <th>{pageCopy["优先级"]}</th>
                <th>{pageCopy["状态"]}</th>
                <th>{pageCopy["更新时间"]}</th>
                <th>{pageCopy["操作"]}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((notice) => (
                <tr key={notice.id}>
                  <td className="admin-notice-title">{notice.title}</td>
                  <td>
                    <span className={`notice-priority ${notice.priority}`}>
                      {notice.priority === "important" ? pageCopy["重要"] : pageCopy["普通"]}
                    </span>
                  </td>
                  <td>{notice.status === "published" ? pageCopy["已发布"] : pageCopy["草稿"]}</td>
                  <td>{noticeDate(notice.updatedAt)}</td>
                  <td>
                    <div className="notice-row-actions">
                      <button
                        className="text-link"
                        disabled={busy}
                        onClick={() => setEditing(notice)}
                      >
                        <Pencil size={14} />
                        {pageCopy["编辑"]}
                      </button>
                      {notice.status === "published" && (
                        <button
                          className="text-link"
                          disabled={busy}
                          onClick={() => void mutate(notice, "withdraw")}
                        >
                          {pageCopy["下架"]}
                        </button>
                      )}
                      <button
                        className="icon-button"
                        aria-label={formatCopy(pageCopy["删除通知：{value0}"], {
                          value0: notice.title,
                        })}
                        disabled={busy}
                        onClick={() => setDeleting(notice)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.totalPages > 1 && (
        <nav className="notice-pagination" aria-label={pageCopy["公告管理分页"]}>
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
      {editing && (
        <NoticeEditor
          notice={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      )}
      {deleting && (
        <Modal
          title={pageCopy["删除这条通知？"]}
          description={formatCopy(
            pageCopy["「{value0}」和对应的阅读状态将被永久删除。如只是不再展示，可以选择下架。"],
            { value0: deleting.title },
          )}
          onClose={() => {
            if (!operation.current) setDeleting(null);
          }}
        >
          <div className="modal-actions">
            <button className="button secondary" disabled={busy} onClick={() => setDeleting(null)}>
              {pageCopy["取消"]}
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={() => void mutate(deleting, "delete")}
            >
              {busy ? pageCopy["正在删除…"] : pageCopy["确认删除"]}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
