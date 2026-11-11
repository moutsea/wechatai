import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Plugins } from "../src/client/pages/plugins";
import { Wechat } from "../src/client/pages/wechat";
import { useApp } from "../src/client/context";
import { createFakeApi } from "./support/fake-api";
import { cloudAgentInputSchema, type CloudAgentPlugin } from "../src/shared/cloud-agent";
import type { Snapshot } from "../src/shared/types";

vi.mock("../src/client/context", () => ({ useApp: vi.fn() }));
let root: Root;
let container: HTMLDivElement;
let data: Snapshot;
const notify = vi.fn();
const request = vi.fn();
const plugin = (enabled = true): CloudAgentPlugin => ({
  ...cloudAgentInputSchema.parse({ enabled }),
  id: "cloud",
  pluginId: "wechatai/cloud-agent",
  version: "1.0.0",
  createdAt: 1,
  hasKey: true,
  status: {
    ready: true,
    dailyLimit: 30,
    maxActive: 1,
    usedToday: 0,
    active: 0,
    deadlineMinutes: 10,
  },
});
async function render(view = <Plugins />) {
  await act(async () => root.render(<MemoryRouter>{view}</MemoryRouter>));
}
async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === label || button.getAttribute("aria-label") === label,
  );
  expect(button, label).toBeDefined();
  await act(async () => button!.click());
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  data = await createFakeApi()<Snapshot>("/dashboard");
  data.plan = "plus";
  data.assistants = [];
  data.plugins = [];
  notify.mockReset();
  request.mockReset();
  vi.mocked(useApp).mockReturnValue({
    data,
    base: "/app",
    isAdmin: false,
    user: { name: "测试", email: "test@example.test" },
    request,
    notify,
    refresh: async () => {},
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
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
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("cloud Agent plugin interactions", () => {
  it.each(["free", "plus"] as const)(
    "shows unavailable service before configuration or upgrade for %s users",
    async (plan) => {
      data.plan = plan;
      data.cloudAgent = {
        ...data.cloudAgent,
        ready: false,
        reason: "运营方尚未开启云端服务，请稍后再试。",
      };
      await render();
      const card = container.querySelector('article[aria-label="云端 Agent"]')!;
      expect(card.textContent).toContain("暂未开放");
      expect(card.textContent).toContain("运营方尚未开启云端服务");
      expect(card.querySelector('a[href="/app/billing"]')).toBeNull();
      expect(card.querySelector('button[aria-label="配置 云端 Agent"]')).toBeNull();
      expect(card.querySelector("button")!.disabled).toBe(true);
      expect(request).not.toHaveBeenCalled();
      data.cloudAgent = { ...data.cloudAgent, ready: true, reason: undefined };
      await render();
      const restored = container.querySelector('article[aria-label="云端 Agent"]')!;
      if (plan === "free")
        expect(restored.querySelector('a[href="/app/billing"]')?.textContent).toContain(
          "开通 Plus",
        );
      else
        expect(
          restored.querySelector<HTMLButtonElement>('button[aria-label="配置 云端 Agent"]')
            ?.disabled,
        ).toBe(false);
    },
  );

  it("creates a plugin without model fields and checks its status without a paid question modal", async () => {
    request.mockImplementation(async (path: string, options: RequestInit) => {
      if (path === "/plugins") {
        expect(options.method).toBe("POST");
        const body = JSON.parse(options.body as string);
        expect(body).toMatchObject({
          pluginId: "wechatai/cloud-agent",
          shortcut: "云",
          enabled: true,
        });
        expect(body).not.toHaveProperty("modelId");
        expect(body).not.toHaveProperty("apiKey");
        data.plugins = [plugin()];
        return plugin();
      }
      expect(path).toBe("/plugins/cloud/test");
      expect(JSON.parse(options.body as string)).toEqual({});
      return { text: "云端服务已配置，请在微信发送任务验证实际运行。", cost: 0 };
    });
    await render();
    await click("配置 云端 Agent");
    expect(container.textContent).toContain("添加云端 Agent");
    await act(async () =>
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(container.textContent).toContain("云端 Agent 配置");
    await click("检查服务状态");
    expect(request).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenLastCalledWith("云端服务已配置，请在微信发送任务验证实际运行。");
    expect(container.querySelector("textarea[required]")).toBeNull();
    expect(container.textContent).not.toContain("测试问题");
  });

  it("can re-enable a saved configuration through the editor", async () => {
    data.plugins = [plugin(false)];
    request.mockImplementation(async (path: string, options: RequestInit) => {
      expect(path).toBe("/plugins/cloud");
      expect(options.method).toBe("PATCH");
      expect(JSON.parse(options.body as string)).toMatchObject({ enabled: true });
      data.plugins = [plugin()];
      return plugin();
    });
    await render();
    await click("查看 云端 Agent 配置");
    await click("修改配置");
    const select = [...container.querySelectorAll("select")].find(
      (select) => select.value === "disabled",
    )!;
    await act(async () => {
      select.value = "enabled";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () =>
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("已启用");
  });

  it("keeps maintenance available during an outage but blocks saving an enabled configuration", async () => {
    data.plugins = [plugin()];
    data.cloudAgent = { ...data.cloudAgent, ready: false };
    request.mockImplementation(async () => {
      data.plugins = [plugin(false)];
      return plugin(false);
    });
    await render();
    await click("查看 云端 Agent 配置");
    expect(container.textContent).not.toContain("添加另一组配置");
    expect(container.textContent).toContain("/wx stop");
    await click("修改配置");
    const save = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "保存配置",
    )!;
    expect(save.disabled).toBe(true);
    const form = container.querySelector("form")!;
    await act(async () =>
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(request).not.toHaveBeenCalled();
    const select = [...container.querySelectorAll("select")].find((s) => s.value === "enabled")!;
    await act(async () => {
      select.value = "disabled";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(save.disabled).toBe(false);
    await act(async () =>
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({ enabled: false });
  });

  it("does not offer renewal or another configuration for a saved cloud plugin while the service is closed", async () => {
    data.plan = "free";
    data.plugins = [plugin()];
    data.cloudAgent = { ...data.cloudAgent, ready: false };
    await render();
    await click("查看 云端 Agent 配置");
    const dialog = container.querySelector("dialog")!;
    expect(dialog.textContent).toContain("运营方尚未开启云端服务");
    expect(dialog.querySelector('a[href="/app/billing"]')).toBeNull();
    expect(dialog.textContent).not.toContain("添加另一组配置");
    expect(dialog.textContent).toContain("删除配置");
  });

  it("permits QR binding for an eligible cloud-only account", async () => {
    data.channels = [];
    data.plugins = [plugin()];
    data.currentSession = null;
    data.connection = { status: "disconnected" };
    await render(<Wechat />);
    const qr = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("获取二维码"),
    )!;
    expect(qr.disabled).toBe(false);
    expect(container.textContent).not.toContain("配置渠道与模型");
    expect(container.textContent).toContain("发送 /use 云");
    await act(async () => qr.click());
    expect(request).toHaveBeenCalledWith("/wechat/links/default/bind", { method: "POST" });
  });

  it.each([
    ["service", "运营方尚未开启云端服务"],
    ["membership", "云端 Agent 是 Plus 会员功能"],
    ["disabled", "启用云端 Agent"],
  ])(
    "blocks cloud-only binding and offers a relevant action when %s eligibility is lost",
    async (change, message) => {
      data.channels = [];
      data.plugins = [plugin(change !== "disabled")];
      if (change === "service") data.cloudAgent = { ...data.cloudAgent, ready: false };
      if (change === "membership") data.plan = "free";
      data.connection = { status: "disconnected" };
      await render(<Wechat />);
      const qr = [...container.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("获取二维码"),
      )!;
      expect(qr.disabled).toBe(true);
      expect(container.textContent).toContain(message);
      expect(
        [...container.querySelectorAll("a")].some(
          (a) =>
            a.textContent?.includes("管理云端 Agent") && a.getAttribute("href") === "/app/plugins",
        ),
      ).toBe(true);
      expect(request).not.toHaveBeenCalled();
    },
  );
});
