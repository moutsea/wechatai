import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trackFunnel } from "../src/client/analytics-client";
import { Channels } from "../src/client/pages/channels";
import { DashboardOnboarding } from "../src/client/pages/dashboard-onboarding";
import { useKimiseekConnect } from "../src/client/pages/kimiseek-connect";
import { createFakeApi } from "./support/fake-api";
import type { api } from "../src/client/api";
import type { Snapshot } from "../src/shared/types";

const state = vi.hoisted(() => ({
  data: null as Snapshot | null,
  base: "/app",
  request: vi.fn<typeof api>(),
  refresh: vi.fn(async () => {}),
  notify: vi.fn(),
}));
vi.mock("../src/client/context", () => ({ useApp: () => state }));

let container: HTMLDivElement;
let root: Root;
let events: { name: string; path: string; sessionId?: string; props?: Record<string, unknown> }[];
const imported = { total: 2, imported: 2, existing: 0, invalid: 0, limited: 0 };
const empty = { total: 0, imported: 0, existing: 0, invalid: 0, limited: 0 };
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  events = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, options?: RequestInit) => {
      expect(path).toBe("/api/analytics/event");
      events.push(JSON.parse(String(options?.body)));
      return new Response(null, { status: 204 });
    }),
  );
  window.history.replaceState({}, "", "/app/channels");
  window.sessionStorage.clear();
  state.data = await createFakeApi()<Snapshot>("/dashboard");
  state.data.onboardingDismissedAt = 1;
  state.base = "/app";
  state.request.mockReset();
  state.refresh.mockClear();
  state.notify.mockClear();
  vi.spyOn(window, "open").mockReturnValue(null);
  // happy-dom 不实现原生 dialog 的浏览器方法；仍挂载真实 Modal 和交互按钮。
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
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function mount(node: React.ReactNode) {
  await act(async () => root.render(<MemoryRouter>{node}</MemoryRouter>));
}
async function click(label: string) {
  const target = [...container.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === label,
  );
  expect(target, `button: ${label}`).toBeDefined();
  await act(async () => target!.click());
}
async function saveChannel() {
  await click("添加渠道");
  await act(async () => {
    const key = container.querySelector<HTMLInputElement>("#channel-api-key")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      key,
      "test-key",
    );
    key.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("保存并获取模型");
}
const names = () => events.map((event) => event.name);

describe("funnel event reporting", () => {
  it("keeps live events and respects DNT and GPC", () => {
    trackFunnel("channel_saved");
    expect(names()).toEqual(["channel_saved"]);
    const navigator = window.navigator;
    vi.spyOn(window, "navigator", "get").mockReturnValue(
      Object.create(navigator, { doNotTrack: { value: "1" } }),
    );
    trackFunnel("onboarding_done");
    vi.spyOn(window, "navigator", "get").mockReturnValue(
      Object.create(navigator, { globalPrivacyControl: { value: true } }),
    );
    trackFunnel("invite_share_click");
    expect(names()).toEqual(["channel_saved"]);
  });

  it("shares one in-memory session when sessionStorage cannot be written", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("disabled");
    });
    trackFunnel("signup_submit");
    trackFunnel("verify_sent");
    expect(events).toHaveLength(2);
    expect(events[0].sessionId).toBeTruthy();
    expect(events[1].sessionId).toBe(events[0].sessionId);
  });

  it("tracks every onboarding step, completion and skip in the real workspace", async () => {
    await mount(<DashboardOnboarding data={state.data!} />);
    await click("新手引导");
    await click("我了解了，下一步");
    await click("下一步");
    await click("完成引导");
    await click("新手引导");
    await click("稍后设置");
    expect(names()).toEqual([
      "onboarding_step",
      "onboarding_step",
      "onboarding_done",
      "onboarding_skip",
    ]);
  });
});

