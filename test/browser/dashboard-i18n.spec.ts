import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { DASHBOARD_PATH, LOCALE_DEFINITIONS, localizedPath } from "../../src/shared/i18n";
import { dashboardCopy } from "../../src/shared/i18n/dashboard";
import type { Snapshot } from "../../src/shared/types";
import { createFakeApi } from "../support/fake-api";

const origin = "http://dashboard-i18n.test";
const assets = new URL("../../dist/client/", import.meta.url);
const locales = ["en", "ja", "ko", "es", "pt"] as const;
const chineseUi =
  /微伴|工作台|新手引导|选择用途|准备服务|连接微信|添加渠道|微信待连接|新的对话|我的微信|已删除插件/;

test.beforeEach(async ({ page }) => {
  const snapshot = await createFakeApi()<Snapshot>("/dashboard");
  Object.assign(snapshot, {
    channels: [],
    assistants: [],
    connections: [],
    currentSession: null,
    plugins: [],
    plan: "free",
    planUntil: Date.now() - 24 * 60 * 60 * 1000,
    stats: { sessions: 0, messages: 0, tokens: 0 },
    onboardingDismissedAt: 0,
  });
  snapshot.connection = { status: "disconnected" };
  snapshot.wallet.dailyGrant = 100;
  snapshot.cloudAgent.ready = true;
  await page.route("**/*", async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/api/dashboard") return route.fulfill({ json: snapshot });
    if (pathname === "/api/auth/get-session") {
      return route.fulfill({
        json: {
          user: { id: "fixture", name: "Alex", email: "alex@example.test" },
          session: { id: "session", userId: "fixture", token: "fixture" },
        },
      });
    }
    if (pathname === "/api/notices") {
      return route.fulfill({ json: { unread: 0, items: [], important: null } });
    }
    if (pathname === "/api/admin/access") return route.fulfill({ json: { isAdmin: false } });
    if (pathname === "/api/onboarding/dismiss") {
      snapshot.onboardingDismissedAt = Date.now();
      return route.fulfill({ json: { ok: true } });
    }
    if (pathname.startsWith("/api/analytics/")) return route.fulfill({ status: 204 });
    const file = pathname.slice(1) + (extname(pathname) ? "" : ".html");
    try {
      const body = await readFile(new URL(file, assets));
      const contentType =
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".png": "image/png",
          ".svg": "image/svg+xml",
        }[extname(file)] ?? "application/octet-stream";
      return route.fulfill({ body, contentType });
    } catch {
      return route.fulfill({ status: 404 });
    }
  });
});

for (const locale of locales) {
  test(`opens ${locale} dashboard and renders each setup path in that language`, async ({
    page,
  }) => {
    const { dashboard, onboarding, shell, membership } = dashboardCopy[locale];
    const response = await page.goto(origin + localizedPath(locale, DASHBOARD_PATH));
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", LOCALE_DEFINITIONS[locale].htmlLang);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
    await expect(page.locator('link[rel="canonical"], link[hreflang]')).toHaveCount(0);

    const dialog = page.getByRole("dialog", { name: onboarding.title });
    await expect(dialog.getByRole("heading", { name: onboarding.purposeTitle })).toBeVisible();
    await expect(dialog.getByRole("button", { name: shell.close, exact: true })).toBeVisible();
    for (const [title, cost] of [
      [onboarding.modelTitle, onboarding.modelSetup],
      [onboarding.agentTitle, onboarding.agentCosts],
      [onboarding.cloudTitle, onboarding.cloudCosts],
      [onboarding.notificationTitle, onboarding.notificationCosts],
    ]) {
      await dialog.getByRole("button", { name: title }).click();
      await expect(dialog.getByRole("heading", { name: title })).toBeVisible();
      await expect(dialog.getByText(cost, { exact: true })).toBeVisible();
      await expect(dialog).not.toContainText(chineseUi);
      await dialog.getByRole("button", { name: onboarding.continueWechat }).click();
      await expect(dialog.getByRole("heading", { name: onboarding.scan })).toBeVisible();
      await expect(dialog.locator("code").filter({ hasText: /^\/wx help$/ })).toBeVisible();
      await expect(dialog).not.toContainText(chineseUi);
      await dialog.getByRole("button", { name: onboarding.choosePurpose }).click();
    }
    await dialog.getByRole("button", { name: onboarding.later }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".dashboard h1")).toContainText("Alex");
    await expect(page.getByRole("heading", { name: dashboard.firstSessionTitle })).toBeVisible();
    await expect(page.getByRole("status", { name: membership.label })).toBeVisible();
    await expect(page.locator(".topbar .site-language button")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(chineseUi);
    if (locale !== "ja") await expect(page.locator("body")).not.toContainText(/\p{Script=Han}/u);
  });
}

