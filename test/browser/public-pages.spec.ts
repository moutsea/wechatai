import { expect, test, type Route } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { createFakeApi } from "../support/fake-api";

// Run `pnpm build` first: these regressions depend on real code splitting and prerendering.
const assets = new URL("../../dist/client/", import.meta.url);
const origin = "http://public-pages.test";

test.beforeEach(async ({ page }) => {
  const fakeApi = createFakeApi();
  await page.route("**/*", async (route) => {
    const { pathname, search } = new URL(route.request().url());
    if (pathname.startsWith("/api/analytics/")) return route.fulfill({ status: 204 });
    if (pathname === "/api/auth/get-session") return route.fulfill({ json: null });
    if (pathname === "/api/auth/providers") return route.fulfill({ json: { providers: [] } });
    if (pathname === "/api/auth/email-config")
      return route.fulfill({ json: { delivery: "preview" } });
    if (pathname === "/api/referrals/attribution")
      return route.fulfill({ json: { active: false } });
    if (pathname === "/api/admin/access") return route.fulfill({ json: { isAdmin: false } });
    if (pathname.startsWith("/api/")) {
      return route.fulfill({ json: await fakeApi(pathname.slice(4) + search) });
    }
    const filename =
      pathname === "/" ? "index.html" : pathname.slice(1) + (extname(pathname) ? "" : ".html");
    try {
      const body = await readFile(new URL(filename, assets));
      const contentType =
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
          ".png": "image/png",
          ".webp": "image/webp",
        }[extname(filename)] ?? "application/octet-stream";
      return route.fulfill({ body, contentType });
    } catch {
      return route.fulfill({ status: 404, body: "Not found" });
    }
  });
});

for (const width of [390, 1280]) {
  for (const path of ["/", "/#how"]) {
    test(`preserves homepage reading state while the entry script loads: ${path} at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      let entry: Route | undefined;
      await page.route("**/assets/index-*.js", (route) => {
        entry = route;
      });
      // The entry module delays DOMContentLoaded, but the static document is already usable.
      await page.goto(`${origin}${path}`, { waitUntil: "commit" });
      await expect.poll(() => Boolean(entry)).toBe(true);
      const questions = page.locator(".landing-faq details");
      for (const question of [questions.nth(0), questions.nth(1)]) {
        await question.locator("summary").click();
      }
      const summary = questions.first().locator("summary");
      await summary.focus();
      const position = await page.evaluate(() => window.scrollY);
      expect(position).toBeGreaterThan(0);

      const mounted = page.waitForRequest("**/api/auth/get-session");
      await entry!.fallback();
      await mounted;
      // Include deferred effects and any delayed native or smooth anchor scrolling.
      await page.waitForTimeout(1000);
      for (const question of [questions.nth(0), questions.nth(1)]) {
        await expect(question).toHaveAttribute("open", "");
      }
      await expect(summary).toBeFocused();
      await expect(summary).toBeInViewport();
      expect(await page.evaluate(() => window.scrollY)).toBe(position);
      await page.keyboard.press("Enter");
      await expect(questions.first()).not.toHaveAttribute("open");
      await expect(questions.nth(1)).toHaveAttribute("open", "");

      // Later lazy navigation must not restore the homepage snapshot again.
      await page.locator(".landing-faq-more a").click();
      await expect(page).toHaveURL(`${origin}/docs/faq`);
      await expect(page.locator(".docs-page")).toBeVisible();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    });
  }

  test(`preserves homepage scrolling without a focused control at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    let entry: Route | undefined;
    await page.route("**/assets/index-*.js", (route) => {
      entry = route;
    });
    await page.goto(`${origin}/#how`, { waitUntil: "commit" });
    await expect(page.locator(".landing-faq")).toBeAttached();
    await expect.poll(() => Boolean(entry)).toBe(true);
    await page.evaluate(() => window.scrollTo({ top: 1600, behavior: "instant" }));
    await expect(page.locator("body")).toBeFocused();
    const mounted = page.waitForRequest("**/api/auth/get-session");
    await entry!.fallback();
    await mounted;
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => window.scrollY)).toBe(1600);
    await expect(page.locator("body")).toBeFocused();
  });

  test(`resolves the initial homepage anchor at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const mounted = page.waitForRequest("**/api/auth/get-session");
    await page.goto(`${origin}/#how`);
    await mounted;
    await expect(page.locator("#how")).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });

  test(`preserves homepage reading state when DOMContentLoaded follows React at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const views: unknown[] = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/api/analytics/page-view")) views.push(request.postDataJSON());
    });
    let entry: Route | undefined;
    let deferred: Route | undefined;
    await page.route(`${origin}/`, async (route) => {
      const html = await readFile(new URL("index.html", assets), "utf8");
      await route.fulfill({
        contentType: "text/html",
        body: html.replace("</head>", '<script defer src="/deferred.js"></script></head>'),
      });
    });
    await page.route(`${origin}/deferred.js`, (route) => {
      deferred = route;
    });
    await page.route("**/assets/index-*.js", (route) => {
      entry = route;
    });
    await page.goto(`${origin}/#how`, { waitUntil: "commit" });
    await expect.poll(() => Boolean(entry && deferred)).toBe(true);
    const question = page.locator(".landing-faq details").first();
    await question.locator("summary").click();
    const position = await page.evaluate(() => window.scrollY);
    const script = await readFile(
      new URL(new URL(entry!.request().url()).pathname.slice(1), assets),
      "utf8",
    );
    await entry!.fulfill({
      contentType: "text/javascript",
      body: `${script}\ndocument.body.dataset.entryEvaluated = "true";`,
    });
    // Hold DOMContentLoaded past the entry's initial React commit opportunity.
    // The marker is appended to the built entry without changing its application code.
    await expect(page.locator("body")).toHaveAttribute("data-entry-evaluated", "true");
    await expect.poll(() => views.length).toBe(1);
    await page.waitForTimeout(300);
    await deferred!.fulfill({ contentType: "text/javascript", body: "" });
    await page.waitForLoadState("load");
    await page.waitForTimeout(1000);
    await expect(question).toHaveAttribute("open", "");
    await expect(question.locator("summary")).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(position);
    expect(views).toHaveLength(1);
  });
}

