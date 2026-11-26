import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppProvider } from "../src/client/context";
import { Wechat } from "../src/client/pages/wechat";
import { createFakeApi } from "./support/fake-api";
import type { Connection, Snapshot, WechatLink } from "../src/shared/types";

// A stable refetch: a new function on every render would reload the workspace forever.
const auth = vi.hoisted(() => ({ refetch: async () => {} }));
vi.mock("../src/client/auth", () => ({ useAuth: () => ({ data: null, refetch: auth.refetch }) }));
let root: Root;
let container: HTMLDivElement;
let snapshot: Snapshot;
let submitted: { path: string; body: unknown }[];

function link(connection: Partial<Connection>) {
  const value: WechatLink = {
    id: "a",
    name: "我的微信",
    paused: false,
    createdAt: 1,
    currentSessionId: "",
    status: "scanned",
    qrUrl: "https://example.test/qr",
    qrExpires: Date.now() + 120_000,
    ...connection,
  };
  snapshot.connections = [value];
  snapshot.selectedConnectionId = "a";
  snapshot.connection = value;
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // A pending link makes the workspace poll the dashboard on a timer.
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
  snapshot = await createFakeApi()<Snapshot>("/dashboard");
  submitted = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, options?: RequestInit) => {
      if (path === "/api/dashboard") return Response.json(snapshot);
      if (path === "/api/analytics/event") return new Response(null, { status: 204 });
      if (path.endsWith("/verify")) {
        submitted.push({ path, body: JSON.parse(String(options?.body)) });
        link({ verifyState: "rejected" });
        return Response.json(snapshot);
      }
      throw new Error(`Unexpected API: ${path}`);
    }),
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/app/wechat"]}>
        <AppProvider>
          <Routes>
            <Route path="/app/wechat" element={<Wechat />} />
          </Routes>
        </AppProvider>
      </MemoryRouter>,
    ),
  );
}

it("replaces the QR code with the digit prompt and submits the digits for the selected link", async () => {
  link({ verifyState: "required" });
  await mount();
  expect(container.textContent).toContain("输入手机微信上显示的数字");
  expect(container.textContent).toContain("等待输入数字");
  expect(container.querySelector(".qr-area > svg")).toBeNull();
  const input = container.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "2468");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () =>
    container.querySelector<HTMLFormElement>(".wechat-verify")!.requestSubmit(),
  );
  expect(submitted).toEqual([{ path: "/api/wechat/links/a/verify", body: { code: "2468" } }]);
  expect(container.textContent).toContain("数字不匹配");
});

it("shows the QR code again once no digits are needed", async () => {
  link({ status: "waiting" });
  await mount();
  expect(container.querySelector(".wechat-verify")).toBeNull();
  expect(container.textContent).toContain("使用微信 ClawBot 的「扫一扫」");
});
