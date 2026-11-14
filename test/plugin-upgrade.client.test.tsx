import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Plugins } from "../src/client/pages/plugins";
import { Billing } from "../src/client/pages/billing";
import { useApp } from "../src/client/context";
import { pluginUpgradeReturnPath } from "../src/client/plugin-upgrade";
import { BILLING_OFFERS, type BillingCatalog } from "../src/shared/billing";
import { openClawInputSchema, type OpenClawPlugin } from "../src/shared/openclaw";
import type { Snapshot } from "../src/shared/types";
import { createFakeApi } from "./support/fake-api";

vi.mock("../src/client/context", () => ({ useApp: vi.fn() }));
vi.mock("../src/client/analytics-client", () => ({
  trackFunnel: vi.fn(),
  browserAnalyticsHeaders: () => ({}),
}));

let root: Root;
let container: HTMLDivElement;
let data: Snapshot;
let catalog: BillingCatalog;
const request = vi.fn();
const email = "upgrade@example.test";
const plugin = (id: string): OpenClawPlugin => ({
  ...openClawInputSchema.parse({ name: `Agent ${id}`, shortcut: id }),
  id,
  pluginId: "wechatai/openclaw",
  version: "1.0.0",
  createdAt: 1,
  hasKey: true,
  lastSeen: Date.now(),
});

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  data = await createFakeApi()<Snapshot>("/dashboard");
  data.plan = "free";
  data.plugins = [];
  data.cloudAgent = { ...data.cloudAgent, ready: true };
  catalog = {
    mode: "live",
    offers: BILLING_OFFERS.map((offer) => ({
      ...offer,
      price: offer.amount / 100,
      currency: "cny",
      enabled: true,
    })),
  };
  request.mockReset().mockImplementation(async (path: string) => {
    if (path === "/billing/catalog") return catalog;
    if (path === "/billing/subscription") return null;
    if (path === "/billing/checkout") return { url: "https://checkout.stripe.com/test-upgrade" };
    if (path.startsWith("/billing/checkout-status?"))
      return { status: "paid", kind: "plus", credits: 0 };
    throw new Error(`Unexpected request: ${path}`);
  });
  vi.mocked(useApp).mockReturnValue({
    data,
    base: "/app",
    isAdmin: false,
    user: { name: "测试", email },
    request,
    notify: vi.fn(),
    refresh: vi.fn(async () => {}),
  });
  vi.spyOn(window.location, "assign").mockImplementation(() => {});
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
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount(path = "/app/plugins") {
  await act(async () =>
    root.render(
      <MemoryRouter key={path} initialEntries={[path]}>
        <Routes>
          <Route path="/app/plugins" element={<Plugins />} />
          <Route path="/app/billing" element={<Billing />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
}

async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find(
    (item) => item.textContent?.trim() === label || item.getAttribute("aria-label") === label,
  );
  expect(button, label).toBeDefined();
  await act(async () => button!.click());
}

const dialog = () => container.querySelector("dialog")!;
const checkoutCalls = () => request.mock.calls.filter(([path]) => path === "/billing/checkout");

it("opens Plus cards for a Free user's cloud plugin without creating a configuration", async () => {
  await mount();
  await click("配置 小薇");
  expect(dialog().textContent).toContain("开通 Plus，解锁小薇");
  expect(dialog().textContent).toContain("1000 credits");
  expect(dialog().textContent).toContain("Plus 不包含模型 API 费用");
  expect(dialog().textContent).toContain("使用小薇需先配置自己的模型 API Key");
  const note = dialog().querySelector(".plugin-upgrade-note")!;
  const plans = dialog().querySelector(".plugin-upgrade-plans")!;
  expect(note.compareDocumentPosition(plans) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(dialog().querySelectorAll(".plugin-upgrade-plan")).toHaveLength(2);
  expect(dialog().querySelector("form")).toBeNull();
  expect(request.mock.calls.every(([path]) => String(path).startsWith("/billing/"))).toBe(true);
  expect(checkoutCalls()).toHaveLength(0);
  await click("暂时不用");
  expect(container.querySelector("dialog")).toBeNull();
});

it.each(["消息提醒", "DS Chat", "Hermes"])(
  "opens the same subscription dialog for a second %s configuration even without models",
  async (name) => {
    data.plugins = [plugin("first")];
    data.assistants = [];
    await mount();
    await click(`配置 ${name}`);
    expect(dialog().textContent).toContain("Free 最多配置 1 个插件");
    expect(dialog().textContent).toContain("仅停用不会释放名额");
    expect(checkoutCalls()).toHaveLength(0);
  },
);

it("keeps editing the first Free plugin available and offers Plus when adding another", async () => {
  data.plugins = [plugin("first")];
  await mount();
  await click("查看 OpenClaw 配置");
  await click("修改配置");
  expect(dialog().querySelector('input[value="Agent first"]')).not.toBeNull();
  expect(container.querySelector(".plugin-upgrade-plans")).toBeNull();
  await click("关闭");
  await click("添加另一组配置");
  expect(dialog().textContent).toContain("开通 Plus，配置更多插件");
  expect(container.querySelectorAll("dialog")).toHaveLength(1);
});

it.each([
  ["Plus 月付", "plus_monthly", 9.9],
  ["Plus 年付", "plus_yearly", 88],
] as const)(
  "charges the offer displayed on the %s card and preserves the plugin",
  async (name, offerId, price) => {
    await mount();
    await click("配置 小薇");
    const card = dialog().querySelector(`article[aria-label="${name}"]`)!;
    expect(card.querySelector(".plugin-upgrade-price strong")?.textContent).toBe(`¥${price}`);
    await act(async () => card.querySelector<HTMLButtonElement>("button")!.click());
    expect(checkoutCalls()).toHaveLength(1);
    expect(checkoutCalls()[0][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ offerId }),
    });
    expect(window.location.assign).toHaveBeenCalledWith("https://checkout.stripe.com/test-upgrade");
    expect(pluginUpgradeReturnPath(email)).toContain("plugin=wechatai%2Fcloud-agent");
    expect(pluginUpgradeReturnPath("other@example.test")).toBeNull();
  },
);

it("locks both cards while checkout is pending and allows retry after failure", async () => {
  let rejectCheckout!: (reason: Error) => void;
  const previous = request.getMockImplementation()!;
  request.mockImplementation((path, options) =>
    path === "/billing/checkout"
      ? new Promise((_resolve, reject) => {
          rejectCheckout = reject;
        })
      : previous(path, options),
  );
  await mount();
  await click("配置 小薇");
  await click("开通年付 Plus");
  for (const button of dialog().querySelectorAll<HTMLButtonElement>(".plugin-upgrade-plan button"))
    expect(button.disabled).toBe(true);
  await click("关闭");
  expect(container.querySelector("dialog")).not.toBeNull();
  await act(async () => rejectCheckout(new Error("支付服务暂不可用")));
  expect(dialog().querySelector('[role="alert"]')?.textContent).toContain("支付服务暂不可用");
  expect(window.location.assign).not.toHaveBeenCalled();
  expect(pluginUpgradeReturnPath(email)).toBeNull();
  for (const button of dialog().querySelectorAll<HTMLButtonElement>(".plugin-upgrade-plan button"))
    expect(button.disabled).toBe(false);
});

it("retries catalog failures and prevents purchases of unavailable offers", async () => {
  request.mockRejectedValueOnce(new Error("方案加载失败"));
  await mount();
  await click("配置 小薇");
  expect(dialog().textContent).toContain("方案加载失败");
  catalog.offers[0].enabled = false;
  await click("重新加载");
  const monthly = dialog().querySelector<HTMLButtonElement>(
    'article[aria-label="Plus 月付"] button',
  )!;
  expect(monthly.disabled).toBe(true);
  expect(monthly.textContent).toBe("暂未开放购买");
  expect(
    dialog().querySelector<HTMLButtonElement>('article[aria-label="Plus 年付"] button')!.disabled,
  ).toBe(false);
  expect(checkoutCalls()).toHaveLength(0);
});

it("routes an existing recurring subscription to management instead of creating another checkout", async () => {
  const previous = request.getMockImplementation()!;
  request.mockImplementation((path, options) =>
    path === "/billing/subscription"
      ? {
          id: "old-sub",
          status: "past_due",
          cancelAtPeriodEnd: false,
          offerId: "plus_monthly",
          periodEnd: 1,
        }
      : previous(path, options),
  );
  await mount();
  await click("配置 小薇");
  expect(dialog().querySelectorAll('.plugin-upgrade-plan a[href="/app/billing"]')).toHaveLength(2);
  expect(dialog().querySelector(".plugin-upgrade-plan button")).toBeNull();
  expect(checkoutCalls()).toHaveLength(0);
});

it("rejects a checkout URL outside the payment provider without leaving the plugin page", async () => {
  const previous = request.getMockImplementation()!;
  request.mockImplementation((path, options) =>
    path === "/billing/checkout"
      ? { url: "https://checkout.stripe.com.example.test/payment" }
      : previous(path, options),
  );
  await mount();
  await click("配置 小薇");
  await click("开通年付 Plus");
  expect(dialog().textContent).toContain("支付链接无效");
  expect(window.location.assign).not.toHaveBeenCalled();
  expect(pluginUpgradeReturnPath(email)).toBeNull();
});

it("returns to the selected paused configuration after a verified Plus purchase", async () => {
  data.plugins = [plugin("first"), plugin("second")];
  const previous = request.getMockImplementation()!;
  request.mockImplementation((path, options) => {
    if (path === "/plugins/second/openclaw/status")
      return { ...plugin("second"), agents: [], deliveries: [] };
    if (path === "/plugins/second" && options?.method === "PATCH") return plugin("second");
    return previous(path, options);
  });
  await mount("/app/plugins?plugin=wechatai%2Fopenclaw&config=second");
  await click("修改配置");
  expect(dialog().textContent).toContain("开通 Plus，配置更多插件");
  await click("开通月付 Plus");
  data.plan = "plus";
  await mount("/app/billing?checkout=success&session_id=cs_upgrade");
  const back = [...container.querySelectorAll("a")].find((link) =>
    link.textContent?.includes("继续配置刚才的插件"),
  )!;
  expect(back.getAttribute("href")).toBe(
    "/app/plugins?plugin=wechatai%2Fopenclaw&action=edit&config=second",
  );
  await act(async () => back.click());
  expect(container.querySelector(".plugin-upgrade-plans")).toBeNull();
  expect(dialog().querySelector('input[value="Agent second"]')).not.toBeNull();
  await act(async () =>
    dialog()
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(request).toHaveBeenCalledWith(
    "/plugins/second",
    expect.objectContaining({ method: "PATCH" }),
  );
  expect(
    request.mock.calls.some(([path]) => path === "/plugins" || path === "/plugins/first"),
  ).toBe(false);
  expect(pluginUpgradeReturnPath(email)).toBeNull();
});

it.each([
  ["月", "plus_monthly", "month"],
  ["年", "plus_yearly", "year"],
] as const)(
  "keeps the %s付 offer when cancelling and retrying checkout",
  async (label, offerId, interval) => {
    await mount();
    await click("配置 小薇");
    await click(`开通${label}付 Plus`);
    await mount(`/app/billing?checkout=cancelled&offer=${offerId}`);
    const selected = container.querySelector('.billing-interval [aria-pressed="true"]')!;
    expect(selected.textContent).toContain(`${label}付`);
    expect(container.querySelector(".plus-plan .plan-price")?.textContent).toContain(
      interval === "month" ? "9.90" : "88.00",
    );
    await click("升级 Plus");
    expect(checkoutCalls()).toHaveLength(2);
    expect(checkoutCalls()[1][1]).toMatchObject({ body: JSON.stringify({ offerId }) });
    const back = [...container.querySelectorAll("a")].find((link) =>
      link.textContent?.includes("返回插件配置"),
    )!;
    await act(async () => back.click());
    expect(dialog().textContent).toContain("开通 Plus，解锁小薇");
    expect(dialog().querySelector("form")).toBeNull();
    await click("暂时不用");
    expect(container.querySelector(".plugin-upgrade-plans")).toBeNull();
    expect(dialog().querySelector("form")).toBeNull();
    await click("关闭");
    expect(container.querySelector("dialog")).toBeNull();
  },
);

it.each(["credits_5000", "credits_20000", "credits_50000"])(
  "also preserves the %s credit pack after cancelling payment",
  async (offerId) => {
    await mount(`/app/billing?checkout=cancelled&offer=${offerId}`);
    expect(
      container.querySelector<HTMLInputElement>('input[name="credits-pack"]:checked')?.value,
    ).toBe(offerId);
    await click("补充额度");
    expect(checkoutCalls()[0][1]).toMatchObject({ body: JSON.stringify({ offerId }) });
  },
);

it("creates a separate configuration after upgrading instead of editing the existing agent", async () => {
  const first = plugin("first");
  data.plugins = [first];
  const previous = request.getMockImplementation()!;
  request.mockImplementation((path, options) => {
    if (path === "/plugins" && options?.method === "POST") {
      const created = { ...plugin("created"), ...JSON.parse(options.body) };
      data.plugins = [first, created];
      return created;
    }
    if (path === "/plugins/created/openclaw/pair")
      return { command: "test-pair-command", expiresAt: Date.now() + 60_000 };
    if (path === "/plugins/created/openclaw/status")
      return { ...data.plugins![1], agents: [], deliveries: [], pairingClaimed: false };
    return previous(path, options);
  });
  await mount();
  await click("查看 OpenClaw 配置");
  await click("添加另一组配置");
  await click("开通年付 Plus");
  data.plan = "plus";
  await mount("/app/billing?checkout=success&session_id=cs_upgrade&offer=plus_yearly");
  const back = [...container.querySelectorAll("a")].find((link) =>
    link.textContent?.includes("继续配置刚才的插件"),
  )!;
  await act(async () => back.click());
  expect(dialog().querySelector('input[value="OpenClaw"]')).not.toBeNull();
  expect(dialog().querySelector('input[value="Agent first"]')).toBeNull();
  expect(request.mock.calls.some(([path]) => path === "/plugins/first/openclaw/status")).toBe(
    false,
  );
  await click("连接 OpenClaw");
  expect(request).toHaveBeenCalledWith("/plugins", expect.objectContaining({ method: "POST" }));
  expect(dialog().querySelector("pre")?.textContent).toBe("test-pair-command");
  expect(data.plugins![0]).toEqual(first);
  expect(request.mock.calls.some(([path]) => path === "/plugins/first")).toBe(false);
  expect(pluginUpgradeReturnPath(email)).toBeNull();
  await click("关闭");
  expect(dialog().querySelector("form")).toBeNull();
});

it("still requires Plus when returning to a restricted edit after cancelling payment", async () => {
  data.plugins = [plugin("first"), plugin("second")];
  await mount("/app/plugins?plugin=wechatai%2Fopenclaw&config=second");
  await click("修改配置");
  await click("开通月付 Plus");
  await mount("/app/billing?checkout=cancelled&offer=plus_monthly");
  const back = [...container.querySelectorAll("a")].find((link) =>
    link.textContent?.includes("返回插件配置"),
  )!;
  await act(async () => back.click());
  expect(dialog().textContent).toContain("开通 Plus，配置更多插件");
  expect(dialog().querySelector("form")).toBeNull();
  expect(request.mock.calls.every(([path]) => String(path).startsWith("/billing/"))).toBe(true);
});

it("allows Plus users to configure cloud and additional plugins without a paywall", async () => {
  data.plan = "plus";
  data.plugins = [plugin("first")];
  await mount();
  await click("配置 小薇");
  expect(dialog().querySelector("form")).not.toBeNull();
  expect(container.querySelector(".plugin-upgrade-plans")).toBeNull();
  expect(request).not.toHaveBeenCalled();
});
