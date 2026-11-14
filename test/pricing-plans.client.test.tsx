import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DAILY_CREDIT_DEFAULTS } from "../src/shared/credits";
import { PLUGIN_LIMITS } from "../src/shared/plugin-access";
import { WECHAT_LINK_LIMITS } from "../src/shared/wechat-links";
import { PricingPlans } from "../src/client/pages/pricing-plans";

const mocks = vi.hoisted(() => ({ api: vi.fn(), signedIn: true }));
vi.mock("../src/client/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/client/api")>()),
  api: mocks.api,
}));
vi.mock("../src/client/auth", () => ({
  useAuth: () => ({
    data: mocks.signedIn ? { user: { id: "pricing-user" } } : null,
    isPending: false,
  }),
}));
vi.mock("../src/client/analytics-client", () => ({ trackFunnel: vi.fn() }));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.api.mockReset().mockResolvedValue({ url: "https://checkout.stripe.com/test" });
  mocks.signedIn = true;
  vi.spyOn(window.location, "assign").mockImplementation(() => {});
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
async function mount(path: string) {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <PricingPlans />
      </MemoryRouter>,
    ),
  );
}
async function checkout(interval: "month" | "year", offerId: string, price: string) {
  const card = container.querySelector(`.plan-${interval}`)!;
  expect(card.querySelector(".plan-price strong")?.textContent).toBe(price);
  await act(async () => card.querySelector<HTMLButtonElement>("button.plan-cta")!.click());
  expect(mocks.api).toHaveBeenCalledWith("/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ offerId }),
  });
  expect(window.location.assign).toHaveBeenCalledWith("https://checkout.stripe.com/test");
}

it.each([
  ["/pricing", "month", "plus_monthly", "¥9.9"],
  ["/pricing", "year", "plus_yearly", "¥88"],
  ["/pricing?interval=year#plans-title", "month", "plus_monthly", "¥9.9"],
  ["/pricing?interval=month#plans-title", "year", "plus_yearly", "¥88"],
] as const)(
  "charges the clicked %s %s card's displayed offer",
  async (path, interval, offerId, price) => {
    await mount(path);
    await checkout(interval, offerId, price);
  },
);

it("disables both purchase buttons while checkout is being created", async () => {
  let finish!: (result: { url: string }) => void;
  mocks.api.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await mount("/pricing");
  await act(async () =>
    container.querySelector<HTMLButtonElement>(".plan-year button.plan-cta")!.click(),
  );
  for (const button of container.querySelectorAll<HTMLButtonElement>("button.plan-cta"))
    expect(button.disabled).toBe(true);
  expect(container.querySelector(".plan-year .plan-cta")?.textContent).toContain("正在跳转支付");
  await act(async () => finish({ url: "https://checkout.stripe.com/test" }));
  expect(mocks.api).toHaveBeenCalledTimes(1);
});

it("shows checkout failures on the card that was purchased", async () => {
  mocks.api.mockRejectedValueOnce(new Error("支付服务暂不可用"));
  await mount("/pricing");
  await act(async () =>
    container.querySelector<HTMLButtonElement>(".plan-year button.plan-cta")!.click(),
  );
  expect(container.querySelector(".plan-year [role=alert]")?.textContent).toBe("支付服务暂不可用");
  expect(container.querySelector(".plan-month [role=alert]")).toBeNull();
  expect(window.location.assign).not.toHaveBeenCalled();
});

it.each(["month", "year"])(
  "preserves the %s offer through the registration link",
  async (interval) => {
    mocks.signedIn = false;
    await mount(`/pricing?interval=${interval}#plans-title`);
    const registration = new URL(
      container.querySelector<HTMLAnchorElement>(`.plan-${interval} a.plan-cta`)!.href,
      "https://wechatai.app",
    );
    expect(registration.pathname).toBe("/register");
    const returnTo = new URL(registration.searchParams.get("returnTo")!, "https://wechatai.app");
    expect(returnTo.pathname + returnTo.search).toBe(`/pricing?interval=${interval}`);
    expect(container.querySelector(`${returnTo.hash} .plan-price`)).not.toBeNull();
    expect(mocks.api).not.toHaveBeenCalled();
  },
);

it("compares the enforced plan limits and Plus access in matching rows", async () => {
  await mount("/pricing");
  const values = (plan: string) =>
    [...container.querySelectorAll(`.plan-${plan} .plan-features strong`)].map(
      (e) => e.textContent,
    );
  expect(values("free")).toEqual([
    String(DAILY_CREDIT_DEFAULTS.free),
    `${WECHAT_LINK_LIMITS.free} 个`,
    `${PLUGIN_LIMITS.free} 个`,
    "不支持",
    "不支持",
    "不支持",
  ]);
  const plusValues = [
    String(DAILY_CREDIT_DEFAULTS.plus),
    `${WECHAT_LINK_LIMITS.plus} 个`,
    "不限",
    "支持",
    "支持",
    "支持",
  ];
  expect(values("month")).toEqual(plusValues);
  expect(values("year")).toEqual(plusValues);
});