test("keeps the prerendered article visible while its chunk loads and React mounts", async ({
  page,
}) => {
  let chunk: Route | undefined;
  await page.route("**/assets/docs-*.js", (route) => {
    chunk = route;
  });
  await page.goto(`${origin}/docs/getting-started#prepare`, { waitUntil: "domcontentloaded" });
  await expect.poll(() => Boolean(chunk)).toBe(true);
  const title = await page.locator("h1").innerText();
  await expect(page.locator(".full-state")).toHaveCount(0);
  // Catch even a brief fallback frame during the handoff to React.
  await page.evaluate(() => {
    document.body.dataset.lostArticle = "false";
    const observer = new MutationObserver(() => {
      if (!document.querySelector("#root h1")) document.body.dataset.lostArticle = "true";
    });
    observer.observe(document.getElementById("root")!, { childList: true, subtree: true });
  });
  const mounted = page.waitForRequest("**/api/auth/get-session");
  await chunk!.fallback();
  await mounted;
  await expect(page.locator("h1")).toHaveText(title);
  await expect(page.locator("body")).toHaveAttribute("data-lost-article", "false");
  await expect(page.locator("#prepare h2")).toBeInViewport();
  // The shared router and a second lazy route must work after initial preload.
  await page.locator('.site-header-nav a[href="/pricing"]').click();
  await expect(page).toHaveURL(`${origin}/pricing`);
  await expect(page.locator(".plans-grid .plan")).toHaveCount(3);
  await expect(page.locator(".plan-year .plan-price-unit")).toHaveText("/ 年");
  await expect(page.locator(".plan-year .plan-cta")).toHaveAttribute(
    "href",
    `/register?returnTo=${encodeURIComponent("/pricing?interval=year#plan-year")}`,
  );
});

