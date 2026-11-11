import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CloudTasks } from "../src/client/pages/cloud-tasks";
import { Sessions } from "../src/client/pages/sessions";
import { useApp } from "../src/client/context";
import { Workspace } from "../src/client/workspace";
import { ApiError } from "../src/client/api";
import { createFakeApi } from "./support/fake-api";
import type { CloudAgentTask, CloudAgentTaskPage } from "../src/shared/cloud-agent";
import type { ChatMessage, ChatSession, Snapshot } from "../src/shared/types";

vi.mock("../src/client/context", () => ({
  useApp: vi.fn(),
  AppProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../src/client/notices", () => ({
  NoticeProvider: ({ children }: { children: ReactNode }) => children,
  NoticeBell: () => null,
  ImportantNotice: () => null,
}));

let root: Root;
let container: HTMLDivElement;
let handle: (path: string, options?: RequestInit) => unknown | Promise<unknown>;
const request = vi.fn(async (path: string, options?: RequestInit) => handle(path, options));
const requestApi = async <T,>(path: string, options?: RequestInit): Promise<T> =>
  (await request(path, options)) as T;
const notify = vi.fn();
const task = (id: string, patch: Partial<CloudAgentTask> = {}): CloudAgentTask => ({
  id,
  pluginInstanceId: "cloud",
  pluginName: "云端 Agent",
  sessionId: "session",
  sessionTitle: "原会话",
  prompt: `任务 ${id}`,
  status: "completed",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  result: `结果 ${id}`,
  delivery: "sent",
  ...patch,
});
const page = (tasks: CloudAgentTask[], nextCursor: string | null = null): CloudAgentTaskPage => ({
  tasks,
  nextCursor,
});

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
  request.mockClear();
  notify.mockClear();
  handle = (path) => {
    throw new Error(`Unexpected API: ${path}`);
  };
  const data = await createFakeApi()<Snapshot>("/dashboard");
  data.plan = "free";
  data.planUntil = Date.now() - 86400000;
  data.wallet.balance = 0;
  vi.mocked(useApp).mockReturnValue({
    data,
    request: requestApi,
    notify,
    base: "/app",
    isAdmin: false,
    user: { name: "测试", email: "test@example.test" },
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
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Views() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate("/app/tasks?plugin=other")}>切换测试插件</button>
      <Routes>
        <Route path="/app/tasks/:id?" element={<CloudTasks />} />
      </Routes>
    </>
  );
}
async function mount(path = "/app/tasks") {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Views />
      </MemoryRouter>,
    ),
  );
}
function control(label: string) {
  const element = [
    ...container.querySelectorAll<HTMLAnchorElement | HTMLButtonElement>("a,button"),
  ].find((element) => element.textContent?.trim() === label);
  expect(element, `Missing control: ${label}`).toBeDefined();
  return element!;
}
async function click(label: string) {
  await act(async () =>
    control(label).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })),
  );
}

