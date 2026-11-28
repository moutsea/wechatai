import { workspaceError, workspaceLabel } from "../workspace-copy";
import { useLocale } from "../locale";
import { copy as sourceCopy } from "../../shared/i18n/zh-CN/copy/cloud-tasks-page";
import { copy as koCopy } from "../../shared/i18n/ko/copy/cloud-tasks-page";
import { formatCopy } from "../../shared/i18n/dashboard";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  Cloud,
  Coins,
  Download,
  FileText,
  HardDrive,
  Loader2,
  MessageCircle,
  RefreshCw,
  Square,
  TriangleAlert,
} from "lucide-react";
import { useApp } from "../context";
import { Empty, PageHead, relativeTime } from "../ui";
import { ApiError, json } from "../api";
import { ChatMarkdown, CopyMessage } from "../chat-markdown";
import "./cloud-tasks.css";
import {
  CLOUD_AGENT_STORAGE_BYTES,
  CLOUD_AGENT_FILE_LIMITS_NOTE,
  type CloudAgentStorageUsage,
  type CloudAgentTask,
  type CloudAgentTaskPage,
  type CloudAgentTaskStatus,
} from "../../shared/cloud-agent";

const active = (status: CloudAgentTaskStatus) =>
  ["submitting", "queued", "running", "awaiting_approval", "finalizing"].includes(status);

const canStop = (task: CloudAgentTask) =>
  active(task.status) && (task.status !== "finalizing" || task.canCancelFiles);

// Bound both reads and mutations, even when the transport ignores AbortSignal.
async function taskRequest<T>(
  request: (signal: AbortSignal) => Promise<T>,
  controller: AbortController,
  timeoutMessage: string,
): Promise<T> {
  let onAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener("abort", onAbort, { once: true });
    if (controller.signal.aborted) onAbort();
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request(controller.signal),
      aborted,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(timeoutMessage)), 20000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
    controller.signal.removeEventListener("abort", onAbort);
  }
}

function TaskResult({ id, content }: { id: string; content: string }) {
  const { locale } = useLocale();
  const pageCopy = locale === "ko" ? koCopy : sourceCopy;

  return (
    <>
      <div className="cloud-task-content cloud-task-result">
        <ChatMarkdown content={content} id={`cloud-${id}`} />
      </div>
      <CopyMessage text={content} label={pageCopy["复制结果"]} />
    </>
  );
}

function TaskStatus({ task }: { task: CloudAgentTask }) {
  const { locale } = useLocale();
  const pageCopy = locale === "ko" ? koCopy : sourceCopy;

  const labels: Record<CloudAgentTaskStatus, string> = {
    submitting: pageCopy["提交中"],
    queued: pageCopy["排队中"],
    running: pageCopy["执行中"],
    awaiting_approval: pageCopy["等待审批"],
    finalizing: pageCopy["结果处理中"],
    completed: pageCopy["已完成"],
    failed: pageCopy["失败"],
    cancelled: pageCopy["已停止"],
  };

  return (
    <span className={`cloud-task-status ${task.status}`}>
      {task.status === "completed" ? (
        <Check size={14} />
      ) : active(task.status) ? (
        <Loader2 size={14} className="cloud-task-spinner" />
      ) : task.status === "failed" ? (
        <TriangleAlert size={14} />
      ) : (
        <Square size={14} />
      )}
      {labels[task.status]}
      {task.stopping
        ? task.status === "finalizing"
          ? pageCopy[" · 正在取消文件接收"]
          : pageCopy[" · 停止确认中"]
        : ""}
    </span>
  );
}

function storageSize(bytes: number, pageCopy: typeof sourceCopy = sourceCopy) {
  if (bytes > 0 && bytes < 1024 * 1024) return pageCopy["不足 1 MiB"];
  return `${(bytes / (1024 * 1024)).toLocaleString("zh-CN", { maximumFractionDigits: 1 })} MiB`;
}

