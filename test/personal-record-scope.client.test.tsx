import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PersonalRecords } from "../src/client/pages/personal-records";
import { PersonalAssistantEditor } from "../src/client/pages/personal-assistant-editor";
import { createFakeApi } from "./support/fake-api";
import type { Snapshot } from "../src/shared/types";
import type {
  PersonalAssistantPlugin,
  PersonalRecords as RecordPage,
} from "../src/shared/personal-assistant";
import { json } from "../src/client/api";

const state = vi.hoisted(() => ({
  data: null as Snapshot | null,
  request: vi.fn(),
  refresh: vi.fn(async () => {}),
  notify: vi.fn(),
}));
vi.mock("../src/client/context", () => ({ useApp: () => state }));
let root: Root;
let container: HTMLDivElement;
let plugin: PersonalAssistantPlugin;
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
  const fake = createFakeApi({ connections: 2 });
  state.data = await fake<Snapshot>("/dashboard");
  plugin = await fake<PersonalAssistantPlugin>(
    "/plugins",
    json({
      pluginId: "wechatai/personal-assistant",
      modelId: state.data.assistants[0].id,
      recordScope: "connection",
    }),
  );
  state.data = await fake<Snapshot>("/dashboard");
  state.request.mockReset().mockImplementation(fake);
  state.notify.mockClear();
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

it("ignores the previous link's delayed record response after switching scope", async () => {
  const a = state.data!.selectedConnectionId;
  const b = state.data!.connections.find((link) => link.id !== a)!.id;
  let finishA!: (page: RecordPage) => void;
  state.request.mockImplementation(async (path: string, options?: RequestInit) => {
    if (path.endsWith("/scopes")) return [a, b];
    expect(path).toMatch(/\/records\/query$/);
    const scope = JSON.parse(String(options?.body)).connectionId;
    if (scope === a)
      return new Promise<RecordPage>((resolve) => {
        finishA = resolve;
      });
    expect(scope).toBe(b);
    return { records: [], total: 0, totals: [] };
  });
  await act(async () => root.render(<PersonalRecords plugin={plugin} onClose={() => {}} />));
  const select = container.querySelector("select")!;
  expect(select.value).toBe(a);
  await act(async () => {
    select.value = b;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => finishA({ records: [], total: 99, totals: [] }));
  expect(container.querySelector("select")!.value).toBe(b);
  expect(container.textContent).not.toContain("99");
  expect(
    state.request.mock.calls
      .filter(([path]) => String(path).endsWith("/query"))
      .map(([, options]) => JSON.parse(String(options.body)).connectionId),
  ).toEqual([a, b]);
});

it("saves the selected sharing policy and shows reminder routing for that policy", async () => {
  const saved = vi.fn();
  await act(async () =>
    root.render(
      <PersonalAssistantEditor
        plugin={{ ...plugin, recordScope: "shared" }}
        onClose={() => {}}
        onSaved={saved}
      />,
    ),
  );
  const policy = [...container.querySelectorAll("label")]
    .find((label) => label.textContent?.startsWith("记录共享方式"))!
    .querySelector("select")!;
  expect(container.textContent).toContain("提醒发送到");
  await act(async () => {
    policy.value = "connection";
    policy.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(container.textContent).not.toContain("提醒发送到");
  expect(container.textContent).toContain("提醒发回创建记录的链接");
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(saved).toHaveBeenCalledWith(plugin.id);
  expect(JSON.parse(String(state.request.mock.calls.at(-1)![1].body)).recordScope).toBe(
    "connection",
  );
});

it("shows a deleted recipient when returning to shared mode and lets the user replace it", async () => {
  const saved = vi.fn();
  await act(async () =>
    root.render(
      <PersonalAssistantEditor
        plugin={{ ...plugin, reminderConnectionId: "deleted-link" }}
        onClose={() => {}}
        onSaved={saved}
      />,
    ),
  );
  expect(container.textContent).not.toContain("提醒发送到");
  const policy = [...container.querySelectorAll("label")]
    .find((label) => label.textContent?.startsWith("记录共享方式"))!
    .querySelector("select")!;
  await act(async () => {
    policy.value = "shared";
    policy.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const recipient = [...container.querySelectorAll("label")]
    .find((label) => label.textContent?.startsWith("提醒发送到"))!
    .querySelector("select")!;
  expect(recipient.selectedOptions[0].textContent).toBe("原接收链接已删除，请重新选择");
  expect(recipient.selectedOptions[0].disabled).toBe(true);
  const replacement = state.data!.connections[0].id;
  await act(async () => {
    recipient.value = replacement;
    recipient.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(saved).toHaveBeenCalledWith(plugin.id);
  expect(JSON.parse(String(state.request.mock.calls.at(-1)![1].body))).toMatchObject({
    recordScope: "shared",
    reminderConnectionId: replacement,
  });
});

it("refreshes an emptied deleted link's library without leaving the deleted record visible", async () => {
  const connectionId = state.data!.selectedConnectionId;
  await state.request(
    `/plugins/${plugin.id}/records`,
    json({
      connectionId,
      record: { kind: "note", title: "历史笔记", date: "2026-10-31" },
    }),
  );
  state.data!.connections = state.data!.connections.filter((link) => link.id !== connectionId);
  state.data!.selectedConnectionId = state.data!.connections[0].id;
  await act(async () => root.render(<PersonalRecords plugin={plugin} onClose={() => {}} />));
  const scopes = container.querySelector("select")!;
  expect([...scopes.options].some((option) => option.value === connectionId)).toBe(true);
  await act(async () => {
    scopes.value = connectionId;
    scopes.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(container.textContent).toContain("历史笔记");
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="删除历史笔记"]')!.click(),
  );
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "确认删除")!
      .click(),
  );
  expect(container.textContent).toContain("0 条记录");
  expect(container.textContent).toContain("还没有普通笔记");
  expect(container.textContent).not.toContain("历史笔记");
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.querySelector("select")!.value).toBe(connectionId);
  const removal = state.request.mock.calls.find(([, options]) => options?.method === "DELETE");
  expect(JSON.parse(String(removal![1].body)).connectionId).toBe(connectionId);
  expect(await state.request(`/plugins/${plugin.id}/records/scopes`)).toContain(connectionId);
});