describe("cloud task history navigation", () => {
  it("shows the complete request and result for a failed stale task while keeping a list summary", async () => {
    const prompt = `请按下列要求执行：\n${"较长的任务背景。".repeat(30)}\n最后一条：保留全部验收条件。`;
    const result = "完整的第一段结果\n完整的第二段结果";
    const fullTask = task("long", {
      prompt,
      result,
      status: "failed",
      stale: true,
      delivery: "stale",
    });
    handle = (path) => (path === "/cloud/tasks/long" ? fullTask : page([fullTask]));
    await mount("/app/tasks?plugin=cloud&cursor=page2");
    expect(control(prompt.slice(0, 120)).getAttribute("href")).toBe(
      "/app/tasks/long?plugin=cloud&cursor=page2",
    );
    expect(container.textContent).not.toContain("最后一条：保留全部验收条件。");
    await click(prompt.slice(0, 120));
    expect(container.querySelector('[aria-label="任务要求"] pre')?.textContent).toBe(prompt);
    expect(container.querySelector('[aria-label="任务结果"] .chat-markdown')?.textContent).toBe(
      result,
    );
    expect(container.querySelector("details")).toBeNull();
    expect(container.querySelector('a[href*="/tasks/long"]')).toBeNull();
    await click("返回任务列表");
    expect(control(prompt.slice(0, 120)).getAttribute("href")).toContain("cursor=page2");
  });

  it("preserves the plugin and history position through pagination, details and return", async () => {
    handle = (path) => {
      if (path === "/cloud/tasks?plugin=cloud") return page([task("first")], "page2");
      if (path === "/cloud/tasks?plugin=cloud&cursor=page2") return page([task("old")]);
      if (path === "/cloud/tasks/old") return task("old");
      if (path === "/cloud/tasks") return page([task("all")]);
      throw new Error(`Unexpected API: ${path}`);
    };
    await mount("/app/tasks?plugin=cloud");
    expect(control("查看更早任务").getAttribute("href")).toBe(
      "/app/tasks?plugin=cloud&cursor=page2",
    );
    await click("查看更早任务");
    expect(container.textContent).toContain("任务 old");
    expect(container.textContent).not.toContain("任务 first");
    expect(control("任务 old").getAttribute("href")).toBe(
      "/app/tasks/old?plugin=cloud&cursor=page2",
    );
    await click("任务 old");
    expect(control("返回任务列表").getAttribute("href")).toBe(
      "/app/tasks?plugin=cloud&cursor=page2",
    );
    await click("返回任务列表");
    expect(container.textContent).toContain("任务 old");
    expect(container.querySelector('[aria-label="任务分页"]')).toBeNull();
    await click("返回最新任务");
    expect(container.textContent).toContain("任务 first");
    expect(container.textContent).toContain("仅显示该插件的任务");
    await click("查看全部");
    expect(container.textContent).toContain("任务 all");
    expect(container.textContent).not.toContain("仅显示该插件的任务");
  });

  it("offers a working return to the latest filtered page after a bad cursor", async () => {
    handle = (path) => {
      if (path === "/cloud/tasks?plugin=cloud&cursor=bad") throw new Error("任务分页信息无效");
      if (path === "/cloud/tasks?plugin=cloud") return page([task("latest")]);
      throw new Error(`Unexpected API: ${path}`);
    };
    await mount("/app/tasks?plugin=cloud&cursor=bad");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("任务分页信息无效");
    expect(container.textContent).not.toContain("还没有云端任务");
    await click("返回最新任务");
    expect(container.textContent).toContain("任务 latest");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("ignores an older response after changing the plugin filter", async () => {
    let resolve!: (value: CloudAgentTaskPage) => void;
    handle = (path) => {
      if (path === "/cloud/tasks?plugin=cloud")
        return new Promise<CloudAgentTaskPage>((done) => {
          resolve = done;
        });
      if (path === "/cloud/tasks?plugin=other") return page([task("other")]);
      throw new Error(`Unexpected API: ${path}`);
    };
    await mount("/app/tasks?plugin=cloud");
    await click("切换测试插件");
    expect(request.mock.calls[0][1]?.signal?.aborted).toBe(true);
    await act(async () => resolve(page([task("obsolete")])));
    expect(container.textContent).toContain("任务 other");
    expect(container.textContent).not.toContain("任务 obsolete");
  });
});

describe("cloud task refresh and cancellation", () => {
  it.each(["running", "failed"] as const)(
    "keeps a %s task visible and polling after a transient refresh failure",
    async (status) => {
      let calls = 0;
      handle = (path) => {
        expect(path).toBe("/cloud/tasks?plugin=cloud&cursor=page2");
        calls++;
        if (calls === 2) throw new Error("网络暂时中断");
        return page(
          [task("pending", { status, delivery: calls >= 3 ? "sent" : "pending" })],
          "page3",
        );
      };
      await mount("/app/tasks?plugin=cloud&cursor=page2");
      await click("刷新");
      expect(container.textContent).toContain("网络暂时中断");
      expect(container.textContent).toContain("任务 pending");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15000);
      });
      expect(calls).toBe(3);
      expect(container.textContent).toContain("已送达微信");
      expect(container.textContent).not.toContain("网络暂时中断");
      if (status === "failed") {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(15000);
        });
        expect(calls).toBe(3);
      }
    },
  );

  it("cancels the addressed task and refreshes the same history page", async () => {
    let stopping = false;
    handle = (path, options) => {
      if (path === "/cloud/tasks/pending/cancel") {
        expect(options?.method).toBe("POST");
        stopping = true;
        return task("pending", { status: "running", delivery: "pending", stopping });
      }
      expect(path).toBe("/cloud/tasks?plugin=cloud&cursor=page2");
      return page([task("pending", { status: "running", delivery: "pending", stopping })], "page3");
    };
    await mount("/app/tasks?plugin=cloud&cursor=page2");
    await click("停止");
    expect(container.textContent).toContain("停止确认中");
    expect((control("停止") as HTMLButtonElement).disabled).toBe(true);
    expect(control("查看更早任务").getAttribute("href")).toBe(
      "/app/tasks?plugin=cloud&cursor=page3",
    );
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("已请求停止"));
  });
  it.each([
    ["completed", "任务已完成，无法再停止。"],
    ["finalizing", "任务已结束，正在处理结果，无法再停止。"],
    ["cancelled", "任务已停止，费用以最终结算为准。"],
  ] as const)(
    "reports the actual %s outcome when stopping races with completion",
    async (status, message) => {
      let stopped = false;
      handle = (path) => {
        if (path.endsWith("/cancel")) stopped = true;
        return path.endsWith("/cancel")
          ? task("race", { status, delivery: "pending" })
          : page([task("race", { status: stopped ? status : "running", delivery: "pending" })]);
      };
      await mount();
      await click("停止");
      expect(notify).toHaveBeenCalledWith(message);
      expect(notify).not.toHaveBeenCalledWith(expect.stringContaining("已请求停止"));
      expect(
        [...container.querySelectorAll("button")].some((button) => button.textContent === "停止"),
      ).toBe(false);
    },
  );

  it("prevents a read started before cancellation from overwriting the stop acknowledgement", async () => {
    let finishRead!: (value: CloudAgentTaskPage) => void;
    let reads = 0;
    handle = (path) => {
      if (path.endsWith("/cancel")) return task("race", { status: "running", stopping: true });
      reads++;
      if (reads === 2)
        return new Promise<CloudAgentTaskPage>((resolve) => {
          finishRead = resolve;
        });
      return page([task("race", { status: "running", stopping: reads >= 3 })]);
    };
    await mount();
    await click("刷新");
    const oldRead = request.mock.calls[1][1]?.signal;
    await click("停止");
    expect(oldRead?.aborted).toBe(true);
    await act(async () => finishRead(page([task("race", { status: "running" })])));
    expect(container.textContent).toContain("停止确认中");
    expect((control("停止") as HTMLButtonElement).disabled).toBe(true);
  });

  it("allows retrying a failed stop request without losing the current task", async () => {
    handle = (path) => {
      if (path.endsWith("/cancel")) throw new Error("停止请求失败，请重试。");
      return page([task("retry", { status: "running" })]);
    };
    await mount();
    await click("停止");
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("是否受理尚未确认"), true);
    expect(control("任务 retry")).toBeDefined();
    expect((control("停止") as HTMLButtonElement).disabled).toBe(false);
  });

  it.each([false, true])(
    "recovers after a lost stop response and reconciles whether the server accepted it (%s)",
    async (accepted) => {
      let finishStop!: (value: CloudAgentTask) => void;
      let stopping = false;
      let completed = false;
      handle = (path) => {
        if (path.endsWith("/cancel")) {
          stopping = accepted;
          return new Promise<CloudAgentTask>((resolve) => {
            finishStop = resolve;
          });
        }
        expect(path).toBe("/cloud/tasks?plugin=cloud&cursor=page2");
        return page([
          task(
            "slow",
            completed
              ? { credits: 1.234 }
              : { status: "running", delivery: "pending", stopping, result: undefined },
          ),
        ]);
      };
      await mount("/app/tasks?plugin=cloud&cursor=page2");
      await click("停止");
      const stopSignal = request.mock.calls.find(([path]) => path.endsWith("/cancel"))![1]?.signal;
      expect((control("刷新") as HTMLButtonElement).disabled).toBe(true);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20000);
      });
      expect(stopSignal?.aborted).toBe(true);
      expect(notify).toHaveBeenCalledWith(expect.stringContaining("停止请求超时"), true);
      expect(notify).toHaveBeenCalledWith(expect.stringContaining("是否受理尚未确认"), true);
      expect((control("刷新") as HTMLButtonElement).disabled).toBe(false);
      expect((control("停止") as HTMLButtonElement).disabled).toBe(accepted);
      expect(container.textContent?.includes("停止确认中")).toBe(accepted);

      completed = true;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15000);
      });
      expect(container.textContent).toContain("已完成");
      expect(container.textContent).toContain("已结算 · 1.234 credits");
      await act(async () => finishStop(task("slow", { status: "cancelled" })));
      expect(container.textContent).toContain("已完成");
      expect(notify).toHaveBeenCalledTimes(1);
    },
  );

  it("aborts a pending stop when changing pages and ignores its late response", async () => {
    let finishStop!: (value: CloudAgentTask) => void;
    handle = (path) => {
      if (path.endsWith("/cancel"))
        return new Promise<CloudAgentTask>((resolve) => {
          finishStop = resolve;
        });
      return page([
        task(path.includes("other") ? "other" : "old", { status: "running", delivery: "pending" }),
      ]);
    };
    await mount("/app/tasks?plugin=cloud");
    await click("停止");
    const signal = request.mock.calls.find(([path]) => path.endsWith("/cancel"))![1]?.signal;
    await click("切换测试插件");
    expect(signal?.aborted).toBe(true);
    expect((control("刷新") as HTMLButtonElement).disabled).toBe(false);
    expect((control("停止") as HTMLButtonElement).disabled).toBe(false);
    await act(async () => finishStop(task("old", { status: "cancelled" })));
    expect(control("任务 other")).toBeDefined();
    expect(container.textContent).not.toContain("任务 old");
    expect(notify).not.toHaveBeenCalled();
  });

  it("waits for a slow poll to finish before starting the next one", async () => {
    let finishRead!: (value: CloudAgentTaskPage) => void;
    let reads = 0;
    handle = () => {
      reads++;
      if (reads === 2)
        return new Promise<CloudAgentTaskPage>((resolve) => {
          finishRead = resolve;
        });
      return page([task("slow", { status: "running" })]);
    };
    await mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31000);
    });
    expect(reads).toBe(2);
    expect(request.mock.calls[1][1]?.signal?.aborted).toBe(false);
    await act(async () => finishRead(page([task("slow", { status: "running" })])));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(reads).toBe(3);
  });

  it("unlocks refresh after a timeout and ignores the timed-out response", async () => {
    let finishRead!: (value: CloudAgentTaskPage) => void;
    handle = () =>
      new Promise<CloudAgentTaskPage>((resolve) => {
        finishRead = resolve;
      });
    await mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("加载云端任务超时");
    expect(request.mock.calls[0][1]?.signal?.aborted).toBe(true);
    handle = () => page([task("fresh")]);
    await click("刷新");
    await act(async () => finishRead(page([task("outdated")])));
    expect(container.textContent).toContain("任务 fresh");
    expect(container.textContent).not.toContain("任务 outdated");
  });
});