function CloudStorage({ tasks }: { tasks: CloudAgentTask[] }) {
  const { locale } = useLocale();
  const pageCopy = locale === "ko" ? koCopy : sourceCopy;

  const { request } = useApp();
  const [usage, setUsage] = useState<CloudAgentStorageUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  // Keep active IDs across list/detail navigation, but do not treat historical
  // terminal tasks as new completions or refresh again for delivery updates.
  const activeTasks = useRef(new Set<string>());
  useEffect(() => {
    let ended = false;
    for (const task of tasks) {
      if (active(task.status)) activeTasks.current.add(task.id);
      else if (activeTasks.current.delete(task.id)) ended = true;
    }
    if (ended) setRevision((value) => value + 1);
  }, [tasks]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void taskRequest(
      (signal) => request<CloudAgentStorageUsage>("/cloud/storage", { signal }),
      controller,
      pageCopy["读取空间用量超时"],
    )
      .then(
        (result) => {
          if (!controller.signal.aborted) setUsage(result);
        },
        () => {
          if (!controller.signal.aborted) setError(true);
        },
      )
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
        controller.abort();
      });
    return () => controller.abort();
  }, [request, revision, pageCopy]);
  return (
    <section className="panel cloud-storage" aria-label={pageCopy["云端空间"]}>
      <div className="cloud-storage-heading">
        <span className="cloud-storage-icon">
          <HardDrive size={19} />
        </span>
        <div>
          <h2>{pageCopy["云端空间"]}</h2>
          <span>{pageCopy["同账号的 Agent 共享"]}</span>
        </div>
      </div>
      <div className="cloud-storage-summary">
        <p className="cloud-storage-capacity">
          <strong>
            {((usage?.maxTotalBytes ?? CLOUD_AGENT_STORAGE_BYTES) / (1024 * 1024)).toLocaleString(
              locale === "ko" ? "ko-KR" : "zh-CN",
            )}
          </strong>
          <span>{pageCopy["MiB 总容量"]}</span>
        </p>
        <p className="cloud-storage-used">
          {usage
            ? formatCopy(pageCopy["已用 {value0} / {value1}"], {
                value0: storageSize(usage.usedBytes, pageCopy),
                value1: storageSize(usage.maxTotalBytes, pageCopy),
              })
            : formatCopy(pageCopy["每账号 {value0}"], {
                value0: storageSize(CLOUD_AGENT_STORAGE_BYTES, pageCopy),
              })}
        </p>
        {usage && (
          <>
            <progress
              aria-label={pageCopy["云端空间占用"]}
              max={usage.maxTotalBytes}
              value={Math.min(usage.maxTotalBytes, usage.usedBytes + usage.reservedBytes)}
            />
            <p className="cloud-storage-available">
              {pageCopy["可用 "]}
              {storageSize(usage.availableBytes, pageCopy)}
              {usage.reservedBytes > 0 &&
                formatCopy(pageCopy["，任务写入预留 {value0}"], {
                  value0: storageSize(usage.reservedBytes, pageCopy),
                })}
              。
            </p>
          </>
        )}
      </div>
      <button
        className="text-link cloud-storage-refresh"
        disabled={loading}
        onClick={() => setRevision((value) => value + 1)}
      >
        <RefreshCw size={13} className={loading ? "cloud-task-spinner" : undefined} />
        {loading ? pageCopy["正在读取用量…"] : pageCopy["刷新用量"]}
      </button>
      {error && (
        <p className="form-error" role="status">
          {pageCopy["用量暂时无法读取，请刷新重试。"]}
          {usage && pageCopy["当前显示上次读取的用量。"]}
        </p>
      )}
      <details className="cloud-storage-notes">
        <summary>
          {pageCopy["空间与文件说明 "]}
          <ChevronDown size={14} />
        </summary>
        <p className="form-note">
          {
            pageCopy[
              "同账号的小薇 共用此空间，用于工作文件、附件及任务运行数据。空间不足时无法继续写入。删除任务记录不会释放云端空间。"
            ]
          }
        </p>
        <p className="form-note">{workspaceLabel(locale, CLOUD_AGENT_FILE_LIMITS_NOTE)}</p>
      </details>
    </section>
  );
}

