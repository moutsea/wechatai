import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import type { Snapshot } from "../shared/types";
import { api, ApiError } from "./api";
import { createDemo } from "./demo";
import { useAuth } from "./auth";
import { authReturnPath } from "../shared/auth";
type AppState = {
  data: Snapshot | null;
  refresh: () => Promise<void>;
  request: typeof api;
  demo: boolean;
  isAdmin: boolean;
  base: string;
  user: { name: string; email: string };
  notify: (message: string, error?: boolean) => void;
};
const State = createContext<AppState | null>(null);
export function useApp() {
  const state = useContext(State);
  if (!state) throw new Error("Missing app context");
  return state;
}
export function AppProvider({ demo, children }: { demo: boolean; children: ReactNode }) {
  const request = useMemo(() => (demo ? createDemo() : api), [demo]);
  const [data, setData] = useState<Snapshot | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const { data: session, refetch: refreshSession } = useAuth();
  const user = demo
    ? { name: "体验用户", email: "仅示例数据 · 不连接真实服务" }
    : (session?.user ?? { name: "", email: "" });
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [failure, setFailure] = useState("");
  const navigate = useNavigate();
  useEffect(() => {
    setIsAdmin(false);
    if (demo || !session?.user.id) return;
    const controller = new AbortController();
    void api<{ isAdmin: boolean }>("/admin/access", { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setIsAdmin(result.isAdmin);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [demo, session?.user.id]);
  const notify = useCallback((text: string, error = false) => setNotice({ text, error }), []);
  const refresh = useCallback(async () => {
    try {
      setData(await request<Snapshot>("/dashboard"));
      setFailure("");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        const returnTo = authReturnPath(
          window.location.pathname + window.location.search + window.location.hash,
        );
        await refreshSession();
        navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
      } else setFailure(e instanceof Error ? e.message : "加载失败");
    }
  }, [request, navigate, refreshSession]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  useEffect(() => {
    if (!data || demo) return;
    const timer = setInterval(
      () => {
        if (!document.hidden) void refresh();
      },
      data.connections.some((l) => !l.paused && ["waiting", "scanned"].includes(l.status))
        ? 2500
        : 30000,
    );
    return () => clearInterval(timer);
  }, [data?.connections.map((l) => `${l.id}:${l.status}:${l.paused}`).join(","), demo, refresh]);
  return (
    <State.Provider
      value={{ data, request, refresh, demo, isAdmin, base: demo ? "/demo" : "/app", user, notify }}
    >
      {failure ? (
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
      {notice && (
        <div
          className={`toast ${notice.error ? "error" : ""}`}
          role={notice.error ? "alert" : "status"}
        >
          {notice.text}
          <button aria-label="关闭通知" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}
    </State.Provider>
  );
}
