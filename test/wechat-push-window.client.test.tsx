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

function connected(pushWindow?: Connection["pushWindow"]) {
  const link: WechatLink = {
    id: "a",
    name: "我的微信",
    paused: false,
    createdAt: 1,
    currentSessionId: "",
    status: "connected",
    hasReplyContext: true,
    lastSeen: Date.now() - 3600_000,
    ...(pushWindow ? { pushWindow } : {}),
  };
  snapshot.connections = [link];
  snapshot.selectedConnectionId = "a";
  snapshot.connection = link;
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
  snapshot = await createFakeApi()<Snapshot>("/dashboard");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      if (path === "/api/dashboard") return Response.json(snapshot);
      if (path === "/api/analytics/event") return new Response(null, { status: 204 });
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

it("says how long scheduled pushes can still arrive", async () => {
  connected({ until: Date.now() + 20 * 3600_000 });
  await mount();
  expect(container.textContent).toContain("提醒和通知可推送至");
  expect(container.textContent).not.toContain("即可恢复");
});

it.each([
  ["WeChat refused a push", { until: Date.now() + 3600_000, blockedAt: Date.now() }, "微信拒绝了"],
  ["the window closed", { until: Date.now() - 1000 }, "已超过 24 小时"],
])("tells the user to write when %s", async (_, pushWindow, text) => {
  connected(pushWindow);
  await mount();
  expect(container.textContent).toContain(text);
  expect(container.textContent).toContain("即可恢复");
});

it("shows nothing for a link without scheduled pushes", async () => {
  connected();
  await mount();
  expect(container.textContent).not.toContain("可推送至");
  expect(container.textContent).not.toContain("24 小时没在微信发消息");
});
