import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { PluginLibrary } from "../src/client/pages/plugin-library";
import { GrokEditor } from "../src/client/pages/grok-editor";
import {
  GROK_DISPATCH_UNAVAILABLE,
  GROK_ID,
  grokInputSchema,
  grokRoutineInstructions,
  grokSetupPrompt,
  type GrokPlugin,
} from "../src/shared/grok-bot";
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
