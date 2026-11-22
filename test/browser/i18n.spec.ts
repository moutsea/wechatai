import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

const origin = "http://i18n-switch.test";
const root = fileURLToPath(new URL("../../", import.meta.url));
const assets = new Map<string, Buffer>();

test.beforeAll(async () => {
  // Run the real browser entry; replace only Vite's translation discovery with a test registration.
  const result = await build({
    absWorkingDir: root,
    entryPoints: ["src/client/main.tsx"],
    outfile: "app.js",
    bundle: true,
    format: "esm",
    loader: { ".md": "text" },
    write: false,
    plugins: [
      {
        name: "translation-fixture",
        setup(builder) {
          builder.onResolve({ filter: /\/shared\/i18n\/load$/ }, () => ({
            path: "translations",
            namespace: "fixture",
          }));
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            resolveDir: root,
            contents: `
              import { registerTranslations } from './src/shared/i18n';
              import developerPages from './src/shared/i18n/en/developer-pages';
              import docsPages from './src/shared/i18n/en/docs';
              registerTranslations('en', developerPages);
              registerTranslations('en', docsPages);
              registerTranslations('en', [{
                path: '/pricing',
                title: 'Pricing | Wechatai',
                description: 'Plans for every WeChat AI workflow.',
                updatedAt: '2026-11-20',
              }]);
            `,
          }));
        },
      },
    ],
  });
  for (const asset of result.outputFiles) {
    assets.set(`/${basename(asset.path)}`, Buffer.from(asset.contents));
  }
});

test.beforeEach(async ({ page }) => {
  await page.route("**/*", async (route) => {
    const { pathname } = new URL(route.request().url());
    const asset = assets.get(pathname);
    if (asset)
      return route.fulfill({
        body: asset,
        contentType: pathname.endsWith(".css") ? "text/css" : "text/javascript",
      });
    if (pathname === "/api/auth/get-session") return route.fulfill({ json: null });
    if (pathname.startsWith("/api/analytics/")) return route.fulfill({ status: 204 });
    if (route.request().resourceType() === "document")
      return route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="zh-CN"><head><link rel="stylesheet" href="/app.css"></head><body><div id="root"><h1>Before application takeover</h1></div><script type="module" src="/app.js"></script></body></html>',
      });
    return route.fulfill({ status: 404, body: "Not found" });
  });
});

test("the application takes over a registered route and switches back to Chinese", async ({
  page,
}) => {
  const chineseHeading = page.getByRole("heading", { name: "免费开始，按需升级 Plus" });
  const englishHeading = page.getByRole("heading", {
    name: "Start free, upgrade to Plus when you need more",
  });
  await page.goto(`${origin}/pricing`);
  const chineseTrigger = page.getByRole("button", { name: "语言：中文", exact: true });
  await expect(chineseTrigger).toContainText("中文");
  await expect(chineseTrigger).toHaveAttribute("aria-haspopup", "menu");
  await expect(chineseTrigger).toHaveAttribute("aria-expanded", "false");
  await chineseTrigger.click();
  const english = page.getByRole("menuitem", { name: "English" });
  await expect(english).toHaveAttribute("href", "/en/pricing");
  await expect(english).toHaveAttribute("hreflang", "en");
  await expect(page.getByRole("menuitem", { name: "中文" })).toHaveAttribute(
    "aria-current",
    "true",
  );

  await english.click();
  await expect(page).toHaveURL(`${origin}/en/pricing`);
  await expect(englishHeading).toBeVisible();
  await expect(page).toHaveTitle("Pricing | Wechatai");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", "en_US");

  const englishTrigger = page.getByRole("button", { name: "Language: English", exact: true });
  await expect(englishTrigger).toContainText("English");
  await englishTrigger.click();
  const chinese = page.getByRole("menuitem", { name: "中文" });
  await expect(chinese).toHaveAttribute("href", "/pricing");
  await expect(chinese).toHaveAttribute("hreflang", "zh-CN");
  await expect(page.getByRole("menuitem", { name: "English" })).toHaveAttribute(
    "aria-current",
    "true",
  );

  await chinese.click();
  await expect(page).toHaveURL(`${origin}/pricing`);
  await expect(chineseHeading).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", "zh_CN");
  await expect(page.getByRole("button", { name: "语言：中文", exact: true })).toContainText("中文");
});

test("the language menu is fully operable from the keyboard", async ({ page }) => {
  await page.goto(`${origin}/pricing`);
  const trigger = page.getByRole("button", { name: "语言：中文", exact: true });
  await trigger.focus();
  await expect(trigger).toBeFocused();

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

test("developer pages render English bodies and localized links after takeover", async ({
  page,
}) => {
  await page.goto(`${origin}/developers/plugins`);
  await expect(page.getByRole("heading", { name: /插件协议/ })).toBeVisible();
  await page.getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(`${origin}/en/developers/plugins`);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: /The plugin protocol/ })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Plugin protocol contents" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Muse connection guide/ })).toHaveAttribute(
    "href",
    "/en/developers/muse",
  );
  await expect(page.getByRole("link", { name: /Read the documentation/ })).toHaveAttribute(
    "href",
    "/en/docs",
  );
  await expect(page.getByRole("button", { name: /Copy for your AI agent/ })).toBeVisible();

  await page.getByRole("link", { name: "中文" }).click();
  await expect(page).toHaveURL(`${origin}/developers/plugins`);
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByRole("heading", { name: /插件协议/ })).toBeVisible();

  await page.goto(`${origin}/en/developers/openclaw`);
  await expect(
    page.getByRole("heading", { name: "OpenClaw connection guide" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Markdown version" })).toHaveAttribute(
    "href",
    "/developers/openclaw.md",
  );
  await expect(page.getByRole("link", { name: "中文" })).toHaveAttribute(
    "href",
    "/developers/openclaw",
  );
});

test("an unregistered pricing locale shows 404 without the published language links", async ({
  page,
}) => {
  // Only English pricing is registered; the page under the Japanese prefix is not published.
  await page.goto(`${origin}/ja/pricing`);
  await expect(page.getByRole("heading", { name: "这个页面没有找到。" })).toBeVisible();
  await expect(page.locator(".site-header a[hreflang]")).toHaveCount(0);
});
