import { NoticeProvider } from "./notices";
import { Notices } from "./pages/notices";
import { lazy, Suspense, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppProvider } from "./context";
import { Shell } from "./shell";
import { Dashboard } from "./pages/dashboard";
import { Channels } from "./pages/channels";
import { Wechat } from "./pages/wechat";
import { Billing } from "./pages/billing";
import { Credits } from "./pages/credits";
import { Invite } from "./pages/invite";
import "./pages/sessions.css";
const Sessions = lazy(() =>
  import("./pages/sessions").then((module) => ({ default: module.Sessions })),
);
const Plugins = lazy(() =>
  import("./pages/plugins").then((module) => ({ default: module.Plugins })),
);
const CloudTasks = lazy(() =>
  import("./pages/cloud-tasks").then((module) => ({ default: module.CloudTasks })),
);
const Admin = lazy(() => import("./pages/admin").then((module) => ({ default: module.Admin })));
export function Workspace() {
  const [historyRevision, setHistoryRevision] = useState(0);
  return (
    <AppProvider>
      <NoticeProvider>
        <Shell onHistoryCleared={() => setHistoryRevision((value) => value + 1)}>
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="channels" element={<Channels />} />
            <Route
              path="plugins"
              element={
                <Suspense
                  fallback={
                    <div className="full-state" role="status">
                      正在加载插件…
                    </div>
                  }
                >
                  <Plugins />
                </Suspense>
              }
            />
            <Route
              path="tasks/:id?"
              element={
                <Suspense
                  fallback={
                    <div className="full-state" role="status">
                      正在加载云端任务…
                    </div>
                  }
                >
                  <CloudTasks key={historyRevision} />
                </Suspense>
              }
            />
            <Route path="assistants" element={<Channels />} />
            <Route path="wechat" element={<Wechat />} />
            <Route
              path="sessions"
              element={
                <Suspense
                  fallback={
                    <div className="full-state" role="status">
                      正在加载会话记录…
                    </div>
                  }
                >
                  <Sessions key={historyRevision} />
                </Suspense>
              }
            />
            <Route path="billing" element={<Billing />} />
            <Route path="credits" element={<Credits />} />
            <Route path="invite" element={<Invite />} />
            <Route path="notices" element={<Notices />} />
            <Route
              path="admin"
              element={
                <Suspense fallback={<div className="full-state">正在加载管理后台…</div>}>
                  <Admin />
                </Suspense>
              }
            />
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Routes>
        </Shell>
      </NoticeProvider>
    </AppProvider>
  );
}
