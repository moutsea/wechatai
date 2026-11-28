import { expect, test, type Page } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { extname } from "node:path";
import { BILLING_OFFERS } from "../../src/shared/billing-offers";
import type { Snapshot } from "../../src/shared/types";
import { createFakeApi } from "../support/fake-api";
import { emptyFunnelSummary } from "../../src/shared/funnel-report";

const origin = "https://pt-workspace.test";
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

async function fixture(
  page: Page,
  options: {
    admin?: boolean;
    authenticated?: boolean;
    userContent?: boolean;
    failure?: string;
    models?: boolean;
    ledger?: boolean;
    connectionError?: boolean;
  } = {},
) {
  const fake = createFakeApi();
  const snapshot = await fake<Snapshot>("/dashboard");
  snapshot.onboardingDismissedAt = Date.now();
  if (options.models) {
    snapshot.assistants = snapshot.assistants.map((model, i) => ({
      ...model,
      description: "",
      shortcut: `model${i}`,
      systemPrompt: "Respond clearly.",
    }));
  } else {
    snapshot.channels = [];
    snapshot.assistants = [];
  }
  snapshot.grokBotReady = true;
  if (options.models && options.userContent) snapshot.assistants[0].name = "通知";
  snapshot.connections = [];
  snapshot.connection = {
    status: "disconnected",
    ...(options.connectionError ? { error: "连接测试失败，请重试" } : {}),
  };
  snapshot.currentSession = null;
  snapshot.plugins = [];
  snapshot.ledger = options.ledger
    ? [
        {
          id: "usage",
          kind: "usage",
          amount: -0.548,
          note: "实际消耗 0.548 credits",
          createdAt: 1795788000000,
        },
        {
          id: "daily",
          kind: "daily",
          amount: 1000,
          note: "每日赠送；抵扣欠额 2.340 credits",
          createdAt: 1795788000000,
        },
      ]
    : [];
  const now = Date.now();
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/auth/get-session")
      return route.fulfill({
        json:
          options.authenticated === false
            ? null
            : {
                user: { id: "fixture", name: "Alex", email: "alex@example.test" },
                session: { id: "session", userId: "fixture", token: "fixture" },
              },
      });
    if (path.startsWith("/api/analytics/")) return route.fulfill({ status: 204 });
    if (path === "/api/auth/providers") return route.fulfill({ json: { providers: [] } });
    if (path === "/api/auth/email-config") return route.fulfill({ json: { delivery: "preview" } });
    if (path === "/api/referrals/attribution") return route.fulfill({ json: { active: false } });
    if (
      options.failure &&
      (path === `/api/${options.failure}` ||
        (options.failure === "models/import" && path.endsWith("/models/import")))
    )
      return route.fulfill({
        status: 500,
        json: { message: "服务器失败，不应展示原始提示", error: "fixture_failure" },
      });
    if (path === "/api/dashboard")
      return options.authenticated === false
        ? route.fulfill({ status: 401, json: { error: "unauthorized" } })
        : route.fulfill({ json: snapshot });
    if (path === "/api/admin/access")
      return route.fulfill({ json: { isAdmin: options.admin ?? false } });
    if (path.startsWith("/api/admin/") && !options.admin)
      return route.fulfill({ status: 403, json: { message: "无管理权限", error: "forbidden" } });
    if (path === "/api/notices")
      return route.fulfill({
        json: {
          items: options.userContent
            ? [
                {
                  id: "notice",
                  title: "管理员中文公告",
                  content: "保留这段中文正文。",
                  isRead: true,
                  priority: "normal",
                  status: "published",
                  revision: 1,
                  publishedRevision: 1,
                  createdAt: now,
                  updatedAt: now,
                  publishedAt: now,
                },
              ]
            : [],
          total: options.userContent ? 1 : 0,
          page: 1,
          totalPages: 1,
          unread: 0,
          readThrough: 1,
          important: null,
        },
      });
    if (path === "/api/sessions") return route.fulfill({ json: [] });
    if (path === "/api/cloud/tasks")
      return route.fulfill({ json: { tasks: [], nextCursor: null } });
    if (path === "/api/cloud/tasks/task-1")
      return route.fulfill({
        json: {
          id: "task-1",
          status: "completed",
          createdAt: now,
          updatedAt: now,
          prompt: "用户原始中文任务",
          result: "用户原始中文结果",
          pluginId: "fixture-plugin",
          pluginName: "Xiaowei",
          sessionId: "session-1",
          connectionId: "connection-1",
          delivery: "sent",
          files: [],
          credits: 12.5,
        },
      });
    if (path === "/api/cloud/storage")
      return route.fulfill({
        json: {
          usedBytes: 0,
          reservedBytes: 0,
          availableBytes: 104857600,
          maxTotalBytes: 104857600,
        },
      });
    if (path === "/api/referrals")
      return route.fulfill({
        json: {
          url: "https://wechatai.app/register?ref=test",
          reward: 500,
          registered: 0,
          completed: 0,
          earned: 0,
          received: null,
          recent: [],
        },
      });
    if (path === "/api/admin/overview")
      return route.fulfill({
        json: {
          mode: "test",
          generatedAt: now,
          coverage: { synced: 1, oldest: now, newest: now },
          summary: {
            requests: 7,
            tokens: 1234,
            credits: 12.5,
            failedRequests: 1,
            users: 1,
            plus: 1,
            links: 0,
            connected: 0,
            channels: 0,
            models: 0,
            plugins: 0,
            sessions: 0,
            purchasedCredits: 250,
            debt: 0,
            revenue: 990,
            paidOrders: 1,
            payingUsers: 1,
            membershipRevenue: 990,
            creditsRevenue: 0,
            rewardedReferrals: 0,
          },
          daily: Array.from({ length: 30 }, (_, index) => ({
            day: new Date(now - (29 - index) * 86400000).toISOString().slice(0, 10),
            requests: 0,
            tokens: 0,
            credits: 0,
            failedRequests: 0,
            activeUsers: 0,
            newUsers: 0,
            revenue: 0,
            paidOrders: 0,
          })),
          plugins: [],
        },
      });
    if (path === "/api/admin/sync")
      return route.fulfill({ json: { processed: 1, failed: 0, next: null } });
    if (path === "/api/admin/users")
      return route.fulfill({ json: { items: [], total: 0, page: 1, totalPages: 1 } });
    if (path === "/api/admin/notices")
      return route.fulfill({ json: { items: [], total: 0, page: 1, totalPages: 1 } });
    if (path === "/api/admin/server-status") return route.fulfill({ json: { configured: false } });
    if (path === "/api/admin/analytics") {
      const range = { from: "2026-11-28", to: "2026-11-28", days: 1 };
      return route.fulfill({
        json: {
          traffic: {
            range,
            totals: { pv: 0, visitorDays: 0, sessions: 0, pagesPerSession: 0 },
            daily: [],
            sources: [],
            topPages: [],
            sourceDepth: [],
            countries: [],
            devices: [],
          },
          conversions: {
            total: 0,
            unattributed: 0,
            sessions: 0,
            rate: 0,
            rows: [],
            sourceRows: [],
          },
          funnel: emptyFunnelSummary(range),
        },
      });
    }
    if (path.startsWith("/api/")) {
      try {
        const result = await fake(path.slice(4) + url.search, {
          method: route.request().method(),
          body: route.request().postData(),
        });
        if (path === "/api/channels" && route.request().method() === "POST")
          snapshot.channels.push(result as Snapshot["channels"][number]);
        return route.fulfill({ json: result });
      } catch {
        return route.fulfill({
          status: 400,
          json: { error: "fixture_failure", message: "测试操作失败" },
        });
      }
    }
    const shellPath = path.startsWith("/pt/app/tasks/")
      ? "/pt/app/tasks"
      : path === "/pt/app/missing"
        ? "/pt/app"
        : path;
    const file = shellPath.slice(1) + (extname(shellPath) ? "" : ".html");
    try {
      return route.fulfill({
        body: await readFile(new URL(file, assets)),
        contentType:
          (
            {
              ".html": "text/html",
              ".js": "text/javascript",
              ".css": "text/css",
              ".svg": "image/svg+xml",
              ".png": "image/png",
              ".webp": "image/webp",
            } as Record<string, string>
          )[extname(file)] ?? "application/octet-stream",
      });
    } catch {
      return route.fulfill({ status: 404 });
    }
  });
  return snapshot;
}

