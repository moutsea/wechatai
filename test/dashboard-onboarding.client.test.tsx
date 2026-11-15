import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DashboardOnboarding } from "../src/client/pages/dashboard-onboarding";
import { createFakeApi } from "./support/fake-api";
import type { Snapshot } from "../src/shared/types";

const state = vi.hoisted(() => ({ base: "/app", request: vi.fn(), refresh: vi.fn() }));
vi.mock("../src/client/context", () => ({ useApp: () => state }));
vi.mock("../src/client/analytics-client", () => ({ trackFunnel: vi.fn() }));
vi.mock("../src/client/pages/kimiseek-connect", () => ({
  useKimiseekConnect: () => ({ busy: false, start: vi.fn() }),
}));
let data: Snapshot;
let root: Root;
let container: HTMLDivElement;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  data = await createFakeApi()<Snapshot>("/dashboard");
  data.channels = [];
  data.assistants = [];
  data.connections = [];
  data.stats.messages = 0;
  data.onboardingDismissedAt = 0;
  data.plan = "free";
  data.cloudAgent.ready = true;
  state.request.mockReset().mockResolvedValue({ ok: true });
  state.refresh.mockReset().mockResolvedValue(undefined);
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
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<DashboardOnboarding data={data} />} />
          <Route path="/app/*" element={<p>配置目标页</p>} />
        </Routes>
      </MemoryRouter>,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find((e) =>
    e.textContent?.includes(text),
  );
  expect(button, text).toBeDefined();
  await act(async () => button!.click());
}
it("starts with purpose selection and keeps the choice on back navigation", async () => {
  expect(container.querySelectorAll(".onboarding-choices button")).toHaveLength(4);
  expect(container.textContent).not.toContain("API 余额");
  await click("接收服务通知");
  expect(container.textContent).toContain("Webhook 推送不扣 credits");
  expect(container.textContent).not.toContain("前往 DeepSeek");
  expect(document.activeElement?.textContent).toBe("接收服务通知");
  await click("上一步");
  expect(container.querySelector('[aria-pressed="true"]')?.textContent).toContain("接收服务通知");
  await click("下一步");
  expect(container.textContent).toContain("去配置通知");
});
it.each([
  ["在微信聊模型", "我有 Key，去配置模型"],
  ["连接已有 Agent", "去连接 Agent"],
  ["使用云端助手小薇", "了解小薇与 Plus"],
  ["接收服务通知", "去配置通知"],
])("connects %s to its existing configuration flow without purchasing", async (purpose, action) => {
  await click(purpose);
  if (purpose.includes("小薇")) expect(container.textContent).toContain("仅对 Plus 会员开放");
  await click(action);
  expect(container.textContent).toContain("配置目标页");
  expect(state.request).toHaveBeenCalledWith("/onboarding/dismiss", { method: "POST" });
  expect(state.request).not.toHaveBeenCalledWith("/billing/checkout", expect.anything());
});
