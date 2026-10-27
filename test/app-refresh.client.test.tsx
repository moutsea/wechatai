import { act, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppProvider, useApp } from "../src/client/context";
import { Channels } from "../src/client/pages/channels";
import { ApiError, type api } from "../src/client/api";
import type { Snapshot } from "../src/shared/types";
import { createFakeApi } from "./support/fake-api";

const auth = vi.hoisted(() => ({ refetch: vi.fn(async () => {}), requireSignIn: vi.fn() }));
vi.mock("../src/client/auth", () => ({
  useAuth: () => ({ data: null, refetch: auth.refetch, requireSignIn: auth.requireSignIn }),
}));
let root: Root;
let container: HTMLDivElement;
let snapshot: Snapshot;
let refresh: () => Promise<void>;
let events: string[];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  snapshot = await createFakeApi()<Snapshot>("/dashboard");
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(
    function (this: HTMLDialogElement) {
      this.open = true;
    },
  );
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(
    function (this: HTMLDialogElement) {
      this.open = false;
    },
  );
  auth.refetch.mockReset().mockResolvedValue(undefined);
  auth.requireSignIn.mockClear();
  events = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, options?: RequestInit) => {
      expect(path).toBe("/api/analytics/event");
      events.push(JSON.parse(String(options?.body)).name);
      return new Response(null, { status: 204 });
    }),
  );
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

function Probe() {
  const state = useApp();
  refresh = state.refresh;
  return <output data-testid="status">{state.data?.connection.status ?? "loading"}</output>;
}
function Location() {
  const location = useLocation();
  return (
    <output data-testid="location">{location.pathname + location.search + location.hash}</output>
  );
}
async function mount(
  request: (...args: Parameters<typeof api>) => Promise<unknown>,
  options: { children?: ReactNode; strict?: boolean; path?: string } = {},
) {
  const path = options.path ?? "/app/channels";
  window.history.replaceState({}, "", path);
  // Vitest 的 mock 会把泛型返回值收窄为 unknown；在夹具边界恢复 api 的泛型签名。
  const injected: typeof api = async <T,>(path: string, options?: RequestInit) =>
    (await request(path, options)) as T;
  const app = (
    <MemoryRouter initialEntries={[path]}>
      <Location />
      <Link to="/away">离开工作台</Link>
      <Routes>
        <Route
          path="/app/*"
          element={
            <AppProvider request={injected}>
              <Probe />
              {options.children}
            </AppProvider>
          }
        />
        <Route path="/login" element={<h1>登录</h1>} />
        <Route path="/away" element={<h1>其他页面</h1>} />
      </Routes>
    </MemoryRouter>
  );
  await act(async () => root.render(options.strict ? <StrictMode>{app}</StrictMode> : app));
}
async function click(label: string) {
  const button = [...container.querySelectorAll<HTMLElement>("button,a")].find(
    (item) => item.textContent?.trim() === label,
  );
  expect(button, label).toBeDefined();
  await act(async () => button!.click());
}
const status = () => container.querySelector('[data-testid="status"]')?.textContent;
const location = () => container.querySelector('[data-testid="location"]')?.textContent;
const alert = () => container.querySelector('[role="alert"]');
function connectedSnapshot() {
  const data = structuredClone(snapshot);
  data.connection.status = "connected";
  data.connections[0].status = "connected";
  return data;
}
function waitForScan() {
  snapshot.connection.status = "waiting";
  snapshot.connections[0].status = "waiting";
}

it("ignores stale success without rolling back the connection or double counting it", async () => {
  waitForScan();
  const old = deferred<Snapshot>();
  // 故意忽略 AbortSignal：即使底层请求取消不及时，迟到结果也不能生效。
  const request = vi
    .fn<typeof api>()
    .mockResolvedValueOnce(snapshot)
    .mockReturnValueOnce(old.promise)
    .mockResolvedValue(connectedSnapshot());
  await mount(request);
  await act(async () => vi.advanceTimersByTimeAsync(2500));
  expect(request).toHaveBeenCalledTimes(2);
  await act(async () => refresh());
  expect(status()).toBe("connected");
  expect(events).toEqual(["wechat_connected"]);
  await act(async () => old.resolve(snapshot));
  expect(status()).toBe("connected");
  await act(async () => refresh());
  expect(events).toEqual(["wechat_connected"]);
  expect(request.mock.calls[1][1]?.signal?.aborted).toBe(true);
});

