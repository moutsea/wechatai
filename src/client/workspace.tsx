import { lazy, Suspense } from "react";
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
const Admin = lazy(() => import("./pages/admin").then((module) => ({ default: module.Admin })));
export function Workspace({ demo = false }: { demo?: boolean }) {
  return (
    <AppProvider key={demo ? "demo" : "live"} demo={demo}>
      <Shell>
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
                <Sessions />
              </Suspense>
            }
          />
          <Route path="billing" element={<Billing />} />
          <Route path="credits" element={<Credits />} />
          <Route path="invite" element={<Invite />} />
          {!demo && (
            <Route
              path="admin"
              element={
                <Suspense fallback={<div className="full-state">正在加载管理后台…</div>}>
                  <Admin />
                </Suspense>
              }
            />
          )}
          <Route path="*" element={<Navigate to={demo ? "/demo" : "/app"} replace />} />
        </Routes>
      </Shell>
    </AppProvider>
  );
}
