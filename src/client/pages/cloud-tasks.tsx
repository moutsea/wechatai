import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Cloud, RefreshCw, Square, Check, Loader2, TriangleAlert } from "lucide-react";
import { useApp } from "../context";
import { Empty, PageHead, relativeTime } from "../ui";
import { ApiError, json } from "../api";
import { ChatMarkdown, CopyMessage } from "../chat-markdown";
import "./cloud-tasks.css";
import type {
  CloudAgentTask,
  CloudAgentTaskPage,
  CloudAgentTaskStatus,
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

const canStop = (task: CloudAgentTask) => active(task.status) && task.status !== "finalizing";

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
          ? "已请求停止，等待云端确认。已发生的外部操作无法撤销，费用以最终结算为准。"
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
  return (
    <div className="page-enter cloud-tasks">
      <PageHead
        eyebrow="CLOUD AGENT"
        title="云端任务"
        description="查看执行状态、已结算费用和历史结果，微信未送达的结果也可在这里查看。清空或删除会话会清除对应任务内容，并请求停止未结束的任务。"
        action={
          <button
            className="button secondary"
            disabled={loading || Boolean(busy)}
            onClick={refresh}
          >
            <RefreshCw size={15} /> 刷新
          </button>
        }
      />
      {id && (
        <p>
          <Link className="text-link" to={`${base}/tasks${search}`}>
            返回任务列表
          </Link>
        </p>
      )}
      {!id && cursor && (
        <p>
          <Link className="text-link" to={`${base}/tasks${latestSearch}`}>
            返回最新任务
          </Link>
        </p>
      )}
      {!id && plugin && (
        <p className="cloud-task-filter">
          仅显示该插件的任务。
          <button className="text-link" onClick={() => setParams({}, { replace: true })}>
            查看全部
          </button>
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {currentPage && "刷新失败，当前显示上次加载的任务。"}
          {error}
        </p>
      )}
      {tasks.some(canStop) && (
        <p className="form-note">
          停止需等待云端确认；已发生的外部操作无法撤销，费用以最终结算为准。
        </p>
      )}
      {loading && !currentPage ? (
        <p className="form-note" role="status">
          正在加载云端任务…
        </p>
      ) : tasks.length ? (
        <div className="cloud-task-list">
          {tasks.map((task) => (
            <article key={task.id} className="panel cloud-task">
              <div className="cloud-task-description">
                {id ? (
                  <section aria-label="任务要求">
                    <h2 className="cloud-task-heading">任务要求</h2>
                    <pre className="cloud-task-content">{task.prompt || "（内容已删除）"}</pre>
                  </section>
                ) : (
                  <Link
                    className="cloud-task-title"
                    to={`${base}/tasks/${encodeURIComponent(task.id)}${search}`}
                  >
                    {task.prompt.slice(0, 120) || "（内容已删除）"}
                  </Link>
                )}
                <small>
                  {task.pluginName} · {task.sessionTitle}
                  {task.stale && " · 原会话已变更"}
                  {task.unconfirmed && " · 正在确认云端是否已接收任务"}
                </small>
                {task.result &&
                  (id ? (
                    <section aria-label="任务结果">
                      <h2 className="cloud-task-heading">任务结果</h2>
                      <TaskResult id={task.id} content={task.result} />
                    </section>
                  ) : (
                    <details>
                      <summary>查看结果</summary>
                      <TaskResult id={task.id} content={task.result} />
                    </details>
                  ))}
                {task.error && <small className="form-error">{task.error}</small>}
              </div>
              <span className={`tag ${task.status}`}>
                {task.status === "completed" ? (
                  <Check size={13} />
                ) : active(task.status) ? (
                  <Loader2 size={13} />
                ) : task.status === "failed" ? (
                  <TriangleAlert size={13} />
                ) : (
                  <Square size={13} />
                )}
                {labels[task.status]}
                {task.stopping ? " · 停止确认中" : ""}
              </span>
              <div className="cloud-task-meta">
                <time
                  dateTime={new Date(task.createdAt).toISOString()}
                  title={new Date(task.createdAt).toLocaleString("zh-CN")}
                >
                  {relativeTime(task.createdAt)}
                </time>
                <span>
                  {task.credits !== undefined
                    ? `已结算 · ${task.credits.toFixed(3)} credits`
                    : active(task.status)
                      ? "费用待结算"
                      : "暂无扣费记录"}
                </span>
                <span>
                  {task.delivery === "sent"
                    ? "已送达微信"
                    : task.delivery === "stale" || task.stale
                      ? "结果仅保留在任务页，不再发送微信"
                      : task.delivery === "failed"
                        ? "微信未送达"
                        : active(task.status)
                          ? ""
                          : "等待发送微信"}
                </span>
              </div>
              {canStop(task) && (
                <button
                  className="text-link"
                  disabled={Boolean(busy) || task.stopping}
                  onClick={() => void cancel(task)}
                >
                  {busy === task.id ? "正在请求停止…" : "停止"}
                </button>
              )}
            </article>
          ))}
        </div>
      ) : error ? null : (
        <Empty
          icon={<Cloud size={22} />}
          title={plugin ? "该插件暂无云端任务" : cursor ? "没有更早的云端任务" : "还没有云端任务"}
          description="已接收的云端任务会显示在这里。服务开放后，Plus 会员可在插件页配置云端 Agent，再从微信提交文字任务。"
        />
      )}
      {!id && currentPage?.nextCursor && (
        <nav className="cloud-task-pagination" aria-label="任务分页">
          <Link className="button secondary" to={`${base}/tasks?${olderQuery}`}>
            查看更早任务
          </Link>
        </nav>
      )}
    </div>
  );
}
