import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Admin } from "../src/client/pages/admin";
import type { AdminAnalytics } from "../src/shared/analytics";

type PendingRequest = {
  url: string;
  signal: AbortSignal;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
};

const report = (days = 7, pv = 123): AdminAnalytics => ({
  traffic: {
    range: {
      from: new Date(Date.parse("2026-10-25") - (days - 1) * 86_400_000).toISOString().slice(0, 10),
      to: "2026-10-25",
      days,
    },
    totals: { pv, visitorDays: pv ? 1 : 0, sessions: pv ? 1 : 0, pagesPerSession: pv },
    daily: pv ? [{ day: "2026-10-25", pv, uv: 1, sessions: 1 }] : [],
    topPages: [],
    sources: [],
    sourceDepth: [],
    countries: [],
    devices: [],
  },
  conversions: { total: 0, unattributed: 0, sessions: pv ? 1 : 0, rate: 0, rows: [] },
});

let container: HTMLDivElement;
let root: Root | undefined;
let requests: PendingRequest[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  requests = [];
  // 故意不随 abort 自动完成 Promise，验证即使传输层迟到返回，UI 也不会被覆盖。
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
      if (!options?.signal) throw new Error("Expected an abortable request");
      const signal = options.signal;
      return new Promise<Response>((resolve, reject) => {
        requests.push({ url: String(input), signal, resolve, reject });
      });
    }),
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  container.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function mount(days = 7) {
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[`/app/admin?tab=analytics&analyticsDays=${days}`]}>
        <Admin />
      </MemoryRouter>,
    );
  });
}

async function reply(index: number, data = report(), status = 200) {
  await act(async () => {
    requests[index].resolve(
      new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function button(text: string) {
  const result = [...container.querySelectorAll("button")].find(
    (item) => item.textContent === text,
  );
  if (!result) throw new Error(`Missing button: ${text}`);
  return result;
}

async function click(text: string) {
  await act(async () => button(text).click());
}

async function select(days: number) {
  await act(async () => {
    const input = container.querySelector("select")!;
    input.value = String(days);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const alert = () => container.querySelector('[role="alert"]')?.textContent;
const range = () => container.querySelector(".analytics-range")?.textContent;
const pv = () => container.querySelector(".admin-kpis article strong")?.textContent;

describe("admin analytics request lifecycle", () => {
  it("loads the requested period without starting account reads or synchronization", async () => {
    await mount(30);
    expect(requests.map((request) => request.url)).toEqual(["/api/admin/analytics?days=30"]);
    expect(button("刷新统计").disabled).toBe(true);
    await reply(0, report(30));
    expect(range()).toContain("2026-09-26 至 2026-10-25");
    expect(pv()).toBe("123");
    // 成功后清理超时，且流量页没有账户概览的定时同步。
    await advance(60_000);
    expect(alert()).toBeUndefined();
    expect(requests.map((request) => request.url)).toEqual(["/api/admin/analytics?days=30"]);
    expect(button("刷新统计").disabled).toBe(false);
  });

  it.each([200, 500])(
    "cancels an old period and ignores its late %s response",
    async (lateStatus) => {
      await mount();
      await reply(0);
      await select(30);
      expect(range()).toBeUndefined();
      expect(container.textContent).toContain("正在加载流量统计");
      const old = requests[1];
      await select(1);
      expect(old.signal.aborted).toBe(true);
      expect(requests.map((request) => request.url)).toEqual([
        "/api/admin/analytics?days=7",
        "/api/admin/analytics?days=30",
        "/api/admin/analytics?days=1",
      ]);
      await reply(2, report(1, 45));
      await reply(1, report(30, 999), lateStatus);
      expect(range()).toContain("2026-10-25 至 2026-10-25");
      expect(pv()).toBe("45");
      await advance(15_000);
      expect(alert()).toBeUndefined();
    },
  );

  it("times out at 15 seconds, ignores a late result and starts a fresh request on retry", async () => {
    await mount();
    await advance(14_999);
    expect(requests[0].signal.aborted).toBe(false);
    expect(alert()).toBeUndefined();
    expect(button("刷新统计").disabled).toBe(true);
    await advance(1);
    expect(requests[0].signal.aborted).toBe(true);
    expect(alert()).toContain("流量统计加载超时，请重试。");
    expect(button("刷新统计").disabled).toBe(false);
    await reply(0, report(7, 999));
    expect(pv()).toBeUndefined();
    expect(alert()).toContain("加载超时");
    await click("重新加载");
    expect(requests).toHaveLength(2);
    expect(requests[1].signal.aborted).toBe(false);
    expect(alert()).toBeUndefined();
    await advance(14_999);
    expect(alert()).toBeUndefined();
    await reply(1, report(7, 456));
    await advance(1);
    expect(pv()).toBe("456");
    expect(alert()).toBeUndefined();
  });

  it("also times out if headers arrive but reading the response body stalls", async () => {
    await mount();
    let finish!: (data: AdminAnalytics) => void;
    const response = new Response();
    vi.spyOn(response, "json").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => requests[0].resolve(response));
    await advance(15_000);
    expect(alert()).toContain("加载超时");
    expect(requests[0].signal.aborted).toBe(true);
    await act(async () => finish(report()));
    expect(pv()).toBeUndefined();
    expect(alert()).toContain("加载超时");
  });

  it.each(["http", "network"])(
    "recovers from a %s failure through the retry button",
    async (failure) => {
      await mount();
      if (failure === "http") await reply(0, report(), 500);
      else await act(async () => requests[0].reject(new TypeError("Network unavailable")));
      expect(alert()).toContain("流量统计加载失败，请重试。");
      expect(container.textContent).not.toContain("暂无访问或注册记录");
      await advance(15_000);
      expect(alert()).not.toContain("超时");
      await click("重新加载");
      await reply(1, report(7, 0));
      expect(alert()).toBeUndefined();
      expect(container.textContent).toContain("该时间范围暂无访问或注册记录");
      expect(pv()).toBe("0");
    },
  );

  it.each([401, 403])("clears an existing report when refresh returns %s", async (status) => {
    await mount();
    await reply(0);
    expect(pv()).toBe("123");
    await click("刷新统计");
    expect(pv()).toBeUndefined();
    await reply(1, report(), status);
    expect(alert()).toContain(status === 401 ? "登录已失效" : "当前账号没有管理权限");
    expect(pv()).toBeUndefined();
    await advance(15_000);
    expect(alert()).not.toContain("超时");
  });

  it("aborts a pending request and clears its deadline when unmounted", async () => {
    await mount();
    await act(async () => root!.unmount());
    root = undefined;
    expect(requests[0].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await reply(0);
    await advance(15_000);
    expect(container.textContent).toBe("");
  });
});
