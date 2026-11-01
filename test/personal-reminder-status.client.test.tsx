import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PersonalRecords } from "../src/client/pages/personal-records";
import { DailyTasksReminder } from "../src/client/pages/personal-daily-reminder";
import { ReminderFailureNotice } from "../src/client/pages/personal-reminder-status";
import {
  personalRecordInputSchema,
  type PersonalRecord,
  type PersonalAssistantPlugin,
} from "../src/shared/personal-assistant";
import type { Snapshot } from "../src/shared/types";
import { createFakeApi } from "./support/fake-api";
import { json } from "../src/client/api";

const state = vi.hoisted(() => ({
  data: null as Snapshot | null,
  request: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("../src/client/context", () => ({ useApp: () => state }));
let container: HTMLDivElement;
let root: Root;
let plugin: PersonalAssistantPlugin;
const dueAt = Date.parse("2026-10-27T08:00:00+08:00");
function failedRecord(extra: Partial<PersonalRecord> = {}): PersonalRecord {
  return {
    ...personalRecordInputSchema.parse({
      kind: "reminder",
      title: "拿牛奶",
      date: "2026-10-27",
      remindAt: new Date(dueAt).toISOString(),
    }),
    id: "reminder",
    revision: 1,
    createdAt: dueAt - 86400000,
    updatedAt: dueAt - 86400000,
    reminderState: "expired",
    reminderError: "提醒已超过 24 小时，未再补发",
    reminderErrorDueAt: dueAt,
    reminderLastFailure: {
      code: "wechat_error",
      message: "微信拒绝发送，可能是会话凭据失效或发送受限。",
      dueAt,
      at: dueAt + 60000,
      upstreamStatus: 200,
      ret: -2,
    },
    ...extra,
  };
}
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
  const fake = createFakeApi();
  state.data = await fake<Snapshot>("/dashboard");
  plugin = await fake<PersonalAssistantPlugin>(
    "/plugins",
    json({ pluginId: "wechatai/personal-assistant", modelId: state.data.assistants[0].id }),
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

it("shows an expired reminder's original cause and a rescheduling action in the actual reminder list", async () => {
  state.request.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path.endsWith("/scopes")) return [""];
    const query = JSON.parse(String(init?.body));
    return {
      records: query.kind === "reminder" ? [failedRecord()] : [],
      total: query.kind === "reminder" ? 1 : 0,
      totals: [],
    };
  });
  await act(async () => root.render(<PersonalRecords plugin={plugin} onClose={() => {}} />));
  await act(async () =>
    [...container.querySelectorAll<HTMLButtonElement>("nav button")]
      .find((b) => b.textContent === "提醒")!
      .click(),
  );
  const warning = container.querySelector('[role="status"]')!;
  expect(warning.textContent).toContain("这条提醒未送达，已过期");
  expect(warning.textContent).toContain("微信拒绝发送");
  expect(warning.textContent).toContain("新的提醒时间");
  expect(warning.textContent).not.toContain("继续重试");
  expect(container.querySelector("details")!.textContent).toContain("ret=-2");
  expect(container.querySelector("details")!.textContent).toContain("对应提醒时间");
});

it("shows a skipped daily occurrence alongside the next schedule in the daily reminder settings", async () => {
  const record = failedRecord({
    reminderType: "daily_tasks",
    repeat: "daily",
    reminderState: "scheduled",
    reminderError: "已跳过过期提醒，保留下一次提醒",
    nextReminderAt: dueAt + 2 * 86400000,
  });
  state.request.mockResolvedValue({ records: [record], total: 1, totals: [] });
  await act(async () =>
    root.render(
      <DailyTasksReminder
        plugin={plugin}
        connectionId=""
        writable
        busy={false}
        setBusy={() => {}}
        refreshKey={0}
        onSaved={() => {}}
      />,
    ),
  );
  const warning = container.querySelector('[role="status"]')!;
  expect(warning.textContent).toContain("上次提醒未送达");
  expect(warning.textContent).toContain("下一次仍会按计划尝试");
  expect(container.querySelector("details")!.textContent).toContain("ret=-2");
});

it("keeps recovered failures available as history without showing an active warning", async () => {
  for (const reminderState of ["sent", "scheduled"]) {
    await act(async () =>
      root.render(
        <ReminderFailureNotice record={failedRecord({ reminderState, reminderError: "" })} />,
      ),
    );
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector("details")!.textContent).toContain("历史失败记录");
  }
});

