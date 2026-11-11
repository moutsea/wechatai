import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sessions } from "../src/client/pages/sessions";
import { useApp } from "../src/client/context";
import { createFakeApi } from "./support/fake-api";
import type { Snapshot, ChatSession } from "../src/shared/types";
import { cloudAgentInputSchema, type CloudAgentPlugin } from "../src/shared/cloud-agent";

vi.mock("../src/client/context", () => ({ useApp: vi.fn() }));
let root: Root;
let container: HTMLDivElement;
let data: Snapshot;
let sessions: ChatSession[];
const notify = vi.fn();
const request = vi.fn(async (path: string, options?: RequestInit): Promise<unknown> => {
  if (path === "/sessions" && options?.method !== "POST") return sessions;
  if (path === "/sessions" && options?.method === "POST") {
    const input = JSON.parse(String(options.body));
    const session = {
      ...input,
      id: "new-session",
      assistantId: input.assistantId ?? null,
      title: input.title || "新的对话",
      archived: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      resetAt: 0,
      messageCount: 0,
    };
    sessions.push(session);
    return session;
  }
  if (path.endsWith("/messages")) return [];
  throw new Error(`Unexpected API: ${path}`);
});
const requestApi = async <T,>(path: string, options?: RequestInit): Promise<T> =>
  (await request(path, options)) as T;
const cloud = (patch: Partial<CloudAgentPlugin> = {}): CloudAgentPlugin => ({
  ...cloudAgentInputSchema.parse({}),
  id: "cloud",
  pluginId: "wechatai/cloud-agent",
  version: "1.0.0",
  createdAt: Date.now(),
  hasKey: true,
  status: {
    ready: true,
    maxActive: 1,
    dailyLimit: 30,
    usedToday: 0,
    active: 0,
    deadlineMinutes: 10,
  },
  ...patch,
});
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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
  data = await createFakeApi()<Snapshot>("/dashboard");
  data.plan = "plus";
  data.cloudAgent = cloud().status!;
  data.currentSession = null;
  sessions = [];
  request.mockClear();
  notify.mockClear();
  vi.mocked(useApp).mockImplementation(() => ({
    data,
    request: requestApi,
    notify,
    refresh: async () => {},
    base: "/app",
    isAdmin: false,
    user: { name: "测试", email: "test@example.test" },
  }));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const render = async () =>
  act(async () =>
    root.render(
      <MemoryRouter>
        <Sessions />
      </MemoryRouter>,
    ),
  );
const button = (label: string) => {
  const result = [...container.querySelectorAll("button")].find(
    (el) => el.textContent?.trim() === label,
  );
  expect(result, `Missing button: ${label}`).toBeDefined();
  return result!;
};
const click = async (label: string) => act(async () => button(label).click());
const select = () => container.querySelector("dialog")!.querySelector("select")!;
const choose = async (value: string) =>
  act(async () => {
    select().value = value;
    select().dispatchEvent(new Event("change", { bubbles: true }));
  });
