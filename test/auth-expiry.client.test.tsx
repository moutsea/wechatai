import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "../src/client/auth";
import { AppProvider, useApp } from "../src/client/context";
import { AuthPage } from "../src/client/public-pages";
import { ForgotPasswordPage } from "../src/client/pages/auth-recovery";
import { ApiError, type api } from "../src/client/api";
import type { Snapshot } from "../src/shared/types";
import { createFakeApi } from "./support/fake-api";

// 只替换认证服务边界；AuthProvider、AppProvider、AuthPage 和表单交互都使用真实实现。
const auth = vi.hoisted(() => {
  const cached = {
    user: { id: "cached-user", name: "Cached", email: "cached@example.test" },
    session: { token: "cached-token" },
  };
  const signedIn = {
    user: { id: "new-user", name: "Signed in", email: "again@example.test" },
    session: { token: "new-token" },
  };
  return {
    cached,
    signedIn,
    session: {
      data: cached as typeof cached | null,
      isPending: false,
      isRefetching: false,
      error: null as Error | null,
      refetch: vi.fn(async () => {}),
    },
    signIn: vi.fn(async () => ({
      error: null as { code: string } | null,
      data: { user: signedIn.user, token: signedIn.session.token } as {
        user: typeof signedIn.user;
        token: string;
      } | null,
    })),
  };
});
vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({ useSession: () => auth.session, signIn: { email: auth.signIn } }),
}));

