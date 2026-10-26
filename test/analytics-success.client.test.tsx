import { act, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthPage } from "../src/client/public-pages";
import { VerifyEmailPage, ResetPasswordPage } from "../src/client/pages/auth-recovery";
import { Billing } from "../src/client/pages/billing";
import { browserPageViewReporter, trackFunnel } from "../src/client/analytics-client";
import { createDemo } from "../src/client/demo";
import { ANALYTICS_SESSION_HEADER } from "../src/shared/analytics";
import type { Snapshot } from "../src/shared/types";

const state = vi.hoisted(() => ({
  data: null as Snapshot | null,
  base: "/app",
  demo: false,
  request: vi.fn(),
  refresh: vi.fn(async () => {}),
  notify: vi.fn(),
  auth: {
    data: null as { user: { id: string } } | null,
    isPending: false,
    error: null as Error | null,
    refetch: vi.fn(async () => {}),
  },
  resetPassword: vi.fn(async () => ({ data: { status: true }, error: null })),
}));
vi.mock("../src/client/context", () => ({ useApp: () => state }));
vi.mock("../src/client/auth", () => ({
  useAuth: () => state.auth,
  authClient: { resetPassword: state.resetPassword },
}));
let root: Root;
let container: HTMLDivElement;
let events: { name: string }[];
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  events = [];
  state.data = await createDemo()<Snapshot>("/dashboard");
  state.auth.data = null;
  state.auth.isPending = false;
  state.auth.error = null;
  state.demo = false;
  state.request.mockReset();
  state.resetPassword.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, options?: RequestInit) => {
      if (path === "/api/analytics/event") {
        events.push(JSON.parse(String(options?.body)));
        return new Response(null, { status: 204 });
      }
      if (path === "/api/auth/email-config") return Response.json({ delivery: "preview" });
      if (path === "/api/auth/providers") return Response.json({ providers: [] });
      if (path === "/api/referrals/attribution") return Response.json({ active: false });
      throw new Error(`Unexpected fetch: ${path}`);
    }),
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
});
async function mount(child: ReactNode, path: string) {
  window.history.replaceState({}, "", path);
  await act(async () => root.render(<MemoryRouter initialEntries={[path]}>{child}</MemoryRouter>));
}

it.each(["loading", "error", "authenticated"])("excludes %s from register_view", async (status) => {
  state.auth.isPending = status === "loading";
  state.auth.error = status === "error" ? new Error("Network unavailable") : null;
  state.auth.data = status === "authenticated" ? { user: { id: "existing-user" } } : null;
  await mount(<AuthPage register />, "/register");
  expect(events).toEqual([]);
  expect(container.querySelector("form")).toBeNull();
});

it("counts the form once after recovery, including StrictMode effect replay and rerender", async () => {
  state.auth.error = new Error("Network unavailable");
  const page = (
    <StrictMode>
      <AuthPage register />
    </StrictMode>
  );
  await mount(page, "/register");
  expect(events).toEqual([]);
  state.auth.error = null;
  await mount(
    <StrictMode>
      <AuthPage register />
    </StrictMode>,
    "/register",
  );
  expect(container.querySelector("form")).not.toBeNull();
  await mount(
    <StrictMode>
      <AuthPage register />
    </StrictMode>,
    "/register",
  );
  expect(events.map((event) => event.name)).toEqual(["register_view"]);
});

it("does not turn URL parameters or direct browser calls into verified successes", async () => {
  await mount(<VerifyEmailPage />, "/verify-email?verified=1");
  trackFunnel("verify_done");
  trackFunnel("checkout_success");
  expect(events).toEqual([]);
});

it("leaves recovery completion recording to the verified server transition", async () => {
  await mount(<ResetPasswordPage />, "/reset-password?recovery=1&token=review-token");
  await act(async () => {
    for (const input of container.querySelectorAll<HTMLInputElement>('input[type="password"]')) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "review-password-123",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(state.resetPassword).toHaveBeenCalledWith({
    token: "review-token",
    newPassword: "review-password-123",
  });
  expect(container.textContent).toContain("密码已更新");
  expect(events).toEqual([]);
});

function paidBilling() {
  state.request.mockImplementation(async (path: string) => {
    if (path === "/billing/catalog") return { offers: [], mode: "live" };
    if (path === "/billing/subscription") return null;
    if (path.startsWith("/billing/checkout-status?"))
      return { status: "paid", kind: "plus", credits: 0 };
    throw new Error(`Unexpected request: ${path}`);
  });
}
const returnPath = "/app/billing?checkout=success&session_id=cs_review";

it("passes optional attribution to the server and never repeats browser success events", async () => {
  paidBilling();
  await mount(<Billing />, returnPath);
  await act(async () => root.render(null));
  await mount(<Billing />, returnPath);
  const calls = state.request.mock.calls.filter(([path]) =>
    path.startsWith("/billing/checkout-status?"),
  );
  expect(calls).toHaveLength(2);
  for (const [, options] of calls) expect(options.headers[ANALYTICS_SESSION_HEADER]).toBeTruthy();
  expect(container.textContent).toContain("支付成功");
  expect(events).toEqual([]);
});

it.each(["dnt", "gpc", "broken"])("still confirms payment with %s analytics", async (mode) => {
  paidBilling();
  const reporter = browserPageViewReporter();
  if (mode === "broken")
    vi.spyOn(reporter, "signupAttribution").mockImplementation(() => {
      throw new Error("Unavailable");
    });
  else {
    const navigator = window.navigator;
    vi.spyOn(window, "navigator", "get").mockReturnValue(
      Object.create(
        navigator,
        mode === "dnt" ? { doNotTrack: { value: "1" } } : { globalPrivacyControl: { value: true } },
      ),
    );
  }
  await mount(<Billing />, returnPath);
  const [, options] = state.request.mock.calls.find(([path]) =>
    path.startsWith("/billing/checkout-status?"),
  )!;
  expect(options.headers).toEqual({});
  expect(container.textContent).toContain("支付成功");
  expect(events).toEqual([]);
});