const submit = async () =>
  act(async () =>
    container
      .querySelector("dialog form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
const payload = () =>
  JSON.parse(
    String(
      request.mock.calls.find(
        ([path, options]) => path === "/sessions" && options?.method === "POST",
      )![1]!.body,
    ),
  );

describe("cloud session creation", () => {
  it("creates a cloud-only conversation on the selected WeChat link without sending an assistant id", async () => {
    data.channels = [];
    data.assistants = [];
    data.plugins = [cloud()];
    await render();
    expect(button("新建会话").disabled).toBe(false);
    await click("新建会话");
    expect(select().value).toBe("plugin:cloud");
    expect(container.querySelector("dialog")?.textContent).toContain("不会提交任务或消耗执行次数");
    expect(container.querySelector("dialog")?.textContent).toContain("已有任务继续执行");
    await submit();
    expect(payload()).toEqual({
      pluginInstanceId: "cloud",
      title: "",
      connectionId: data.selectedConnectionId,
    });
    expect(container.querySelector("dialog")).toBeNull();
    expect(notify).toHaveBeenCalledWith("新会话已创建，并设为微信当前会话");
    expect(container.textContent).toContain("新的对话");
  });

  it("keeps model and cloud choices distinct and defaults to the current cloud configuration", async () => {
    const model = data.assistants[0];
    data.plugins = [cloud(), cloud({ id: "cloud-2", name: "工作助手", shortcut: "工作" })];
    data.currentSession = {
      id: "old",
      title: "旧会话",
      assistantId: null,
      assistantName: "工作助手",
      channelId: "",
      channelName: "云端 Agent",
      model: "",
      pluginInstanceId: "cloud-2",
    };
    await render();
    await click("新建会话");
    expect(select().value).toBe("plugin:cloud-2");
    expect([...select().options].map((option) => option.text)).toContain("云端 Agent · 云端 Agent");
    await choose(`model:${model.id}`);
    await submit();
    expect(payload()).toMatchObject({ assistantId: model.id });
    expect(payload().pluginInstanceId).toBeUndefined();
  });

  it("submits the specifically selected cloud configuration when ordinary models also exist", async () => {
    data.plugins = [cloud(), cloud({ id: "cloud-2", name: "工作助手", shortcut: "工作" })];
    await render();
    await click("新建会话");
    await choose("plugin:cloud-2");
    await submit();
    expect(payload().pluginInstanceId).toBe("cloud-2");
    expect(payload().assistantId).toBeUndefined();
  });

  it("defaults to the current ordinary model when cloud configurations also exist", async () => {
    const model = data.assistants[1];
    data.currentSession = {
      id: "current-model",
      title: "当前会话",
      assistantId: model.id,
      assistantName: model.name,
      channelId: model.channelId,
      channelName: model.channelName,
      model: model.model,
    };
    data.plugins = [cloud()];
    await render();
    await click("新建会话");
    expect(select().value).toBe(`model:${model.id}`);
    await submit();
    expect(payload().assistantId).toBe(model.id);
    expect(payload().pluginInstanceId).toBeUndefined();
  });

  it("excludes disabled and inaccessible cloud configurations with actionable setup links", async () => {
    data.channels = [];
    data.assistants = [];
    data.plugins = [
      cloud({ enabled: false }),
      cloud({ id: "denied", access: { code: "cloud_plus_required", message: "需要 Plus" } }),
    ];
    await render();
    expect(button("新建会话").disabled).toBe(true);
    expect(container.querySelector('a[href="/app/channels"]')).not.toBeNull();
    expect(container.querySelector('a[href="/app/plugins"]')).not.toBeNull();
  });

  it("uses service availability even when a plugin's cached status still says ready", async () => {
    data.channels = [];
    data.assistants = [];
    data.plugins = [cloud()];
    data.cloudAgent.ready = false;
    await render();
    expect(button("新建会话").disabled).toBe(true);
  });

  it("blocks a stale selection when cloud service becomes unavailable while the dialog is open", async () => {
    data.channels = [];
    data.assistants = [];
    data.plugins = [cloud()];
    await render();
    await click("新建会话");
    data = { ...data, cloudAgent: { ...data.cloudAgent, ready: false } };
    await render();
    expect(button("确认").disabled).toBe(true);
    expect(button("取消").disabled).toBe(false);
    await submit();
    expect(request.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
    await click("取消");
    expect(container.querySelector("dialog")).toBeNull();
  });

  it.each(["重置上下文", "归档会话", "清空消息", "删除会话"])(
    "explains cloud session effects before %s",
    async (operation) => {
      data.plugins = [cloud()];
      sessions = [
        {
          id: "cloud-session",
          title: "云端会话",
          assistantId: null,
          pluginInstanceId: "cloud",
          pluginName: "云端 Agent",
          connectionId: "default",
          archived: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          resetAt: 0,
          messageCount: 0,
        },
      ];
      await render();
      await act(async () =>
        container.querySelector<HTMLButtonElement>('[aria-label="会话操作"]')!.click(),
      );
      await click(operation);
      const description = container.querySelector("dialog")!.textContent;
      if (operation === "重置上下文") {
        expect(description).toContain("新的云端对话");
        expect(description).toContain("云端记忆仍保留");
      } else if (operation === "归档会话") {
        expect(description).toContain("不会释放会话名额");
        expect(description).toContain("仅在微信链接和模型或插件可用时自动新建");
        expect(description).toContain("否则退出当前会话");
      } else {
        expect(description).toContain("云端服务中的历史与记忆不会同步删除");
      }
      expect(description).toContain("请求停止");
    },
  );
});