test("keeps static content and links when the initial chunk fails, and reload recovers", async ({
  page,
}) => {
  let fail = true;
  await page.route("**/assets/docs-*.js", (route) => (fail ? route.abort() : route.fallback()));
  await page.goto(`${origin}/docs/getting-started`);
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("你仍可阅读正文和打开链接");
  await expect(page.locator("h1")).toHaveText("微信 AI 使用指南：配置 AI 渠道并扫码连接");
  await expect(page.locator('.site-header-nav a[href="/pricing"]')).toBeVisible();
  await expect(page.locator(".full-state")).toHaveCount(0);
  fail = false;
  const mounted = page.waitForRequest("**/api/auth/get-session");
  await alert.getByRole("button", { name: "重新加载页面" }).click();
  await mounted;
  await expect(alert).toHaveCount(0);
  await expect(page.locator("h1")).toHaveText("微信 AI 使用指南：配置 AI 渠道并扫码连接");
});

for (const { path, asset } of [
  { path: "/docs/getting-started", asset: "docs" },
  { path: "/docs/getting-started#prepare", asset: "docs" },
  { path: "/wechat-clawbot-models#compatibility", asset: "seo-landing" },
]) {
  test(`preserves reading position when a slow article becomes interactive: ${path}`, async ({
    page,
  }) => {
    let chunk: Route | undefined;
    await page.route(`**/assets/${asset}-*.js`, (route) => {
      chunk = route;
    });
    await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
    await expect.poll(() => Boolean(chunk)).toBe(true);
    await page.evaluate(() => window.scrollTo({ top: 1600, behavior: "instant" }));
    const mounted = page.waitForRequest("**/api/auth/get-session");
    await chunk!.fallback();
    await mounted;
    // Include deferred effects and smooth scrolling, which previously jumped back to the hash.
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => window.scrollY)).toBe(1600);
    // Later navigation must still resolve an anchor after the destination's lazy chunk loads.
    await page.locator('.site-header-nav a[href="/#how"]').click();
    await expect(page.locator("#how")).toBeInViewport();
    await page.goBack();
    await expect(page.locator("h1")).toBeVisible();
    if (path.includes("#"))
      await expect(page.locator(path.slice(path.indexOf("#")))).toBeInViewport();
  });
}

test("preserves expanded native details and keyboard focus when React takes over", async ({
  page,
}) => {
  let chunk: Route | undefined;
  await page.route("**/assets/seo-landing-*.js", (route) => {
    chunk = route;
  });
  await page.goto(`${origin}/wechat-clawbot-models`, { waitUntil: "domcontentloaded" });
  await expect.poll(() => Boolean(chunk)).toBe(true);
  const toc = page.locator(".seopage-toc");
  const advanced = page.locator(".seopage-details");
  const faq = page.locator(".seopage-faq details").first();
  for (const details of [toc, advanced, faq]) await details.locator("summary").click();
  await advanced.locator("summary").focus();
  await advanced.locator("li").last().scrollIntoViewIfNeeded();
  const position = await page.evaluate(() => window.scrollY);
  const mounted = page.waitForRequest("**/api/auth/get-session");
  await chunk!.fallback();
  await mounted;
  for (const details of [toc, advanced, faq]) await expect(details).toHaveAttribute("open", "");
  await expect(advanced.locator("summary")).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(position);
  await page.keyboard.press("Enter");
  await expect(advanced).not.toHaveAttribute("open");
});

test("adopts all typed estimate values, calculates from them and allows further edits", async ({
  page,
}) => {
  let chunk: Route | undefined;
  await page.route("**/assets/seo-landing-*.js", (route) => {
    chunk = route;
  });
  await page.goto(`${origin}/pricing#estimate`, { waitUntil: "domcontentloaded" });
  await expect.poll(() => Boolean(chunk)).toBe(true);
  const inputs = page.locator(".cost-fields input");
  const values = ["8500", "250", "3", "2", "8"];
  for (const [index, value] of values.entries()) await inputs.nth(index).fill(value);
  const mounted = page.waitForRequest("**/api/auth/get-session");
  await chunk!.fallback();
  await mounted;
  for (const [index, value] of values.entries()) await expect(inputs.nth(index)).toHaveValue(value);
  await expect(inputs.last()).toBeFocused();
  await expect(page.locator(".cost-results strong")).toHaveText(["6.3 credits", "约 ¥0.057"]);
  await inputs.nth(1).fill("500");
  await expect(page.locator(".cost-results strong")).toHaveText(["7.5 credits", "约 ¥0.063"]);
  await expect(inputs.first()).toHaveValue("8500");
  // A new mount after navigation must not replay the original handoff values.
  await page.locator('.site-header-nav a[href="/docs"]').click();
  await expect(page).toHaveURL(`${origin}/docs`);
  await expect(page.locator(".docs-page")).toBeVisible();
  await page.locator('.site-header-nav a[href="/pricing"]').click();
  await expect(inputs.first()).toHaveValue("1000");
  await expect(page.locator(".cost-results strong")).toHaveText(["18 credits", "填写单价后显示"]);
});