it.each([new Error("old network failure"), new ApiError("old session expired", 401)])(
  "ignores stale failure after a newer success: %s",
  async (error) => {
    const old = deferred<Snapshot>();
    const request = vi
      .fn<typeof api>()
      .mockResolvedValueOnce(snapshot)
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue(snapshot);
    await mount(request);
    await act(async () => {
      void refresh();
    });
    await act(async () => refresh());
    await act(async () => old.reject(error));
    expect(status()).toBe(snapshot.connection.status);
    expect(location()).toBe("/app/channels");
    expect(alert()).toBeNull();
    expect(auth.refetch).not.toHaveBeenCalled();
    expect(auth.requireSignIn).not.toHaveBeenCalled();
  },
);

it("does not let stale success clear a newer refresh failure", async () => {
  waitForScan();
  const old = deferred<Snapshot>();
  const request = vi
    .fn<typeof api>()
    .mockResolvedValueOnce(snapshot)
    .mockReturnValueOnce(old.promise)
    .mockRejectedValueOnce(new Error("latest failure"));
  await mount(request);
  await act(async () => {
    void refresh();
  });
  await act(async () => refresh());
  expect(alert()?.textContent).toContain("刷新失败");
  await act(async () => old.resolve(connectedSnapshot()));
  expect(status()).toBe("waiting");
  expect(alert()?.textContent).toContain("刷新失败");
  expect(events).toEqual([]);
});

it("does not let polling replace a slow request before it can finish", async () => {
  waitForScan();
  const pending = deferred<Snapshot>();
  const request = vi
    .fn<typeof api>()
    .mockResolvedValueOnce(snapshot)
    .mockReturnValue(pending.promise);
  await mount(request);
  await act(async () => vi.advanceTimersByTimeAsync(12500));
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[1][1]?.signal?.aborted).toBe(false);
  await act(async () => pending.resolve(connectedSnapshot()));
  expect(status()).toBe("connected");
  expect(events).toEqual(["wechat_connected"]);
  await act(async () => vi.advanceTimersByTimeAsync(15000));
  expect(request.mock.calls[1][1]?.signal?.aborted).toBe(false);
  expect(alert()).toBeNull();
});

it("times out an initial hung request and allows a successful retry", async () => {
  const hung = deferred<Snapshot>();
  const request = vi
    .fn<typeof api>()
    .mockReturnValueOnce(hung.promise)
    .mockResolvedValue(connectedSnapshot());
  await mount(request);
  await act(async () => vi.advanceTimersByTimeAsync(14999));
  expect(container.textContent).not.toContain("暂时没能打开工作台");
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(request.mock.calls[0][1]?.signal?.aborted).toBe(true);
  expect(container.textContent).toContain("刷新超时");
  await click("重新加载");
  expect(status()).toBe("connected");
  await act(async () => hung.resolve(snapshot));
  expect(status()).toBe("connected");
});

it.each([2500, 30000])(
  "resumes %i ms polling after a request hangs past the deadline",
  async (interval) => {
    if (interval === 2500) waitForScan();
    const hung = deferred<Snapshot>();
    const request = vi
      .fn<typeof api>()
      .mockResolvedValueOnce(snapshot)
      .mockReturnValueOnce(hung.promise)
      .mockResolvedValue(connectedSnapshot());
    await mount(request);
    await act(async () => vi.advanceTimersByTimeAsync(interval + 14999));
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][1]?.signal?.aborted).toBe(false);
    await act(async () => vi.advanceTimersByTimeAsync(interval + 1));
    expect(request.mock.calls[1][1]?.signal?.aborted).toBe(true);
    expect(request.mock.calls.length).toBeGreaterThan(2);
    expect(status()).toBe("connected");
    expect(alert()).toBeNull();
    expect(events).toEqual(interval === 2500 ? ["wechat_connected"] : []);
  },
);

