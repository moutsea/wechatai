import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { OpenClawEditor } from "../src/client/pages/openclaw-editor";
import { useApp } from "../src/client/context";
import { createFakeApi } from "./support/fake-api";
import {
  openClawInputSchema,
  type OpenClawPlugin,
  type OpenClawStatus,
} from "../src/shared/openclaw";
import { pluginLimitIssue } from "../src/shared/plugin-access";
import type { Snapshot } from "../src/shared/types";

vi.mock("../src/client/context", () => ({ useApp: vi.fn() }));

it("updates a paused connector to online after membership renewal without re-pairing", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const data = await createFakeApi()<Snapshot>("/dashboard");
  data.plan = "free";
  data.planUntil = Date.now() - 1000;
  const plugin: OpenClawPlugin = {
    ...openClawInputSchema.parse({ name: "Mac 助手", shortcut: "mac" }),
    id: "mac",
    pluginId: "wechatai/openclaw",
    version: "1.0.0",
    createdAt: 1,
    hasKey: true,
    lastSeen: Date.now(),
    access: pluginLimitIssue(data.planUntil),
  };
  data.plugins = [{ ...plugin, id: "older" }, plugin];
  let status: OpenClawStatus = {
    ...plugin,
    lastSeen: plugin.lastSeen!,
    agents: [],
    agentId: "main",
    deliveries: [],
  };
  const request = vi.fn(async (_path: string) => status);
  vi.mocked(useApp).mockReturnValue({
    data,
    base: "/app",
    request: request as ReturnType<typeof useApp>["request"],
    refresh: async () => {},
    notify: vi.fn(),
    isAdmin: false,
    user: { name: "测试", email: "test@example.test" },
  });
  vi.useFakeTimers();
  const node = document.createElement("div");
  document.body.appendChild(node);
  const root = createRoot(node);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <OpenClawEditor
            plugin={plugin}
            onClose={() => {}}
            onSaved={() => {}}
            onComplete={() => {}}
          />
        </MemoryRouter>,
      ),
    );
    const reconnect = () =>
      [...document.querySelectorAll("button")].find((b) => b.textContent === "重新连接")!;
    expect(document.body.textContent).toContain("会员到期已暂停");
    expect(document.body.textContent).not.toContain("请检查 Gateway");
    expect(reconnect().disabled).toBe(true);
    data.plan = "plus";
    data.planUntil = Date.now() + 86400000;
    status = { ...status, access: null, lastSeen: Date.now() };
    await act(async () => vi.advanceTimersByTimeAsync(10000));
    expect(document.body.textContent).toContain("OpenClaw 已连接");
    expect(document.body.textContent).not.toContain("会员到期已暂停");
    expect(reconnect().disabled).toBe(false);
    expect(request.mock.calls.every((args) => args[0] === "/plugins/mac/openclaw/status")).toBe(
      true,
    );
  } finally {
    await act(async () => root.unmount());
    node.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
