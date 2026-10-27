import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppProvider, useApp } from "../src/client/context";
import { createFakeApi } from "./support/fake-api";
import type { Snapshot } from "../src/shared/types";

/**
 * AppProvider 的数据源是构造时注入的依赖（`request`），不再是产品里的某种「模式」。
 * 这条测试盯住契约本身：注入的实现会被用来取 `/dashboard` **和** `/admin/access`，
 * 且不会顺手打到真实 `api`。没有它的话，把 `api` 写死回去也不会有任何测试变红——
 * 其它客户端测试都 mock 掉了 context。
 * 注意：mock 的 session 必须带 user.id，否则 `/admin/access` 那段 effect 会提前 return，
 * 断言就成了空跑（这正是这条用例最初的样子）。
 */
const auth = vi.hoisted(() => ({ refetch: vi.fn(async () => {}) }));
vi.mock("../src/client/auth", () => ({
  useAuth: () => ({
    data: { user: { id: "user-1", email: "qa@example.com" } },
    refetch: auth.refetch,
  }),
}));
let root: Root;
let container: HTMLDivElement;
let snapshot: Snapshot;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  snapshot = await createFakeApi()<Snapshot>("/dashboard");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function Probe() {
  const { data, base, user } = useApp();
  return (
    <p>
      {base}|{data?.plan ?? "loading"}|{user.email}
    </p>
  );
}

it("loads the workspace through the injected request and never touches the real api", async () => {
  const fetchSpy = vi.fn(() => Promise.reject(new Error("Unexpected network")));
  vi.stubGlobal("fetch", fetchSpy);
  // 结构上等价于 `typeof api`：泛型返回 + 只用到 path，不需要 vi.fn 的 mock 类型。
  const requested: string[] = [];
  async function injected<T>(path: string): Promise<T> {
    requested.push(path);
    return snapshot as T;
  }
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/app"]}>
        <AppProvider request={injected}>
          <Probe />
        </AppProvider>
      </MemoryRouter>,
    ),
  );
  expect(requested).toContain("/dashboard");
  // `/admin/access` 也必须走注入的 `request`：写死 `api` 的话下面这条 fetch 断言会变红。
  expect(requested).toContain("/admin/access");
  expect(fetchSpy).not.toHaveBeenCalled();
  // base 恒为 /app：工作台不再有第二种挂载路径。
  expect(container.textContent).toContain("/app|plus|qa@example.com");
});