test("preserves cleared and zero estimate fields instead of substituting defaults", async ({
  page,
}) => {
  let chunk: Route | undefined;
  await page.route("**/assets/seo-landing-*.js", (route) => {
    chunk = route;
  });
  await page.goto(`${origin}/pricing#estimate`, { waitUntil: "domcontentloaded" });
  await expect.poll(() => Boolean(chunk)).toBe(true);
  const inputs = page.locator(".cost-fields input");
  const values = ["", "0", "0", "0", "0"];
  for (const [index, value] of values.entries()) await inputs.nth(index).fill(value);
  const mounted = page.waitForRequest("**/api/auth/get-session");
  await chunk!.fallback();
  await mounted;
  for (const [index, value] of values.entries()) await expect(inputs.nth(index)).toHaveValue(value);
  await expect(page.locator(".cost-results")).toContainText("请填写有效的非负数字");
  await inputs.first().fill("0");
  await expect(page.locator(".cost-results strong")).toHaveText(["0 credits", "约 ¥0"]);
});

for (const width of [390, 1280]) {
  for (const { scenario, query, path, fallback } of [
    {
      scenario: "filtered-out document",
      query: "联网",
      path: "/docs/getting-started",
      fallback: true,
    },
    { scenario: "remaining document", query: "联网", path: "/docs/ds-chat", fallback: false },
    {
      scenario: "empty search",
      query: "不可能匹配的关键词",
      path: "/docs/getting-started",
      fallback: true,
    },
    {
      scenario: "developer link",
      query: "不可能匹配的关键词",
      path: "/developers/plugins",
      fallback: false,
    },
  ]) {
    test(`restores navigation focus after filtering: ${scenario} at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      let chunk: Route | undefined;
      await page.route("**/assets/docs-*.js", (route) => {
        chunk = route;
      });
      await page.goto(`${origin}/docs/getting-started`, { waitUntil: "domcontentloaded" });
      await expect.poll(() => Boolean(chunk)).toBe(true);
      const navigation = page.locator(width === 390 ? ".docs-mobile-navigation" : ".docs-sidebar");
      if (width === 390) await navigation.locator("summary").click();
      const input = navigation.getByRole("searchbox");
      await input.fill(query);
      const link = navigation.locator(`a[href="${path}"]`);
      if (fallback) {
        // The static search has not filtered yet: Tab still reaches the first document.
        await page.keyboard.press("Tab");
        await page.keyboard.press("Tab");
      } else {
        await link.focus();
      }
      await expect(link).toBeFocused();
      const mounted = page.waitForRequest("**/api/auth/get-session");
      await chunk!.fallback();
      await mounted;
      await expect(input).toHaveValue(query);
      if (fallback) {
        await expect(link).toHaveCount(0);
        await expect(input).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(`${origin}/docs/getting-started`);
        // The same keyboard flow can now select a visible, intentional result.
        await input.fill("联网");
        await page.keyboard.press("Tab");
        await page.keyboard.press("Tab");
        await expect(navigation.locator('a[href="/docs/ds-chat"]')).toBeFocused();
      } else {
        // Surviving links retain their identity even when preceding groups disappear.
        await expect(link).toBeFocused();
      }
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(`${origin}${fallback ? "/docs/ds-chat" : path}`);
    });
  }

  test(`restores document search, filtering and caret at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let chunk: Route | undefined;
    await page.route("**/assets/docs-*.js", (route) => {
      chunk = route;
    });
    await page.goto(`${origin}/docs/getting-started`, { waitUntil: "domcontentloaded" });
    await expect.poll(() => Boolean(chunk)).toBe(true);
    const navigation = page.locator(width === 390 ? ".docs-mobile-navigation" : ".docs-sidebar");
    if (width === 390) await navigation.locator("summary").click();
    const input = navigation.getByRole("searchbox");
    await input.fill("插件");
    await input.evaluate((element: HTMLInputElement) =>
      element.setSelectionRange(0, 1, "backward"),
    );
    const mounted = page.waitForRequest("**/api/auth/get-session");
    await chunk!.fallback();
    await mounted;
    await expect(input).toHaveValue("插件");
    await expect(input).toBeFocused();
    expect(
      await input.evaluate((element: HTMLInputElement) => [
        element.selectionStart,
        element.selectionEnd,
        element.selectionDirection,
      ]),
    ).toEqual([0, 1, "backward"]);
    // A copied DOM value alone would leave these navigation results unfiltered.
    await expect(
      navigation.locator('.docs-nav-group a[href="/docs/wechat-connection"]'),
    ).toHaveCount(0);
    await expect(navigation.locator('.docs-nav-group a[href="/docs/ds-chat"]')).toBeVisible();
    await input.fill("不可能匹配的关键词");
    await expect(navigation.getByRole("status")).toContainText("没有匹配");
    await input.fill("");
    await expect(
      navigation.locator('.docs-nav-group a[href="/docs/wechat-connection"]'),
    ).toBeVisible();
    // The hidden desktop/mobile copy retains its independent initial state.
    const other = page.locator(width === 390 ? "#docs-search-desktop" : "#docs-search-mobile");
    await expect(other).toHaveValue("");
  });
}

