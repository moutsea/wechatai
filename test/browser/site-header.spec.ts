import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

const assets = new Map<string, Uint8Array>();
test.beforeAll(async () => {
  // Render the real header and styles; only authentication and API data are fixtures.
  const result = await build({
    stdin: {
      contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { MemoryRouter } from 'react-router-dom';
        import { SiteHeader } from './src/client/site-header';
        import './src/client/styles.css';
        createRoot(document.getElementById('root')).render(
          <MemoryRouter><SiteHeader /><main style={{height: 2000}}>Page content</main></MemoryRouter>
        );
      `,
      resolveDir: fileURLToPath(new URL("../../", import.meta.url)),
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
    if (path === "/")
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
