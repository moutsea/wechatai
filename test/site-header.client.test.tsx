import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteHeader } from "../src/client/site-header";
import { readFileSync } from "node:fs";

const styles = readFileSync("src/client/styles.css", "utf8");

const auth = vi.hoisted(() => ({
  session: null as null | { user: { id: string; name: string; email: string } },
  pending: false,
  refetch: vi.fn(async () => {}),
  signOut: vi.fn(async () => ({})),
}));
vi.mock("../src/client/auth", () => ({
  useAuth: () => ({ data: auth.session, isPending: auth.pending, refetch: auth.refetch }),
  authClient: { signOut: auth.signOut },
}));

let container: HTMLDivElement;
let root: Root;
let style: HTMLStyleElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) =>
      Response.json(
        path === "/api/admin/access"
          ? { isAdmin: true }
          : { plan: "free", planUntil: 0, wallet: { balance: 100 } },
      ),
    ),
  );
  auth.session = { user: { id: "review-admin", name: "管理员", email: "admin@example.test" } };
  auth.pending = false;
  auth.signOut.mockClear();
  auth.refetch.mockClear();
  Reflect.get(window, "happyDOM").setWindowSize({ width: 390, height: 844 });
  style = document.createElement("style");
  style.textContent = styles;
  document.head.appendChild(style);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  style.remove();
  vi.unstubAllGlobals();
});
const mount = async () =>
  act(async () =>
    root.render(
      <MemoryRouter>
        <SiteHeader />
      </MemoryRouter>,
    ),
  );
async function click(selector: string) {
  const target = container.querySelector<HTMLButtonElement>(selector);
  expect(target).not.toBeNull();
  await act(async () => target!.click());
}

describe("mobile account navigation", () => {
  it("keeps the authenticated menu visible at 390px with workspace, admin and sign-out actions", async () => {
    await mount();
    expect(getComputedStyle(container.querySelector(".site-header-account")!).display).toBe("flex");
    await click('[aria-label="用户菜单"]');
    expect(container.querySelector('.account-dropdown a[href="/app"]')).not.toBeNull();
    expect(container.querySelector('.account-dropdown a[href="/app/admin"]')).not.toBeNull();
    await click(".account-sign-out");
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(auth.refetch).toHaveBeenCalledOnce();
  });

  it("keeps guest login/register in the mobile drawer and closes it with Escape", async () => {
    auth.session = null;
    await mount();
    expect(getComputedStyle(container.querySelector(".site-header-account")!).display).toBe("none");
    expect(container.querySelector('[aria-label="用户菜单"]')).toBeNull();
    await click('[aria-label="打开菜单"]');
    expect(container.querySelector('.site-mobile-menu.is-open a[href="/login"]')).not.toBeNull();
    expect(container.querySelector('.site-mobile-menu.is-open a[href="/register"]')).not.toBeNull();
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(container.querySelector(".site-mobile-menu.is-open")).toBeNull();
  });

  it("does not expose admin navigation to ordinary users", async () => {
    vi.mocked(fetch).mockImplementation(async (path) =>
      Response.json(
        path === "/api/admin/access"
          ? { isAdmin: false }
          : { plan: "free", planUntil: 0, wallet: { balance: 0 } },
      ),
    );
    await mount();
    await click('[aria-label="用户菜单"]');
    expect(container.querySelector('.account-dropdown a[href="/app"]')).not.toBeNull();
    expect(container.querySelector('.account-dropdown a[href="/app/admin"]')).toBeNull();
  });
});
