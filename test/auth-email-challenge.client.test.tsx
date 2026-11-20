import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthPage } from "../src/client/pages/auth-page";
import { ForgotPasswordPage, VerifyEmailPage } from "../src/client/pages/auth-recovery";

vi.mock("../src/client/auth", async () => {
  const { createAuthClient } = await import("better-auth/react");
  return {
    useAuth: () => ({ data: null }),
    authClient: createAuthClient({
      baseURL: "https://example.test",
      fetchOptions: { customFetchImpl: (url, options) => fetch(url, options) },
    }),
  };
});

type Widget = NonNullable<Window["turnstile"]>;
let widget: Parameters<Widget["render"]>[1];
let root: Root;
let container: HTMLDivElement;
let requests: { path: string; token: string | null }[];

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  requests = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  window.turnstile = {
    render: vi.fn((_element, options) => {
      widget = options;
      return "widget";
    }),
    remove: vi.fn(),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options?: RequestInit) => {
      const path = new URL(String(url), "https://example.test").pathname;
      if (path === "/api/auth/email-config")
        return Response.json({ delivery: "email", siteKey: "public-key" });
      if (path === "/api/auth/providers") return Response.json({ providers: [] });
      if (path === "/api/referrals/attribution") return Response.json({ active: false });
      if (path.startsWith("/api/analytics/")) return new Response(null, { status: 204 });
      requests.push({ path, token: new Headers(options?.headers).get("X-Turnstile-Token") });
      return Response.json(
        { code: "EMAIL_CHALLENGE_INVALID", message: "expired" },
        { status: 403 },
      );
    }),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete window.turnstile;
  vi.unstubAllGlobals();
});

it.each([
  ["/register", "email_signup", "/api/auth/sign-up/email", <AuthPage register />],
  ["/verify-email", "email_resend", "/api/auth/send-verification-email", <VerifyEmailPage />],
  ["/forgot-password", "email_reset", "/api/auth/request-password-reset", <ForgotPasswordPage />],
] as const)(
  "requires a fresh challenge on %s and passes it through the auth client",
  async (page, action, path, component) => {
    await act(async () =>
      root.render(<MemoryRouter initialEntries={[page]}>{component}</MemoryRouter>),
    );
    expect(widget).toMatchObject({ sitekey: "public-key", action });
    const form = container.querySelector("form")!;
    const button = form.querySelector<HTMLButtonElement>("button.button.full")!;
    const submit = () =>
      act(async () => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
    await act(async () => {
      for (const input of form.querySelectorAll("input")) {
        const value =
          input.type === "password"
            ? "test-password-long"
            : input.type === "email"
              ? "test@example.test"
              : "Test";
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
          input,
          value,
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    expect(button.disabled).toBe(true);
    await submit();
    expect(requests).toEqual([]);
    await act(async () => widget.callback("old"));
    expect(button.disabled).toBe(false);
    await act(async () => widget["expired-callback"]());
    expect(button.disabled).toBe(true);
    await act(async () => widget.callback("fresh-token"));
    await submit();
    expect(requests).toEqual([{ path, token: "fresh-token" }]);
    expect(button.disabled).toBe(true);
    expect(window.turnstile!.remove).toHaveBeenCalled();
    expect(window.turnstile!.render).toHaveBeenCalledTimes(2);
  },
);

it("allows a visitor to retry when loading the widget fails", async () => {
  vi.mocked(window.turnstile!.render).mockImplementationOnce(() => {
    throw new Error("Unavailable");
  });
  await act(async () =>
    root.render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    ),
  );
  const retry = container.querySelector<HTMLButtonElement>('button[type="button"]')!;
  expect(retry.textContent).toContain("重新加载");
  await act(async () => retry.click());
  expect(widget.action).toBe("email_reset");
  await act(async () => widget.callback("new-token"));
  expect(container.querySelector<HTMLButtonElement>("button.button.full")!.disabled).toBe(false);
});