test("preserves a scrolled sidebar and its visible keyboard target during handoff", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  let chunk: Route | undefined;
  await page.route("**/assets/docs-*.js", (route) => {
    chunk = route;
  });
  await page.goto(`${origin}/docs/getting-started`, { waitUntil: "domcontentloaded" });
  await expect.poll(() => Boolean(chunk)).toBe(true);
  const sidebar = page.locator(".docs-sidebar");
  const link = sidebar.locator('a[href="/docs/hermes-in-wechat"]');
  await sidebar.getByRole("searchbox").focus();
  for (let step = 0; step < 30; step++) {
    if (await link.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(link).toBeFocused();
  await expect(link).toBeInViewport({ ratio: 1 });
  const scroll = await sidebar.evaluate((element) => element.scrollTop);
  expect(scroll).toBeGreaterThan(0);
  const position = await page.evaluate(() => window.scrollY);
  const mounted = page.waitForRequest("**/api/auth/get-session");
  await chunk!.fallback();
  await mounted;
  await expect(link).toBeFocused();
  await expect(link).toBeInViewport({ ratio: 1 });
  expect(await sidebar.evaluate((element) => element.scrollTop)).toBe(scroll);
  expect(await page.evaluate(() => window.scrollY)).toBe(position);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`${origin}/docs/hermes-in-wechat`);
});

for (const { name, width, path, selector, axis } of [
  {
    name: "sidebar",
    width: 1280,
    path: "/docs/getting-started",
    selector: ".docs-sidebar",
    axis: "scrollTop",
  },
  {
    name: "wide table",
    width: 390,
    path: "/docs/commands",
    selector: ".docs-table-scroll",
    axis: "scrollLeft",
  },
] as const) {
  test(`preserves a scrolled ${name} without moving focus`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    let chunk: Route | undefined;
    await page.route("**/assets/docs-*.js", (route) => {
      chunk = route;
    });
    await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
    await expect.poll(() => Boolean(chunk)).toBe(true);
    const container = page.locator(selector).first();
    await container.scrollIntoViewIfNeeded();
    await container.evaluate((element, property) => {
      element[property] = 80;
    }, axis);
    const scroll = await container.evaluate((element, property) => element[property], axis);
    expect(scroll).toBeGreaterThan(0);
    const position = await page.evaluate(() => window.scrollY);
    const mounted = page.waitForRequest("**/api/auth/get-session");
    await chunk!.fallback();
    await mounted;
    expect(await container.evaluate((element, property) => element[property], axis)).toBe(scroll);
    expect(await page.evaluate(() => window.scrollY)).toBe(position);
    await expect(page.locator("body")).toBeFocused();
  });
}

