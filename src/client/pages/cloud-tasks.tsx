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

const labels: Record<CloudAgentTaskStatus, string> = {
  submitting: "提交中",
  queued: "排队中",
  running: "执行中",
  awaiting_approval: "等待审批",
  finalizing: "结果处理中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已停止",
};

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
  return (
    <>
      <div className="cloud-task-content cloud-task-result">
        <ChatMarkdown content={content} id={`cloud-${id}`} />
      </div>
      <CopyMessage text={content} label="复制结果" />
    </>
  );
}

function TaskStatus({ task }: { task: CloudAgentTask }) {
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
          ? " · 正在取消文件接收"
          : " · 停止确认中"
        : ""}
    </span>
  );
}

function storageSize(bytes: number) {
  if (bytes > 0 && bytes < 1024 * 1024) return "不足 1 MiB";
  return `${(bytes / (1024 * 1024)).toLocaleString("zh-CN", { maximumFractionDigits: 1 })} MiB`;
}

function CloudStorage({ tasks }: { tasks: CloudAgentTask[] }) {
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
      "读取空间用量超时",
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
  }, [request, revision]);
  return (
    <section className="panel cloud-storage" aria-label="云端空间">
      <div className="cloud-storage-heading">
        <span className="cloud-storage-icon">
          <HardDrive size={19} />
        </span>
        <div>
          <h2>云端空间</h2>
          <span>同账号的 Agent 共享</span>
        </div>
      </div>
      <div className="cloud-storage-summary">
        <p className="cloud-storage-capacity">
          <strong>
            {((usage?.maxTotalBytes ?? CLOUD_AGENT_STORAGE_BYTES) / (1024 * 1024)).toLocaleString(
              "zh-CN",
            )}
          </strong>
          <span>MiB 总容量</span>
        </p>
        <p className="cloud-storage-used">
          {usage
            ? `已用 ${storageSize(usage.usedBytes)} / ${storageSize(usage.maxTotalBytes)}`
            : `每账号 ${storageSize(CLOUD_AGENT_STORAGE_BYTES)}`}
        </p>
        {usage && (
          <>
            <progress
              aria-label="云端空间占用"
              max={usage.maxTotalBytes}
              value={Math.min(usage.maxTotalBytes, usage.usedBytes + usage.reservedBytes)}
            />
            <p className="cloud-storage-available">
              可用 {storageSize(usage.availableBytes)}
              {usage.reservedBytes > 0 && `，任务写入预留 ${storageSize(usage.reservedBytes)}`}。
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
        {loading ? "正在读取用量…" : "刷新用量"}
      </button>
      {error && (
        <p className="form-error" role="status">
          用量暂时无法读取，请刷新重试。{usage && "当前显示上次读取的用量。"}
        </p>
      )}
      <details className="cloud-storage-notes">
        <summary>
          空间与文件说明 <ChevronDown size={14} />
        </summary>
        <p className="form-note">
          同账号的云端 Agent
          共用此空间，用于工作文件、附件及任务运行数据。空间不足时无法继续写入。删除任务记录不会释放云端空间。
        </p>
        <p className="form-note">{CLOUD_AGENT_FILE_LIMITS_NOTE}</p>
      </details>
    </section>
  );
}

export function CloudTasks() {
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
          "加载云端任务超时，请重试。",
        );
        if (!controller.signal.aborted) setPage({ path, data: result });
      } catch (e) {
        // A transient refresh failure must not erase results or stop their polling.
        if (!controller.signal.aborted) {
          if (e instanceof ApiError && [401, 403, 404].includes(e.status)) setPage(null);
          setLoad({ path, loading: false, error: (e as Error).message });
        }
      } finally {
        if (!controller.signal.aborted) setLoad((current) => ({ ...current, loading: false }));
        if (pendingRead.current === controller) pendingRead.current = null;
        controller.abort();
      }
    };
    void load();
    return () => controller.abort();
  }, [request, path, id, revision]);
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
        "停止请求超时。",
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
            ? "正在取消文件接收，本次不扣 credits。已发生的模型 API 费用以服务商账单为准。"
            : "已请求停止，等待云端确认。已发生的外部操作无法撤销，费用以最终结算为准。"
          : updated.status === "cancelled"
            ? "任务已停止，费用以最终结算为准。"
            : updated.status === "finalizing"
              ? "任务已结束，正在处理结果，无法再停止。"
              : updated.status === "completed"
                ? "任务已完成，无法再停止。"
                : "任务状态已更新，请查看最新结果。",
      );
    } catch (e) {
      if (pendingStop.current === controller)
        notify(
          e instanceof ApiError
            ? e.message
            : `${(e as Error).message} 停止请求是否受理尚未确认，正在重新查询任务状态。`,
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
        eyebrow="CLOUD AGENT"
        title={id ? "任务详情" : "云端任务"}
        description="从微信发起，在后台执行。进度、处理结果和生成文件都在这里。"
        action={
          <div className="cloud-tasks-actions">
            <Link className="button secondary" to={`${base}/plugins`}>
              配置 Agent <ArrowUpRight size={15} />
            </Link>
            <button
              className="button secondary"
              disabled={loading || Boolean(busy)}
              onClick={refresh}
            >
              <RefreshCw size={15} className={loading ? "cloud-task-spinner" : undefined} /> 刷新
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
                  返回任务列表
                </Link>
              ) : (
                <>
                  <h2>{cursor ? "更早的任务" : "任务记录"}</h2>
                  {currentPage && (
                    <span>
                      本页 {tasks.length} 个任务{running > 0 && ` · ${running} 个进行中`}
                    </span>
                  )}
                </>
              )}
            </div>
            {running > 0 && (
              <span className="cloud-tasks-live">
                <span />
                自动更新中
              </span>
            )}
            {!id && cursor && (
              <Link className="text-link" to={`${base}/tasks${latestSearch}`}>
                返回最新任务
              </Link>
            )}
          </div>
          {!id && plugin && (
            <p className="cloud-task-filter">
              仅显示该插件的任务。
              <button className="text-link" onClick={() => setParams({}, { replace: true })}>
                查看全部
              </button>
            </p>
          )}
          {error && (
            <p className="form-error cloud-task-notice" role="alert">
              {currentPage && "刷新失败，当前显示上次加载的任务。"}
              {error}
            </p>
          )}
          {loading && !currentPage ? (
            <div className="panel cloud-tasks-loading" role="status">
              <Loader2 size={22} className="cloud-task-spinner" />
              正在加载云端任务…
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
                            {task.prompt.slice(0, 120) || "（内容已删除）"}
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
                    <p className="cloud-task-notice">正在确认云端是否已接收任务</p>
                  )}
                  {id && (
                    <section aria-label="任务要求" className="cloud-task-request">
                      <h3>任务要求</h3>
                      <pre className="cloud-task-content">{task.prompt || "（内容已删除）"}</pre>
                    </section>
                  )}
                  {task.result &&
                    (id ? (
                      <section aria-label="任务结果" className="cloud-task-output">
                        <h3>任务结果</h3>
                        <TaskResult id={task.id} content={task.result} />
                      </section>
                    ) : (
                      <details className="cloud-task-preview">
                        <summary>
                          查看结果 <ChevronDown size={15} />
                        </summary>
                        <TaskResult id={task.id} content={task.result} />
                      </details>
                    ))}
                  {task.files?.length ? (
                    <section aria-label="生成文件" className="cloud-task-files">
                      <h3>
                        生成文件 <span>{task.files.length}</span>
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
                      <p className="form-note">文件保留 30 天；清空或删除所属会话后不可下载。</p>
                    </section>
                  ) : null}
                  {task.error && (
                    <p className="form-error cloud-task-error">
                      <TriangleAlert size={16} />
                      {task.error}
                    </p>
                  )}
                  <div className="cloud-task-footer">
                    <div className="cloud-task-meta">
                      <time
                        dateTime={new Date(task.createdAt).toISOString()}
                        title={new Date(task.createdAt).toLocaleString("zh-CN")}
                      >
                        <Clock3 size={13} />
                        {relativeTime(task.createdAt)}
                      </time>
                      <span>
                        <Coins size={13} />
                        {task.credits !== undefined
                          ? `已结算 · ${task.credits.toFixed(3)} credits`
                          : active(task.status)
                            ? "费用待结算"
                            : "暂无扣费记录"}
                      </span>
                      {(task.delivery !== "pending" || !active(task.status) || task.stale) && (
                        <span
                          className={
                            task.delivery === "failed" ? "cloud-task-delivery-failed" : undefined
                          }
                        >
                          <MessageCircle size={13} />
                          {task.delivery === "sent"
                            ? "已送达微信"
                            : task.delivery === "stale" || task.stale
                              ? "结果仅保留在任务页，不再发送微信"
                              : task.delivery === "failed"
                                ? "微信未送达"
                                : "等待发送微信"}
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
                            ? "正在取消…"
                            : "取消文件接收"
                          : busy === task.id
                            ? "正在请求停止…"
                            : "停止"}
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
                  plugin ? "该插件暂无云端任务" : cursor ? "没有更早的云端任务" : "还没有云端任务"
                }
                description={
                  plugin || cursor
                    ? "已接收的云端任务会显示在这里，可返回全部任务查看其他记录。"
                    : !data.cloudAgent.ready
                      ? "云端 Agent 暂时不可用，已有任务记录仍可查看。"
                      : data.plan === "plus"
                        ? "在插件页配置云端 Agent 后，从微信发送文字或附件处理要求，即可在这里查看进度与结果。"
                        : "云端 Agent 已向 Plus 会员开放。开通后可配置自己的模型，从微信提交任务。"
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
                        ? "查看使用指南"
                        : data.plan === "plus"
                          ? "配置云端 Agent"
                          : "了解 Plus"}
                      <ArrowUpRight size={15} />
                    </Link>
                  ) : undefined
                }
              />
            </div>
          )}
          {!id && currentPage?.nextCursor && (
            <nav className="cloud-task-pagination" aria-label="任务分页">
              <Link className="button secondary" to={`${base}/tasks?${olderQuery}`}>
                查看更早任务
              </Link>
            </nav>
          )}
          {tasks.some(canStop) && (
            <p className="form-note cloud-task-stop-note">
              执行中的任务停止需等待云端确认，费用以最终结算为准；文件接收可取消，取消后本次不扣
              credits。已发生的模型 API 费用以服务商账单为准。
            </p>
          )}
        </div>
        <aside className="cloud-tasks-aside">
          <CloudStorage tasks={tasks} />
          <section className="cloud-tasks-help">
            <h2>
              <MessageCircle size={17} />
              在微信里继续
            </h2>
            <p>先发附件，再发送完整处理要求。任务在后台执行，完成后会尝试回复原微信会话。</p>
            <Link className="text-link" to="/docs/cloud-agent">
              查看使用指南 <ArrowUpRight size={14} />
            </Link>
            <p className="cloud-tasks-retention">
              清空或删除会话会清除对应任务内容，并请求停止未结束的任务。
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
