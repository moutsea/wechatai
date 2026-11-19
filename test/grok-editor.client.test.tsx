import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { PluginLibrary } from "../src/client/pages/plugin-library";
import { GrokEditor } from "../src/client/pages/grok-editor";
import { useApp } from "../src/client/context";
import { createFakeApi } from "./support/fake-api";
import type { Snapshot } from "../src/shared/types";
vi.mock("../src/client/context", () => ({ useApp: vi.fn() }));
it("offers the webhook path without a model, and explains both directions of setup", async () => {
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
  function card() {
    const el = document.createElement("div");
    el.innerHTML = renderToStaticMarkup(
      <MemoryRouter>
        <PluginLibrary onConfigure={() => {}} onView={() => {}} onResume={() => {}} />
      </MemoryRouter>,
    );
    return el.querySelector('article[aria-label="Grok Bot"]')!;
  }
  expect(card().textContent).not.toContain("超出当前套餐");
  expect(card().querySelector("button:disabled")?.textContent).toContain("暂未开放");
  data.grokBotReady = true;
  expect(card().querySelector("button:not(:disabled)")?.textContent).toContain("配置插件");
  expect(card().textContent).not.toContain("先添加模型");
  const markup = renderToStaticMarkup(
    <GrokEditor plugin="new" onClose={() => {}} onSaved={() => {}} />,
  );
  expect(markup).toContain("Webhook key");
  expect(markup).toContain("wechatai_claim");
  expect(markup).not.toContain("安装命令");
});
