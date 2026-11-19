import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

// A real browser renders the shared LocaleProvider and switcher with one sample
// translation. The production build stays clean because this fixture is bundled
// here only, never imported from src/.
const origin = "http://i18n-switch.test";
let app: Buffer;

test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { MemoryRouter } from 'react-router-dom';
        import { LocaleProvider } from './src/client/locale';
        import { LanguageSwitcher } from './src/client/language-switcher';
        import { registerTranslations } from './src/shared/i18n';
        registerTranslations('en', [
          {
            path: '/pricing',
            title: 'Pricing | Wechatai',
            description: 'Plans for every WeChat AI workflow.',
            updatedAt: '2026-11-20',
          },
        ]);
        createRoot(document.getElementById('root')).render(
          <MemoryRouter initialEntries={[window.location.pathname]}>
            <LocaleProvider>
              <LanguageSwitcher />
            </LocaleProvider>
          </MemoryRouter>
        );
      `,
      resolveDir: fileURLToPath(new URL("../../", import.meta.url)),
      loader: "tsx",
    },
    bundle: true,
    format: "esm",
    write: false,
  });
  app = Buffer.from(result.outputFiles[0].contents);
});

test.beforeEach(async ({ page }) => {
  await page.route("**/*", async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/app.js") return route.fulfill({ body: app, contentType: "text/javascript" });
    if (pathname === "/pricing" || pathname === "/en/pricing")
      return route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="zh-CN"><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>',
      });
    return route.fulfill({ status: 404, body: "Not found" });
  });
});

test("switches between the Chinese page and its registered English counterpart", async ({
  page,
}) => {
  await page.goto(`${origin}/pricing`);
  const english = page.getByRole("link", { name: "English" });
  await expect(english).toHaveAttribute("href", "/en/pricing");
  await expect(english).toHaveAttribute("hreflang", "en");

  await english.click();
  await expect(page).toHaveURL(`${origin}/en/pricing`);
  const chinese = page.getByRole("link", { name: "中文" });
  await expect(chinese).toHaveAttribute("href", "/pricing");
  await expect(chinese).toHaveAttribute("hreflang", "zh-CN");

  await chinese.click();
  await expect(page).toHaveURL(`${origin}/pricing`);
  await expect(page.getByRole("link", { name: "English" })).toBeVisible();
});