async function portugueseUi(page: Page, formValues = false) {
  const text = await page
    .locator("body")
    .evaluate(
      (body, includeValues) =>
        [
          (body as HTMLElement).innerText,
          ...Array.from(
            body.querySelectorAll("[aria-label], [title], [placeholder], [alt]"),
          ).flatMap((element) =>
            ["aria-label", "title", "placeholder", "alt"].map(
              (attribute) => element.getAttribute(attribute) ?? "",
            ),
          ),
          ...(includeValues
            ? Array.from(body.querySelectorAll("input, textarea")).map(
                (input) => (input as HTMLInputElement).value,
              )
            : []),
        ].join(" "),
      formValues,
    );
  expect(text).not.toMatch(/\p{Script=Han}/u);
}

for (const width of [1280, 390]) {
  test(`Portuguese private pages load and refresh at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await fixture(page);
    for (const section of sections) {
      const url = `${origin}/pt/app${section ? `/${section}` : ""}`;
      expect((await page.goto(url))?.status(), section).toBe(200);
      await expect(page.locator(".workspace")).toBeVisible();
      await expect(page.locator("main h1, main h2").first()).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        "noindex, follow",
      );
      await portugueseUi(page);
      expect((await page.reload())?.status()).toBe(200);
      await expect(page.locator(".workspace")).toBeVisible();
      await expect(page.locator("main h1, main h2").first()).toBeVisible();
    }
    await page.goto(`${origin}/pt/app/billing`);
    await expect(
      page.getByRole("heading", { name: "Assinatura e créditos", exact: true }),
    ).toBeVisible();
    await mkdir("test-results/pt-workspace", { recursive: true });
    await page.screenshot({
      path: `test-results/pt-workspace/billing-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
  });
}