for (const { scenario, path, keepReading } of [
  { scenario: "filtered-out target", path: "/docs/hermes-in-wechat", keepReading: false },
  { scenario: "reordered target", path: "/docs/deepseek-in-wechat", keepReading: false },
  { scenario: "offscreen target while reading", path: "/docs/hermes-in-wechat", keepReading: true },
]) {
  test(`handles scrolled mobile navigation during handoff: ${scenario}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let chunk: Route | undefined;
    await page.route("**/assets/docs-*.js", (route) => {
      chunk = route;
    });
    await page.goto(`${origin}/docs/getting-started`, { waitUntil: "domcontentloaded" });
    await expect.poll(() => Boolean(chunk)).toBe(true);
    const navigation = page.locator(".docs-mobile-navigation");
    await navigation.locator("summary").click();
    const input = navigation.getByRole("searchbox");
    await input.fill("联网");
    const link = navigation.locator(`a[href="${path}"]`);
    for (let step = 0; step < 30; step++) {
      if (await link.evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press("Tab");
    }
    await expect(link).toBeFocused();
    await expect(link).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    if (keepReading) {
      await page.evaluate(() => window.scrollTo({ top: 1600, behavior: "instant" }));
      await expect(link).not.toBeInViewport();
    }
    const mounted = page.waitForRequest("**/api/auth/get-session");
    await chunk!.fallback();
    await mounted;
    const target = path === "/docs/hermes-in-wechat" ? input : link;
    await expect(target).toBeFocused();
    if (keepReading) {
      expect(await page.evaluate(() => window.scrollY)).toBe(1600);
    } else {
      await expect(target).toBeInViewport({ ratio: 1 });
      // Intersection alone cannot detect an element hidden behind the sticky header.
      expect(
        await target.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
          );
        }),
      ).toBe(true);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(
        `${origin}${path === "/docs/hermes-in-wechat" ? "/docs/getting-started" : path}`,
      );
    }
  });
}

test("records the original campaign and landing page before early registration navigation", async ({
  page,
}) => {
  const views: Array<{ pathname: string; utmSource: string; sessionId: string }> = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/analytics/page-view")) views.push(request.postDataJSON());
  });
  let chunk: Route | undefined;
  await page.route("**/assets/docs-*.js", (route) => {
    chunk = route;
  });
  await page.goto(`${origin}/docs/getting-started?utm_source=newsletter`, {
    waitUntil: "domcontentloaded",
  });
  await expect.poll(() => Boolean(chunk)).toBe(true);
  await expect.poll(() => views.length).toBe(1);
  await page.locator('.site-header-account a[href="/register"]').click();
  await expect(page.locator("form")).toBeVisible();
  await expect.poll(() => views.length).toBe(2);
  expect(views.map(({ pathname, utmSource }) => ({ pathname, utmSource }))).toEqual([
    { pathname: "/docs/getting-started", utmSource: "newsletter" },
    { pathname: "/register", utmSource: "newsletter" },
  ]);
  expect(views[1]!.sessionId).toBe(views[0]!.sessionId);
});

for (const privacy of ["none", "dnt", "gpc", "hidden"] as const) {
  test(`dedupes the static page handoff and respects privacy/visibility (${privacy})`, async ({
    page,
  }) => {
    await page.addInitScript((setting) => {
      if (setting === "dnt") Object.defineProperty(navigator, "doNotTrack", { value: "1" });
      if (setting === "gpc")
        Object.defineProperty(navigator, "globalPrivacyControl", { value: true });
      if (setting === "hidden")
        Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    }, privacy);
    const views: unknown[] = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/api/analytics/page-view")) views.push(request.postDataJSON());
    });
    let chunk: Route | undefined;
    await page.route("**/assets/docs-*.js", (route) => {
      chunk = route;
    });
    await page.goto(`${origin}/docs/getting-started?utm_source=newsletter`, {
      waitUntil: "domcontentloaded",
    });
    await expect.poll(() => Boolean(chunk)).toBe(true);
    if (privacy === "none") await expect.poll(() => views.length).toBe(1);
    else {
      expect(views).toHaveLength(0);
      expect(await page.evaluate(() => sessionStorage.getItem("wechatai:attribution"))).toBeNull();
    }
    if (privacy === "hidden") {
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
          value: "visible",
          configurable: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await expect.poll(() => views.length).toBe(1);
    }
    const mounted = page.waitForRequest("**/api/auth/get-session");
    await chunk!.fallback();
    await mounted;
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.waitForTimeout(200);
    expect(views).toHaveLength(privacy === "dnt" || privacy === "gpc" ? 0 : 1);
  });
}

test("positions article anchors after navigating between lazy routes", async ({ page }) => {
  const mounted = page.waitForRequest("**/api/auth/get-session");
  await page.goto(`${origin}/wechat-clawbot-models`);
  await mounted;
  let chunk: Route | undefined;
  await page.route("**/assets/docs-*.js", (route) => {
    chunk = route;
  });
  await page.locator('a[href="/docs/getting-started"]').first().click();
  await expect.poll(() => Boolean(chunk)).toBe(true);
  await chunk!.fallback();
  await expect(page.locator("h1")).toHaveText("微信 AI 使用指南：配置 AI 渠道并扫码连接");
  await page.locator('a[href="/docs/wechat-connection#connect"]').first().click();
  await expect(page.locator("#connect h2")).toBeInViewport();
});

test.describe("static public pages", () => {
  test.use({ javaScriptEnabled: false });
  for (const width of [390, 1280]) {
    test(`includes guide and pricing styles without JavaScript at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const kind of ["openclaw", "hermes"]) {
        await page.goto(`${origin}/developers/${kind}`);
        const article = await page.locator(".guide-article").boundingBox();
        expect(article!.x).toBeGreaterThan(0);
        expect(article!.width).toBeLessThanOrEqual(780);
        await expect(page.locator(".guide-article h2").first()).toHaveCSS("margin-top", "40px");
      }
      await page.goto(`${origin}/pricing`);
      const columns = await page
        .locator(".plans-grid")
        .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
      expect(columns).toBe(width === 390 ? 1 : 3);
      await expect(page.locator(".plan").first()).toHaveCSS("padding-top", "22px");
    });
  }
  test("keeps advanced troubleshooting collapsed and usable without JavaScript", async ({
    page,
  }) => {
    await page.goto(`${origin}/wechat-clawbot-models#compatibility`);
    const details = page.locator(".seopage-details");
    await expect(details.locator("ul")).not.toBeVisible();
    await details.locator("summary").click();
    await expect(details.locator("ul")).toBeVisible();
  });
});