export function CloudTasks() {
  const { locale } = useLocale();
  const pageCopy = locale === "ko" ? koCopy : sourceCopy;

  const { request, notify, data, base } = useApp();
  const [params, setParams] = useSearchParams();
  const { id } = useParams();
  const [page, setPage] = useState<{ path: string; data: CloudAgentTaskPage } | null>(null);
  const [load, setLoad] = useState({ path: "", loading: true, error: "" });
  const pendingRead = useRef<AbortController | null>(null);
  const pendingStop = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState("");
  const [revision, setRevision] = useState(0);
  const plugin = params.get("plugin") || "";
  const cursor = params.get("cursor") || "";
  const query = new URLSearchParams();
  if (plugin) query.set("plugin", plugin);
  if (cursor) query.set("cursor", cursor);
  const search = query.size ? `?${query}` : "";
  const path = id ? `/cloud/tasks/${encodeURIComponent(id)}` : `/cloud/tasks${search}`;
  const currentPage = page?.path === path ? page.data : null;
  const loading = load.path !== path || load.loading;
  const error = load.path === path ? load.error : "";
  const tasks = currentPage?.tasks ?? [];
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    pendingRead.current = controller;
    setLoad({ path, loading: true, error: "" });
    const load = async () => {
      try {
        const result = await taskRequest(
          (signal) =>
            id
              ? request<CloudAgentTask>(path, { signal }).then((task) => ({
                  tasks: [task],
                  nextCursor: null,
                }))
              : request<CloudAgentTaskPage>(path, { signal }),
          controller,
          pageCopy["加载云端任务超时，请重试。"],
        );
        if (!controller.signal.aborted) setPage({ path, data: result });
      } catch (e) {
        // A transient refresh failure must not erase results or stop their polling.
        if (!controller.signal.aborted) {
          if (e instanceof ApiError && [401, 403, 404].includes(e.status)) setPage(null);
          setLoad({ path, loading: false, error: workspaceError(e as Error, locale) });
        }
      } finally {
        if (!controller.signal.aborted) setLoad((current) => ({ ...current, loading: false }));
        if (pendingRead.current === controller) pendingRead.current = null;
        controller.abort();
      }
    };
    void load();
    return () => controller.abort();
  }, [request, path, id, revision, pageCopy, locale]);
  useEffect(() => {
    setBusy("");
    return () => {
      pendingStop.current?.abort();
      pendingStop.current = null;
    };
  }, [path]);
  // Wait for each read to finish so a slow request is not repeatedly aborted by polling.
  useEffect(() => {
    if (loading || busy) return;
    if (!tasks.some((task) => active(task.status) || task.delivery === "pending")) return;
    const timer = setTimeout(refresh, 15000);
    return () => clearTimeout(timer);
  }, [tasks, loading, busy, refresh]);
  const cancel = async (task: CloudAgentTask) => {
    if (pendingStop.current) return;
    const controller = new AbortController();
    pendingStop.current = controller;
    // Reads started before this mutation must not replace the acknowledged stop state.
    pendingRead.current?.abort();
    setLoad((current) => ({ ...current, loading: false }));
    setBusy(task.id);
    try {
      const updated = await taskRequest(
        (signal) =>
          request<CloudAgentTask>(`/cloud/tasks/${encodeURIComponent(task.id)}/cancel`, {
            ...json({}),
            signal,
          }),
        controller,
        pageCopy["停止请求超时。"],
      );
      if (pendingStop.current !== controller) return;
      setPage((current) =>
        current?.path === path
          ? {
              ...current,
              data: {
                ...current.data,
                tasks: current.data.tasks.map((item) => (item.id === updated.id ? updated : item)),
              },
            }
          : current,
      );
      notify(
        updated.stopping
          ? updated.status === "finalizing"
            ? pageCopy[
                "正在取消文件接收，本次不扣 credits。已发生的模型 API 费用以服务商账单为准。"
              ]
            : pageCopy["已请求停止，等待云端确认。已发生的外部操作无法撤销，费用以最终结算为准。"]
          : updated.status === "cancelled"
            ? pageCopy["任务已停止，费用以最终结算为准。"]
            : updated.status === "finalizing"
              ? pageCopy["任务已结束，正在处理结果，无法再停止。"]
              : updated.status === "completed"
                ? pageCopy["任务已完成，无法再停止。"]
                : pageCopy["任务状态已更新，请查看最新结果。"],
      );
    } catch (e) {
      if (pendingStop.current === controller)
        notify(
          e instanceof ApiError
            ? workspaceError(e, locale)
            : formatCopy(pageCopy["{value0} 停止请求是否受理尚未确认，正在重新查询任务状态。"], {
                value0: workspaceError(e as Error, locale),
              }),
          true,
        );
    } finally {
      controller.abort();
      if (pendingStop.current === controller) {
        pendingStop.current = null;
        setBusy("");
        refresh();
      }
    }
  };
  const olderQuery = new URLSearchParams(query);
  if (currentPage?.nextCursor) olderQuery.set("cursor", currentPage.nextCursor);
  const latestQuery = new URLSearchParams(query);
  latestQuery.delete("cursor");
  const latestSearch = latestQuery.size ? `?${latestQuery}` : "";
  if (!data) return null;
  const running = tasks.filter((task) => active(task.status)).length;
  return (
    <div className={`page-enter cloud-tasks${id ? " cloud-task-detail" : ""}`}>
      <PageHead
        eyebrow="XIAOWEI"
        title={id ? pageCopy["任务详情"] : pageCopy["云端任务"]}
        description={pageCopy["小薇在微伴云端帮你做事。进度、处理结果和生成文件都在这里。"]}
        action={
          <div className="cloud-tasks-actions">
            <Link className="button secondary" to={`${base}/plugins`}>
              {pageCopy["配置小薇 "]}
              <ArrowUpRight size={15} />
            </Link>
            <button
              className="button secondary"
              disabled={loading || Boolean(busy)}
              onClick={refresh}
            >
              <RefreshCw size={15} className={loading ? "cloud-task-spinner" : undefined} />
              {pageCopy[" 刷新"]}
            </button>
          </div>
        }
      />
      <div className="cloud-tasks-layout">
        <div className="cloud-tasks-main">
          <div className="cloud-tasks-toolbar">
            <div>
              {id ? (
                <Link className="text-link" to={`${base}/tasks${search}`}>
                  <ArrowLeft size={15} />
                  {pageCopy["返回任务列表"]}
                </Link>
              ) : (
                <>
                  <h2>{cursor ? pageCopy["更早的任务"] : pageCopy["任务记录"]}</h2>
                  {currentPage && (
                    <span>
                      {pageCopy["本页 "]}
                      {tasks.length}
                      {pageCopy[" 个任务"]}
                      {running > 0 &&
                        formatCopy(pageCopy[" · {value0} 个进行中"], { value0: running })}
                    </span>
                  )}
                </>
              )}
            </div>
            {running > 0 && (
              <span className="cloud-tasks-live">
                <span />
                {pageCopy["自动更新中"]}
              </span>
            )}
            {!id && cursor && (
              <Link className="text-link" to={`${base}/tasks${latestSearch}`}>
                {pageCopy["返回最新任务"]}
              </Link>
            )}
          </div>
          {!id && plugin && (
            <p className="cloud-task-filter">
              {pageCopy["仅显示该插件的任务。"]}
              <button className="text-link" onClick={() => setParams({}, { replace: true })}>
                {pageCopy["查看全部"]}
              </button>
            </p>
          )}
          {error && (
            <p className="form-error cloud-task-notice" role="alert">
              {currentPage && pageCopy["刷新失败，当前显示上次加载的任务。"]}
              {error}
            </p>
          )}
          {loading && !currentPage ? (
            <div className="panel cloud-tasks-loading" role="status">
              <Loader2 size={22} className="cloud-task-spinner" />
              {pageCopy["正在加载云端任务…"]}
            </div>
          ) : tasks.length ? (
            <div className="cloud-task-list">
              {tasks.map((task) => (
                <article key={task.id} className={`panel cloud-task ${task.status}`}>
                  <div className="cloud-task-header">
                    <span className="cloud-task-icon">
                      <FileText size={20} />
                    </span>
                    <div className="cloud-task-description">
                      <h2 className="cloud-task-heading">
                        {id ? (
                          task.pluginName
                        ) : (
                          <Link
                            className="cloud-task-title"
                            to={`${base}/tasks/${encodeURIComponent(task.id)}${search}`}
                          >
                            {task.prompt.slice(0, 120) || pageCopy["（内容已删除）"]}
                          </Link>
                        )}
                      </h2>
                      <p className="cloud-task-source">
                        {id ? task.sessionTitle : `${task.pluginName} · ${task.sessionTitle}`}
                      </p>
                    </div>
                    <TaskStatus task={task} />
                  </div>
                  {task.unconfirmed && (
                    <p className="cloud-task-notice">{pageCopy["正在确认云端是否已接收任务"]}</p>
                  )}
                  {id && (
                    <section aria-label={pageCopy["任务要求"]} className="cloud-task-request">
                      <h3>{pageCopy["任务要求"]}</h3>
                      <pre className="cloud-task-content">
                        {task.prompt || pageCopy["（内容已删除）"]}
                      </pre>
                    </section>
                  )}
                  {task.result &&
                    (id ? (
                      <section aria-label={pageCopy["任务结果"]} className="cloud-task-output">
                        <h3>{pageCopy["任务结果"]}</h3>
                        <TaskResult id={task.id} content={task.result} />
                      </section>
                    ) : (
                      <details className="cloud-task-preview">
                        <summary>
                          {pageCopy["查看结果 "]}
                          <ChevronDown size={15} />
                        </summary>
                        <TaskResult id={task.id} content={task.result} />
                      </details>
                    ))}
                  {task.files?.length ? (
                    <section aria-label={pageCopy["生成文件"]} className="cloud-task-files">
                      <h3>
                        {pageCopy["生成文件 "]}
                        <span>{task.files.length}</span>
                      </h3>
                      <div className="cloud-task-file-list">
                        {task.files.map((file) => (
                          <a
                            key={file.id}
                            className="cloud-task-file"
                            href={`/api/assets/${encodeURIComponent(file.id)}`}
                            download={file.name}
                          >
                            <FileText size={20} />
                            <span>
                              <strong>{file.name}</strong>
                              <small>{(file.bytes / 1024).toFixed(1)} KiB</small>
                            </span>
                            <Download size={16} />
                          </a>
                        ))}
                      </div>
                      <p className="form-note">
                        {pageCopy["文件保留 30 天；清空或删除所属会话后不可下载。"]}
                      </p>
                    </section>
                  ) : null}
                  {task.error && (
                    <p className="form-error cloud-task-error">
                      <TriangleAlert size={16} />
                      {workspaceError(task.error, locale)}
                    </p>
                  )}
                  <div className="cloud-task-footer">
                    <div className="cloud-task-meta">
                      <time
                        dateTime={new Date(task.createdAt).toISOString()}
                        title={new Date(task.createdAt).toLocaleString(
                          locale === "ko" ? "ko-KR" : "zh-CN",
                        )}
                      >
                        <Clock3 size={13} />
                        {relativeTime(task.createdAt, locale)}
                      </time>
                      <span>
                        <Coins size={13} />
                        {task.credits !== undefined
                          ? formatCopy(pageCopy["已结算 · {value0} credits"], {
                              value0: task.credits.toFixed(3),
                            })
                          : active(task.status)
                            ? pageCopy["费用待结算"]
                            : pageCopy["暂无扣费记录"]}
                      </span>
                      {(task.delivery !== "pending" || !active(task.status) || task.stale) && (
                        <span
                          className={
                            task.delivery === "failed" ? "cloud-task-delivery-failed" : undefined
                          }
                        >
                          <MessageCircle size={13} />
                          {task.delivery === "sent"
                            ? pageCopy["已送达微信"]
                            : task.delivery === "stale" || task.stale
                              ? pageCopy["结果仅保留在任务页，不再发送微信"]
                              : task.delivery === "failed"
                                ? pageCopy["微信未送达"]
                                : pageCopy["等待发送微信"]}
                        </span>
                      )}
                    </div>
                    {canStop(task) && (
                      <button
                        className="text-link cloud-task-stop"
                        disabled={Boolean(busy) || task.stopping}
                        onClick={() => void cancel(task)}
                      >
                        <Square size={12} />
                        {task.canCancelFiles
                          ? busy === task.id
                            ? pageCopy["正在取消…"]
                            : pageCopy["取消文件接收"]
                          : busy === task.id
                            ? pageCopy["正在请求停止…"]
                            : pageCopy["停止"]}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : error ? null : (
            <div className="panel cloud-tasks-empty">
              <Empty
                icon={<Cloud size={26} />}
                title={
                  plugin
                    ? pageCopy["该插件暂无云端任务"]
                    : cursor
                      ? pageCopy["没有更早的云端任务"]
                      : pageCopy["还没有云端任务"]
                }
                description={
                  plugin || cursor
                    ? pageCopy["已接收的云端任务会显示在这里，可返回全部任务查看其他记录。"]
                    : !data.cloudAgent.ready
                      ? pageCopy["小薇暂时不可用，已有任务记录仍可查看。"]
                      : data.plan === "plus"
                        ? pageCopy[
                            "在插件页配置小薇后，从微信发送文字或附件处理要求，即可在这里查看进度与结果。"
                          ]
                        : pageCopy[
                            "小薇已向 Plus 会员开放。开通后可配置自己的模型，从微信提交任务。"
                          ]
                }
                action={
                  !plugin && !cursor ? (
                    <Link
                      className="button"
                      to={
                        data.cloudAgent.ready
                          ? `${base}/${data.plan === "plus" ? "plugins" : "billing"}`
                          : "/docs/cloud-agent"
                      }
                    >
                      {!data.cloudAgent.ready
                        ? pageCopy["查看使用指南"]
                        : data.plan === "plus"
                          ? pageCopy["配置小薇"]
                          : pageCopy["了解 Plus"]}
                      <ArrowUpRight size={15} />
                    </Link>
                  ) : undefined
                }
              />
            </div>
          )}
          {!id && currentPage?.nextCursor && (
            <nav className="cloud-task-pagination" aria-label={pageCopy["任务分页"]}>
              <Link className="button secondary" to={`${base}/tasks?${olderQuery}`}>
                {pageCopy["查看更早任务"]}
              </Link>
            </nav>
          )}
          {tasks.some(canStop) && (
            <p className="form-note cloud-task-stop-note">
              {
                pageCopy[
                  "执行中的任务停止需等待云端确认，费用以最终结算为准；文件接收可取消，取消后本次不扣 credits。已发生的模型 API 费用以服务商账单为准。"
                ]
              }
            </p>
          )}
        </div>
        <aside className="cloud-tasks-aside">
          <CloudStorage tasks={tasks} />
          <section className="cloud-tasks-help">
            <h2>
              <MessageCircle size={17} />
              {pageCopy["在微信里继续"]}
            </h2>
            <p>
              {
                pageCopy[
                  "先发附件，再发送完整处理要求。任务在后台执行，完成后会尝试回复原微信会话。"
                ]
              }
            </p>
            <Link className="text-link" to="/docs/cloud-agent">
              {pageCopy["查看使用指南 "]}
              <ArrowUpRight size={14} />
            </Link>
            <p className="cloud-tasks-retention">
              {pageCopy["清空或删除会话会清除对应任务内容，并请求停止未结束的任务。"]}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
