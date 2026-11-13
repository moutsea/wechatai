import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Plugins } from "../src/client/pages/plugins";
import { Wechat } from "../src/client/pages/wechat";
import { DashboardOnboarding } from "../src/client/pages/dashboard-onboarding";
import { useApp } from "../src/client/context";
import { createFakeApi } from "./support/fake-api";
import { cloudAgentInputSchema, type CloudAgentPlugin } from "../src/shared/cloud-agent";
import type { Snapshot } from "../src/shared/types";
import { museInputSchema } from "../src/shared/muse";
import { notificationInputSchema } from "../src/shared/notification";
import { NotificationAccess, NotificationEditor } from "../src/client/pages/notification-editor";

vi.mock("../src/client/context", () => ({ useApp: vi.fn() }));
vi.mock("../src/client/analytics-client", () => ({ trackFunnel: vi.fn() }));
let root: Root;
let container: HTMLDivElement;
let data: Snapshot;
const notify = vi.fn();
const request = vi.fn();
const plugin = (enabled = true): CloudAgentPlugin => ({
  ...cloudAgentInputSchema.parse({ enabled, modelId: "demo-1" }),
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

function CurrentPath() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}
async function onboarding(keepModels = false) {
  if (!keepModels) {
    data.channels = [];
    data.assistants = [];
  }
  data.connections = [];
  data.stats.messages = 0;
  data.onboardingDismissedAt = undefined;
  await render(
    <>
      <DashboardOnboarding data={data} />
      <CurrentPath />
    </>,
  );
}

describe("cloud Agent onboarding", () => {
  it.each(["free", "plus"] as const)(
    "does not offer configuration or upgrade while the service is unavailable for %s",
    async (plan) => {
      data.plan = plan;
      data.cloudAgent = { ...plugin().status!, ready: false };
      data.plugins = [plugin()]; // Cached plugin status must not override the global gate.
      await onboarding();
      await click("我了解了，下一步");
      expect(container.textContent).toContain("云端 Agent 暂未开放");
      expect(container.textContent).not.toContain("云端 Agent 已就绪");
      expect(container.textContent).not.toContain("了解 Plus 云端 Agent");
      expect(container.textContent).toContain("接入已有 Agent 或接收通知");
    },
  );

  it.each(["free", "plus"] as const)(
    "routes %s users to the plugin page when cloud service is available",
    async (plan) => {
      data.plan = plan;
      data.cloudAgent = plugin().status!;
      await onboarding();
      await click("我了解了，下一步");
      const label = plan === "plus" ? "使用云端 Agent" : "了解 Plus 云端 Agent";
      const card = [...container.querySelectorAll("button")].find(
        (button) => button.querySelector("strong")?.textContent === label,
      );
      expect(card).toBeDefined();
      await act(async () => card!.click());
      expect(container.querySelector('[data-testid="path"]')?.textContent).toBe("/app/plugins");
      expect(request).toHaveBeenCalledExactlyOnceWith("/onboarding/dismiss", { method: "POST" });
    },
  );

  it("keeps the guide open with a selected execution model and proceeds to QR setup", async () => {
    data.cloudAgent = plugin().status!;
    data.plugins = [plugin()];
    await onboarding(true);
    await click("新手引导");
    expect(container.querySelector("dialog")).not.toBeNull();
    await click("我了解了，下一步");
    expect(container.textContent).toContain("云端 Agent 已就绪");
    expect(container.textContent).toContain("执行模型已就绪");
    await click("下一步");
    await click("去连接微信");
    expect(container.querySelector('[data-testid="path"]')?.textContent).toBe("/app/wechat");
  });

  it.each([false, true])(
    "shows the selected cloud shortcut before the first task, with ordinary models: %s",
    async (withModels) => {
      const baseline = await createFakeApi()<Snapshot>("/dashboard");
      const selected = { ...plugin(), id: "work-cloud", shortcut: "计划" };
      data.cloudAgent = selected.status!;
      data.plugins = [
        {
          ...museInputSchema.parse({ name: "Muse", shortcut: "muse" }),
          id: "remote",
          pluginId: "wechatai/muse",
          version: "1.0.0",
          createdAt: 1,
          hasKey: true,
        },
        plugin(false),
        { ...plugin(), id: "other", shortcut: "其他" },
        selected,
      ];
      data.currentSession = { ...baseline.currentSession!, pluginInstanceId: selected.id };
      if (withModels) {
        data.channels = baseline.channels;
        data.assistants = baseline.assistants;
      }
      await onboarding(true);
      await click("新手引导");
      await click("我了解了，下一步");
      await click("下一步");
      const commands = [...container.querySelectorAll(".onboarding-wechat-steps code")].map(
        (code) => code.textContent,
      );
      expect(commands).toContain("/use 计划");
      expect(commands).not.toContain("/use 云");
      expect(commands).not.toContain("/use 其他");
      expect(commands).not.toContain("/use muse");
      expect(container.textContent).toContain("云端 Agent 已就绪，按下面的步骤连接。");
      expect(container.textContent).not.toContain("Agent 无需使用微伴的模型配置");
      expect(request).not.toHaveBeenCalled();
      await click("去连接微信");
      await render(<Wechat />);
      expect(container.textContent).toContain("发送 /use 计划");
      expect(container.textContent).not.toContain("发送 /use 其他");
    },
  );

  it.each([
    ["muse", false],
    ["muse", true],
    ["hermes", false],
    ["hermes", true],
    ["openclaw", false],
    ["openclaw", true],
  ] as const)(
    "keeps the selected %s in the guide and WeChat page, with models: %s",
    async (kind, withModels) => {
      const agents = ["first", "selected"].map((id) => ({
        ...museInputSchema.parse({ name: id, shortcut: id }),
        id,
        pluginId: `wechatai/${kind}` as const,
        version: "1.0.0" as const,
        createdAt: 1,
        hasKey: true,
      }));
      data.plugins = [
        { ...agents[0], id: "disabled", shortcut: "disabled", enabled: false },
        ...agents,
      ];
      data.currentSession = { ...data.currentSession!, pluginInstanceId: "selected" };
      await onboarding(withModels);
      if (withModels) await click("新手引导");
      await click("我了解了，下一步");
      await click("下一步");
      const commands = [...container.querySelectorAll(".onboarding-wechat-steps code")].map(
        (c) => c.textContent,
      );
      expect(commands).toContain("/use selected");
      expect(commands).not.toContain("/use first");
      expect(commands).not.toContain("/use disabled");
      await click("去连接微信");
      await render(<Wechat />);
      expect(container.textContent).toContain("发送 /use selected");
      expect(container.textContent).not.toContain("发送 /use first");
    },
  );

  it("allows transport binding before choosing an AI service", async () => {
    data.cloudAgent = plugin().status!;
    await onboarding();
    await click("我了解了，下一步");
    await click("下一步");
    expect(container.textContent).toContain("可以先绑定微信");
    await click("去连接微信");
    expect(container.querySelector('[data-testid="path"]')?.textContent).toBe("/app/wechat");
    expect(container.querySelector("dialog")).toBeNull();
    expect(request).toHaveBeenCalledExactlyOnceWith("/onboarding/dismiss", { method: "POST" });
  });
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
  it("keeps notification initialization visible after creating a Token, following the receiving link", async () => {
    const notification = {
      ...notificationInputSchema.parse({ connectionId: "receiving" }),
      id: "notice",
      pluginId: "wechatai/notification" as const,
      version: "1.0.0" as const,
      createdAt: 1,
      shortcut: "notice",
      hasKey: true,
    };
    data.plugins = [notification];
    data.connection = { status: "connected", hasReplyContext: true };
    const receiving = {
      ...data.connections[0],
      id: "receiving",
      name: "通知微信",
      status: "connected" as const,
      hasReplyContext: false,
    };
    data.connections.push(receiving);
    request.mockResolvedValue({ hasToken: true, endpoint: "/api/notify", deliveries: [] });
    await render(<NotificationAccess plugin={notification} />);
    expect(container.textContent).toContain("已生成");
    expect(container.querySelector('[role="status"]')?.textContent).toContain("通知微信」尚未就绪");
    expect(container.querySelector('[role="status"]')?.textContent).toContain("/wx help");
    expect(container.querySelector('[role="status"] a')?.getAttribute("href")).toBe("/app/wechat");

    receiving.hasReplyContext = true;
    await render(<NotificationAccess plugin={notification} />);
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "通知微信」已完成初始化",
    );
    expect(container.querySelector('[role="status"]')?.textContent).toContain("24 小时回复窗口");
    expect(container.querySelector('[role="status"]')?.textContent).not.toContain("/wx help");

    receiving.lastSeen = Date.now() - 2 * 86400000;
    await render(<NotificationAccess plugin={notification} />);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("需要更新回复窗口");
    expect(container.querySelector('[role="status"]')?.textContent).toContain("/wx help");
    expect(container.querySelector('[role="status"]')?.textContent).toContain("无需重新扫码");
    await render(
      <NotificationEditor plugin={notification} onClose={() => {}} onSaved={() => {}} />,
    );
    expect(container.querySelector("dialog")?.textContent).toContain("回复窗口可能已过期");
    data.assistants = [];
    data.channels = [];
    data.currentSession = null;
    data.selectedConnectionId = receiving.id;
    data.connection = { ...receiving };
    await render(<Wechat />);
    expect(container.querySelector(".binding-card > p")?.textContent).toContain(
      "回复窗口可能已过期",
    );
    receiving.lastSeen = Date.now();
    data.connection = { ...receiving };
    await render(<Wechat />);
    expect(container.querySelector(".binding-card > p")?.textContent).toContain("已完成首次通信");
    await render(<NotificationAccess plugin={notification} />);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("已完成初始化");
    receiving.paused = true;
    await render(<NotificationAccess plugin={notification} />);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("接收微信已暂停");
    receiving.paused = false;
    receiving.hasReplyContext = false;
    await render(<NotificationAccess plugin={notification} />);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("/wx help");
    await render(
      <NotificationEditor plugin={notification} onClose={() => {}} onSaved={() => {}} />,
    );
    expect(container.querySelector("dialog")?.textContent).toContain("/wx help");
    expect(container.querySelector("dialog")?.textContent).toContain("无需配置模型");
  });

  it.each(["empty", "muse", "notification"])(
    "keeps QR binding and regeneration usable for %s accounts without models",
    async (kind) => {
      data.channels = [];
      data.assistants = [];
      data.currentSession = null;
      data.plugins =
        kind === "muse"
          ? [
              {
                ...museInputSchema.parse({ name: "Muse", shortcut: "muse" }),
                id: "muse",
                pluginId: "wechatai/muse",
                version: "1.0.0",
                createdAt: 1,
                hasKey: true,
              },
            ]
          : kind === "notification"
            ? [
                {
                  ...notificationInputSchema.parse({ connectionId: "default" }),
                  id: "notice",
                  pluginId: "wechatai/notification",
                  version: "1.0.0",
                  createdAt: 1,
                  shortcut: "notice",
                  hasKey: true,
                },
              ]
            : [];
      data.connection = { status: "disconnected" };
      await render(<Wechat />);
      await click("获取二维码");
      expect(request).toHaveBeenCalledWith("/wechat/links/default/bind", { method: "POST" });
      data.connection = { status: "waiting", qrUrl: "https://example.test/qr" };
      await render(<Wechat />);
      expect(container.querySelector(".qr-area svg")).not.toBeNull();
      await click("重新生成二维码");
      expect(request).toHaveBeenCalledTimes(2);
      if (kind !== "empty") {
        expect(container.textContent).not.toContain("请先添加渠道");
        expect(container.textContent).not.toContain("普通模型聊天尚未就绪");
        expect(container.textContent).toContain(
          kind === "muse" ? "发送 /use muse" : "配置消息提醒",
        );
      }
    },
  );

  it("offers the server-authorized administrator preview with its billing rules", async () => {
    data.cloudAgent = { ...plugin().status!, adminPreview: true };
    await render();
    const card = container.querySelector('article[aria-label="云端 Agent"]')!;
    expect(card.textContent).toContain("管理员内测");
    await click("配置 云端 Agent");
    const dialog = container.querySelector("dialog")!;
    expect(dialog.textContent).toContain("当前仅对管理员开放内测");
    expect(dialog.textContent).toContain("模型 API 费用另付服务商");
    expect(dialog.textContent).toContain("每账号提供 500 MiB 云端空间");
    expect(dialog.textContent).toContain("累计存储额度不代表单次处理上限");
    expect(dialog.textContent).toContain("工作区单文件最大 25 MiB");
    expect(dialog.textContent).toContain("每个最大 2 MiB，输入、输出各合计最大 8 MiB");
    expect(request).not.toHaveBeenCalled();
  });

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

  it("selects an existing model without sending its key and checks service status", async () => {
    request.mockImplementation(async (path: string, options: RequestInit) => {
      if (path === "/plugins") {
        expect(options.method).toBe("POST");
        const body = JSON.parse(options.body as string);
        expect(body).toMatchObject({
          pluginId: "wechatai/cloud-agent",
          shortcut: "云",
          enabled: true,
        });
        expect(body.modelId).toBe("");
        expect(body).not.toHaveProperty("apiKey");
        const saved = { ...plugin(), modelId: body.modelId };
        data.plugins = [saved];
        return saved;
      }
      expect(path).toBe("/plugins/cloud/test");
      expect(JSON.parse(options.body as string)).toEqual({});
      return { text: "云端服务已配置，请在微信发送任务验证实际运行。", cost: 0 };
    });
    await render();
    await click("配置 云端 Agent");
    expect(container.textContent).toContain("添加云端 Agent");
    const modelSelect = container.querySelector("select")!;
    expect(modelSelect.value).toBe("");
    expect(modelSelect.selectedOptions[0].textContent).toContain("使用默认模型");
    await act(async () =>
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(container.textContent).toContain("云端 Agent 配置");
    expect(container.textContent).toContain("默认模型：");
    await click("检查服务状态");
    expect(request).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenLastCalledWith("云端服务已配置，请在微信发送任务验证实际运行。");
    expect(container.querySelector("textarea[required]")).toBeNull();
    expect(container.textContent).not.toContain("测试问题");
  });

  it("can switch an explicitly selected model back to the account default", async () => {
    const selected = {
      ...data.assistants[0],
      id: "selected-default-b",
      name: "已选择的默认模型 B",
      model: "selected-model-b",
      channelName: "渠道 B",
    };
    data.assistants.push(selected);
    data.defaultModelId = selected.id;
    data.plugins = [plugin()];
    request.mockImplementation(async (path: string, options: RequestInit) => {
      expect(path).toBe("/plugins/cloud");
      expect(JSON.parse(options.body as string)).toMatchObject({ modelId: "" });
      const saved = { ...plugin(), modelId: "" };
      data.plugins = [saved];
      return saved;
    });
    await render();
    await click("查看 云端 Agent 配置");
    await click("修改配置");
    const select = container.querySelector("select")!;
    expect(select.value).toBe("demo-1");
    expect(select.options[0].textContent).toContain("渠道 B / 已选择的默认模型 B");
    await act(async () => {
      select.value = "";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () =>
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("默认模型：");
    expect(container.textContent).toContain("已选择的默认模型 B");
    expect(container.textContent).toContain("selected-model-b");
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

  it("permits QR binding with a configured user model and eligible cloud plugin", async () => {
    data.plugins = [plugin()];
    data.currentSession = { ...data.currentSession!, pluginInstanceId: "cloud" };
    data.connection = { status: "disconnected" };
    await render(<Wechat />);
    const qr = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("获取二维码"),
    )!;
    expect(qr.disabled).toBe(false);
    expect(container.textContent).not.toContain("请先在「渠道与模型」中添加渠道");
    expect(container.textContent).toContain("发送 /use 云");
    await act(async () => qr.click());
    expect(request).toHaveBeenCalledWith("/wechat/links/default/bind", { method: "POST" });
  });

  it.each([
    ["service", "运营方尚未开启云端服务"],
    ["membership", "云端 Agent 是 Plus 会员功能"],
    ["disabled", "启用云端 Agent"],
  ])(
    "permits transport binding but warns about cloud eligibility when %s is lost",
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
      expect(qr.disabled).toBe(false);
      expect(container.textContent).toContain(message);
      expect(
        [...container.querySelectorAll("a")].some(
          (a) =>
            a.textContent?.includes("管理云端 Agent") && a.getAttribute("href") === "/app/plugins",
        ),
      ).toBe(true);
      expect(request).not.toHaveBeenCalled();
      await act(async () => qr.click());
      expect(request).toHaveBeenCalledWith("/wechat/links/default/bind", { method: "POST" });
    },
  );
});