describe("cloud task status, cost and delivery", () => {
  it.each(["/app/tasks", "/app/tasks/markdown"])(
    "renders safe usable results and copies the original text on %s",
    async (path) => {
      const result = [
        "## 调研结论",
        "[查看来源](https://example.test/report)",
        "| 方案 | 价格 |\n| --- | --- |\n| A | 10 |",
        "```js\nconst value = 1;\n```",
        "<script>alert(1)</script>",
        "[危险链接](javascript:alert%281%29)",
        "![示意图](https://images.example.test/tracking.png)",
      ].join("\n\n");
      const value = task("markdown", { prompt: "**任务原文** <img src=x>", result });
      handle = () => (path.endsWith("markdown") ? value : page([value]));
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal("navigator", { clipboard: { writeText } });
      await mount(path);
      if (path === "/app/tasks") {
        await act(async () => {
          container.querySelector("details")!.open = true;
        });
      } else {
        expect(container.querySelector('[aria-label="任务要求"] pre')?.textContent).toBe(
          value.prompt,
        );
      }
      const resultView = container.querySelector(".cloud-task-result")!;
      expect(resultView.querySelector("h2")?.textContent).toBe("调研结论");
      const source = resultView.querySelector<HTMLAnchorElement>(
        'a[href="https://example.test/report"]',
      )!;
      expect(source.target).toBe("_blank");
      expect(source.rel).toBe("noopener noreferrer");
      expect(resultView.querySelector("table tbody td")?.textContent).toBe("A");
      expect(resultView.querySelector("pre code")?.textContent).toBe("const value = 1;\n");
      expect(resultView.querySelector("script,img")).toBeNull();
      expect(resultView.querySelector('a[href^="javascript:"]')).toBeNull();
      await click("复制结果");
      expect(writeText).toHaveBeenCalledWith(result);
      await click("复制代码");
      expect(writeText).toHaveBeenCalledWith("const value = 1;\n");
    },
  );

  it("distinguishes pending settlement, zero cost, charged cost and rejected tasks", async () => {
    handle = () =>
      page([
        task("active", { status: "running", result: undefined, delivery: "pending" }),
        task("zero", { credits: 0 }),
        task("charged", { credits: 1.234 }),
        task("rejected", { status: "failed", delivery: "failed", error: "任务被拒绝" }),
      ]);
    await mount();
    const rows = [...container.querySelectorAll("article")].map((element) => element.textContent);
    expect(rows[0]).toContain("费用待结算");
    expect(rows[0]).not.toContain("未扣");
    expect(rows[1]).toContain("已结算 · 0.000 credits");
    expect(rows[2]).toContain("已结算 · 1.234 credits");
    expect(rows[3]).toContain("暂无扣费记录");
    expect(rows[3]).toContain("微信未送达");
    expect(rows[3]).toContain("任务被拒绝");
  });

  it("polls result finalization without offering cancellation, then stops after delivery", async () => {
    let reads = 0;
    handle = () => {
      reads++;
      return page([
        task(
          "final",
          reads === 1
            ? { status: "finalizing", result: undefined, delivery: "pending" }
            : { credits: 0 },
        ),
      ]);
    };
    await mount();
    expect(container.textContent).toContain("结果处理中");
    expect(container.textContent).toContain("费用待结算");
    expect(
      [...container.querySelectorAll("button")].some((button) => button.textContent === "停止"),
    ).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(container.textContent).toContain("已结算 · 0.000 credits");
    expect(container.textContent).toContain("已送达微信");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(reads).toBe(2);
  });

  it("keeps stale results readable and distinguishes them from already delivered results", async () => {
    handle = () =>
      page([
        task("stale", { stale: true, delivery: "stale" }),
        task("sent", { stale: true, delivery: "sent" }),
        task("unconfirmed", {
          status: "submitting",
          unconfirmed: true,
          result: undefined,
          delivery: "pending",
        }),
      ]);
    await mount();
    const rows = [...container.querySelectorAll("article")].map((element) => element.textContent);
    expect(rows[0]).toContain("结果 stale");
    expect(rows[0]).toContain("不再发送微信");
    expect(rows[1]).toContain("已送达微信");
    expect(rows[1]).not.toContain("不再发送");
    expect(rows[2]).toContain("正在确认云端是否已接收任务");
  });

  it("explains configuration and WeChat entry with the service availability condition", async () => {
    handle = () => page([]);
    await mount();
    expect(container.textContent).toContain("还没有云端任务");
    expect(container.textContent).toContain("服务开放后，Plus 会员可在插件页配置云端 Agent");
    expect(container.textContent).not.toContain("在微信里向云端 Agent 发送");
  });

  it("removes a cached task when refresh confirms it was deleted", async () => {
    let removed = false;
    handle = () => {
      if (removed) throw new ApiError("找不到这个云端任务", 404, "task_missing");
      return task("removed");
    };
    await mount("/app/tasks/removed");
    expect(container.textContent).toContain("结果 removed");
    removed = true;
    await click("刷新");
    expect(container.textContent).not.toContain("结果 removed");
    expect(container.textContent).not.toContain("任务 removed");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("找不到这个云端任务");
    expect(control("返回任务列表")).toBeDefined();
  });
});

