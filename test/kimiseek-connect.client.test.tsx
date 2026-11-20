import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { KimiseekConnectError, useKimiseekConnect } from "../src/client/pages/kimiseek-connect";
import { kimiseekEmailError } from "../src/shared/kimiseek-errors";

const app = vi.hoisted(() => ({ request: vi.fn(), refresh: vi.fn(), notify: vi.fn() }));
vi.mock("../src/client/context", () => ({ useApp: () => app }));
vi.mock("../src/client/analytics-client", () => ({
  trackFunnel: vi.fn(),
  trackChannelModelImport: vi.fn(),
}));

let host: HTMLDivElement;
let root: Root;
const completed = vi.fn();
function Connect() {
  const connection = useKimiseekConnect(completed);
  return (
    <>
      <button
        type="button"
        disabled={connection.busy}
        onClick={() => void connection.start("connect")}
      >
        导入
      </button>
      {connection.error && (
        <KimiseekConnectError message={connection.error} code={connection.errorCode} />
      )}
    </>
  );
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.spyOn(window, "open").mockReturnValue(null);
  app.request.mockReset();
  app.refresh.mockReset().mockResolvedValue(undefined);
  app.notify.mockReset();
  completed.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  ["EMAIL_VERIFICATION_REQUIRED", "/verify-email?returnTo=%2Fapp%2Fchannels%3Fnew%3D1", "验证邮箱"],
  ["EMAIL_DOMAIN_BLOCKED", "/docs/model-providers#kimiseek", "查看手动接入步骤"],
])(
  "recovers from %s without retry loops or losing the ability to start a new flow",
  async (code, href, label) => {
    const policy = kimiseekEmailError(code)!;
    app.request
      .mockResolvedValueOnce({ flowId: "failed-flow", url: "https://kimiseek.example.com/start" })
      .mockResolvedValueOnce({ status: "failed", errorCode: code, message: policy.message });
    await act(async () => root.render(<Connect />));
    await act(async () => host.querySelector("button")!.click());
    expect(host.querySelector("[role=alert]")?.textContent).toContain(policy.message);
    const link = host.querySelector("[role=alert] a")!;
    expect(link.getAttribute("href")).toBe(href);
    expect(link.textContent).toBe(label);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(host.querySelector("button")!.disabled).toBe(false);
    expect(completed).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(10000));
    expect(app.request).toHaveBeenCalledTimes(2);
    expect(app.notify).toHaveBeenCalledWith(policy.message, true);

    app.request
      .mockResolvedValueOnce({ flowId: "retry-flow", url: "https://kimiseek.example.com/start" })
      .mockResolvedValueOnce({ status: "complete" });
    await act(async () => host.querySelector("button")!.click());
    expect(host.querySelector("[role=alert]")).toBeNull();
    expect(app.request).toHaveBeenLastCalledWith("/kimiseek/status/retry-flow");
    expect(completed).toHaveBeenCalledTimes(1);
    expect(app.refresh).toHaveBeenCalledTimes(1);
  },
);

it("does not invent recovery links for an unknown service error", async () => {
  app.request
    .mockResolvedValueOnce({ flowId: "failed-flow", url: "https://kimiseek.example.com/start" })
    .mockResolvedValueOnce({ status: "failed", errorCode: "OTHER_ERROR", message: "服务暂不可用" });
  await act(async () => root.render(<Connect />));
  await act(async () => host.querySelector("button")!.click());
  expect(host.querySelector("[role=alert]")?.textContent).toBe("服务暂不可用");
  expect(host.querySelector("[role=alert] a")).toBeNull();
  expect(host.querySelector("button")!.disabled).toBe(false);
});
