import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Link, MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PricingPlans } from "../src/client/pages/pricing-plans";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../src/client/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/client/api")>()),
  api: mocks.api,
}));
vi.mock("../src/client/auth", () => ({
  useAuth: () => ({ data: { user: { id: "pricing-user" } }, isPending: false }),
}));
vi.mock("../src/client/analytics-client", () => ({ trackFunnel: vi.fn() }));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.api.mockReset().mockResolvedValue({ url: "https://checkout.stripe.com/test" });
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
        <Link to="/pricing?interval=year#plans-title">查看年付</Link>
      </MemoryRouter>,
    ),
  );
}
async function checkout(offerId: string, price: string) {
  expect(container.querySelector(".plan-plus .plan-price strong")?.textContent).toBe(price);
  await act(async () => container.querySelector<HTMLButtonElement>("button.plan-cta")!.click());
  expect(mocks.api).toHaveBeenCalledWith("/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ offerId }),
  });
  expect(window.location.assign).toHaveBeenCalledWith("https://checkout.stripe.com/test");
}

it.each([
  ["/pricing", "plus_monthly", "¥9.9"],
  ["/pricing?interval=month#plans-title", "plus_monthly", "¥9.9"],
  ["/pricing?interval=year#plans-title", "plus_yearly", "¥88"],
  ["/pricing?interval=unknown", "plus_monthly", "¥9.9"],
])("charges the displayed offer when entering %s", async (path, offerId, price) => {
  await mount(path);
  await checkout(offerId, price);
});

it("uses monthly checkout after switching away from the annual landing link", async () => {
  await mount("/pricing?interval=year#plans-title");
  await act(async () => container.querySelector<HTMLButtonElement>(".plan-switch button")!.click());
  await checkout("plus_monthly", "¥9.9");
});

it("updates the selected offer when following an annual link on the pricing page", async () => {
  await mount("/pricing");
  await act(async () =>
    container.querySelector<HTMLAnchorElement>('a[href*="interval=year"]')!.click(),
  );
  await checkout("plus_yearly", "¥88");
});