describe("channel configuration versus model import events", () => {
  it("counts a saved invalid key as configuration only and records import failure", async () => {
    state.request
      .mockResolvedValueOnce(state.data!.channels[0])
      .mockRejectedValueOnce(new Error("Invalid API key"));
    await mount(<Channels />);
    await saveChannel();
    expect(names()).toEqual(["channel_saved", "channel_test_failed"]);
  });

  it.each([imported, { ...imported, imported: 0, existing: 2 }])(
    "counts successfully imported or existing models",
    async (models) => {
      state.request.mockResolvedValueOnce(state.data!.channels[0]).mockResolvedValueOnce(models);
      await mount(<Channels />);
      await saveChannel();
      expect(names()).toEqual(["channel_saved", "channel_models_imported"]);
      expect(events[1].props).toMatchObject({ models: 2 });
    },
  );

  it.each([empty, { ...empty, total: 2, limited: 2 }])(
    "does not count an empty or fully rejected catalog as imported",
    async (models) => {
      state.request.mockResolvedValueOnce(state.data!.channels[0]).mockResolvedValueOnce(models);
      await mount(<Channels />);
      await saveChannel();
      expect(names()).toEqual(["channel_saved"]);
    },
  );

  it("does not count failed saves and can count a later successful import retry", async () => {
    state.request.mockRejectedValueOnce(new Error("渠道达到上限"));
    await mount(<Channels />);
    await saveChannel();
    expect(names()).toEqual([]);
    await click("取消");
    state.request.mockResolvedValueOnce(imported);
    const button = container.querySelector<HTMLButtonElement>('[aria-label$="获取可用模型"]');
    expect(button).not.toBeNull();
    await act(async () => button!.click());
    expect(names()).toEqual(["channel_models_imported"]);
  });

  it("distinguishes a failed model import from a failed refresh after successful import", async () => {
    state.request.mockRejectedValueOnce(new Error("Invalid API key"));
    await mount(<Channels />);
    const button = container.querySelector<HTMLButtonElement>('[aria-label$="获取可用模型"]');
    expect(button).not.toBeNull();
    await act(async () => button!.click());
    expect(names()).toEqual(["channel_test_failed"]);

    events = [];
    state.request.mockResolvedValueOnce(imported);
    state.refresh.mockRejectedValueOnce(new Error("Dashboard unavailable"));
    await act(async () => button!.click());
    expect(names()).toEqual(["channel_models_imported"]);
  });
});

function KimiseekActions() {
  const connection = useKimiseekConnect(() => {});
  return (
    <>
      <button onClick={() => void connection.start("connect")}>connect</button>
      <button onClick={() => void connection.start("recharge")}>recharge</button>
      <span>{connection.busy ? "pending" : "idle"}</span>
    </>
  );
}
describe("KimiSeek completion events", () => {
  it.each([
    {
      operation: "connect",
      modelImport: imported,
      expected: ["channel_saved", "channel_models_imported"],
    },
    { operation: "connect", modelImport: empty, expected: ["channel_saved"] },
    { operation: "connect", modelImport: undefined, expected: ["channel_saved"] },
    { operation: "recharge", modelImport: imported, expected: [] },
  ])(
    "separates $operation from successful model import ($modelImport)",
    async ({ operation, modelImport, expected }) => {
      state.request
        .mockResolvedValueOnce({ flowId: "test-flow", url: "https://example.test" })
        .mockResolvedValueOnce({ status: "complete", modelImport });
      await mount(<KimiseekActions />);
      await click(operation);
      expect(names()).toEqual(expected);
      expect(state.refresh).toHaveBeenCalledOnce();
    },
  );

  it("waits for completion, emits once, and ignores failed flows", async () => {
    vi.useFakeTimers();
    state.request
      .mockResolvedValueOnce({ flowId: "test-flow", url: "https://example.test" })
      .mockResolvedValueOnce({ status: "working" })
      .mockResolvedValueOnce({ status: "complete", modelImport: imported });
    await mount(<KimiseekActions />);
    await click("connect");
    expect(names()).toEqual([]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(names()).toEqual(["channel_saved", "channel_models_imported"]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(events).toHaveLength(2);
    events = [];
    state.request
      .mockResolvedValueOnce({ flowId: "failed-flow", url: "https://example.test" })
      .mockResolvedValueOnce({ status: "failed", message: "导入失败" });
    await click("connect");
    expect(events).toEqual([]);
  });

  it("ignores a completion received after the component unmounts", async () => {
    let complete!: (data: unknown) => void;
    state.request
      .mockResolvedValueOnce({ flowId: "late-flow", url: "https://example.test" })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      );
    await mount(<KimiseekActions />);
    await click("connect");
    await mount(null);
    await act(async () => complete({ status: "complete", modelImport: imported }));
    expect(events).toEqual([]);
  });
});
