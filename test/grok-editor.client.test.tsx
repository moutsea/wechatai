import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { PluginLibrary } from "../src/client/pages/plugin-library";
import { GrokEditor } from "../src/client/pages/grok-editor";
import {
  GROK_DISPATCH_UNAVAILABLE,
  GROK_ID,
  grokInputSchema,
  grokReopenPrompt,
  grokRoutineInstructions,
  grokSetupPrompt,
  type GrokPlugin,
} from "../src/shared/grok-bot";
import { remoteAgentConnection } from "../src/client/remote-agent-status";
import { useApp } from "../src/client/context";
import { createFakeApi } from "./support/fake-api";
import type { Snapshot } from "../src/shared/types";
vi.mock("../src/client/context", () => ({ useApp: vi.fn() }));
async function setup() {
  const data = await createFakeApi()<Snapshot>("/dashboard");
  vi.mocked(useApp).mockReturnValue({
    data,
    base: "/app",
    request: createFakeApi(),
    refresh: async () => {},
    notify: vi.fn(),
    isAdmin: false,
    user: { name: "测试", email: "test@example.test" },
  });
  return data;
}
function card() {
  const el = document.createElement("div");
  el.innerHTML = renderToStaticMarkup(
    <MemoryRouter>
      <PluginLibrary onConfigure={() => {}} onView={() => {}} onResume={() => {}} />
    </MemoryRouter>,
  );
  return el.querySelector('article[aria-label="Grok Bot"]')!;
}

it("offers the webhook path without a model, and explains both directions of setup", async () => {
  const data = await setup();
  data.assistants = [];
  data.plugins = [];
  expect(card().textContent).not.toContain("超出当前套餐");
  expect(card().querySelector("button:disabled")?.textContent).toContain("暂未开放");
  data.grokBotReady = true;
  expect(card().querySelector("button:not(:disabled)")?.textContent).toContain("配置插件");
  expect(card().textContent).not.toContain("先添加模型");
  const markup = renderToStaticMarkup(
    <GrokEditor plugin="new" onClose={() => {}} onSaved={() => {}} />,
  );
  expect(markup).toContain("生成配置指令");
  expect(markup).toContain("发送等待提示");
  expect(markup).toContain("Webhook key");
  expect(markup).toContain("wechatai_claim");
  expect(markup).not.toContain("安装命令");
  data.grokBotVisible = false;
  expect(card()).toBeNull();
});
it("shows an existing Grok configuration how to proceed when dispatch is unavailable", async () => {
  const data = await setup();
  const saved: GrokPlugin = {
    ...grokInputSchema.parse({ name: "测试 Bot", shortcut: "grok" }),
    id: "test-bot",
    pluginId: GROK_ID,
    version: "1.0.0",
    createdAt: 1,
    hasKey: true,
    lastSeen: 1,
  };
  data.plugins = [saved];
  const editor = () =>
    renderToStaticMarkup(<GrokEditor plugin={saved} onClose={() => {}} onSaved={() => {}} />);
  data.grokBotReady = false;
  expect(card().textContent).toContain(GROK_DISPATCH_UNAVAILABLE);
  const unavailable = editor();
  expect(unavailable).toContain(GROK_DISPATCH_UNAVAILABLE);
  expect(unavailable).not.toContain("验证收发");
  expect(unavailable).toContain("撤销 MCP 凭据");
  data.grokBotReady = true;
  expect(editor()).toContain("验证收发");
});

it("builds one prompt that lets the Bot connect itself", () => {
  const prompt = grokSetupPrompt({
    endpoint: "https://wechatai.app/api/grok/mcp",
    token: "secret-token",
    shortcut: "grok",
  });
  expect(prompt).toContain("https://wechatai.app/api/grok/mcp");
  expect(prompt).toContain("Authorization: Bearer secret-token");
  expect(prompt).toContain(grokRoutineInstructions);
  expect(prompt).toContain("wechatai_register_webhook");
  expect(prompt).toContain("@grok");
});

const configured = (extra: Partial<GrokPlugin> = {}): GrokPlugin => ({
  ...grokInputSchema.parse({ name: "测试 Bot", shortcut: "grok" }),
  id: "test-bot",
  pluginId: GROK_ID,
  version: "1.0.0",
  createdAt: 1,
  hasKey: true,
  webhookReady: true,
  lastSeen: 1,
  ...extra,
});

