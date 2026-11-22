import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

const origin = "http://i18n-t4.test";
const root = fileURLToPath(new URL("../../", import.meta.url));
const path = "/compare/wechatai-vs-openclaw";
const assets = new Map<string, Buffer>();

test.beforeAll(async () => {
  // Run the real browser entry; replace only Vite's translation discovery with a T4 fixture.
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
              const description =
                'Compare Wechatai hosted chat with a self-hosted OpenClaw: keys, devices, deployment, group chat, and fees.';
              const englishPage = {
                path: '${path}',
                title: 'Wechatai vs Self-Hosted OpenClaw | Wechatai',
                description,
                updatedAt: '2026-11-20',
                content: {
                  path: '${path}',
                  kind: 'comparison',
                  title: 'Wechatai vs self-hosted OpenClaw',
                  description,
                  eyebrow: 'Wechatai × OpenClaw',
                  h1: 'Count runtime and upkeep as cost',
                  lede: 'Everyday conversation can run on hosted chat.',
                  answer: 'Hosted chat needs no always-on device.',
                  primaryKeyword: 'Wechatai vs OpenClaw',
                  secondaryKeywords: ['hosted or self-hosted'],
                  highlights: ['Five facts compared'],
                  sections: [{
                    id: 'facts',
                    title: 'Five facts',
                    body: 'Hosted chat handles ordinary model chat.',
                  }],
                  faq: [{
                    question: 'Does OpenClaw need a computer kept on?',
                    answer: 'The device running the agent must stay online.',
                  }],
                  related: [{ label: 'Pricing and free quota', href: '/pricing' }],
                  comparison: {
                    title: 'Five facts compared',
                    columns: ['Dimension', 'Wechatai', 'Self-hosted OpenClaw'],
                    rows: [{
                      label: 'Supports group chat',
                      values: ['No, ClawBot one-to-one only', null],
                    }],
                    note: 'A dash means no public source was verified.',
                  },
                  updatedAt: '2026-11-19',
                },
              };
              registerTranslations('en', [englishPage]);

              const japaneseTitle = '微伴と自前運用の OpenClaw を比較';
              const japaneseDescription = '微伴のホスト型チャットと自前運用の OpenClaw を比較します。';
              registerTranslations('ja', [{
                ...englishPage,
                title: japaneseTitle + ' | Wechatai',
                description: japaneseDescription,
                content: {
                  ...englishPage.content,
                  title: japaneseTitle,
                  description: japaneseDescription,
                  h1: japaneseTitle,
                },
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

test("the compare route renders registered English copy and switches through the language menu", async ({
  page,
}) => {
  const chineseTrigger = page.getByRole("button", { name: "语言：中文", exact: true });
  const english = page.getByRole("menuitem", { name: "English" });
  await page.goto(`${origin}${path}`);
  await chineseTrigger.click();
  await expect(english).toHaveAttribute("href", `/en${path}`);
  await english.click();

  await expect(page).toHaveURL(origin + `/en${path}`);
  await expect(page).toHaveTitle("Wechatai vs Self-Hosted OpenClaw | Wechatai");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", "en_US");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `https://wechatai.app/en${path}`,
  );
  await expect(
    page.getByRole("heading", { name: "Count runtime and upkeep as cost", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Five facts compared", level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "No, ClawBot one-to-one only" }),
  ).toBeVisible();
  await expect(page.getByText("A dash means no public source was verified.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Frequently asked questions", level: 2 }),
  ).toBeVisible();
  await expect(page.getByText("Does OpenClaw need a computer kept on?")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Check the requirements, then set up your WeChat AI" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Language: English", exact: true }).click();
  await page.getByRole("menuitem", { name: "中文" }).click();
  await expect(page).toHaveURL(origin + path);
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await chineseTrigger.click();
  await expect(english).toBeVisible();

  const japanese = page.getByRole("menuitem", { name: "日本語" });
  await expect(japanese).toHaveAttribute("href", `/ja${path}`);
  await expect(japanese).toHaveAttribute("hreflang", "ja-JP");
  await japanese.click();
  await expect(page).toHaveURL(origin + `/ja${path}`);
  await expect(page.locator("html")).toHaveAttribute("lang", "ja-JP");
  await expect(
    page.getByRole("heading", { name: "微伴と自前運用の OpenClaw を比較", level: 1 }),
  ).toBeVisible();
});