for (const width of [390, 1280]) {
  test(`links the model tutorial to Muse hosted setup at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(origin);
    await page.locator(".hero-how").click();
    await expect(page).toHaveURL(`${origin}/#how`);
    await page.locator('#how a[href="/wechat-agent"]').click();
    await expect(page).toHaveURL(`${origin}/wechat-agent`);
    await page.locator('.seopage-related a[href="/developers/muse"]').click();
    await expect(page).toHaveURL(`${origin}/developers/muse`);
    await expect(page.locator("h1")).toHaveText("Muse 接入指南");
  });
}

for (const authenticated of [true, false]) {
  test(`preserves the setup destination while session is pending (${authenticated})`, async ({
    page,
  }) => {
    let sessionRequest: Route | undefined;
    await page.route("**/api/auth/get-session", (route) => {
      sessionRequest = route;
    });
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await expect.poll(() => Boolean(sessionRequest)).toBe(true);
    await page.locator(".hero-actions a").first().click();
    await expect(page).toHaveURL(`${origin}/register?returnTo=%2Fapp`);
    const user = {
      id: "public-test",
      name: "Test user",
      email: "test@example.test",
      emailVerified: true,
    };
    await sessionRequest!.fulfill({
      json: authenticated
        ? {
            user,
            session: {
              id: "public-session",
              token: "test-token",
              userId: user.id,
              expiresAt: new Date(Date.now() + 86400000).toISOString(),
            },
          }
        : null,
    });
    if (authenticated) {
      await expect(page).toHaveURL(`${origin}/app`);
      await expect(page.locator("h1")).toContainText("你好");
    } else {
      await expect(page.locator("form")).toBeVisible();
      await expect(page.getByRole("link", { name: "去登录" })).toHaveAttribute("href", "/login");
    }
  });
}