it("keeps watching a setup that is still open after the editor is reopened", async () => {
  const data = await setup();
  data.grokBotReady = true;
  const plugin = configured({ setupPending: true, setupUntil: Date.now() + 10 * 60_000 });
  const markup = renderToStaticMarkup(
    <GrokEditor plugin={plugin} onClose={() => {}} onSaved={() => {}} />,
  );
  expect(markup).toContain("等待 Grok Bot 完成登记");
  expect(markup).toContain("配置指令已经发出");
  expect(markup).not.toContain("验证收发");
  // A saved Webhook does not mean the new credential is in use yet.
  expect(remoteAgentConnection(plugin).label).toBe("等待 Bot 完成配置");
  expect(remoteAgentConnection({ ...plugin, setupPending: false }).label).toBe("已配置");
});

it("asks before a new credential replaces the connector the Bot uses", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const data = await setup();
  data.grokBotReady = true;
  const api = createFakeApi();
  const paths: string[] = [];
  const request = ((path: string, options?: RequestInit) => {
    paths.push(path);
    return api(path, options);
  }) as typeof api;
  vi.mocked(useApp).mockReturnValue({ ...vi.mocked(useApp)(), data, request });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(<GrokEditor plugin={configured()} onClose={() => {}} onSaved={() => {}} />),
  );
  const button = () =>
    [...container.querySelectorAll("button")].find((b) =>
      /重新连接|确认重新生成/.test(b.textContent ?? ""),
    )!;
  expect(button().textContent).toBe("重新连接");
  // Rebuilding only the Routine needs no new credential.
  expect(container.textContent).toContain("重新开放登记");
  await act(async () => button().click());
  expect(button().textContent).toBe("确认重新生成，现有连接器会失效");
  expect(paths.some((path) => path.includes("/grok/token"))).toBe(false);
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("writes prompts a Bot can safely follow twice", () => {
  const prompt = grokSetupPrompt({
    endpoint: "https://wechatai.app/api/grok/mcp",
    token: "t",
    shortcut: "grok",
  });
  expect(prompt).toContain("不要再添加一个");
  expect(prompt).toContain("不要新建");
  const reopen = grokReopenPrompt({ shortcut: "grok" });
  expect(reopen).toContain("wechatai_register_webhook");
  expect(reopen).not.toContain("Authorization");
});

it("offers to reopen registration when an earlier setup never finished", async () => {
  const data = await setup();
  data.grokBotReady = true;
  // Reconnected, then the window expired before the Bot used the new credential.
  const plugin = configured({ lastSeen: 0, setupPending: false, setupUntil: 0 });
  const markup = renderToStaticMarkup(
    <GrokEditor plugin={plugin} onClose={() => {}} onSaved={() => {}} />,
  );
  expect(markup).toContain("上次的配置还没完成");
  expect(markup).toContain("重新开放登记");
  expect(markup).not.toContain("验证收发");
  expect(remoteAgentConnection(plugin).label).toBe("待 Bot 连接");
});

it("finishes a setup only after the Bot has used its credential", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const data = await setup();
  data.grokBotReady = true;
  const api = createFakeApi();
  // The owner saved the Routine by hand inside the window; the Bot has not called yet.
  const status = {
    hasKey: true,
    lastSeen: 0,
    webhookReady: true,
    setupPending: false,
    setupUntil: 0,
    registeredAt: Date.now(),
  };
  const request = ((path: string, options?: RequestInit) =>
    path.endsWith("/grok/status")
      ? Promise.resolve({ ...status })
      : api(path, options)) as typeof api;
  const notify = vi.fn();
  vi.mocked(useApp).mockReturnValue({ ...vi.mocked(useApp)(), data, request, notify });
  vi.useFakeTimers();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    const plugin = configured({
      lastSeen: 0,
      setupPending: true,
      setupUntil: Date.now() + 10 * 60_000,
    });
    await act(async () =>
      root.render(<GrokEditor plugin={plugin} onClose={() => {}} onSaved={() => {}} />),
    );
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(notify).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Webhook 已保存");
    status.lastSeen = Date.now();
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(notify).toHaveBeenCalledWith("Grok Bot 已完成配置，可以去微信测试了");
    expect(container.textContent).toContain("验证收发");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