it("does not invent the reason of an already expired legacy reminder", async () => {
  await act(async () =>
    root.render(
      <ReminderFailureNotice record={failedRecord({ reminderLastFailure: undefined })} />,
    ),
  );
  expect(container.textContent).toContain("历史提醒未保留原始失败原因");
  expect(container.textContent).not.toContain("凭据失效");
  expect(container.querySelector("details")).toBeNull();
});

it("distinguishes retryable HTTP rejection from a login credential requiring a new QR scan", async () => {
  await act(async () =>
    root.render(
      <ReminderFailureNotice
        record={failedRecord({
          reminderState: "retry",
          reminderLastFailure: {
            code: "wechat_unavailable",
            message: "微信接口拒绝请求（HTTP 403）。",
            at: dueAt + 1000,
            dueAt,
            upstreamStatus: 403,
          },
        })}
      />,
    ),
  );
  expect(container.querySelector('[role="status"]')!.textContent).toContain("自动重试");
  expect(container.textContent).not.toContain("先向接收微信发送一条消息");
  await act(async () =>
    root.render(
      <ReminderFailureNotice
        record={failedRecord({
          reminderState: "paused",
          reminderLastFailure: {
            code: "wechat_expired",
            message: "微信登录凭据已失效。",
            at: dueAt + 1000,
            dueAt,
            ret: -14,
            upstreamStatus: 200,
          },
        })}
      />,
    ),
  );
  expect(container.querySelector('[role="status"]')!.textContent).toContain("重新扫码连接");
});

it.each(
  (["daily_tasks", "message"] as const).flatMap((reminderType) =>
    (["http", "missing-context", "ret", "errcode"] as const).map((failure) => ({
      reminderType,
      failure,
    })),
  ),
)(
  "shows the correct retry deadline for $reminderType after $failure",
  async ({ reminderType, failure }) => {
    const at = Date.parse("2026-11-20T23:59:00+08:00");
    const record = failedRecord({
      reminderType,
      // An ordinary repeating reminder still has a 24-hour retry window.
      repeat: "daily",
      date: "2026-11-20",
      remindAt: new Date(at).toISOString(),
      nextReminderAt: at,
      reminderErrorDueAt: at,
      reminderState: failure === "missing-context" ? "waiting_context" : "retry",
      reminderError: failure === "missing-context" ? "缺少微信会话凭据。" : "微信发送失败。",
      reminderLastFailure:
        failure === "missing-context"
          ? undefined
          : {
              code: failure === "http" ? "wechat_unavailable" : "wechat_error",
              message: failure === "http" ? "微信接口拒绝请求（HTTP 403）。" : "微信拒绝发送。",
              dueAt: at,
              at: at + 1000,
              ...(failure === "http" ? { upstreamStatus: 403 } : { [failure]: -2 }),
            },
      reminderBlockReason:
        failure === "missing-context"
          ? {
              code: "wechat_context_missing",
              message: "缺少微信会话凭据。",
              dueAt: at,
            }
          : undefined,
    });
    state.request.mockResolvedValue({ records: [record], total: 1, totals: [] });
    await act(async () =>
      root.render(
        reminderType === "daily_tasks" ? (
          <DailyTasksReminder
            plugin={plugin}
            connectionId=""
            writable
            busy={false}
            setBusy={() => {}}
            refreshKey={0}
            onSaved={() => {}}
          />
        ) : (
          <ReminderFailureNotice record={record} />
        ),
      ),
    );
    const warning = container.querySelector('[role="status"]')!.textContent;
    if (reminderType === "daily_tasks") {
      expect(warning).toContain("预定提醒当天（北京时间）");
      expect(warning).toContain("跨天后不再补发");
      expect(warning).not.toContain("24 小时内");
    } else {
      expect(warning).toContain("预定时间后的 24 小时内");
      expect(warning).not.toContain("跨天后不再补发");
    }
    if (failure === "http") {
      expect(warning).toContain("自动重试");
      expect(warning).not.toContain("先向接收微信发送一条消息");
    } else expect(warning).toContain("请先向接收微信发送一条消息");
  },
);