it("settles a hung manual refresh, preserves the draft and allows retry", async () => {
  const hung = deferred<Snapshot>();
  const request = vi
    .fn<typeof api>()
    .mockResolvedValueOnce(snapshot)
    .mockReturnValueOnce(hung.promise)
    .mockResolvedValue(snapshot);
  await mount(request, { children: <Channels /> });
  await click("添加渠道");
  const input = container.querySelector<HTMLInputElement>("#channel-api-key")!;
  let settled = false;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      input,
      "unsaved-timeout-key",
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
    void refresh().then(() => {
      settled = true;
    });
  });
  await act(async () => vi.advanceTimersByTimeAsync(15000));
  expect(settled).toBe(true);
  expect(alert()?.textContent).toContain("刷新失败");
  expect(container.querySelector("#channel-api-key")).toBe(input);
  expect(input.value).toBe("unsaved-timeout-key");
  await click("重试刷新");
  expect(alert()).toBeNull();
  expect(container.querySelector("#channel-api-key")).toBe(input);
  expect(input.value).toBe("unsaved-timeout-key");
});

it.each(["success", "network error", "401"])(
  "ignores a timed-out request's late %s after recovery",
  async (outcome) => {
    waitForScan();
    const hung = deferred<Snapshot>();
    const request = vi
      .fn<typeof api>()
      .mockResolvedValueOnce(snapshot)
      .mockReturnValueOnce(hung.promise)
      .mockResolvedValue(connectedSnapshot());
    await mount(request);
    await act(async () => vi.advanceTimersByTimeAsync(20000));
    expect(status()).toBe("connected");
    expect(events).toEqual(["wechat_connected"]);
    await act(async () => {
      if (outcome === "success") hung.resolve(snapshot);
      else
        hung.reject(outcome === "401" ? new ApiError("expired", 401) : new Error("late failure"));
    });
    expect(status()).toBe("connected");
    expect(alert()).toBeNull();
    expect(location()).toBe("/app/channels");
    expect(auth.refetch).not.toHaveBeenCalled();
    await act(async () => refresh());
    expect(events).toEqual(["wechat_connected"]);
  },
);

it("cancels an obsolete refresh deadline without timing out its replacement", async () => {
  const old = deferred<Snapshot>();
  const next = deferred<Snapshot>();
  const request = vi
    .fn<typeof api>()
    .mockResolvedValueOnce(snapshot)
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(next.promise);
  await mount(request);
  let settled = false;
  await act(async () => {
    void refresh().then(() => {
      settled = true;
    });
  });
  await act(async () => vi.advanceTimersByTimeAsync(5000));
  await act(async () => {
    void refresh();
  });
  expect(settled).toBe(true);
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  expect(request.mock.calls[2][1]?.signal?.aborted).toBe(false);
  expect(alert()).toBeNull();
  await act(async () => next.resolve(connectedSnapshot()));
  expect(status()).toBe("connected");
  await act(async () => vi.advanceTimersByTimeAsync(5000));
  expect(request.mock.calls[2][1]?.signal?.aborted).toBe(false);
  expect(alert()).toBeNull();
});

it("bounds the session refresh after a current 401 so it cannot hold polling forever", async () => {
  const hung = deferred<void>();
  auth.refetch.mockReturnValueOnce(hung.promise);
  const request = vi
    .fn<typeof api>()
    .mockResolvedValueOnce(snapshot)
    .mockRejectedValueOnce(new ApiError("expired", 401));
  const path = "/app/channels?channel=abc#settings";
  await mount(request, { path });
  let settled = false;
  await act(async () => {
    void refresh().then(() => {
      settled = true;
    });
  });
  await act(async () => vi.advanceTimersByTimeAsync(15000));
  expect(settled).toBe(true);
  const target = new URL(location()!, "https://example.test");
  expect(target.pathname).toBe("/login");
  expect(target.searchParams.get("returnTo")).toBe(path);
  await act(async () => hung.reject(new Error("late session failure")));
  expect(location()).toBe(target.pathname + target.search);
});

it("shows an initial load failure and retries into the workspace", async () => {
  const request = vi
    .fn<typeof api>()
    .mockRejectedValueOnce(new Error("initial failure"))
    .mockResolvedValue(snapshot);
  await mount(request);
  expect(container.textContent).toContain("暂时没能打开工作台");
  expect(status()).toBeUndefined();
  await click("重新加载");
  expect(status()).toBe(snapshot.connection.status);
  expect(container.textContent).not.toContain("暂时没能打开工作台");
});