for (const width of [1280, 390])
  test(`sidebar links preserve Portuguese at ${width}px`, async ({ page }) => {
    await fixture(page, { admin: true });
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/pt/app`);
    await expect(page.locator("aside nav")).toBeAttached();
    const hrefs = await page
      .locator("aside nav a")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(hrefs.length).toBeGreaterThan(8);
    for (const href of hrefs) {
      expect(href).toMatch(/^\/pt\/app(?:\/|$)/);
      if (width === 390)
        await page.getByRole("button", { name: "Abrir navegação", exact: true }).click();
      await page.locator(`aside nav a[href="${href}"]`).click();
      await expect(page).toHaveURL(origin + href);
      await expect(page.locator("aside nav a.active")).toHaveAttribute("href", href!);
    }
  });

test("task detail keeps its address and original user content", async ({ page }) => {
  await fixture(page);
  const url = `${origin}/pt/app/tasks/task-1?source=history#result`;
  expect((await page.goto(url))?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Detalhes da tarefa" })).toBeVisible();
  await expect(page.getByText("用户原始中文任务", { exact: true })).toBeVisible();
  expect((await page.reload())?.status()).toBe(200);
  await expect(page).toHaveURL(url);
  await expect(page.getByRole("link", { name: "Voltar à lista de tarefas" })).toHaveAttribute(
    "href",
    "/pt/app/tasks",
  );
});

test("administrator notices preserve the original title and body", async ({ page }) => {
  await fixture(page, { userContent: true });
  await page.goto(`${origin}/pt/app/notices`);
  await page.getByText("管理员中文公告", { exact: true }).click();
  await expect(
    page.getByRole("dialog").getByText("保留这段中文正文。", { exact: true }),
  ).toBeVisible();
});

test("anonymous return paths retain the Portuguese child, query and fragment", async ({ page }) => {
  await fixture(page, { authenticated: false });
  await page.goto(`${origin}/pt/app/billing?checkout=cancelled#plans`);
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(
    "/pt/app/billing?checkout=cancelled#plans",
  );
});

test("non-admin users get a Portuguese denial with a localized return", async ({ page }) => {
  await fixture(page);
  await page.goto(`${origin}/pt/app/admin`);
  await expect(page.getByText("Esta conta não tem permissão de administração.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Voltar ao painel", exact: true })).toHaveAttribute(
    "href",
    "/pt/app",
  );
});