async function mountWorkspace(path: string) {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app/*" element={<Workspace />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
}

describe("cloud tasks in the workspace", () => {
  it("immediately removes cached conversations after deleting history, before dashboard refresh finishes", async () => {
    const state = useApp();
    state.data!.plan = "plus";
    state.data!.planUntil = Date.now() + 86400000;
    let finishRefresh!: () => void;
    state.refresh = () =>
      new Promise<void>((resolve) => {
        finishRefresh = resolve;
      });
    const fake = createFakeApi();
    const sessions = await fake<ChatSession[]>("/sessions");
    const messages = await fake<ChatMessage[]>(`/sessions/${sessions[0].id}/messages`);
    handle = (path, options) => fake(path, options);
    await mountWorkspace(`/app/sessions?id=${sessions[0].id}`);
    await act(async () => {
      await import("../src/client/pages/sessions");
    });
    expect(container.textContent).toContain(sessions[0].title);
    expect(container.textContent).toContain(messages[0].content);
    await act(async () => container.querySelector<HTMLButtonElement>(".user-row")!.click());
    await click("删除全部会话记录");
    await click("确认永久删除");
    expect(await fake("/sessions")).toEqual([]);
    expect(container.textContent).not.toContain(sessions[0].title);
    expect(container.textContent).not.toContain(messages[0].content);
    await act(async () => finishRefresh());
    expect(notify).toHaveBeenCalledWith(
      "会话记录和云端任务内容已删除，未结束的云端任务已请求停止。",
    );
  });

  it.each([
    ["list", false],
    ["list", true],
    ["messages", false],
    ["messages", true],
    ["older", false],
    ["older", true],
  ] as const)(
    "discards the old %s query after history deletion, including a late error (%s)",
    async (pending, reject) => {
      const data = useApp().data!;
      data.plan = "plus";
      data.planUntil = Date.now() + 86400000;
      const fake = createFakeApi();
      const sessions = await fake<ChatSession[]>("/sessions");
      const messages = await fake<ChatMessage[]>(`/sessions/${sessions[0].id}/messages`);
      const messagePath = `/sessions/${sessions[0].id}/messages`;
      let cleared = false;
      let resolveOld!: (value: ChatSession[] | ChatMessage[]) => void;
      let rejectOld!: (error: Error) => void;
      let oldSignal: AbortSignal | null | undefined;
      handle = (path, options) => {
        if (path === "/privacy/history") cleared = true;
        const oldRequest =
          !cleared &&
          ((pending === "list" && path === "/sessions") ||
            (pending === "messages" && path === messagePath) ||
            (pending === "older" && path.startsWith(`${messagePath}?before=`)));
        if (oldRequest) {
          oldSignal = options?.signal;
          return new Promise<ChatSession[] | ChatMessage[]>((resolve, reject) => {
            resolveOld = resolve;
            rejectOld = reject;
          });
        }
        if (!cleared && pending === "older" && path === messagePath)
          return Array.from({ length: 100 }, (_, index) => ({ ...messages[0], id: index + 100 }));
        return fake(path, options);
      };
      await mountWorkspace(`/app/sessions?id=${sessions[0].id}`);
      await act(async () => {
        await import("../src/client/pages/sessions");
      });
      if (pending === "older") await click("加载更早的消息");
      expect(resolveOld).toBeDefined();
      await act(async () => container.querySelector<HTMLButtonElement>(".user-row")!.click());
      await click("删除全部会话记录");
      await click("确认永久删除");
      expect(oldSignal?.aborted).toBe(true);
      expect(container.textContent).not.toContain(sessions[0].title);
      expect(container.textContent).not.toContain(messages[0].content);
      await act(async () => {
        if (reject) rejectOld(new Error("已删除记录的旧查询失败"));
        else resolveOld(pending === "list" ? sessions : messages);
      });
      expect(container.textContent).not.toContain(sessions[0].title);
      expect(container.textContent).not.toContain(messages[0].content);
      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify).not.toHaveBeenCalledWith("已删除记录的旧查询失败", true);
    },
  );

  it.each(["清空消息", "删除会话"])(
    "explains cloud task effects before %s on a single conversation",
    async (action) => {
      const data = useApp().data!;
      data.plan = "plus";
      data.planUntil = Date.now() + 86400000;
      const fake = createFakeApi();
      handle = (path, options) => fake(path, options);
      await act(async () =>
        root.render(
          <MemoryRouter initialEntries={["/app/sessions"]}>
            <Sessions />
          </MemoryRouter>,
        ),
      );
      await act(async () =>
        container
          .querySelector<HTMLButtonElement>('[aria-label="会话操作"]')!
          .dispatchEvent(new MouseEvent("click", { bubbles: true })),
      );
      await click(action);
      const confirmation = container.querySelector("dialog")!;
      expect(confirmation.textContent).toContain("云端任务内容");
      expect(confirmation.textContent).toContain("未结束的云端任务会请求停止");
      expect(confirmation.textContent).toContain("不再投递结果");
      expect(confirmation.textContent).toContain("外部操作无法撤销");
      expect(
        request.mock.calls.some(
          ([path, options]) => path.endsWith("/action") && options?.method === "POST",
        ),
      ).toBe(false);
    },
  );

  it("exposes list and detail routes with the correct navigation after membership expiry", async () => {
    handle = (path) => (path === "/cloud/tasks/detail" ? task("detail") : page([task("detail")]));
    await mountWorkspace("/app/tasks");
    expect(
      container
        .querySelector('nav[aria-label="主导航"] a[href="/app/tasks"]')
        ?.classList.contains("active"),
    ).toBe(true);
    expect(container.querySelector(".breadcrumb strong")?.textContent).toBe("云端任务");
    await click("任务 detail");
    expect(container.querySelector('[aria-label="任务结果"]')?.textContent).toContain(
      "结果 detail",
    );
    expect(container.querySelector(".breadcrumb strong")?.textContent).toBe("云端任务");
  });

  it.each(["/app/tasks", "/app/tasks/private"])(
    "immediately clears cached contents after deleting all history on %s",
    async (path) => {
      let cleared = false;
      let finishOldRead!: (value: CloudAgentTaskPage | CloudAgentTask) => void;
      let reads = 0;
      handle = (url, options) => {
        if (url === "/privacy/history") {
          expect(options?.method).toBe("DELETE");
          cleared = true;
          return {};
        }
        if (cleared) throw new Error("网络暂时中断");
        reads++;
        if (reads === 2)
          return new Promise<CloudAgentTaskPage | CloudAgentTask>((resolve) => {
            finishOldRead = resolve;
          });
        return url === "/cloud/tasks/private" ? task("private") : page([task("private")]);
      };
      await mountWorkspace(path);
      expect(container.textContent).toContain("结果 private");
      await click("刷新");
      await act(async () =>
        container
          .querySelector<HTMLButtonElement>(".user-row")!
          .dispatchEvent(new MouseEvent("click", { bubbles: true })),
      );
      await click("删除全部会话记录");
      const confirmation = [...container.querySelectorAll("dialog")].find((dialog) =>
        dialog.textContent?.includes("删除全部会话记录？"),
      )!;
      expect(confirmation.textContent).toContain("云端任务内容");
      expect(confirmation.textContent).toContain("未结束的云端任务会请求停止");
      expect(confirmation.textContent).toContain("停止向微信投递结果");
      expect(confirmation.textContent).toContain("外部操作无法撤销");
      expect(confirmation.textContent).toContain("计费记录会保留");
      await click("确认永久删除");
      expect(cleared).toBe(true);
      expect(container.textContent).not.toContain("结果 private");
      expect(container.textContent).not.toContain("任务 private");
      await act(async () =>
        finishOldRead(path.endsWith("private") ? task("private") : page([task("private")])),
      );
      expect(container.textContent).not.toContain("结果 private");
      expect(container.textContent).toContain("网络暂时中断");
    },
  );

  it("aborts an in-flight stop after deleting history without showing a late acknowledgement", async () => {
    let finishStop!: (value: CloudAgentTask) => void;
    let cleared = false;
    handle = (path) => {
      if (path.endsWith("/cancel"))
        return new Promise<CloudAgentTask>((resolve) => {
          finishStop = resolve;
        });
      if (path === "/privacy/history") {
        cleared = true;
        return {};
      }
      return page(cleared ? [] : [task("private", { status: "running", delivery: "pending" })]);
    };
    await mountWorkspace("/app/tasks");
    await click("停止");
    const signal = request.mock.calls.find(([path]) => path.endsWith("/cancel"))![1]?.signal;
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(".user-row")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    await click("删除全部会话记录");
    await click("确认永久删除");
    expect(signal?.aborted).toBe(true);
    expect(container.textContent).not.toContain("任务 private");
    expect(notify).toHaveBeenCalledWith(
      "会话记录和云端任务内容已删除，未结束的云端任务已请求停止。",
    );
    await act(async () => finishStop(task("private", { stopping: true })));
    expect(notify).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("任务 private");
  });
});