it.each(["retry", "poll"])(
  "preserves a channel draft after a background failure and %s recovery",
  async (recovery) => {
    const request = vi
      .fn<typeof api>()
      .mockResolvedValueOnce(snapshot)
      .mockRejectedValueOnce(new Error("temporary network failure"))
      .mockResolvedValue(snapshot);
    await mount(request, { children: <Channels /> });
    await click("添加渠道");
    const input = container.querySelector<HTMLInputElement>("#channel-api-key")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "unsaved-test-key",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => vi.advanceTimersByTimeAsync(30000));
    expect(container.querySelector("#channel-api-key")).toBe(input);
    expect(input.value).toBe("unsaved-test-key");
    expect(alert()?.textContent).toContain("刷新失败");
    if (recovery === "retry") await click("重试刷新");
    else await act(async () => vi.advanceTimersByTimeAsync(30000));
    expect(container.querySelector("#channel-api-key")).toBe(input);
    expect(input.value).toBe("unsaved-test-key");
    expect(alert()).toBeNull();
  },
);

it.each([false, true])(
  "redirects a current 401 to login even when refetch rejects=%s",
  async (reject) => {
    if (reject) auth.refetch.mockRejectedValueOnce(new Error("session request failed"));
    const request = vi
      .fn<typeof api>()
      .mockResolvedValueOnce(snapshot)
      .mockRejectedValueOnce(new ApiError("session expired", 401));
    const path = "/app/channels?channel=abc#settings";
    await mount(request, { path });
    await act(async () => refresh());
    const target = new URL(location()!, "https://example.test");
    expect(target.pathname).toBe("/login");
    expect(target.searchParams.get("returnTo")).toBe(path);
    expect(auth.refetch).toHaveBeenCalledTimes(1);
  },
);

it("does not redirect after session refetch if a newer dashboard request succeeds", async () => {
  const session = deferred<void>();
  auth.refetch.mockReturnValueOnce(session.promise);
  const request = vi
    .fn<typeof api>()
    .mockResolvedValueOnce(snapshot)
    .mockRejectedValueOnce(new ApiError("session expired", 401))
    .mockResolvedValue(snapshot);
  await mount(request);
  let expired!: Promise<void>;
  await act(async () => {
    expired = refresh();
  });
  expect(auth.refetch).toHaveBeenCalledTimes(1);
  await act(async () => refresh());
  await act(async () => {
    session.resolve();
    await expired;
  });
  expect(location()).toBe("/app/channels");
  expect(status()).toBe(snapshot.connection.status);
});

it("cancels work on unmount and ignores a late 401", async () => {
  const pending = deferred<Snapshot>();
  const request = vi
    .fn<typeof api>()
    .mockResolvedValueOnce(snapshot)
    .mockReturnValueOnce(pending.promise);
  await mount(request);
  let settled = false;
  await act(async () => {
    void refresh().then(() => {
      settled = true;
    });
  });
  await click("离开工作台");
  expect(request.mock.calls[1][1]?.signal?.aborted).toBe(true);
  expect(settled).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => vi.advanceTimersByTimeAsync(15000));
  await act(async () => pending.reject(new ApiError("old session expired", 401)));
  expect(auth.refetch).not.toHaveBeenCalled();
  expect(location()).toBe("/away");
  await act(async () => refresh());
  expect(request).toHaveBeenCalledTimes(2);
});

it("ignores the discarded StrictMode request without hiding the successful workspace", async () => {
  const discarded = deferred<Snapshot>();
  const request = vi
    .fn<typeof api>()
    .mockReturnValueOnce(discarded.promise)
    .mockResolvedValue(snapshot);
  await mount(request, { strict: true });
  expect(status()).toBe(snapshot.connection.status);
  expect(request.mock.calls[0][1]?.signal?.aborted).toBe(true);
  await act(async () => discarded.reject(new ApiError("discarded session", 401)));
  expect(status()).toBe(snapshot.connection.status);
  expect(auth.refetch).not.toHaveBeenCalled();
  expect(location()).toBe("/app/channels");
});

it("ignores a previous request implementation after replacing the provider dependency", async () => {
  const old = deferred<Snapshot>();
  const previous = vi.fn<typeof api>().mockReturnValue(old.promise);
  const next = vi.fn<typeof api>().mockResolvedValue(connectedSnapshot());
  await mount(previous);
  await mount(next);
  expect(status()).toBe("connected");
  expect(previous.mock.calls[0][1]?.signal?.aborted).toBe(true);
  await act(async () => old.reject(new ApiError("old session", 401)));
  expect(status()).toBe("connected");
  expect(auth.refetch).not.toHaveBeenCalled();
});