const returnTo = "/app/channels?channel=abc#settings";
let container: HTMLDivElement;
let root: Root;
let snapshot: Snapshot;
let dashboardReply: () => Promise<Snapshot>;
let dashboardReads: number;
let refresh: () => Promise<void>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const request: typeof api = async <T,>(path: string) => {
  if (path === "/admin/access") return { isAdmin: false } as T;
  if (path === "/dashboard") {
    dashboardReads++;
    return (await dashboardReply()) as T;
  }
  throw new Error(`Unexpected request: ${path}`);
};

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  snapshot = await createFakeApi()<Snapshot>("/dashboard");
  dashboardReply = async () => snapshot;
  dashboardReads = 0;
  auth.session.data = auth.cached;
  auth.session.isPending = false;
  auth.session.isRefetching = false;
  auth.session.error = null;
  auth.session.refetch.mockReset().mockResolvedValue(undefined);
  auth.signIn
    .mockReset()
    .mockResolvedValue({
      error: null,
      data: { user: auth.signedIn.user, token: auth.signedIn.session.token },
    });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      if (path === "/api/auth/providers") return Response.json({ providers: [] });
      if (path === "/api/referrals/attribution") return Response.json({ active: false });
      if (path === "/api/auth/email-config") return Response.json({ delivery: "preview" });
      if (path === "/api/analytics/event") return new Response(null, { status: 204 });
      throw new Error(`Unexpected fetch: ${path}`);
    }),
  );
  window.history.replaceState({}, "", returnTo);
  window.sessionStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function WorkspaceProbe() {
  const state = useApp();
  refresh = state.refresh;
  return <output data-testid="workspace">{state.data ? "ready" : "loading"}</output>;
}
function Identity() {
  const { data } = useAuth();
  return (
    <output data-testid="identity">
      {data?.user.id}:{data?.user.name}:{data?.user.email}
    </output>
  );
}
function Location() {
  const location = useLocation();
  return (
    <output data-testid="location">{location.pathname + location.search + location.hash}</output>
  );
}
async function render(path = returnTo) {
  await act(async () =>
    root.render(
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <Location />
          <Identity />
          <Link to={`/login?returnTo=${encodeURIComponent(returnTo)}`}>打开登录页</Link>
          <Link to="/away">离开工作台</Link>
          <Routes>
            <Route
              path="/app/*"
              element={
                <AppProvider request={request}>
                  <WorkspaceProbe />
                </AppProvider>
              }
            />
            <Route path="/login" element={<AuthPage />} />
            <Route path="/register" element={<AuthPage register />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/away" element={<h1>其他页面</h1>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    ),
  );
}
const location = () => container.querySelector('[data-testid="location"]')?.textContent;
const password = () => container.querySelector<HTMLInputElement>('input[type="password"]');
async function click(text: string) {
  const target = [...container.querySelectorAll<HTMLElement>("button,a")].find(
    (node) => node.textContent?.trim() === text,
  );
  expect(target, text).toBeDefined();
  await act(async () => target!.click());
}
async function fill(selector: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(selector)!;
  expect(input).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function expire() {
  dashboardReply = async () => {
    // 若发生重定向回环，让下一次加载保持等待，避免测试自身陷入无限微任务循环。
    dashboardReply = () => new Promise<Snapshot>(() => {});
    throw new ApiError("expired", 401);
  };
  await act(async () => {
    void refresh();
  });
}

it.each(["hung", "failed", "cached"])(
  "keeps the real login form usable when session refresh is %s",
  async (outcome) => {
    const pending = deferred<void>();
    if (outcome === "hung") auth.session.refetch.mockReturnValue(pending.promise);
    if (outcome === "failed")
      auth.session.refetch.mockImplementation(async () => {
        auth.session.error = new Error("session unavailable");
        throw auth.session.error;
      });
    await render();
    await expire();
    await act(async () => vi.advanceTimersByTimeAsync(15000));
    const target = new URL(location()!, "https://example.test");
    expect(target.pathname).toBe("/login");
    expect(target.searchParams.get("returnTo")).toBe(returnTo);
    expect(password()).not.toBeNull();
    const reads = dashboardReads;
    await act(async () => vi.advanceTimersByTimeAsync(60000));
    expect(dashboardReads).toBe(reads);
    expect(password()).not.toBeNull();
  },
);

it.each(["cached", "error", "pending"])(
  "preserves the login draft when late session state becomes %s",
  async (outcome) => {
    const pending = deferred<void>();
    auth.session.refetch.mockReturnValue(pending.promise);
    await render();
    await expire();
    await act(async () => vi.advanceTimersByTimeAsync(15000));
    await fill('input[type="password"]', "unsaved-password");
    const input = password();
    auth.session.error = outcome === "error" ? new Error("late failure") : null;
    auth.session.isPending = outcome === "pending";
    await act(async () => pending.resolve());
    await render();
    expect(password()).toBe(input);
    expect(password()?.value).toBe("unsaved-password");
    expect(location()).toMatch(/^\/login\?/);
  },
);

it("keeps failed sign-in on the form and clears reauthentication after successful sign-in", async () => {
  await render();
  await expire();
  await fill('input[type="email"]', "again@example.test");
  await fill('input[type="password"]', "test-password");
  auth.signIn.mockResolvedValueOnce({ error: { code: "INVALID_EMAIL_OR_PASSWORD" }, data: null });
  await click("登录工作台");
  expect(container.textContent).toContain("邮箱或密码不正确");
  expect(password()).not.toBeNull();
  dashboardReply = async () => snapshot;
  auth.session.refetch.mockImplementation(async () => {
    auth.session.data = auth.signedIn;
  });
  await click("登录工作台");
  expect(auth.signIn).toHaveBeenLastCalledWith({
    email: "again@example.test",
    password: "test-password",
    fetchOptions: { disableSignal: true },
  });
  expect(location()).toBe(returnTo);
  expect(container.querySelector('[data-testid="workspace"]')?.textContent).toBe("ready");
  await click("打开登录页");
  expect(location()).toBe(returnTo);
  expect(password()).toBeNull();
});

it("retains reauthentication when visiting password recovery and returning to login", async () => {
  await render();
  await expire();
  await click("忘记密码？");
  expect(location()).toMatch(/^\/forgot-password\?/);
  await click("返回登录");
  expect(location()).toMatch(/^\/login\?/);
  expect(password()).not.toBeNull();
});

it("still redirects an ordinarily authenticated visitor away from login", async () => {
  await render(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  expect(location()).toBe(returnTo);
  expect(password()).toBeNull();
  expect(auth.signIn).not.toHaveBeenCalled();
});

it("does not require reauthentication after an obsolete 401 finishes", async () => {
  const pending = deferred<void>();
  auth.session.refetch.mockReturnValue(pending.promise);
  await render();
  await expire();
  dashboardReply = async () => snapshot;
  await act(async () => refresh());
  await act(async () => pending.resolve());
  await act(async () => vi.advanceTimersByTimeAsync(15000));
  await click("打开登录页");
  expect(location()).toBe(returnTo);
  expect(password()).toBeNull();
});

it.each(["hung", "failed", "stale-other-user", "stale-same-user", "anonymous"])(
  "never exposes cached identity when the post-login session is %s, and allows retry",
  async (outcome) => {
    await render();
    await expire();
    const pending = deferred<void>();
    if (outcome === "hung") auth.session.refetch.mockReturnValue(pending.promise);
    if (outcome === "failed")
      auth.session.refetch.mockImplementation(async () => {
        auth.session.error = new Error("500 session unavailable");
      });
    if (outcome === "stale-same-user")
      auth.signIn.mockResolvedValue({
        error: null,
        data: { user: auth.cached.user, token: "new-token" },
      });
    if (outcome === "anonymous")
      auth.session.refetch.mockImplementation(async () => {
        auth.session.data = null;
      });
    await fill('input[type="email"]', "again@example.test");
    await fill('input[type="password"]', "test-password");
    const reads = dashboardReads;
    await click("登录工作台");
    await act(async () => vi.advanceTimersByTimeAsync(15000));
    expect(location()).toMatch(/^\/login\?/);
    expect(password()?.value).toBe("test-password");
    expect(container.querySelector('[data-testid="identity"]')?.textContent).toBe("::");
    expect(container.textContent).toContain(
      outcome === "hung" ? "确认登录会话超时" : "暂时无法确认新的登录会话",
    );
    expect(dashboardReads).toBe(reads);
    if (outcome === "hung") {
      auth.session.data = auth.signedIn;
      await act(async () => pending.resolve());
      await render();
      expect(password()).not.toBeNull();
      expect(container.querySelector('[data-testid="identity"]')?.textContent).toBe("::");
    }
    auth.signIn.mockResolvedValue({
      error: null,
      data: { user: auth.signedIn.user, token: "new-token" },
    });
    auth.session.refetch.mockImplementation(async () => {
      auth.session.error = null;
      auth.session.data = auth.signedIn;
    });
    dashboardReply = async () => snapshot;
    await click("登录工作台");
    expect(location()).toBe(returnTo);
    expect(container.querySelector('[data-testid="identity"]')?.textContent).toBe(
      "new-user:Signed in:again@example.test",
    );
    expect(auth.session.refetch).toHaveBeenLastCalledWith({ query: { disableCookieCache: true } });
  },
);

it("does not navigate back after leaving a pending sign-in confirmation", async () => {
  await render();
  await expire();
  const pending = deferred<void>();
  auth.session.refetch.mockReturnValue(pending.promise);
  await fill('input[type="email"]', "again@example.test");
  await fill('input[type="password"]', "test-password");
  await click("登录工作台");
  await click("离开工作台");
  auth.session.data = auth.signedIn;
  await act(async () => pending.resolve());
  expect(location()).toBe("/away");
  expect(container.querySelector('[data-testid="identity"]')?.textContent).toBe(
    "new-user:Signed in:again@example.test",
  );
});
