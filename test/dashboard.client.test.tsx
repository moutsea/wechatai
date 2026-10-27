import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Dashboard } from "../src/client/pages/dashboard";
import { createFakeApi } from "./support/fake-api";
import type { ChatSession, Snapshot } from "../src/shared/types";

const state = vi.hoisted(() => ({
  data: null as Snapshot | null,
  user: { name: "Tester", email: "test@example.test" },
  base: "/app",
  request: vi.fn(),
  refresh: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("../src/client/context", () => ({ useApp: () => state }));
let root: Root;
let container: HTMLDivElement;
let sessions: ChatSession[];
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 204 })),
  );
  const fakeApi = createFakeApi();
  state.data = await fakeApi<Snapshot>("/dashboard");
  sessions = await fakeApi<ChatSession[]>("/sessions");
  state.data.plan = "plus";
  state.data.planUntil = Date.now() + 86400_000;
  state.data.onboardingDismissedAt = 1;
  state.data.stats.sessions = 1;
  state.request.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    ),
  );
}
const panel = () => container.querySelector(".recent-panel")!;

it("shows loading, distinguishes failure, and retries successfully", async () => {
  let fail!: (error: Error) => void;
  state.request.mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      }),
  );
  await render();
  expect(panel().textContent).toContain("正在加载对话记录");
  await act(async () => fail(new Error("Network unavailable")));
  expect(panel().querySelector('[role="alert"]')?.textContent).toContain("暂时读不到对话记录");
  state.request.mockResolvedValueOnce(sessions);
  await act(async () => panel().querySelector<HTMLButtonElement>("button")!.click());
  expect(state.request).toHaveBeenCalledTimes(2);
  expect(panel().querySelector('[role="alert"]')).toBeNull();
  expect(panel().querySelectorAll(".recent-row").length).toBeGreaterThan(0);
  expect(panel().textContent).toContain(sessions[0].title);
});

it("renders a successful empty response as empty rather than a read error", async () => {
  state.request.mockResolvedValue([]);
  await render();
  expect(panel().textContent).toContain("还没有可回看的对话");
  expect(panel().querySelector('[role="alert"]')).toBeNull();
});

it("reloads when the session count changes and ignores a stale response", async () => {
  let finish!: (value: ChatSession[]) => void;
  state.request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await render();
  const oldSignal = state.request.mock.calls[0][1].signal as AbortSignal;
  state.data = { ...state.data!, stats: { ...state.data!.stats, sessions: 2 } };
  state.request.mockResolvedValueOnce(sessions);
  await render();
  expect(oldSignal.aborted).toBe(true);
  await act(async () => finish([]));
  expect(panel().textContent).toContain(sessions[0].title);
});

it("clears pending reads when membership is downgraded and does not fetch Free history", async () => {
  let fail!: (error: Error) => void;
  state.request.mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      }),
  );
  await render();
  const signal = state.request.mock.calls[0][1].signal as AbortSignal;
  state.data = { ...state.data!, plan: "free" };
  await render();
  await act(async () => fail(new Error("late failure")));
  expect(signal.aborted).toBe(true);
  expect(state.request).toHaveBeenCalledTimes(1);
  expect(panel().textContent).toContain("升级 Plus");
  expect(panel().querySelector('[role="alert"]')).toBeNull();
});
