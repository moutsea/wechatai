import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

// Exercise the published routes with their prerendered HTML and real application chunks.
const assets = new URL("../../dist/client/", import.meta.url);
const origin = "http://i18n-developer-pages.test";
const contentTypes: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
};

test.beforeEach(async ({ page }) => {
  await page.route("**/*", async (route) => {
    const { origin: requestOrigin, pathname } = new URL(route.request().url());
    if (requestOrigin !== origin) return route.abort();
    if (pathname === "/api/auth/get-session") return route.fulfill({ json: null });
    if (pathname.startsWith("/api/analytics/")) return route.fulfill({ status: 204 });
    const extension = extname(pathname);
    const filename = pathname.slice(1) + (extension ? "" : ".html");
    try {
      const body = await readFile(new URL(filename, assets));
      return route.fulfill({ body, contentType: contentTypes[extname(filename)] });
    } catch {
      return route.fulfill({ status: 404 });
    }
  });
});

async function switchLanguage(page: Page, current: string, target: string, destination: string) {
  await page.getByRole("button", { name: current, exact: true }).click();
  const item = page.getByRole("menuitem", { name: target, exact: true });
  await expect(item).toHaveAttribute("href", destination);
  const mounted = page.waitForRequest("**/api/auth/get-session");
  await item.click();
  await expect(page).toHaveURL(`${origin}${destination}`);
  await mounted;
}

test("switches the plugin protocol between Chinese and English after takeover", async ({ page }) => {
  const path = "/developers/plugins";
  const chinese = page.getByRole("heading", { name: /插件协议/, level: 1 });
  const mounted = page.waitForRequest("**/api/auth/get-session");
  await page.goto(`${origin}${path}`);
  await mounted;
  await expect(chinese).toBeVisible();
  await switchLanguage(page, "语言：中文", "English", `/en${path}`);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: /The plugin protocol/, level: 1 })).toBeVisible();
  const contents = page.getByRole("navigation", { name: "Plugin protocol contents" });
  await expect(contents.getByRole("link", { name: /Command routing/ })).toHaveAttribute(
    "href",
    "#commands",
  );
  await expect(page.getByRole("note").getByRole("link", { name: "Muse connection guide" })).toHaveAttribute(
    "href",
    "/en/developers/muse",
  );
  await expect(page.getByRole("link", { name: "Read the documentation" })).toHaveAttribute(
    "href",
    "/en/docs",
  );
  await expect(page.getByRole("button", { name: "Copy for your AI agent" })).toBeVisible();
  await switchLanguage(page, "Language: English", "中文", path);
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(chinese).toBeVisible();
});

for (const [kind, label] of [["openclaw", "OpenClaw"], ["hermes", "Hermes"], ["muse", "Muse"]]) {
  test(`keeps the ${label} guide and source link after takeover`, async ({ page }) => {
    const path = `/developers/${kind}`;
    const mounted = page.waitForRequest("**/api/auth/get-session");
    await page.goto(`${origin}/en${path}`);
    await mounted;
    await expect(page.getByRole("heading", { name: `${label} connection guide`, level: 1 })).toBeVisible();
    if (kind === "muse") {
      await expect(page.getByText(/Task replies can include up to 4 PNG, JPEG or WebP images/)).toBeVisible();
      await expect(page.getByText(/8 upload attempts per task/)).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "Markdown version" })).toHaveAttribute("href", `${path}.md`);
    await page.getByRole("button", { name: "Language: English", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "中文", exact: true })).toHaveAttribute("href", path);
  });
}
