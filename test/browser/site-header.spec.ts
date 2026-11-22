import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));

const assets = new Map<string, Uint8Array>();
test.beforeAll(async () => {
  // Render the real header and styles; only authentication, translations and API data are fixtures.
  const result = await build({
    stdin: {
      contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { MemoryRouter } from 'react-router-dom';
        import { SiteHeader } from './src/client/site-header';
        import { LocaleProvider } from './src/client/locale';
        import { registerTranslations } from './src/shared/i18n';
        import './src/client/styles.css';
        const pages = [
          { path: '/', title: 'Home | Wechatai', description: 'Home', updatedAt: '2026-11-20' },
          { path: '/pricing', title: 'Pricing | Wechatai', description: 'Pricing', updatedAt: '2026-11-20' },
          { path: '/docs', title: 'Docs | Wechatai', description: 'Docs', updatedAt: '2026-11-20' },
        ];
        registerTranslations('en', pages);
        registerTranslations('ja', pages);
        createRoot(document.getElementById('root')).render(
          <MemoryRouter initialEntries={[window.location.pathname + window.location.hash]}>
            <LocaleProvider>
              <SiteHeader /><main style={{height: 2000}}>Page content</main>
            </LocaleProvider>
          </MemoryRouter>
        );
      `,
      resolveDir: root,
      loader: "tsx",
    },
    outfile: "app.js",
    bundle: true,
    format: "esm",
    write: false,
    plugins: [
      {
        name: "authenticated-user",
        setup(builder) {
          builder.onResolve({ filter: /^\.\/auth$/ }, () => ({
            path: "auth",
            namespace: "fixture",
          }));
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: `
          const session = {user: {id: 'layout-test', name: '测试管理员', email: 'layout@example.test'}};
          const refetch = async () => {};
          export const useAuth = () => ({data: session, isPending: false, refetch});
          export const authClient = {signOut: async () => ({})};
        `,
          }));
        },
      },
    ],
  });
  for (const asset of result.outputFiles) assets.set(`/${basename(asset.path)}`, asset.contents);
});

test.beforeEach(async ({ page }) => {
  // No application server, credentials or production requests are needed for layout checks.
  await page.route("**/*", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (["/", "/pricing", "/docs"].includes(path))
      return route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script>',
      });
    const asset = assets.get(path);
    if (asset)
      return route.fulfill({
        contentType: path.endsWith(".css") ? "text/css" : "text/javascript",
        body: Buffer.from(asset),
      });
    if (path === "/api/admin/access") return route.fulfill({ json: { isAdmin: true } });
    if (path === "/api/dashboard")
      return route.fulfill({
        json: { plan: "free", planUntil: 0, wallet: { balance: 100 } },
      });
    return route.abort();
  });
});

async function openMenu(page: Page) {
  await page.getByRole("button", { name: "用户菜单", exact: true }).click();
  await expect(page.getByRole("link", { name: "管理后台", exact: true })).toBeVisible();
}

async function expectMenuInViewport(page: Page) {
  const bounds = await page.getByRole("dialog", { name: "账户菜单", exact: true }).boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds).not.toBeNull();
  expect(bounds!.width).toBeGreaterThan(0);
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
}

for (const width of [320, 360, 375, 390, 820, 821, 1280]) {
  test(`account menu stays inside a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("http://layout.test/");
    await openMenu(page);
    await expectMenuInViewport(page);
    await expect(page.getByRole("link", { name: "进入工作台", exact: true })).toBeInViewport();
    await expect(page.getByRole("link", { name: "管理后台", exact: true })).toBeInViewport();
    await expect(page.getByRole("button", { name: "退出登录", exact: true })).toBeInViewport();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "账户菜单", exact: true })).toHaveCount(0);
  });
}

test("the menu fits a short viewport after scrolling and can scroll to sign out", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 320 });
  await page.goto("http://layout.test/");
  await page.evaluate(() => window.scrollTo(0, 600));
  await openMenu(page);
  await expectMenuInViewport(page);
  const signOut = page.getByRole("button", { name: "退出登录", exact: true });
  await signOut.scrollIntoViewIfNeeded();
  await expect(signOut).toBeInViewport();
  await signOut.click();
});

for (const [path, label] of [
  ["/", "首页"],
  ["/#how", "如何使用"],
  ["/pricing", "价格"],
  ["/docs", "文档"],
]) {
  test(`mobile navigation closes when selecting the current destination ${path}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`http://layout.test${path}`);
    for (const keyboard of [false, true]) {
      const toggle = page.getByRole("button", { name: "打开菜单", exact: true });
      await toggle.click();
      const menu = page.locator(".site-mobile-menu");
      const link = menu.getByRole("link", { name: label, exact: true });
      await expect(link).toBeVisible();
      if (keyboard) {
        await link.focus();
        await page.keyboard.press("Enter");
      } else await link.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(menu).toBeHidden();
    }
  });
}

test("language dropdown keeps the desktop header height and closes on outside press", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto("http://layout.test/pricing");
  const header = page.locator(".site-header");
  const baseline = (await header.boundingBox())!.height;
  const trigger = page.getByRole("button", { name: "语言：中文", exact: true });
  await expect(trigger).toContainText("中文");
  await expect(trigger).toHaveAttribute("aria-haspopup", "menu");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("menuitem")).toHaveCount(0);

  await trigger.click();
  const menu = page.getByRole("menu", { name: "语言", exact: true });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveCount(3);
  await expect(menu.locator('[role="menuitem"][aria-current="true"]')).toHaveText("中文");
  const expanded = (await header.boundingBox())!.height;
  expect(expanded).toBe(baseline);
  expect(expanded).toBeLessThanOrEqual(65);

  await page.locator("main").click({ position: { x: 8, y: 8 } });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toHaveCount(0);

  await trigger.click();
  await expect(menu).toBeVisible();
  await trigger.click();
  await expect(menu).toHaveCount(0);
});

test("language trigger is reachable with Tab and fully operable from the keyboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto("http://layout.test/pricing");
  const trigger = page.getByRole("button", { name: "语言：中文", exact: true });

  let reached = false;
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab");
    if (await trigger.evaluate((node) => node === document.activeElement)) {
      reached = true;
      break;
    }
  }
  expect(reached).toBe(true);
  expect(await trigger.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe("solid");

  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "中文" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "English" })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("menuitem", { name: "中文" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("menuitem")).toHaveCount(0);

  await page.keyboard.press("Space");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
});

test("language menu fits the 390px drawer and the first Escape only closes the menu", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://layout.test/pricing");
  const toggle = page.getByRole("button", { name: "打开菜单", exact: true });
  await toggle.click();
  const drawer = page.locator(".site-mobile-menu");
  const trigger = drawer.getByRole("button", { name: "语言：中文", exact: true });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const menu = drawer.getByRole("menu", { name: "语言", exact: true });
  await expect(menu).toBeVisible();
  const items = menu.getByRole("menuitem");
  await expect(items).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    await items.nth(index).scrollIntoViewIfNeeded();
    await expect(items.nth(index)).toBeInViewport();
  }
  const overflow = await page.evaluate(() => {
    const documentElement = document.documentElement;
    const drawerElement = document.querySelector(".site-mobile-menu")!;
    return {
      page: documentElement.scrollWidth - documentElement.clientWidth,
      drawer: drawerElement.scrollWidth - drawerElement.clientWidth,
    };
  });
  expect(overflow.page).toBeLessThanOrEqual(0);
  expect(overflow.drawer).toBeLessThanOrEqual(0);

  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(drawer).toBeVisible();
  await expect(
    page.getByRole("button", { name: "关闭菜单", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});