test("notice failures are localized and can be retried", async ({ page }) => {
  await fixture(page, { failure: "notices" });
  await page.goto(`${origin}/pt/app/notices`);
  await expect(page.locator(".notices-page [role=alert]")).toBeVisible();
  await portugueseUi(page);
  await page.locator(".notices-page").getByRole("button", { name: "Recarregar" }).click();
  await expect(page.locator(".notices-page [role=alert]")).toBeVisible();
});

test("channel configuration and built-in provider labels use Portuguese", async ({ page }) => {
  await fixture(page);
  await page.goto(`${origin}/pt/app/channels`);
  await page.getByRole("button", { name: "Adicionar canal", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await portugueseUi(page);
  await page.locator("#channel-provider").selectOption("custom");
  await portugueseUi(page);
});

test("admin overview, tabs and notice editor use Portuguese", async ({ page }) => {
  await fixture(page, { admin: true });
  await page.goto(`${origin}/pt/app/admin`);
  await expect(page.locator(".admin-kpis")).toBeVisible();
  await portugueseUi(page);
  for (const tab of [
    "Estatísticas de tráfego",
    "Lista de usuários",
    "Gerenciar notificações",
    "Servidores",
  ]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await portugueseUi(page);
  }
  await page.getByRole("button", { name: "Gerenciar notificações", exact: true }).click();
  await page.getByRole("button", { name: "Nova notificação", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await portugueseUi(page);
});

test("all plugin configuration dialogs and character settings use Portuguese", async ({ page }) => {
  await fixture(page, { models: true });
  await page.goto(`${origin}/pt/app/plugins`);
  const configure = page.locator('.plugin-entry button[aria-label^="Configurar "]');
  await expect(configure.first()).toBeVisible();
  const count = await configure.count();
  expect(count).toBe(10);
  for (let index = 0; index < count; index++) {
    await configure.nth(index).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await portugueseUi(page, true);
    const choose = page.getByRole("button", { name: "Usar este personagem", exact: true });
    if (await choose.count()) {
      await choose.click();
      await portugueseUi(page, true);
      for (const tab of ["História e conversa", "Livro de mundo · 1"]) {
        await page.getByRole("tab", { name: tab, exact: true }).click();
        await portugueseUi(page, true);
      }
    }
    await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
});

test("ledger figures and currency match the default workspace", async ({ page }) => {
  await fixture(page, { ledger: true });
  await page.goto(`${origin}/pt/app/credits`);
  await expect(page.locator(".ledger-row")).toHaveCount(2);
  await portugueseUi(page);
  const localized = await page.locator(".ledger-row").evaluateAll((rows) =>
    rows.map((row) => ({
      amount: row.querySelector("b")?.textContent,
      time: row.querySelector("time")?.getAttribute("datetime"),
    })),
  );
  await expect(page.getByText("Consumo efetivo 0.548 credits", { exact: true })).toBeVisible();
  await page.goto(`${origin}/app/credits`);
  await expect(page.locator(".ledger-row")).toHaveCount(2);
  expect(
    await page.locator(".ledger-row").evaluateAll((rows) =>
      rows.map((row) => ({
        amount: row.querySelector("b")?.textContent,
        time: row.querySelector("time")?.getAttribute("datetime"),
      })),
    ),
  ).toEqual(localized);
  await page.goto(`${origin}/pt/app/billing`);
  await expect(page.locator(".billing-page")).toBeVisible();
  const prices = await page
    .locator(".plan-price")
    .evaluateAll((nodes) => nodes.map((node) => node.firstChild?.textContent?.trim()).slice(1));
  expect(prices).toHaveLength(2);
  await page.goto(`${origin}/app/billing`);
  await expect(page.locator(".billing-page")).toBeVisible();
  expect(
    await page
      .locator(".plan-price")
      .evaluateAll((nodes) => nodes.map((node) => node.firstChild?.textContent?.trim()).slice(1)),
  ).toEqual(prices);
});

test("unknown workspace paths fall back to the Portuguese dashboard", async ({ page }) => {
  await fixture(page);
  expect((await page.goto(`${origin}/pt/app/missing`))?.status()).toBe(200);
  await expect(page).toHaveURL(`${origin}/pt/app`);
  await portugueseUi(page);
});

test("model names that match product labels retain their original text", async ({ page }) => {
  await fixture(page, { models: true, userContent: true });
  await page.goto(`${origin}/pt/app/channels`);
  await expect(page.locator('.channel-model-name strong[title="通知"]')).toHaveText("通知");
  await page.goto(`${origin}/pt/app/plugins`);
  await page
    .locator('.plugin-entry[aria-label="Interpretação de personagens"]')
    .getByRole("button")
    .click();
  await page.getByRole("button", { name: "Usar este personagem", exact: true }).click();
  await expect(
    page.getByRole("dialog").locator("option").filter({ hasText: "OpenAI / 通知" }),
  ).toHaveCount(1);
});

test("connection and post-save model import failures use Portuguese", async ({ page }) => {
  await fixture(page, { connectionError: true, failure: "models/import" });
  await page.goto(`${origin}/pt/app/wechat`);
  await expect(page.locator(".form-error")).toBeVisible();
  await portugueseUi(page);
  await page.goto(`${origin}/pt/app/channels`);
  await page.getByRole("button", { name: "Adicionar canal", exact: true }).first().click();
  await page.locator("#channel-provider").selectOption("openai");
  await page.locator("#channel-api-key").fill("fixture-key");
  await page.getByRole("button", { name: "Salvar e obter modelos", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".channel-card")).toHaveCount(1);
  await portugueseUi(page);
});

for (const width of [1280, 390]) {
  test(`Portuguese Free upgrade plan names are localized at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const snapshot = await fixture(page);
    snapshot.plan = "free";
    snapshot.planUntil = 0;
    await page.route("**/api/billing/catalog", (route) =>
      route.fulfill({
        json: {
          mode: "test",
          offers: BILLING_OFFERS.map((offer) => ({
            ...offer,
            price: offer.amount / 100,
            currency: "cny",
            enabled: true,
          })),
        },
      }),
    );
    await page.goto(`${origin}/pt/app/plugins`);
    await page.getByRole("button", { name: "Configurar Xiaowei", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(".plugin-upgrade-plan h3")).toHaveText([
      "Plus Mensal",
      "Plus Anual",
    ]);
    for (const [index, name] of ["Plus Mensal", "Plus Anual"].entries()) {
      const plan = dialog.getByRole("article", { name, exact: true });
      await expect(plan).toBeVisible();
      await expect(plan.getByRole("button")).toBeEnabled();
      await expect(plan.locator(".plugin-upgrade-price strong")).toHaveText(
        `¥${BILLING_OFFERS[index].amount / 100}`,
      );
    }
    await portugueseUi(page);
    if (width === 390) {
      await dialog.locator(".plugin-upgrade-plans").scrollIntoViewIfNeeded();
      await mkdir("test-results/pt-workspace", { recursive: true });
      await page.screenshot({
        path: "test-results/pt-workspace/upgrade-plans-mobile.png",
        fullPage: false,
        animations: "disabled",
      });
    }
  });
}

for (const entry of ["plugin", "billing", "portal"] as const) {
  const outcomes = entry === "portal" ? ["portal"] : ["success", "cancelled"];
  for (const outcome of outcomes) {
    test(`Portuguese ${entry} preserves locale after Stripe ${outcome}`, async ({ page }) => {
      await page.setViewportSize({ width: outcome === "cancelled" ? 390 : 1280, height: 900 });
      const snapshot = await fixture(page, { models: true });
      snapshot.plan = "free";
      snapshot.planUntil = 0;
      await page.route("**/api/billing/catalog", (route) =>
        route.fulfill({
          json: {
            mode: "test",
            offers: BILLING_OFFERS.map((offer) => ({
              ...offer,
              price: offer.amount / 100,
              currency: "cny",
              enabled: true,
            })),
          },
        }),
      );
      await page.route("**/api/billing/subscription", (route) =>
        route.fulfill({
          json:
            entry === "portal"
              ? {
                  id: "sub_fixture",
                  offerId: "plus_monthly",
                  status: "active",
                  cancelAtPeriodEnd: false,
                  periodEnd: Date.now() + 86400000,
                }
              : null,
        }),
      );
      const stripeUrl =
        entry === "portal"
          ? "https://billing.stripe.com/return-fixture"
          : "https://checkout.stripe.com/return-fixture";
      const requests: unknown[] = [];
      await page.route(`**/api/billing/${entry === "portal" ? "portal" : "checkout"}`, (route) => {
        requests.push(route.request().postDataJSON());
        return route.fulfill({ json: { url: stripeUrl } });
      });
      await page.route("**/api/billing/checkout-status?*", (route) =>
        route.fulfill({
          json: { status: "paid", kind: "plus", credits: 0 },
        }),
      );
      // Existing Stripe sessions return to this canonical path, including reused pending orders.
      const suffix =
        outcome === "portal"
          ? ""
          : `?checkout=${outcome}&offer=plus_monthly${outcome === "success" ? "&session_id=cs_fixture" : ""}#plans`;
      await page.route(stripeUrl, (route) =>
        route.fulfill({
          contentType: "text/html",
          body: `<a href="${origin}/app/billing${suffix}">Return to workspace</a>`,
        }),
      );
      if (entry === "billing") {
        await page.goto(`${origin}/pt/app/billing?offer=plus_monthly`);
        await page.locator(".plus-plan button.button").click();
      } else {
        await page.goto(`${origin}/pt/app/plugins`);
        await page.getByRole("button", { name: "Configurar Xiaowei", exact: true }).click();
        if (entry === "portal") {
          await page.getByRole("link", { name: "Gerenciar assinatura existente" }).first().click();
          await expect(page).toHaveURL(`${origin}/pt/app/billing`);
          await page.getByRole("button", { name: "Gerenciar assinatura", exact: true }).click();
        } else {
          await page.getByRole("button", { name: "Assinar Plus mensal", exact: true }).click();
        }
      }
      await expect(page).toHaveURL(stripeUrl);
      expect(requests).toEqual([entry === "portal" ? {} : { offerId: "plus_monthly" }]);
      if (outcome !== "cancelled") snapshot.plan = "plus";
      await page.getByRole("link", { name: "Return to workspace" }).click();
      await expect(page).toHaveURL(`${origin}/pt/app/billing${suffix}`);
      await expect(
        page.getByRole("heading", { name: "Assinatura e créditos", exact: true }),
      ).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
      if (outcome === "success")
        await expect(page.getByRole("status")).toContainText("Pagamento concluído");
      if (entry === "plugin" && outcome === "cancelled") {
        await mkdir("test-results/pt-workspace", { recursive: true });
        await page.screenshot({
          path: "test-results/pt-workspace/upgrade-return-mobile.png",
          fullPage: true,
          animations: "disabled",
        });
      }
      if (entry !== "billing") {
        const back = page.getByRole("link", {
          name:
            outcome === "cancelled"
              ? "Voltar à configuração do plugin"
              : "Continuar a configuração do plugin",
        });
        await expect(back).toHaveAttribute(
          "href",
          "/pt/app/plugins?plugin=wechatai%2Fcloud-agent&action=create",
        );
        await back.click();
        await expect(page).toHaveURL(
          `${origin}/pt/app/plugins?plugin=wechatai%2Fcloud-agent&action=create`,
        );
        await expect(page.getByRole("dialog")).toBeVisible();
      }
      // The intent is consumed, so a later deliberate visit can use the default locale.
      if (entry === "billing") {
        await page.locator(".site-language-trigger").click();
        await page.getByRole("menuitem", { name: "Chinês", exact: true }).click();
      } else {
        await page.goto(`${origin}/app/billing`);
      }
      await expect(
        page.getByRole("heading", { name: "会员与 credits", exact: true }),
      ).toBeVisible();
    });
  }
}

test("Portuguese payment return restores locale when session arrives after dashboard", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const snapshot = await fixture(page);
  snapshot.plan = "free";
  snapshot.planUntil = 0;
  let returning = false;
  await page.route("**/api/auth/get-session", async (route) => {
    if (returning) await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.fulfill({
      json: {
        user: { id: "fixture", name: "Alex", email: "alex@example.test" },
        session: { id: "session", userId: "fixture", token: "fixture" },
      },
    });
  });
  await page.route("**/api/billing/catalog", (route) =>
    route.fulfill({
      json: {
        mode: "test",
        offers: BILLING_OFFERS.map((offer) => ({
          ...offer,
          price: offer.amount / 100,
          currency: "cny",
          enabled: true,
        })),
      },
    }),
  );
  await page.route("**/api/billing/subscription", (route) => route.fulfill({ json: null }));
  const stripeUrl = "https://checkout.stripe.com/delayed-session-fixture";
  await page.route("**/api/billing/checkout", (route) => {
    expect(route.request().postDataJSON()).toEqual({ offerId: "plus_monthly" });
    return route.fulfill({ json: { url: stripeUrl } });
  });
  const suffix = "?checkout=cancelled&offer=plus_monthly#plans";
  await page.route(stripeUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<a href="${origin}/app/billing${suffix}">Return to workspace</a>`,
    }),
  );
  await page.goto(`${origin}/pt/app/plugins`);
  await page.getByRole("button", { name: "Configurar Xiaowei", exact: true }).click();
  await page.getByRole("button", { name: "Assinar Plus mensal", exact: true }).click();
  await expect(page).toHaveURL(stripeUrl);
  returning = true;
  await page.getByRole("link", { name: "Return to workspace", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/pt/app/billing${suffix}`);
  await expect(
    page.getByRole("heading", { name: "Assinatura e créditos", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  const back = page.getByRole("link", { name: "Voltar à configuração do plugin", exact: true });
  await expect(back).toHaveAttribute(
    "href",
    "/pt/app/plugins?plugin=wechatai%2Fcloud-agent&action=create",
  );
  await expect
    .poll(() =>
      page.evaluate(() => sessionStorage.getItem("wechatai:billing-return:alex@example.test")),
    )
    .toBeNull();
  await mkdir("test-results/pt-workspace", { recursive: true });
  await page.screenshot({
    path: "test-results/pt-workspace/delayed-session-return-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await back.click();
  await expect(page).toHaveURL(
    `${origin}/pt/app/plugins?plugin=wechatai%2Fcloud-agent&action=create`,
  );
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.goto(`${origin}/app/billing`);
  await expect(page.getByRole("heading", { name: "会员与 credits", exact: true })).toBeVisible();
});
