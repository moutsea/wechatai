import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { OpenClawEditor } from "../src/client/pages/openclaw-editor";
import { PluginLibrary, PluginConfiguration } from "../src/client/pages/plugin-library";
import { useApp } from "../src/client/context";
import { createFakeApi } from "./support/fake-api";
import { museInputSchema, type MusePlugin } from "../src/shared/muse";
import type { Snapshot } from "../src/shared/types";

vi.mock("../src/client/context", () => ({ useApp: vi.fn() }));

it("offers Muse without a local model and uses hosted installation guidance", async () => {
  const data = await createFakeApi()<Snapshot>("/dashboard");
  data.assistants = [];
  data.plugins = [];
  vi.mocked(useApp).mockReturnValue({
    data,
    base: "/app",
    request: createFakeApi(),
    refresh: async () => {},
    notify: vi.fn(),
    isAdmin: false,
    user: { name: "测试", email: "test@example.test" },
  });
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <PluginLibrary onConfigure={() => {}} onView={() => {}} onResume={() => {}} />
    </MemoryRouter>,
  );
  const node = document.createElement("div");
  node.innerHTML = html;
  const card = [...node.querySelectorAll("article")].find((item) =>
    item.textContent?.includes("自备 Muse"),
  );
  expect(card?.textContent).toContain("Muse");
  expect(card?.textContent).not.toContain("先添加模型");
  const editor = renderToStaticMarkup(
    <MemoryRouter>
      <OpenClawEditor
        kind="muse"
        plugin="new"
        onClose={() => {}}
        onSaved={() => {}}
        onComplete={() => {}}
      />
    </MemoryRouter>,
  );
  expect(editor).toContain("把指令发给 Muse");
  expect(editor).toContain("超出上限的回复会裁剪并附上提示，提示不计费");
  expect(editor).toContain("Muse 主聊天");
  expect(editor).not.toContain("重启 Gateway");
  expect(editor).not.toContain("OpenClaw 2026");
  expect(editor).toContain('href="/developers/muse"');
});

it("pairs through Muse endpoints and waits for the hook heartbeat", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  const data = await createFakeApi()<Snapshot>("/dashboard");
  const plugin: MusePlugin = {
    ...museInputSchema.parse({ name: "Muse", shortcut: "muse" }),
    id: "muse-config",
    pluginId: "wechatai/muse",
    version: "1.0.0",
    createdAt: 1,
    hasKey: false,
  };
  data.plugins = [plugin];
  const complete = vi.fn();
  let lastSeen = 0;
  let paired = false;
  const request = vi.fn(async (path: string) => {
    if (path === "/plugins/muse-config") return { ...plugin, hasKey: paired };
    if (path === "/plugins/muse-config/muse/pair") {
      paired = true;
      return { command: "把这段指令发给 Muse", expiresAt: Date.now() + 600000 };
    }
    if (path === "/plugins/muse-config/muse/status")
      return {
        hasKey: true,
        pairingClaimed: true,
        lastSeen,
        agents: [{ id: "main", name: "Muse 托管助理", isDefault: true }],
        agentId: "main",
        deliveries: [],
      };
    throw Error("Unexpected endpoint " + path);
  });
  vi.mocked(useApp).mockReturnValue({
    data,
    base: "/app",
    request: request as ReturnType<typeof useApp>["request"],
    refresh: async () => {},
    notify: vi.fn(),
    isAdmin: false,
    user: { name: "测试", email: "test@example.test" },
  });
  const node = document.createElement("div");
  document.body.appendChild(node);
  const root = createRoot(node);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <OpenClawEditor
            kind="muse"
            plugin={plugin}
            onClose={() => {}}
            onSaved={() => {}}
            onComplete={complete}
          />
        </MemoryRouter>,
      ),
    );
    const connect = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "连接 Muse",
    )!;
    await act(async () => connect.click());
    expect(document.body.textContent).toContain("复制后发送到 Muse 主聊天");
    expect(document.body.textContent).toContain("复制 Muse 连接指令");
    expect(complete).not.toHaveBeenCalled();
    lastSeen = Date.now();
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(complete).toHaveBeenCalledWith("muse-config");
    lastSeen = Date.now() - 120000;
    await act(async () => vi.advanceTimersByTimeAsync(10000));
    const reconnect = [...node.querySelectorAll("button")].find(
      (b) => b.textContent === "重新连接",
    )!;
    await act(async () => reconnect.click());
    expect(node.textContent).toContain("等待当前任务完成且结果回传后再连接");
    expect(node.textContent).toContain("先恢复原 hook 完成回传");
    expect(complete).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    node.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

it("describes Muse's own model and the hosted connection in configuration details", async () => {
  const data = await createFakeApi()<Snapshot>("/dashboard");
  data.assistants = [];
  data.plugins = [
    {
      ...museInputSchema.parse({ name: "Muse", shortcut: "muse" }),
      id: "muse-config",
      pluginId: "wechatai/muse",
      version: "1.0.0",
      createdAt: 1,
      hasKey: true,
      lastSeen: Date.now(),
    },
  ];
  vi.mocked(useApp).mockReturnValue({
    data,
    base: "/app",
    request: createFakeApi(),
    refresh: async () => {},
    notify: vi.fn(),
    isAdmin: false,
    user: { name: "测试", email: "test@example.test" },
  });
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <PluginConfiguration
        kind="wechatai/muse"
        selectedId="muse-config"
        busy={false}
        onSelect={() => {}}
        onClose={() => {}}
        onAdd={() => {}}
        onEdit={() => {}}
        onTest={() => {}}
        onDelete={() => {}}
        onAction={() => {}}
        onManage={() => {}}
        onRecords={() => {}}
      />
    </MemoryRouter>,
  );
  expect(html).toContain("Muse 助手");
  expect(html).toContain("在 Muse 中管理");
  expect(html).not.toContain("先添加模型");
});
