import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import type { Snapshot } from "../shared/types";
import { api, ApiError } from "./api";
import { useAuth } from "./auth";
import { authReturnPath } from "../shared/auth";
import { useWechatConnectionTracker } from "./wechat-connection-tracker";
type AppState = {
  data: Snapshot | null;
  refresh: () => Promise<void>;
  request: typeof api;
  isAdmin: boolean;
  base: string;
  user: { name: string; email: string };
  notify: (message: string, error?: boolean) => void;
};
const State = createContext<AppState | null>(null);
const REFRESH_TIMEOUT_MS = 15_000;
export function useApp() {
  const state = useContext(State);
  if (!state) throw new Error("Missing app context");
  return state;
}
/**
 * 工作台的唯一数据入口。
 *
 * `request` 默认就是真实的 `api`，只有测试才注入替代实现：把「换数据源」做成构造时
 * 可替换的依赖，而不是产品里一个能切换的模式，才不会又长回演示工作台那样的分支。
 */
export function AppProvider({
  request = api,
  children,
}: {
  request?: typeof api;
  children: ReactNode;
}) {
  const [data, setData] = useState<Snapshot | null>(null);
  useWechatConnectionTracker(data);
  const [isAdmin, setIsAdmin] = useState(false);
  const { data: session, refetch: refreshSession, requireSignIn } = useAuth();
  const user = session?.user ?? { name: "", email: "" };
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [failure, setFailure] = useState("");
  const active = useRef(false);
  const refreshController = useRef<AbortController | null>(null);
  const navigate = useNavigate();
  useEffect(() => {
    setIsAdmin(false);
    if (!session?.user.id) return;
    const controller = new AbortController();
    // 走注入的 `request` 而不是直接调 `api`：否则「换数据源」这条缝只缝了一半，
    // 测试里 `request` 换掉之后这里仍会打到真实接口（断言也就变成空跑）。
    void request<{ isAdmin: boolean }>("/admin/access", { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setIsAdmin(result.isAdmin);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [session?.user.id, request]);
  const notify = useCallback((text: string, error = false) => setNotice({ text, error }), []);
  const refresh = useCallback(async () => {
    if (!active.current) return;
    // 操作后的刷新优先于旧轮询；既取消网络请求，也防止取消不及时的响应覆盖新状态。
    refreshController.current?.abort();
    const controller = new AbortController();
    refreshController.current = controller;
    const ownsRefresh = () => active.current && refreshController.current === controller;
    const isCurrent = () => ownsRefresh() && !controller.signal.aborted;
    const timeoutError = new Error("数据刷新超时，请重试。");
    // 取消不仅要通知 fetch，也要结束调用方的等待；底层忽略 signal 时仍能恢复轮询。
    let onAbort!: () => void;
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    const timeout = setTimeout(() => controller.abort(timeoutError), REFRESH_TIMEOUT_MS);
    try {
      const next = await Promise.race([
        request<Snapshot>("/dashboard", { signal: controller.signal }),
        aborted,
      ]);
      if (!isCurrent()) return;
      setData(next);
      setFailure("");
    } catch (e) {
      if (ownsRefresh() && e === timeoutError) {
        setFailure(timeoutError.message);
        return;
      }
      if (!isCurrent()) return;
      if (e instanceof ApiError && e.status === 401) {
        const returnTo = authReturnPath(
          window.location.pathname + window.location.search + window.location.hash,
        );
        // 已确认登录失效，会话刷新失败或超时也要回到登录页；新请求仍可取消这次跳转。
        await Promise.race([refreshSession(), aborted]).catch(() => undefined);
        if (
          ownsRefresh() &&
          (!controller.signal.aborted || controller.signal.reason === timeoutError)
        ) {
          requireSignIn();
          navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
        }
      } else setFailure(e instanceof Error ? e.message : "加载失败");
    } finally {
      clearTimeout(timeout);
      controller.signal.removeEventListener("abort", onAbort);
      if (refreshController.current === controller) refreshController.current = null;
    }
  }, [request, navigate, refreshSession, requireSignIn]);
  useEffect(() => {
    active.current = true;
    void refresh();
    return () => {
      active.current = false;
      refreshController.current?.abort();
    };
  }, [refresh]);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  useEffect(() => {
    if (!data) return;
    const timer = setInterval(
      () => {
        // 慢请求尚未返回时跳过轮询，避免每 2.5 秒取消它，使结果一直无法落地。
        if (!document.hidden && !refreshController.current) void refresh();
      },
      data.connections.some((l) => !l.paused && ["waiting", "scanned"].includes(l.status))
        ? 2500
        : 30000,
    );
    return () => clearInterval(timer);
  }, [data?.connections.map((l) => `${l.id}:${l.status}:${l.paused}`).join(","), refresh]);
  const showRefreshFailure = Boolean(data && failure && !notice);
  const toast =
    notice ?? (showRefreshFailure ? { text: "数据刷新失败，已保留当前内容。", error: true } : null);
  return (
    <State.Provider value={{ data, request, refresh, isAdmin, base: "/app", user, notify }}>
      {failure && !data ? (
        <div className="full-state">
          <h2>暂时没能打开工作台</h2>
          <p>{failure}</p>
          <button className="button" onClick={() => void refresh()}>
            重新加载
          </button>
        </div>
      ) : (
        children
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.text}
          {showRefreshFailure && (
            <button className="toast-retry" onClick={() => void refresh()}>
              重试刷新
            </button>
          )}
          <button
            aria-label="关闭通知"
            onClick={() => (showRefreshFailure ? setFailure("") : setNotice(null))}
          >
            ×
          </button>
        </div>
      )}
    </State.Provider>
  );
}