test("keeps one mobile Plus card with the selected price and purchase link", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/`);
  const visiblePlans = page.locator(".landing-plan:visible");
  await expect(visiblePlans).toHaveCount(2);
  const plus = page.locator(".landing-plan-mobile-plus");
  await expect(plus.locator("h3")).toHaveText("Plus 年付");
  await expect(plus.locator(".landing-plan-price")).toHaveText("¥88/ 年");
  await expect(plus.locator(".landing-plan-action")).toHaveAttribute(
    "href",
    "/pricing?interval=year#plan-year",
  );
  const monthly = plus.getByRole("button", { name: "月付", exact: true });
  await monthly.focus();
  await page.keyboard.press("Enter");
  await expect(monthly).toHaveAttribute("aria-pressed", "true");
  await expect(plus.locator("h3")).toHaveText("Plus 月付");
  await expect(plus.locator(".landing-plan-price")).toHaveText("¥9.9/ 月");
  await expect(plus.locator(".landing-plan-action")).toHaveAttribute(
    "href",
    "/pricing?interval=month#plan-month",
  );
  await plus.getByRole("button", { name: "年付 · 更划算" }).click();
  await plus.locator(".landing-plan-action").click();
  await expect(page.locator("#plan-year h3")).toBeInViewport();
  await expect(page.locator("#plan-year .plan-cta")).toBeInViewport();
  await expect(page.locator(".plan-year .plan-price-unit")).toHaveText("/ 年");
  await expect(page.locator(".plan-year .plan-cta")).toHaveAttribute(
    "href",
    `/register?returnTo=${encodeURIComponent("/pricing?interval=year#plan-year")}`,
  );
  await page.goto(`${origin}/`);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(visiblePlans).toHaveCount(3);
  await expect(page.locator(".landing-plan-month").first()).toBeVisible();
  await expect(page.locator(".landing-plan-year").first()).toBeVisible();
});

for (const interval of ["month", "year"]) {
  test(`returns mobile buyers to the ${interval} card after signing in`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const destination = `/pricing?interval=${interval}#plan-${interval}`;
    let signedIn = false;
    const user = {
      id: "pricing-buyer",
      name: "Buyer",
      email: "buyer@example.test",
      emailVerified: true,
    };
    const session = {
      id: "pricing-session",
      token: "pricing-token",
      userId: user.id,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    };
    await page.route("**/api/auth/get-session*", (route) =>
      route.fulfill({ json: signedIn ? { user, session } : null }),
    );
    await page.route("**/api/auth/sign-in/email", (route) => {
      signedIn = true;
      return route.fulfill({ json: { redirect: false, token: session.token, user } });
    });
    await page.goto(`${origin}${destination}`);
    const card = page.locator(`#plan-${interval}`);
    await expect(card.locator("h3")).toBeInViewport();
    await expect(card.locator(".plan-cta")).toBeInViewport();
    await card.locator(".plan-cta").click();
    await expect(page).toHaveURL(`${origin}/register?returnTo=${encodeURIComponent(destination)}`);
    const login = page.getByRole("link", { name: "去登录" });
    await expect(login).toHaveAttribute(
      "href",
      `/login?returnTo=${encodeURIComponent(destination)}`,
    );
    await login.click();
    await expect(page).toHaveURL(`${origin}/login?returnTo=${encodeURIComponent(destination)}`);
    const submit = page.getByRole("button", { name: "登录工作台", exact: true });
    await expect(submit).toBeVisible();
    await page.locator('input[type="email"]').fill(user.email);
    await page.locator('input[type="password"]').fill("test-password");
    await submit.click();
    await expect(page).toHaveURL(`${origin}${destination}`);
    await expect(card.locator("h3")).toBeInViewport();
    await expect(card.locator("button.plan-cta")).toBeInViewport();
    await expect(card.locator("button.plan-cta")).toBeEnabled();
  });
}