test("switching languages keeps the open onboarding step, query, and fragment", async ({
  page,
}) => {
  const suffix = "?source=fixture#setup";
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + DASHBOARD_PATH + suffix);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "接收服务通知" }).click();
  for (const locale of [...locales, "zh-CN"] as const) {
    const switcher = dialog.locator(".site-language");
    await switcher.getByRole("button").click();
    await switcher.locator(`[hreflang="${LOCALE_DEFINITIONS[locale].htmlLang}"]`).click();
    const { onboarding } = dashboardCopy[locale];
    await expect(page).toHaveURL(origin + localizedPath(locale, DASHBOARD_PATH) + suffix);
    await expect(dialog.getByRole("heading", { name: onboarding.notificationTitle })).toBeVisible();
    await expect(dialog.getByText(onboarding.notificationCosts, { exact: true })).toBeVisible();
    await expect(dialog.locator('[aria-current="step"]')).toContainText(onboarding.prepareService);
  }
  await dialog.getByRole("button", { name: "稍后设置" }).click();
  const switcher = page.locator(".topbar .site-language");
  await switcher.getByRole("button").click();
  await switcher.getByRole("menuitem", { name: "English" }).click();
  await expect(page).toHaveURL(origin + "/en/app" + suffix);
  await expect(page.getByRole("heading", { name: "Hello, Alex." })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("localizes KimiSeek errors and import results without losing recovery links or counts", async ({
  page,
}) => {
  let failure = true;
  await page.route("**/api/kimiseek/start", (route) =>
    route.fulfill({ json: { flowId: "fixture", url: "about:blank" } }),
  );
  await page.route("**/api/kimiseek/status/fixture", (route) =>
    route.fulfill({
      json: failure
        ? {
            status: "failed",
            errorCode: "EMAIL_DOMAIN_BLOCKED",
            message: "KimiSeek 暂不支持此邮箱注册",
          }
        : {
            status: "complete",
            message: "已关联 KimiSeek，导入 2 个模型",
            modelImport: { total: 4, imported: 2, existing: 1, limited: 1, invalid: 0 },
          },
    }),
  );
  await page.goto(origin + "/en/app");
  const { onboarding } = dashboardCopy.en;
  const dialog = page.getByRole("dialog", { name: onboarding.title });
  await dialog.getByRole("button", { name: onboarding.modelTitle }).click();
  await dialog.getByRole("button", { name: onboarding.linkAndRecharge }).click();
  await expect(dialog.getByRole("alert")).toContainText(onboarding.kimiseekDomain);
  await expect(dialog.getByRole("link", { name: onboarding.manualSetup })).toHaveAttribute(
    "href",
    "/docs/model-providers#kimiseek",
  );

  failure = false;
  await dialog.getByRole("button", { name: onboarding.linkAndRecharge }).click();
  await expect(dialog.getByRole("heading", { name: onboarding.scan })).toBeVisible();
  await expect(page.locator(".toast")).toContainText("Models imported: 2");
  await expect(page.locator(".toast")).toContainText("Already present: 1");
  await expect(page.locator(".toast")).toContainText("Skipped due to the model limit: 1");
});
