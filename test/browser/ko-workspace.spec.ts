import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { createFakeApi } from "../support/fake-api";
import { summarizeFunnel } from "../../src/shared/funnel-report";
import type { AdminOverview } from "../../src/shared/admin";
import type { Snapshot } from "../../src/shared/types";
import type { CloudAgentTask } from "../../src/shared/cloud-agent";

const origin = "http://ko-workspace.localhost";
const assets = new URL("../../dist/client/", import.meta.url);
const sections = [
  "",
  "channels",
  "assistants",
  "plugins",
  "tasks",
  "wechat",
  "sessions",
  "billing",
  "credits",
  "invite",
  "notices",
  "admin",
];
const userContent = "用户保留的中文内容";
const han = /\p{Script=Han}/u;

type FixtureOptions = {
  signedIn?: boolean;
  failure?: boolean;
  populated?: boolean;
  admin?: boolean;
};

async function fixture(
  page: Page,
  { signedIn = true, failure = false, populated = false, admin = false }: FixtureOptions = {},
) {
  const api = createFakeApi();
  const snapshot = await api<Snapshot>("/dashboard");
  snapshot.onboardingDismissedAt = 1;
  snapshot.grokBotReady = true;
  snapshot.channels = [];
  snapshot.assistants = [];
  snapshot.connections = [];
  snapshot.currentSession = null;
  snapshot.plugins = [];
  snapshot.ledger = populated ? snapshot.ledger.map((row) => ({ ...row, note: userContent })) : [];
  snapshot.stats.sessions = 0;
  snapshot.connection = { status: "disconnected" };
  const task: CloudAgentTask = {
    id: "ko-task",
    pluginInstanceId: "cloud",
    pluginName: "Xiaowei",
    sessionId: null,
    sessionTitle: userContent,
    prompt: userContent,
    result: userContent,
    status: "completed",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    credits: 1.25,
    delivery: "sent",
    delivered: true,
  };
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/auth/get-session")
      return route.fulfill({
        json: signedIn
          ? {
              user: { id: "fixture", name: "Alex", email: "alex@example.test" },
              session: { id: "session", userId: "fixture", token: "fixture" },
            }
          : null,
      });
    if (path === "/api/dashboard")
      return route.fulfill(
        signedIn
          ? { json: snapshot }
          : { status: 401, json: { error: "unauthorized", message: "请先登录" } },
      );
    if (path === "/api/admin/access") return route.fulfill({ json: { isAdmin: admin } });
    if (admin && path === "/api/admin/overview") {
      const overview: AdminOverview = {
        mode: "test",
        generatedAt: Date.now(),
        coverage: { synced: 1, oldest: Date.now(), newest: Date.now() },
        summary: {
          users: 3,
          plus: 1,
          requests: 120000,
          failedRequests: 2,
          tokens: 200000,
          credits: 12.5,
          revenue: 99,
          paidOrders: 1,
          payingUsers: 1,
          membershipRevenue: 99,
          creditsRevenue: 0,
          links: 1,
          connected: 1,
          channels: 1,
          models: 1,
          plugins: 1,
          sessions: 1,
          purchasedCredits: 500,
          debt: 0,
          rewardedReferrals: 0,
        },
        daily: Array.from({ length: 30 }, (_, i) => ({
          day: new Date(Date.UTC(2026, 10, i + 1)).toISOString().slice(0, 10),
          requests: i,
          failedRequests: 0,
          tokens: 0,
          credits: 0,
          activeUsers: 0,
          newUsers: 0,
          revenue: 0,
          paidOrders: 0,
        })),
        plugins: [
          { pluginId: "wechatai/cloud-agent", users: 1, requests: 1, tokens: 20, credits: 0.2 },
        ],
      };
      return route.fulfill({ json: overview });
    }
    if (admin && path === "/api/admin/users")
      return route.fulfill({ json: { items: [], total: 0, page: 1, totalPages: 1 } });
    if (admin && path === "/api/admin/sync")
      return route.fulfill({ json: { next: null, processed: 1, failed: 0 } });
    if (admin && path === "/api/admin/notices")
      return route.fulfill({ json: { items: [], total: 0, page: 1, totalPages: 1 } });
    if (admin && path === "/api/admin/server-status")
      return route.fulfill({
        json: {
          configured: false,
          generatedAt: Date.now(),
          receivedAt: null,
          stale: false,
          report: null,
        },
      });
    if (admin && path === "/api/admin/analytics") {
      const range = { from: "2026-11-22", to: "2026-11-28", days: 7 };
      return route.fulfill({
        json: {
          traffic: {
            range,
            totals: { pv: 5, visitorDays: 3, sessions: 3, pagesPerSession: 1.67 },
            daily: [],
            topPages: [],
            sources: [],
            sourceDepth: [],
            countries: [],
            devices: [],
          },
          conversions: {
            total: 1,
            unattributed: 0,
            sessions: 3,
            rate: 1 / 3,
            rows: [],
            sourceRows: [],
          },
          funnel: summarizeFunnel(range, { signup_submit: { visitorDays: 1, events: 1 } }),
        },
      });
    }
    if (path.startsWith("/api/admin/"))
      return route.fulfill({ status: 403, json: { error: "forbidden", message: "没有管理权限" } });
    if (path.startsWith("/api/analytics/")) return route.fulfill({ status: 204 });
    if (failure && ["/api/notices", "/api/referrals", "/api/cloud/tasks"].includes(path)) {
      return route.fulfill({
        status: 503,
        json: { error: "request_failed", message: "服务暂时不可用" },
      });
    }
    if (path === "/api/notices")
      return route.fulfill({
        json: {
          unread: 0,
          items: populated
            ? [
                {
                  id: "ko-notice",
                  title: userContent,
                  content: userContent,
                  priority: "normal",
                  status: "published",
                  revision: 1,
                  publishedRevision: 1,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                  publishedAt: Date.now(),
                  isRead: true,
                },
              ]
            : [],
          important: null,
          total: populated ? 1 : 0,
          page: 1,
          totalPages: 1,
          readThrough: 1,
        },
      });
    if (path === "/api/referrals")
      return route.fulfill({
        json: {
          url: "",
          reward: 500,
          registered: 0,
          completed: 0,
          earned: 0,
          received: null,
          recent: [],
        },
      });
    if (path === "/api/sessions") return route.fulfill({ json: [] });
    if (path === "/api/cloud/tasks")
      return route.fulfill({ json: { tasks: populated ? [task] : [], nextCursor: null } });
    if (path === "/api/cloud/tasks/ko-task") return route.fulfill({ json: task });
    if (path === "/api/cloud/storage")
      return route.fulfill({
        json: {
          usedBytes: 1024,
          reservedBytes: 0,
          availableBytes: 1024 * 1024,
          maxTotalBytes: 1024 * 1024,
        },
      });
    if (path.startsWith("/api/")) {
      try {
        const json = await api(path.slice(4) + url.search, {
          method: route.request().method(),
          body: route.request().postData(),
        });
        return route.fulfill({ json });
      } catch {
        return route.fulfill({
          status: 400,
          json: { error: "invalid_input", message: "请检查输入" },
        });
      }
    }
    let assetPath = path;
    if (/^\/ko\/app\/tasks\/[^/]+$/.test(path)) assetPath = "/ko/app/tasks";
    if (
      path.startsWith("/ko/app/") &&
      !sections.includes(path.slice("/ko/app/".length)) &&
      !path.startsWith("/ko/app/tasks/")
    )
      assetPath = "/ko/app";
    const file = assetPath.slice(1) + (extname(assetPath) ? "" : ".html");
    try {
      const body = await readFile(new URL(file, assets));
      const contentType =
        (
          {
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
            ".svg": "image/svg+xml",
            ".png": "image/png",
          } as Record<string, string>
        )[extname(file)] ?? "application/octet-stream";
      return route.fulfill({ body, contentType });
    } catch {
      return route.fulfill({ status: 404 });
    }
  });
  return snapshot;
}