it("does not show a failure warning while making the first delivery attempt", async () => {
  await act(async () =>
    root.render(
      <ReminderFailureNotice
        record={failedRecord({
          reminderState: "retry",
          reminderError: "正在发送提醒",
          reminderLastFailure: undefined,
        })}
      />,
    ),
  );
  expect(container.textContent).toBe("");
});

it("keeps yesterday's recovered failure in history while today's first send is in progress", async () => {
  await act(async () =>
    root.render(
      <ReminderFailureNotice
        record={failedRecord({
          repeat: "daily",
          reminderState: "retry",
          reminderError: "正在发送提醒",
          reminderErrorDueAt: dueAt + 86400000,
          nextReminderAt: dueAt + 86400000,
        })}
      />,
    ),
  );
  expect(container.querySelector('[role="status"]')).toBeNull();
  expect(container.querySelector("details")!.textContent).toContain("历史失败记录");
  expect(container.querySelector("details")!.textContent).toContain("ret=-2");
});

it("continues showing this occurrence's failure while its retry is in progress", async () => {
  await act(async () =>
    root.render(
      <ReminderFailureNotice
        record={failedRecord({
          reminderState: "retry",
          reminderError: "正在发送提醒",
          nextReminderAt: dueAt,
        })}
      />,
    ),
  );
  const warning = container.querySelector('[role="status"]')!;
  expect(warning.textContent).toContain("提醒发送失败，正在重试");
  expect(warning.textContent).toContain("微信拒绝发送");
});

it.each([dueAt + 86400000, null])(
  "does not attribute a skipped occurrence (%s) to an unrelated historical login error",
  async (errorDueAt) => {
    await act(async () =>
      root.render(
        <ReminderFailureNotice
          record={failedRecord({
            repeat: "daily",
            reminderState: "scheduled",
            reminderError: "已跳过过期提醒，保留下一次提醒",
            reminderErrorDueAt: errorDueAt,
            nextReminderAt: dueAt + 2 * 86400000,
            reminderLastFailure: {
              code: "wechat_expired",
              message: "微信登录凭据已失效。",
              dueAt,
              at: dueAt + 1000,
              ret: -14,
            },
          })}
        />,
      ),
    );
    const warning = container.querySelector('[role="status"]')!;
    expect(warning.textContent).toContain("已跳过过期提醒");
    expect(warning.textContent).not.toContain("凭据已失效");
    expect(warning.textContent).not.toContain("重新扫码");
    expect(container.querySelector("details")!.textContent).toContain("历史失败记录");
  },
);

it("shows a digest missed at midnight as an active warning even without an upstream failure", async () => {
  await act(async () =>
    root.render(
      <ReminderFailureNotice
        record={failedRecord({
          reminderType: "daily_tasks",
          repeat: "daily",
          reminderState: "scheduled",
          reminderError: "每日待办提醒已跨天，未再补发",
          nextReminderAt: dueAt + 86400000,
          reminderLastFailure: undefined,
        })}
      />,
    ),
  );
  const warning = container.querySelector('[role="status"]')!;
  expect(warning.textContent).toContain("上次提醒未送达");
  expect(warning.textContent).toContain("已跨天，未再补发");
});