async function koreanUi(page: Page) {
  await expect(page.locator("body")).not.toContainText(han);
  const labels = await page
    .locator("[aria-label], [title], [placeholder], img[alt]")
    .evaluateAll((nodes) =>
      nodes
        .flatMap((node) =>
          ["aria-label", "title", "placeholder", "alt"].map((key) => node.getAttribute(key) ?? ""),
        )
        .join("\n"),
    );
  expect(labels).not.toMatch(han);
}

for (const width of [1280, 390]) {
  test(`all Korean workspace routes load and refresh at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await fixture(page);
    for (const section of sections) {
      const path = `/ko/app${section ? `/${section}` : ""}`;
      expect((await page.goto(origin + path))?.status()).toBe(200);
      await expect(page.locator(".workspace")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", "ko-KR");
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        "noindex, follow",
      );
      await expect(page.locator(".full-state[role=status]")).toHaveCount(0);
      await koreanUi(page);
      await page.reload();
      await expect(page.locator(".workspace")).toBeVisible();
      await koreanUi(page);
      expect(await page.locator('a[href^="/app"]').count()).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await page.goto(origin + "/ko/app/plugins");
    await expect(page.locator(".plugin-library")).toBeVisible();
    await page.screenshot({ path: `test-results/ko-workspace-${width}.png`, fullPage: true });
  });
}

test("sidebar and account links keep Korean, including the denied admin return", async ({
  page,
}) => {
  await fixture(page);
  await page.goto(origin + "/ko/app");
  for (const section of sections.filter(
    (value) => value && value !== "assistants" && value !== "admin",
  )) {
    const link = page.locator(`.sidebar a[href="/ko/app/${section}"]`).first();
    await link.click();
    await expect(page).toHaveURL(origin + `/ko/app/${section}`);
    await expect(link).toHaveClass(/active/);
  }
  await page.goto(origin + "/ko/app/admin");
  await expect(page.getByText("현재 계정에 관리 권한이 없습니다.")).toBeVisible();
  await page.getByRole("link", { name: "워크스페이스로 돌아가기", exact: true }).click();
  await expect(page).toHaveURL(origin + "/ko/app");
  await page.goto(origin + "/ko/app/unknown");
  await expect(page).toHaveURL(origin + "/ko/app");
});

test("mobile sidebar retains the active Korean route", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await fixture(page);
  await page.goto(origin + "/ko/app");
  for (const section of sections.filter(
    (value) => value && value !== "assistants" && value !== "admin",
  )) {
    await page.locator(".mobile-menu").click();
    const link = page.locator(`.sidebar a[href="/ko/app/${section}"]`).first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(origin + `/ko/app/${section}`);
    await expect(link).toHaveClass(/active/);
    await expect(page.locator(".sidebar")).not.toHaveClass(/open/);
  }
});

test("keeps query and fragment when switching the billing language", async ({ page }) => {
  await fixture(page);
  await page.goto(origin + "/ko/app/billing?offer=plus_yearly#plans");
  await page.locator(".topbar .site-language button").click();
  await page.locator('.topbar .site-language [hreflang="zh-CN"]').click();
  await expect(page).toHaveURL(origin + "/app/billing?offer=plus_yearly#plans");
  await page.locator(".topbar .site-language button").click();
  await page.locator('.topbar .site-language [hreflang="ko-KR"]').click();
  await expect(page).toHaveURL(origin + "/ko/app/billing?offer=plus_yearly#plans");
  await expect(page.getByRole("heading", { name: "멤버십 및 크레딧", exact: true })).toBeVisible();
});

test("preserves user text and numerical data on notices, tasks and credits", async ({ page }) => {
  const snapshot = await fixture(page, { populated: true });
  await page.goto(origin + "/ko/app/notices");
  await expect(page.getByText(userContent).first()).toBeVisible();
  await page.goto(origin + "/ko/app/tasks/ko-task");
  await expect(page.getByText(userContent).first()).toBeVisible();
  await expect(page.locator(".cloud-task-status")).toContainText("완료");
  await page.reload();
  await expect(page.getByText(userContent).first()).toBeVisible();
  await page.getByRole("link", { name: "작업 목록으로 돌아가기" }).click();
  await expect(page).toHaveURL(origin + "/ko/app/tasks");
  await page.goto(origin + "/ko/app/credits");
  await expect(page.locator(".ledger-row")).toHaveCount(snapshot.ledger.length);
  await expect(page.locator(".ledger-row").first()).toContainText(userContent);
  const koreanAmounts = await page.locator(".ledger-row b").allTextContents();
  await page.goto(origin + "/app/credits");
  await expect(page.locator(".ledger-row")).toHaveCount(snapshot.ledger.length);
  expect(await page.locator(".ledger-row b").allTextContents()).toEqual(koreanAmounts);
});

test("shows Korean read failures and keeps the tutorial target reachable", async ({ page }) => {
  await fixture(page, { failure: true });
  for (const section of ["notices", "invite", "tasks"]) {
    await page.goto(origin + `/ko/app/${section}`);
    await expect(page.locator('[role="alert"]').first()).toBeVisible();
    await koreanUi(page);
  }
  await page.goto(origin + "/ko/app/credits");
  await page.locator(".credit-rules summary").click();
  const tutorial = page.getByRole("link", { name: "과금 안내 보기" });
  await expect(tutorial).toHaveAttribute("href", "/docs/credits#metering");
});

test("anonymous sessions retain the Korean return URL with query and fragment", async ({
  page,
}) => {
  await fixture(page, { signedIn: false });
  const target = "/ko/app/billing?offer=plus_yearly#plans";
  await page.goto(origin + target);
  await expect(page).toHaveURL(origin + "/login?returnTo=" + encodeURIComponent(target));
});

test("admin tabs and notice editor use Korean copy", async ({ page }) => {
  await fixture(page, { admin: true });
  for (const tab of ["overview", "analytics", "users", "notices", "server"]) {
    await page.goto(origin + `/ko/app/admin?tab=${tab}`);
    await expect(page.locator(".admin-page")).toBeVisible();
    await expect(page.locator(".admin-loading")).toHaveCount(0);
    await koreanUi(page);
  }
  await page.goto(origin + "/ko/app/admin?tab=notices");
  await page.getByRole("button", { name: "새 알림", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await koreanUi(page);
});

test("plugin and channel editors keep Korean product text", async ({ page }) => {
  await fixture(page);
  await page.goto(origin + "/ko/app/channels?new=1");
  await expect(page.getByRole("dialog")).toBeVisible();
  await koreanUi(page);
  for (const plugin of [
    "notification",
    "cloud-agent",
    "personal-assistant",
    "roleplay",
    "openclaw",
    "hermes",
    "muse",
    "image-generation",
    "web-research",
    "grok",
  ]) {
    await page.goto(origin + `/ko/app/plugins?plugin=wechatai%2F${plugin}&action=create`);
    await expect(page.getByRole("dialog")).toBeVisible();
    await koreanUi(page);
    const values = await page
      .getByRole("dialog")
      .locator("input, textarea")
      .evaluateAll((elements) =>
        elements.map((element) => (element as HTMLInputElement).value).join("\n"),
      );
    expect(values).not.toMatch(han);
  }
});