it("shows the current login block and preserves the original upstream error details", async () => {
  await act(async () =>
    root.render(
      <ReminderFailureNotice
        record={failedRecord({
          reminderState: "paused",
          reminderBlockReason: { code: "wechat_expired", message: "微信登录凭据已失效。", dueAt },
          reminderLastFailure: {
            code: "wechat_expired",
            message: "微信登录凭据已失效。",
            dueAt,
            at: dueAt + 1000,
            ret: -14,
            upstreamStatus: 200,
          },
        })}
      />,
    ),
  );
  const warning = container.querySelector('[role="status"]')!;
  expect(warning.textContent).toContain("重新扫码连接");
  expect(warning.textContent).toContain("重新保存提醒");
  const details = container.querySelector("details")!;
  expect(details.textContent).toContain("ret=-14");
  expect(details.textContent).toContain("HTTP 200");
  expect(details.textContent).toContain("失败时间");
});

it("uses the current plugin block for recovery guidance instead of a historical login failure", async () => {
  await act(async () =>
    root.render(
      <ReminderFailureNotice
        record={failedRecord({
          reminderState: "paused",
          reminderBlockReason: { code: "reminder_plugin_paused", message: "助理已停用。", dueAt },
          reminderLastFailure: {
            code: "wechat_expired",
            message: "微信登录凭据已失效。",
            dueAt,
            at: dueAt + 1000,
            ret: -14,
          },
        })}
      />,
    ),
  );
  const warning = container.querySelector('[role="status"]')!;
  expect(warning.textContent).toContain("助理已停用");
  expect(warning.textContent).toContain("请启用个人助理");
  expect(warning.textContent).not.toContain("重新扫码");
  expect(container.querySelector("details")!.textContent).toContain("ret=-14");
  expect(container.querySelector("details")!.textContent).toContain("历史失败记录");
});

it("shows a login block without inventing a failed send or its timestamp", async () => {
  await act(async () =>
    root.render(
      <ReminderFailureNotice
        record={failedRecord({
          reminderState: "paused",
          reminderBlockReason: { code: "wechat_expired", message: "微信登录凭据已失效。", dueAt },
          reminderLastFailure: undefined,
        })}
      />,
    ),
  );
  expect(container.querySelector('[role="status"]')!.textContent).toContain("重新扫码连接");
  expect(container.querySelector("details")).toBeNull();
  expect(container.textContent).not.toContain("失败时间");
  expect(container.textContent).not.toContain("ret=");
});

it.each(["none", "daily", "weekly"] as const)(
  "explains how to recover a blocked %s reminder",
  async (repeat) => {
    await act(async () =>
      root.render(
        <ReminderFailureNotice
          record={failedRecord({
            reminderState: "blocked",
            repeat,
            reminderBlockReason: {
              code: "reminder_target_changed",
              message: "提醒链接已变更。",
              dueAt,
            },
            reminderLastFailure: undefined,
          })}
        />,
      ),
    );
    const warning = container.querySelector('[role="status"]')!;
    expect(warning.textContent).toContain(
      repeat === "none" ? "新的提醒时间" : "按原周期恢复下一次未来提醒",
    );
    expect(warning.textContent).not.toContain("自动重试");
  },
);

it.each(["scheduled", "waiting_context"])(
  "does not show an old block as the cause of a new %s occurrence",
  async (reminderState) => {
    await act(async () =>
      root.render(
        <ReminderFailureNotice
          record={failedRecord({
            reminderState,
            repeat: "daily",
            reminderError:
              reminderState === "scheduled" ? "每日待办提醒已跨天，未再补发" : "缺少微信会话凭据。",
            reminderErrorDueAt: dueAt + 86400000,
            nextReminderAt: dueAt + 2 * 86400000,
            reminderBlockReason: { code: "wechat_expired", message: "微信登录凭据已失效。", dueAt },
          })}
        />,
      ),
    );
    const warning = container.querySelector('[role="status"]')!;
    expect(warning.textContent).toContain(
      reminderState === "scheduled" ? "已跨天，未再补发" : "缺少微信会话凭据",
    );
    expect(warning.textContent).not.toContain("登录凭据已失效");
    expect(warning.textContent).not.toContain("重新扫码");
    expect(container.querySelector("details")!.textContent).toContain("历史失败记录");
    expect(container.querySelector("details")!.textContent).toContain("ret=-2");
  },
);
