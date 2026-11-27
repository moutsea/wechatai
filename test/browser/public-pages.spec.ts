import { expect, test, type Page, type Route } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import { runnerImport } from "vite";
import type * as LocaleExpectations from "../../scripts/locale-expectations";
import { createFakeApi } from "../support/fake-api";

// Run `pnpm build` first: these regressions depend on real code splitting and prerendering.
const assets = new URL("../../dist/client/", import.meta.url);
const origin = "http://public-pages.test";
const {
  module: { alternateLinks, locale404Probes, localePageGroups },
} = await runnerImport<typeof LocaleExpectations>(
  fileURLToPath(new URL("../../scripts/locale-expectations.ts", import.meta.url)),
);

const portugueseLanguageNames: Record<string, string> = {
  "zh-CN": "Chinês",
  en: "Inglês",
  "ja-JP": "Japonês",
  "ko-KR": "Coreano",
  es: "Espanhol",
};

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
      try {
        const body = await readFile(new URL("404.html", assets));
        return route.fulfill({ status: 404, body, contentType: "text/html" });
      } catch {
        return route.fulfill({ status: 404, body: "Not found" });
      }
    }
  });
});

/** Resolves once the app has mounted on `url`, which then asks for the session. */
const appMounted = (page: Page, url: string) =>
  page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === "/api/auth/get-session" && request.frame().url() === url,
  );

/** Switcher endonyms (中文, 日本語) are page chrome, not page copy. */
function withoutSwitcherLabels(text: string) {
  return text.replaceAll("中文", "").replaceAll("日本語", "");
}

function languageTriggerName(htmlLang: string, label: string) {
  if (htmlLang === "ko-KR") return `언어：${label}`;
  if (htmlLang === "ja-JP") return `言語：${label}`;
  if (htmlLang === "en") return `Language: ${label}`;
  if (htmlLang === "pt-BR" || htmlLang === "es") return `Idioma：${label}`;
  return `语言：${label}`;
}
const portugueseTrigger = languageTriggerName("pt-BR", "Português");

/** Chinese source strings that must never reach a Japanese page. */
const CHINESE_RESIDUE =
  /免费开始|价格与方案|常见问题|还有疑问|额度怎么用|会员费|微伴|页面未找到|继续了解|估算我的每日用量/;

for (const group of localePageGroups) {
  // Keep the Chinese homepage/pricing regressions and cover both sides of each registered group.
  if (group.length === 1 && !["/", "/pricing"].includes(group[0].path)) continue;
  for (const expected of group) {
    test(`serves ${expected.path} with ${expected.htmlLang} metadata and published alternatives`, async ({
      page,
    }) => {
      const mounted = page.waitForRequest("**/api/auth/get-session");
      const response = await page.goto(`${origin}${expected.path}`);
      expect(response?.status()).toBe(200);
      await mounted;
      await expect(page.locator("html")).toHaveAttribute("lang", expected.htmlLang);
      await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute(
        "content",
        expected.ogLocale,
      );
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", expected.canonical);
      const alternates = page.locator('link[rel="alternate"][hreflang]');
      const links = alternateLinks(group);
      await expect(alternates).toHaveCount(links.length);
      for (const [lang, href] of links) {
        await expect(alternates.and(page.locator(`[hreflang="${lang}"]`))).toHaveAttribute(
          "href",
          href,
        );
      }
      const switchers = page.locator(".site-language");
      const switcher = switchers.filter({ visible: true });
      const targets = group.filter((target) => target !== expected);
      await expect(targets.length ? switcher : switchers).toHaveCount(targets.length ? 1 : 0);
      if (targets.length) {
        const trigger = switcher.getByRole("button", {
          name: languageTriggerName(expected.htmlLang, expected.label),
          exact: true,
        });
        await expect(trigger).toContainText(expected.label);
        await expect(trigger).toHaveAttribute("aria-haspopup", "menu");
        await expect(trigger).toHaveAttribute("aria-expanded", "false");
        // Closed menu items do not exist, so they cannot receive Tab focus.
        await expect(switcher.locator("a")).toHaveCount(0);
        await trigger.click();
        await expect(trigger).toHaveAttribute("aria-expanded", "true");
        await expect(switcher.locator('[role="menuitem"]')).toHaveCount(group.length);
        const current = switcher.locator('[role="menuitem"][aria-current="true"]');
        await expect(current).toHaveCount(1);
        await expect(current).toHaveAttribute("href", expected.path);
      }
      const korean = expected.htmlLang === "ko-KR";
      if (targets.length) await expect(page.getByRole("menu")).toBeVisible();
      for (const { htmlLang, label, path } of targets) {
        const name = expected.htmlLang === "pt-BR" ? portugueseLanguageNames[htmlLang] : label;
        const link = korean
          ? switcher.locator(`[role="menuitem"][hreflang="${htmlLang}"]`)
          : switcher.getByRole("menuitem", { name, exact: true });
        await expect(link).toHaveAttribute("href", path);
        await expect(link).toHaveAttribute("hreflang", htmlLang);
        if (korean && htmlLang === "zh-CN") await expect(link).toHaveText("중국어");
      }
      if (korean) {
        await expect(switcher).not.toContainText(/\p{Script=Han}/u);
        await page.keyboard.press("Escape");
        await page.setViewportSize({ width: 390, height: 844 });
        await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
        const mobile = page.locator(".site-mobile-menu");
        const mobileTrigger = mobile.getByRole("button", { name: "언어：한국어", exact: true });
        await expect(mobileTrigger).toBeVisible();
        await mobileTrigger.click();
        const chinese = mobile.getByRole("menuitem", { name: "중국어", exact: true });
        await expect(chinese).toBeVisible();
        await expect(chinese).toHaveAttribute("href", group[0].path);
        await expect(chinese).toHaveAttribute("hreflang", "zh-CN");
        await expect(mobile).not.toContainText(/\p{Script=Han}/u);
      }
      if (expected.htmlLang === "pt-BR") {
        await page.keyboard.press("Escape");
        await page.setViewportSize({ width: 390, height: 844 });
        await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
        const mobile = page.locator(".site-mobile-menu");
        await mobile.getByRole("button", { name: portugueseTrigger, exact: true }).click();
        await expect(mobile.locator('[role="menuitem"][hreflang]')).toHaveCount(group.length);
        for (const { htmlLang, path } of targets) {
          const link = mobile.getByRole("menuitem", {
            name: portugueseLanguageNames[htmlLang],
            exact: true,
          });
          await expect(link).toHaveAttribute("href", path);
          await expect(link.and(page.locator(":lang(pt-BR)"))).toBeVisible();
        }
      }
    });
  }
}

for (const [suffix, selector, attribute, value] of [
  ["?interval=year#plan-year", "#plan-year", "aria-current", "true"],
  ["#estimate", ".pricing-estimate", "open", ""],
]) {
  test(`preserves pricing state when switching to Spanish from /pricing${suffix}`, async ({
    page,
  }) => {
    const mounted = page.waitForRequest("**/api/auth/get-session");
    await page.goto(`${origin}/pricing${suffix}`);
    await mounted;

    const switcher = page.locator(".site-language");
    // 语言切换器是下拉菜单：先展开，再点菜单项。
    await switcher
      .getByRole("button", { name: languageTriggerName("zh-CN", "中文"), exact: true })
      .click();
    await switcher.getByRole("menuitem", { name: "Español", exact: true }).click();
    await expect(page).toHaveURL(`${origin}/es/pricing${suffix}`);
    await expect(page.locator(selector)).toHaveAttribute(attribute, value);
  });
}

for (const { path } of localePageGroups.flat()) {
  if (!path.startsWith("/en/wechat-")) continue;
  test(`uses English desktop and mobile navigation on ${path}`, async ({ page }) => {
    const mounted = page.waitForRequest("**/api/auth/get-session");
    await page.goto(`${origin}${path}`);
    await mounted;

    const navigation = page.getByRole("navigation", { name: "Main navigation", exact: true });
    await expect(navigation.getByRole("link", { name: "Home", exact: true })).toHaveAttribute(
      "href",
      "/en",
    );
    await expect(navigation.getByRole("link", { name: "Pricing", exact: true })).toHaveAttribute(
      "href",
      "/en/pricing",
    );
    await expect(
      page.locator(".landing-footer").getByRole("link", { name: /Wechatai AI IN WECHAT Home/ }),
    ).toHaveAttribute("href", "/en");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Open menu", exact: true }).click();
    const mobile = page.locator(".site-mobile-menu");
    await expect(mobile.getByRole("link", { name: "Pricing", exact: true })).toHaveAttribute(
      "href",
      "/en/pricing",
    );
    await expect(mobile.getByRole("link", { name: "Home", exact: true })).toHaveAttribute(
      "href",
      "/en",
    );
  });
}

const portuguesePages: Record<string, string> = {
  "/pt": "Leve sua IA para o WeChat",
  "/pt/pricing": "Comece grátis e faça upgrade para o Plus quando precisar",
  "/pt/wechat-ai": "WeChat AI: leve seu próprio modelo para o chat do WeChat",
  "/pt/wechat-bot": "Como criar um bot para WeChat: escolha a rota certa primeiro",
  "/pt/wechat-deepseek": "Quer usar DeepSeek no WeChat? Comece aqui",
};
for (const [path, heading] of Object.entries(portuguesePages)) {
  test(`keeps the Portuguese header usable on a tablet at ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 834, height: 1112 });
    const mounted = page.waitForRequest("**/api/auth/get-session");
    await page.goto(`${origin}${path}`);
    await mounted;
    const header = page.getByRole("banner");
    const toggle = header.getByRole("button", { name: "Abrir menu" });
    if (await toggle.isVisible()) await toggle.click();
    for (const [name, href] of [
      ["Entrar", "/login"],
      ["Comece grátis", "/register"],
    ]) {
      const link = header.getByRole("link", { name, exact: true });
      await expect(link).toBeInViewport({ ratio: 1 });
      await expect(link).toHaveAttribute("href", href);
      await link.click({ trial: true });
    }
    const language = header.getByRole("button", { name: portugueseTrigger, exact: true });
    await expect(language).toBeInViewport({ ratio: 1 });
    await language.click();
    // The wrapped header puts the trigger at the left; the menu must not cross that edge.
    await expect(header.getByRole("menu")).toBeInViewport({ ratio: 1 });
    const english = header.getByRole("menuitem", { name: "Inglês", exact: true });
    await expect(english).toBeInViewport({ ratio: 1 });
    await expect(english).toHaveAttribute("href", path.replace("/pt", "/en"));
    await english.click({ trial: true });
    await page.keyboard.press("Escape");
    await expect(english).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(834);
    await header.getByRole("link", { name: "Comece grátis" }).click();
    await expect(page).toHaveURL(`${origin}/register`);
  });

  test(`serves ${path} in Portuguese after application takeover`, async ({ page }) => {
    const mounted = page.waitForRequest("**/api/auth/get-session");
    const response = await page.goto(`${origin}${path}`);
    expect(response?.status()).toBe(200);
    await mounted;
    await expect(page.locator("h1")).toHaveText(heading);
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");

    const navigation = page.getByRole("navigation", { name: "Navegação principal" });
    await expect(navigation.getByRole("link", { name: "Início", exact: true })).toHaveAttribute(
      "href",
      "/pt",
    );
    await expect(navigation.getByRole("link", { name: "Preços", exact: true })).toHaveAttribute(
      "href",
      "/pt/pricing",
    );
    await expect(
      navigation.getByRole("link", { name: "Documentação", exact: true }),
    ).toHaveAttribute("href", "/docs");
    await expect(
      page.locator(".landing-footer").getByRole("link", { name: /Wechatai AI IN WECHAT Início/ }),
    ).toHaveAttribute("href", "/pt");
    await expect(page.getByRole("navigation", { name: "Idioma" })).toHaveCount(1);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
    const mobile = page.locator(".site-mobile-menu");
    await expect(mobile.getByRole("link", { name: "Preços", exact: true })).toHaveAttribute(
      "href",
      "/pt/pricing",
    );
    await expect(mobile.getByRole("link", { name: "Início", exact: true })).toHaveAttribute(
      "href",
      "/pt",
    );
  });
}

test.describe("short touch viewport", () => {
  test.use({ viewport: { width: 360, height: 540 }, isMobile: true, hasTouch: true });

  for (const path of [...Object.keys(portuguesePages), "/en"]) {
    test(`swipes the mobile menu to reach registration at ${path}`, async ({ page }) => {
      const mounted = page.waitForRequest("**/api/auth/get-session");
      await page.goto(`${origin}${path}`);
      await mounted;
      const english = path === "/en";
      await page.getByRole("button", { name: english ? "Open menu" : "Abrir menu" }).tap();
      const register = page.locator(".site-mobile-menu").getByRole("link", {
        name: english ? "Get started" : "Comece grátis",
        exact: true,
      });

      const touch = await page.context().newCDPSession(page);
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: 125, y: 480 }],
      });
      for (let y = 455; y > 100; y -= 25) {
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: 125, y }],
        });
      }
      await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await touch.detach();

      // When the drawer content fits, the swipe scrolls the page behind it instead.
      // Either can keep coasting, and Chrome treats a tap during a fling as "stop
      // scrolling" rather than a click. Tap once neither has moved for 10 frames.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            const drawer = document.querySelector(".site-mobile-menu")!;
            let last = "";
            let still = 0;
            const check = () => {
              const position = `${window.scrollY}:${drawer.scrollTop}`;
              still = position === last ? still + 1 : 0;
              last = position;
              if (still >= 10) resolve();
              else requestAnimationFrame(check);
            };
            requestAnimationFrame(check);
          }),
      );
      await expect(register).toBeInViewport({ ratio: 1 });
      // Tap at its current location; locator.tap() could scroll it into view itself.
      const box = (await register.boundingBox())!;
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await expect(page).toHaveURL(`${origin}/register`);
    });
  }
});

for (const [path, fragment] of [
  ["", "how"],
  ["/wechat-ai", "models"],
  ["/wechat-bot", "routes"],
  ["/wechat-deepseek", "config"],
]) {
  test(`keeps #${fragment} when switching ${path || "home"} from Portuguese to English`, async ({
    page,
  }) => {
    const mounted = page.waitForRequest("**/api/auth/get-session");
    await page.goto(`${origin}/pt${path}#${fragment}`);
    await mounted;
    const switcher = page.getByRole("navigation", { name: "Idioma" });
    await switcher.getByRole("button", { name: portugueseTrigger, exact: true }).click();
    await switcher.getByRole("menuitem", { name: "Inglês", exact: true }).click();
    await expect(page).toHaveURL(`${origin}/en${path}#${fragment}`);
    await expect(page.locator(`#${fragment}`)).toBeInViewport();
  });
}

test("keeps the selected annual plan when switching Portuguese pricing to English", async ({
  page,
}) => {
  const mounted = page.waitForRequest("**/api/auth/get-session");
  const suffix = "?interval=year#plan-year";
  await page.goto(`${origin}/pt/pricing${suffix}`);
  await mounted;
  await expect(page.locator("#plan-year")).toHaveAttribute("aria-current", "true");

  const switcher = page.getByRole("navigation", { name: "Idioma" });
  await switcher.getByRole("button", { name: portugueseTrigger, exact: true }).click();
  await switcher.getByRole("menuitem", { name: "Inglês", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/en/pricing${suffix}`);
  await expect(page.locator("#plan-year")).toHaveAttribute("aria-current", "true");
  await expect(page.locator("#plan-year h3")).toBeInViewport();
});

test("keeps the pricing estimator open when switching Portuguese to English on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 844 });
  const mounted = page.waitForRequest("**/api/auth/get-session");
  await page.goto(`${origin}/pt/pricing#estimate`);
  await mounted;
  await expect(page.locator("#pricing-estimate")).toHaveAttribute("open", "");

  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  const mobile = page.locator(".site-mobile-menu");
  await mobile.getByRole("button", { name: portugueseTrigger, exact: true }).click();
  await mobile.getByRole("menuitem", { name: "Inglês", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/en/pricing#estimate`);
  await expect(page.locator("#pricing-estimate")).toHaveAttribute("open", "");
  await expect(page.locator("#estimate h2")).toBeInViewport();
});

for (const { format, values, expected } of [
  {
    format: "thousands separators",
    values: ["1000", "500", "1000", "1000", "1000"],
    expected: ["1.000 créditos", "Cerca de ¥1.500"],
  },
  {
    format: "decimal commas",
    values: ["1200", "621", "1", "2", "1"],
    expected: ["1,234 créditos", "Cerca de ¥0,003"],
  },
]) {
  test(`formats Portuguese pricing estimates with ${format}`, async ({ page }) => {
    const mounted = page.waitForRequest("**/api/auth/get-session");
    await page.goto(`${origin}/pt/pricing#estimate`);
    await mounted;

    const inputs = page.locator("#estimate .cost-fields input");
    for (const [index, value] of values.entries()) await inputs.nth(index).fill(value);
    await expect(page.locator("#estimate .cost-results strong")).toHaveText(expected);
  });
}

const pricingUser = {
  id: "pricing-user",
  name: "Ana",
  email: "ana@example.test",
  emailVerified: true,
};
const pricingSession = {
  user: pricingUser,
  session: {
    id: "pricing-session",
    userId: pricingUser.id,
    token: "pricing-token",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  },
};

test("keeps the signed-in Portuguese account menu usable on mobile", async ({ page }) => {
  await page.route("**/api/auth/get-session*", (route) => route.fulfill({ json: pricingSession }));
  await page.route("**/api/dashboard", (route) =>
    route.fulfill({ json: { plan: "free", planUntil: 0, wallet: { balance: 1234 } } }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/pt/pricing`);

  const trigger = page.getByRole("button", { name: "Menu do usuário", exact: true });
  await trigger.click();
  const menu = page.getByRole("dialog", { name: "Menu da conta", exact: true });
  await expect(menu.getByRole("link", { name: "Abrir o painel" })).toHaveAttribute("href", "/pt/app");
  const balance = menu.getByRole("link", { name: /Saldo de créditos/ });
  await expect(balance).toHaveAttribute("href", "/pt/app/credits");
  await expect(balance).toContainText("1.234");
  await expect(menu.getByText("Conta gratuita", { exact: true })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Fazer upgrade para o Plus" })).toHaveAttribute(
    "href",
    "/pt/app/billing",
  );
  await expect(menu.getByRole("button", { name: "Sair", exact: true })).toBeInViewport();
  await expect(menu).not.toContainText(/\p{Script=Han}/u);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("opens Portuguese FAQ answers and the pricing estimator from a DeepSeek CTA", async ({
  page,
}) => {
  const mounted = page.waitForRequest("**/api/auth/get-session");
  await page.goto(`${origin}/pt/wechat-deepseek`);
  await mounted;

  const faq = page.locator(".seopage-faq details").first();
  await expect(faq).not.toHaveAttribute("open", "");
  await faq.locator("summary").click();
  await expect(faq).toHaveAttribute("open", "");
  await expect(faq.locator("p")).toContainText("ClawBot");

  await expect(page.locator(".seopage-cta a")).toHaveAttribute("href", "/register");
  await page.locator(".seopage-actions a[href='/pt/pricing#estimate']").click();
  await expect(page).toHaveURL(`${origin}/pt/pricing#estimate`);
  await expect(page.locator("#pricing-estimate")).toHaveAttribute("open", "");
  await expect(page.locator(".cost-estimator h2")).toHaveText("Estime primeiro seu uso de texto");
});

for (const width of [320, 360]) {
  test(`fits the Portuguese DeepSeek tutorial button at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const mounted = page.waitForRequest("**/api/auth/get-session");
    await page.goto(`${origin}/pt/wechat-deepseek`);
    await mounted;
    const tutorial = page.locator(".seopage-actions").getByRole("link", { name: /tutorial/i });
    await expect(tutorial).toBeInViewport({ ratio: 1 });
    const viewport = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      contentWidth: document.documentElement.scrollWidth,
    }));
    expect(viewport).toEqual({ width, contentWidth: width });
    await tutorial.click();
    await expect(page).toHaveURL(`${origin}/docs/deepseek-in-wechat`);
  });
}

// An unregistered prefix must not fall back to the Chinese homepage or pricing page.
for (const path of locale404Probes) {
  test(`shows the built 404 page for the unregistered locale path ${path}`, async ({ page }) => {
    const mounted = page.waitForRequest("**/api/auth/get-session");
    const response = await page.goto(`${origin}${path}`);
    expect(response?.status()).toBe(404);
    await mounted;
    await expect(page.getByRole("heading", { name: "这个页面没有找到。" })).toBeVisible();
    await expect(page.getByText("免费开始，按需升级 Plus")).toHaveCount(0);
    await expect(page.locator(".site-header a[hreflang]")).toHaveCount(0);
  });
}

test("returns a real 404 for an unregistered English document", async ({ page }) => {
  const mounted = page.waitForRequest("**/api/auth/get-session");
  const response = await page.goto(`${origin}/en/docs/not-registered`);
  expect(response?.status()).toBe(404);
  await mounted;
  await expect(page.getByRole("heading", { name: "这个页面没有找到。" })).toBeVisible();
  await expect(page.locator(".site-header a[hreflang]")).toHaveCount(0);
  await expect(page.getByText("Put your AI to work in WeChat.")).toHaveCount(0);
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
    // Layout can round the restored offset by one pixel when React takes over.
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - 1600)).toBeLessThanOrEqual(1);
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

test("explains why the Spanish estimate rounds up to 1,801 credits", async ({ page }) => {
  const mounted = page.waitForRequest("**/api/auth/get-session");
  await page.goto(`${origin}/es/pricing#estimate`);
  await mounted;

  const estimate = page.locator("#estimate");
  await estimate.getByLabel("Tokens de entrada por turno (incluido el historial)").fill("1001");
  await estimate.getByLabel("Tokens de salida por turno").fill("1000");
  await estimate.getByLabel("Solicitudes al día").fill("1");
  await expect(estimate.getByText("1,801 créditos", { exact: true })).toBeVisible();
  await expect(estimate.locator(".cost-estimator-note")).toContainText(
    "redondeado hacia arriba al siguiente múltiplo de 0,001 crédito por turno",
  );
});

test("accepts typed decimal commas and points in both Spanish provider prices", async ({ page }) => {
  const mounted = page.waitForRequest("**/api/auth/get-session");
  await page.goto(`${origin}/es/pricing#estimate`);
  await mounted;

  const estimate = page.locator("#estimate");
  await estimate.getByLabel("Tokens de entrada por turno (incluido el historial)").fill("1000000");
  await estimate.getByLabel("Tokens de salida por turno").fill("1000000");
  await estimate.getByLabel("Solicitudes al día").fill("1");
  const inputPrice = estimate.getByLabel("Precio de entrada del proveedor", { exact: false });
  const outputPrice = estimate.getByLabel("Precio de salida del proveedor", { exact: false });

  await outputPrice.pressSequentially("0");
  await inputPrice.pressSequentially("1,5");
  await expect(estimate.getByText("Unos ¥1,5", { exact: true })).toBeVisible();
  await expect(inputPrice).toHaveValue("1,5");

  await outputPrice.clear();
  await outputPrice.pressSequentially("2.25");
  await expect(outputPrice).toHaveValue("2.25");
  await expect(estimate.getByText("Unos ¥3,75", { exact: true })).toBeVisible();

  await inputPrice.clear();
  await inputPrice.pressSequentially("1.5");
  await outputPrice.clear();
  await outputPrice.pressSequentially("2,25");
  await expect(inputPrice).toHaveValue("1.5");
  await expect(outputPrice).toHaveValue("2,25");
  await expect(estimate.getByText("Unos ¥3,75", { exact: true })).toBeVisible();

  await outputPrice.pressSequentially(".4");
  await expect(outputPrice).toHaveValue("2,25.4");
  await expect(estimate.getByText(/Introduce números válidos no negativos/)).toBeVisible();
});

test.describe("English provider prices in Chromium en-US", () => {
  test.use({ locale: "en-US" });

  test("retains native grouping when typing a provider price of 1,000", async ({ page }) => {
    const mounted = page.waitForRequest("**/api/auth/get-session");
    await page.goto(`${origin}/en/pricing#estimate`);
    await mounted;

    const estimate = page.locator("#estimate");
    await estimate.getByLabel("Input tokens per turn (including history)").fill("1000000");
    await estimate.getByLabel("Output tokens per turn").fill("0");
    await estimate.getByLabel("Requests per day").fill("1");
    await estimate.getByLabel("Provider output price (CNY / million tokens)").fill("0");
    await estimate
      .getByLabel("Provider input price (CNY / million tokens)")
      .pressSequentially("1,000");
    await expect(estimate.locator(".cost-results strong").last()).toHaveText("About ¥1,000");
  });
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

  test(`finds the Muse guide using document search at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const mounted = page.waitForRequest("**/api/auth/get-session");
    await page.goto(`${origin}/docs`);
    await mounted;
    const navigation = page.locator(width === 390 ? ".docs-mobile-navigation" : ".docs-sidebar");
    if (width === 390) await navigation.locator("summary").click();
    const input = navigation.getByRole("searchbox");
    const museGuide = navigation.getByRole("link", { name: "Muse 接入指南" });

    await input.fill("Muse");
    await expect(navigation.getByRole("status")).toHaveCount(0);
    await expect(museGuide).toBeVisible();
    await input.fill("不可能匹配的关键词");
    await expect(navigation.getByRole("status")).toContainText("没有匹配");
    await expect(museGuide).toHaveCount(0);
    await input.fill("Muse");
    await museGuide.click();
    await expect(page).toHaveURL(`${origin}/developers/muse`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Muse 接入指南");
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

for (const { scenario, path, query, keepReading } of [
  {
    scenario: "filtered-out target",
    path: "/docs/hermes-in-wechat",
    query: "联网",
    keepReading: false,
  },
  {
    scenario: "reordered target",
    path: "/docs/deepseek-in-wechat",
    query: "DeepSeek",
    keepReading: false,
  },
  {
    scenario: "offscreen target while reading",
    path: "/docs/hermes-in-wechat",
    query: "联网",
    keepReading: true,
  },
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
    await input.fill(query);
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

test("describes the maximum KimiSeek discount in English docs", async ({ page }) => {
  await page.goto(`${origin}/en/docs/model-providers`);
  const card = page.getByRole("listitem").filter({
    has: page.getByRole("heading", { name: "KimiSeek", exact: true }),
  });
  await expect(card).toContainText("up to 50% off");
});

test("documents both KimiSeek email recovery paths in English", async ({ page }) => {
  const mounted = page.waitForRequest("**/api/auth/get-session");
  await page.goto(`${origin}/en/docs/model-providers#kimiseek`);
  await mounted;
  const section = page.locator("#kimiseek");
  const verification = section.locator("p").filter({ hasText: "Email not verified?" });
  await expect(verification.getByRole("link", { name: "verify your Wechatai email" })).toHaveAttribute(
    "href",
    "/verify-email?returnTo=%2Fapp%2Fchannels%3Fnew%3D1",
  );
  await expect(verification).toContainText(/return to .*channels page.*click .*one-click import/i);

  await expect(section.getByText("Email not supported?", { exact: true })).toBeVisible();
  await expect(section).toContainText("keep your current Wechatai account");
  const steps = section.getByRole("listitem");
  await expect(steps).toHaveCount(3);
  const [register, configure, save] = await steps.all();
  await expect(register.getByRole("link", { name: "register for KimiSeek" })).toHaveAttribute(
    "href",
    "https://kimiseek.app/zh-CN/register",
  );
  await expect(register).toContainText(/QQ, 163\/126, Gmail or Outlook.*create an API key/);
  await expect(configure.getByRole("link", { name: "Add channel", exact: true })).toHaveAttribute(
    "href",
    "/app/channels?new=1",
  );
  await expect(configure).toContainText("OpenAI Chat Completions");
  await expect(configure.locator("code")).toHaveText("https://api.kimiseek.app/v1");
  await expect(save).toContainText(/Save channel.*Fetch available models/);
  await expect(save).toContainText(/API key and top-ups .* KimiSeek console/);
  await expect(save).toContainText(/Wechatai does not show .* balance or top-up entry/);
});

test("English docs keep navigation, search, table of contents and pagination in English", async ({
  page,
}) => {
  const mounted = page.waitForRequest("**/api/auth/get-session");
  await page.goto(`${origin}/en/docs`);
  await mounted;
  await expect(page.locator("h1")).toHaveText("Put your AI to work in WeChat.");
  await expect(
    page.locator('.docs-tutorial-list a[href="/en/docs/wechat-ai-assistant"]'),
  ).toBeVisible();
  await page.locator('.docs-sidebar a[href="/en/docs/getting-started"]').click();
  await expect(page).toHaveURL(`${origin}/en/docs/getting-started`);
  await expect(page.locator("h1")).toHaveText(
    "WeChat AI guide: configure a model and connect by QR code",
  );
  await expect(page.locator(".docs-sidebar a[href='/en/docs/roleplay']")).toBeVisible();
  await expect(page.locator('.docs-sidebar a[href="/docs/getting-started"]')).toHaveCount(0);

  const toc = page.locator("#docs-toc-desktop");
  await toc.locator('a[href="#prepare"]').click();
  await expect(page.locator("#prepare")).toBeFocused();

  const search = page.locator("#docs-search-desktop");
  await search.fill("roleplay");
  await expect(
    page.locator('.docs-sidebar .docs-nav-group a[href="/en/docs/roleplay"]'),
  ).toBeVisible();
  await expect(
    page.locator('.docs-sidebar .docs-nav-group a[href="/en/docs/channels-models"]'),
  ).toHaveCount(0);
  await search.fill("zzzz");
  await expect(page.locator(".docs-search-empty")).toHaveText(
    "No documents match “zzzz”. Try “channel” or “plugin” instead.",
  );

  const next = page.locator(".docs-pagination a").last();
  await expect(next).toHaveAttribute("href", "/en/docs/channels-models");
  await expect(next).toContainText("Next");
  await page.locator(".site-language").getByRole("button", { name: "Language: English", exact: true }).click();
  // 文档页只有 zh/en 两个语种组，切换器不做 query/fragment 保留（与 main 一致）；
  // es/pt 组内的 hash 保留由 “preserves pricing state when switching to Spanish” 覆盖。
  await expect(page.locator('.site-language [role="menuitem"]', { hasText: "中文" })).toHaveAttribute(
    "href",
    "/docs/getting-started",
  );
});

test("keeps the original Xiaowei prompt in the English tutorial", async ({ page }) => {
  await page.goto(`${origin}/docs/wechat-ai-assistant`);
  const example = page.locator("#first-task pre code");
  const original = await example.textContent();
  expect(original).toContain("Markdown 转成 Word");
  await page.goto(`${origin}/en/docs/wechat-ai-assistant`);
  expect(await example.textContent()).toBe(original);
});

for (const slug of ["cloud-agent", "wechat-ai-assistant"]) {
  test(`shows the working Xiaowei shortcut and command on ${slug}`, async ({ page }) => {
    await page.goto(`${origin}/en/docs/${slug}`);
    const figure = page.getByRole("figure", { name: "Xiaowei configuration and usage example" });
    await expect(figure.locator(".docs-plugin-heading")).toHaveText("Xiaowei");
    await expect(figure.locator('dt:text-is("WeChat shortcut") + dd')).toHaveText("小薇");
    await expect(figure.getByText("/use 小薇", { exact: true })).toBeVisible();
  });
}

test("renders both notification diagrams under the correct English headings", async ({ page }) => {
  const mounted = page.waitForRequest("**/api/auth/get-session");
  await page.goto(`${origin}/en/docs/notifications`);
  await mounted;
  await expect.soft(
    page.locator("#setup").getByRole("figure", {
      name: "Notifications configuration and usage example",
    }),
  ).toBeVisible();
  await expect.soft(
    page.locator("#receipt").getByRole("figure", {
      name: "Notification flow from submission to confirmed delivery",
    }),
  ).toBeVisible();
});

test("keeps the original notification receipt in the English guide", async ({ page }) => {
  await page.goto(`${origin}/docs/notifications`);
  const example = page.locator("#receipt pre code");
  const original = await example.textContent();
  expect(JSON.parse(original!)).toMatchObject({ id: "消息 ID" });
  await page.goto(`${origin}/en/docs/notifications`);
  expect(await example.textContent()).toBe(original);
});

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

for (const width of [320, 390, 1280]) {
  test(`keeps article sections reachable while reading at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const mounted = page.waitForRequest("**/api/auth/get-session");
    await page.goto(`${origin}/docs/getting-started`);
    await mounted;
    const mobile = width < 761;
    const toc = page.locator(`#docs-toc-${mobile ? "mobile" : "desktop"}`);
    const target = page.locator(".docs-prose > section").last();
    const targetId = await target.getAttribute("id");
    await target.scrollIntoViewIfNeeded();
    await expect(toc.locator("summary")).toBeInViewport();
    if (mobile) await toc.locator("summary").click();
    await toc.locator(`a[href="#${targetId}"]`).click();
    await expect(target).toBeFocused();
    await expect.poll(async () => (await target.boundingBox())!.y).toBeGreaterThan(60);
    await expect(target.locator("h2")).toBeInViewport();
    if (mobile) {
      await expect(toc).not.toHaveAttribute("open");
      await toc.locator("summary").click();
      await toc.locator("a").first().focus();
      await page.keyboard.press("Escape");
      await expect(toc).not.toHaveAttribute("open");
      await expect(toc.locator("summary")).toBeFocused();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test("preserves the mobile article menu through the static-to-React handoff", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let chunk: Route | undefined;
  await page.route("**/assets/docs-*.js", (route) => {
    chunk = route;
  });
  await page.goto(`${origin}/docs/getting-started`, { waitUntil: "domcontentloaded" });
  await expect.poll(() => Boolean(chunk)).toBe(true);
  const toc = page.locator("#docs-toc-mobile");
  await toc.locator("summary").click();
  await toc.locator("a").last().focus();
  const position = await page.evaluate(() => scrollY);
  const mounted = page.waitForRequest("**/api/auth/get-session");
  await chunk!.fallback();
  await mounted;
  await expect(toc).toHaveAttribute("open", "");
  await expect(toc.locator("a").last()).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(position);
  await page.keyboard.press("Enter");
  await expect(toc).not.toHaveAttribute("open");
  await expect(page.locator(".docs-prose > section").last().locator("h2")).toBeInViewport();
});

test("preserves an expanded mobile footer and focus when React takes over", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let entry: Route | undefined;
  await page.route("**/assets/index-*.js", (route) => {
    entry = route;
  });
  await page.goto(`${origin}/`, { waitUntil: "commit" });
  await expect.poll(() => Boolean(entry)).toBe(true);
  const group = page.locator("#footer-group-0");
  await group.locator("summary").click();
  await group.locator("a").last().focus();
  const position = await page.evaluate(() => scrollY);
  const mounted = page.waitForRequest("**/api/auth/get-session");
  await entry!.fallback();
  await mounted;
  await expect(group).toHaveAttribute("open", "");
  await expect(group.locator("a").last()).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(position);
  await group.locator("summary").click();
  await expect(group.locator("a").first()).toBeHidden();
  await page.locator('.landing-footer-quick a[href="/pricing"]').click();
  await expect(page).toHaveURL(`${origin}/pricing`);
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
      if (width === 390) {
        await expect(page.locator(".plan-highlights").first()).toBeVisible();
        await expect(page.locator(".plan-features").first()).toBeHidden();
        await expect(page.locator(".plans-comparison")).toBeVisible();
        await expect(page.locator(".landing-footer-desktop")).toBeHidden();
        const group = page.locator("#footer-group-0");
        await expect(group.locator("a").first()).toBeHidden();
        await group.locator("summary").click();
        await expect(group.locator("a").first()).toBeVisible();
      } else {
        await expect(page.locator(".plan-features").first()).toBeVisible();
        await expect(page.locator(".plans-comparison")).toBeHidden();
        await expect(page.locator(".landing-footer-mobile")).toBeHidden();
        await expect(page.locator(".landing-footer-desktop a").first()).toBeVisible();
      }
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

for (const [path, interval] of [
  ["/pricing", "month"],
  ["/pricing", "year"],
  ["/ja/pricing", "year"],
  ["/ko/pricing", "month"],
  ["/ko/pricing", "year"],
  ["/es/pricing", "month"],
  ["/es/pricing", "year"],
  ["/pt/pricing", "month"],
  ["/pt/pricing", "year"],
]) {
  test(`returns mobile buyers on ${path} to the ${interval} card after signing in`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const destination = `${path}?interval=${interval}#plan-${interval}`;
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
    await expect(card).toHaveAttribute("aria-current", "true");
    await expect(card.locator("h3")).toBeInViewport();
    await expect(card.locator("button.plan-cta")).toBeInViewport();
    await expect(card.locator("button.plan-cta")).toBeEnabled();
  });
}

test("sends a same-origin Portuguese plan callback when starting social login", async ({ page }) => {
  const destination = "/pt/pricing?interval=year#plan-year";
  await page.route("**/api/auth/providers", (route) =>
    route.fulfill({ json: { providers: ["github"] } }),
  );
  await page.route("**/api/auth/sign-in/social", (route) =>
    route.fulfill({ json: { redirect: false, url: "https://github.test/authorize" } }),
  );
  await page.goto(`${origin}/login?returnTo=${encodeURIComponent(destination)}`);
  const request = page.waitForRequest("**/api/auth/sign-in/social");
  await page.getByRole("button", { name: "使用 GitHub 继续", exact: true }).click();
  expect((await request).postDataJSON()).toMatchObject({
    callbackURL: `${origin}${destination}`,
    newUserCallbackURL: `${origin}${destination}`,
  });
});

const englishBuyer = {
  user: { id: "english-buyer", name: "Buyer", email: "buyer@example.test", emailVerified: true },
  session: {
    id: "english-session",
    token: "old-token",
    userId: "english-buyer",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  },
};

for (const [path, purchaseLabel, expiredMessage, loginLabel] of [
  [
    "/en/pricing",
    /Get Plus Yearly/,
    "Your session has expired. Log in again to continue.",
    "Log in again",
  ],
  [
    "/ja/pricing",
    /Plus 年間プランを購入/,
    "セッションの有効期限が切れました。再度ログインしてください。",
    "もう一度ログイン",
  ],
] as const) {
  test(`returns expired checkout buyers on ${path} to their selected plan after login`, async ({
    page,
  }) => {
    const destination = `${path}?interval=year#plan-year`;
    const oldSession = englishBuyer.session;
    const newSession = { ...oldSession, id: "new-session", token: "new-token" };
    let signedInAgain = false;
    await page.route("**/api/billing/checkout", (route) =>
      route.fulfill({ status: 401, json: { error: "unauthorized", message: "请先登录" } }),
    );
    await page.route("**/api/auth/get-session*", (route) =>
      route.fulfill({
        // Keep returning the stale session until the buyer actually signs in again.
        json: { ...englishBuyer, session: signedInAgain ? newSession : oldSession },
      }),
    );
    await page.route("**/api/auth/sign-in/email", (route) => {
      signedInAgain = true;
      return route.fulfill({
        json: { redirect: false, token: newSession.token, user: englishBuyer.user },
      });
    });

    await page.goto(`${origin}${destination}`);
    const card = page.locator("#plan-year");
    const purchase = card.getByRole("button", { name: purchaseLabel });
    const alert = card.getByRole("alert");
    await purchase.click();
    await expect(alert).toHaveText(expiredMessage);
    await expect(page.locator("#plan-month").getByRole("alert")).toHaveCount(0);
    const login = card.getByRole("link", { name: loginLabel });
    await expect(login).toHaveAttribute("href", `/login?returnTo=${encodeURIComponent(destination)}`);
    await login.click();
    await expect(page.getByRole("button", { name: "登录工作台", exact: true })).toBeVisible();
    await page.locator('input[type="email"]').fill(englishBuyer.user.email);
    await page.locator('input[type="password"]').fill("test-password");
    await page.getByRole("button", { name: "登录工作台", exact: true }).click();
    await expect(page).toHaveURL(`${origin}${destination}`);
    await expect(purchase).toBeEnabled();
    await expect(alert).toHaveCount(0);
  });
}

test("shows an English checkout failure without asking the buyer to log in again", async ({ page }) => {
  await page.route("**/api/auth/get-session*", (route) => route.fulfill({ json: englishBuyer }));
  await page.route("**/api/billing/checkout", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "billing_unavailable", message: "该方案尚未开放购买" },
    }),
  );
  await page.goto(`${origin}/en/pricing?interval=month#plan-month`);
  const card = page.locator("#plan-month");
  const purchase = card.getByRole("button", { name: /Get Plus Monthly/ });
  await purchase.click();
  await expect(card.getByRole("alert")).toHaveText(
    "This plan is not available for purchase right now. Try again later.",
  );
  await expect(card.getByRole("link", { name: "Log in again" })).toHaveCount(0);
  await expect(purchase).toBeEnabled();
});

for (const width of [320, 390]) {
  test(`keeps the Muse setup reachable, collapsible and copyable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            (window as { __copiedText?: string }).__copiedText = text;
          },
        },
      });
    });
    const mounted = page.waitForRequest("**/api/auth/get-session");
    await page.goto(`${origin}/wechat-muse`);
    await mounted;

    const wechat = page.locator('.seopage-actions a[href="/app/wechat"]');
    const plugins = page.locator('.seopage-actions a[href="/app/plugins"]');
    await expect(wechat).toBeVisible();
    await expect(plugins).toBeVisible();
    await expect(plugins).toBeInViewport();

    const details = page.locator("details.seopage-steps-details");
    await expect(details).toHaveAttribute("open", "");
    await details.locator("summary").click();
    await expect(details).not.toHaveAttribute("open");
    await details.locator("summary").click();
    await expect(details).toHaveAttribute("open", "");

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    const copy = page.getByRole("button", { name: "复制命令 /use muse" });
    await copy.scrollIntoViewIfNeeded();
    await copy.click();
    await expect(copy).toContainText("已复制");
    expect(await page.evaluate(() => (window as { __copiedText?: string }).__copiedText)).toBe(
      "/use muse",
    );

    const connect = page.locator("#connect");
    await expect(
      connect.getByRole("heading", { name: "完整接入步骤：从扫码绑定到第一条任务" }),
    ).toBeVisible();
    const steps = await connect.locator("ol > li").all();
    expect(steps).toHaveLength(6);
    for (const step of steps) await expect(step).toBeHidden();
    const fullSteps = connect.getByText("六步接入说明", { exact: true });
    await fullSteps.click();
    for (const step of steps) await expect(step).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await fullSteps.click();
    for (const step of steps) await expect(step).toBeHidden();
  });
}

test("keeps signed-in account controls English on both marketing pages", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.route("**/api/auth/get-session*", (route) => route.fulfill({ json: englishBuyer }));
  await page.route("**/api/dashboard", (route) =>
    route.fulfill({ json: { plan: "free", planUntil: 0, wallet: { balance: 100 } } }),
  );
  for (const [path, freeCard] of [
    ["/en", ".landing-plan-free"],
    ["/en/pricing", ".plan-free"],
  ]) {
    await page.goto(`${origin}${path}`);
    await expect(page.locator(freeCard).getByRole("link", { name: "Open workspace" }))
      .toHaveAttribute("href", "/en/app");
    await expect(page.getByRole("navigation", { name: "Language", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "User menu", exact: true }).click();
    const menu = page.getByRole("dialog", { name: "Account menu", exact: true });
    await expect(menu.getByRole("link", { name: "Open workspace" })).toHaveAttribute("href", "/en/app");
    await expect(menu.getByRole("link", { name: "Upgrade membership" }))
      .toHaveAttribute("href", "/app/billing");
    await expect(menu.getByRole("button", { name: "Log out" })).toBeVisible();
    await expect(menu).not.toContainText(/\p{Script=Han}/u);
  }
});

test("serves the English homepage and pricing page without Chinese page copy", async ({
  page,
}) => {
  const mounted = page.waitForRequest("**/api/auth/get-session");
  await page.goto(`${origin}/en`);
  await mounted;

  await expect(page.locator("h1")).toContainText("Bring your AI");
  await expect(page.locator("h1")).toContainText("into WeChat");
  await expect(page.locator('.site-header-nav a[href="/en/pricing"]')).toHaveText("Pricing");
  await expect(page.locator('.site-header-nav a[href="/en/docs"]')).toHaveText("Docs");
  await expect(
    page.locator('.landing-plan-year a[href="/en/pricing?interval=year#plan-year"]').first(),
  ).toBeVisible();
  const faq = page.locator(".landing-faq details").first();
  await faq.locator("summary").click();
  await expect(faq).toHaveAttribute("open", "");
  await expect(faq).toContainText("Do I need my own API key?");
  expect(withoutSwitcherLabels(await page.locator("body").innerText())).not.toMatch(
    /\p{Script=Han}/u,
  );

  await page.goto(`${origin}/en/pricing`);
  await expect(page.locator("h1")).toHaveText(
    "Start free, upgrade to Plus when you need more",
  );
  await expect(page.locator(".plan h3")).toHaveText(["Free", "Plus Monthly", "Plus Yearly"]);
  await expect(page.locator(".plan-year .plan-price-unit")).toHaveText("/ year");
  await expect(page.locator('.seopage-related a[href="/wechat-muse"]')).toContainText(
    "Muse managed assistant for WeChat",
  );
  const estimate = page.locator(".pricing-estimate");
  await estimate.locator("summary").click();
  await expect(estimate).toHaveAttribute("open", "");
  await expect(estimate.locator(".cost-results")).toContainText("credits");
  expect(withoutSwitcherLabels(await page.locator("body").innerText())).not.toMatch(
    /\p{Script=Han}/u,
  );
  const readableAttributes = await page.evaluate(() =>
    [...document.querySelectorAll("[alt], [aria-label], [title], [placeholder]")]
      .flatMap((element) =>
        ["alt", "aria-label", "title", "placeholder"].map(
          (name) => element.getAttribute(name) ?? "",
        ),
      )
      .join(" "),
  );
  expect(readableAttributes).not.toMatch(/\p{Script=Han}/u);
});

for (const [path, card, note, register] of [
  ["/ja", ".landing-plan-free", ".landing-plan-note", "/register?returnTo=%2Fja%2Fapp"],
  ["/ja/pricing", ".plan-free", ".plan-note", "/register"],
]) {
  test(`describes the free plan without promising no registration on ${path}`, async ({ page }) => {
    await page.goto(`${origin}${path}`);
    const free = page.locator(card);
    await expect(free.locator(note)).toHaveText("有料プランへの加入は不要です");
    await expect(free.getByRole("link", { name: "無料で始める" })).toHaveAttribute("href", register);
  });
}

test("serves the Japanese homepage and pricing page without Chinese page copy", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  const mounted = page.waitForRequest("**/api/auth/get-session");
  await page.goto(`${origin}/ja`);
  await mounted;

  await expect(page.locator("h1")).toHaveText("あなたの AI を、WeChat へ");
  await expect(page.locator("html")).toHaveAttribute("lang", "ja-JP");
  await expect(page.locator('.site-header-nav a[href="/ja/pricing"]')).toHaveText("料金");
  await expect(page.locator('.site-header-nav a[href="/docs"]')).toHaveText("ドキュメント");
  await expect(page.locator('.landing-footer a[href="/ja/pricing"]').first()).toHaveText(
    "料金と無料クレジット",
  );
  await expect(page.locator(".landing-plan-month .landing-plan-price span").first()).toHaveText(
    "/ 月（人民元）",
  );
  await expect(
    page.locator('.landing-plan-year a[href="/ja/pricing?interval=year#plan-year"]').first(),
  ).toBeVisible();
  await expect(page.locator(".hero-connections img")).toHaveAttribute(
    "src",
    "/images/landing/ai-wechat-connections-en.webp",
  );
  const faq = page.locator(".landing-faq details").first();
  await faq.locator("summary").click();
  await expect(faq).toHaveAttribute("open", "");
  await expect(faq).toContainText("自分で API キーを用意する必要がありますか？");
  expect(withoutSwitcherLabels(await page.locator("body").innerText())).not.toMatch(
    CHINESE_RESIDUE,
  );

  const switcher = page.locator(".site-language");
  await switcher.getByRole("button", { name: "言語：日本語", exact: true }).click();
  await expect(switcher.getByRole("menuitem", { name: "English", exact: true })).toHaveAttribute(
    "href",
    "/en",
  );
  await expect(switcher.getByRole("menuitem", { name: "中文", exact: true })).toHaveAttribute(
    "href",
    "/",
  );

  await page.goto(`${origin}/ja/pricing`);
  await expect(page.locator("h1")).toHaveText("無料で始めて、必要に応じて Plus へ");
  await expect(page.locator(".plan h3")).toHaveText([
    "無料プラン",
    "Plus 月額プラン",
    "Plus 年間プラン",
  ]);
  await expect(page.locator(".plan-month .plan-price-unit")).toHaveText("/ 月（人民元）");
  await expect(page.locator(".plan-month .plan-note")).toHaveText(
    "1 か月分を 1 回払いで購入。必要なときに更新できます。",
  );
  const estimate = page.locator(".pricing-estimate");
  await estimate.locator("summary").click();
  await expect(estimate).toHaveAttribute("open", "");
  await expect(estimate.locator(".cost-results")).toContainText("クレジット");
  await expect(page.locator('.pricing-breadcrumb a[href="/ja"]')).toHaveText("ホーム");
  await expect(page.locator('.seopage-related a[href="/wechat-muse"]')).toContainText(
    "Muse マネージドアシスタント",
  );
  expect(withoutSwitcherLabels(await page.locator("body").innerText())).not.toMatch(
    CHINESE_RESIDUE,
  );
});

test("shows each Japanese homepage plan allowance once on desktop and mobile", async ({ page }) => {
  const mounted = page.waitForRequest("**/api/auth/get-session");
  await page.goto(`${origin}/ja`);
  await mounted;

  const allowances = page
    .locator(".landing-plan:visible li")
    .filter({ hasText: /WeChat 接続|プラグイン設定/ });
  const plus = ["WeChat 接続 10 件", "プラグイン設定 無制限"];
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .soft(allowances, `${width}px`)
      .toHaveText(
        ["WeChat 接続 1 件", "プラグイン設定 1 件", ...plus, ...(width === 1280 ? plus : [])],
        { useInnerText: true },
      );
  }
});

test("opens a Japanese account menu for signed-in pricing visitors", async ({ page }) => {
  await page.route("**/api/auth/get-session*", (route) => route.fulfill({ json: englishBuyer }));
  await page.route("**/api/admin/access", (route) => route.fulfill({ json: { isAdmin: true } }));
  await page.route("**/api/dashboard", (route) =>
    route.fulfill({
      json: { plan: "plus", planUntil: Date.UTC(2026, 11, 1), wallet: { balance: 100 } },
    }),
  );
  await page.goto(`${origin}/ja/pricing`);
  const trigger = page.getByRole("button", { name: "ユーザーメニュー", exact: true });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const menu = page.getByRole("dialog", { name: "アカウントメニュー", exact: true });
  await expect(menu.getByRole("link", { name: "ワークスペースを開く" })).toHaveAttribute(
    "href",
    "/ja/app",
  );
  await expect(menu.getByRole("link", { name: "クレジット残高" })).toBeVisible();
  await expect(menu).toContainText("Plus 会員");
  await expect(menu).toContainText("有効期限： 2026/12/01 08:00（北京時間）");
  await expect(menu.getByRole("link", { name: "会員期間を更新" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "管理コンソール" })).toBeVisible();
  await expect(menu.getByRole("button", { name: "ログアウト" })).toBeVisible();
});

test("formats the Spanish account balance with the page language and existing precision", async ({
  page,
}) => {
  await page.route("**/api/auth/get-session*", (route) => route.fulfill({ json: englishBuyer }));
  let balance = 12.345;
  await page.route("**/api/dashboard", (route) =>
    route.fulfill({ json: { plan: "free", planUntil: 0, wallet: { balance } } }),
  );
  await page.goto(`${origin}/es/pricing#estimate`);
  const trigger = page.getByRole("button", { name: "Menú de usuario", exact: true });
  await trigger.click();
  const balanceLink = page
    .getByRole("dialog", { name: "Menú de la cuenta", exact: true })
    .getByRole("link", { name: /Saldo de créditos/ });
  await expect(balanceLink.getByText("12,345", { exact: true })).toBeVisible();

  await trigger.press("Escape");
  balance = 12345.678;
  await trigger.click();
  await expect(balanceLink.getByText("12.346", { exact: true })).toBeVisible();
});

test("serves the Japanese landing pages with localized chrome and Chinese guide links", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto(`${origin}/ja/wechat-deepseek`);
  await expect(page.locator("html")).toHaveAttribute("lang", "ja-JP");
  await expect(page.locator("h1")).toHaveText("WeChat で DeepSeek を使いたい方は、ここから");
  await expect(page.locator(".seopage-skip")).toHaveText("本文へスキップ");
  await expect(page.locator('.seopage-breadcrumb a[href="/ja"]')).toHaveText("ホーム");
  await expect(page.locator(".seopage-faq h2")).toHaveText("よくある質問");
  await expect(page.locator(".seopage-related a[href='/wechat-claude']")).toContainText(
    "WeChat で Claude を使う",
  );
  expect(withoutSwitcherLabels(await page.locator("body").innerText())).not.toMatch(
    CHINESE_RESIDUE,
  );

  // The Chinese tutorial keeps its unprefixed URL and opens in Chinese.
  await page.locator('.seopage-hero a[href="/docs/deepseek-in-wechat"]').first().click();
  await expect(page).toHaveURL(`${origin}/docs/deepseek-in-wechat`);
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");

  // The prerendered trigger does nothing until the app mounts; wait for that
  // before opening the menu, here and after the full reload to English.
  const japaneseMounted = appMounted(page, `${origin}/ja/wechat-bot`);
  await page.goto(`${origin}/ja/wechat-bot`);
  await japaneseMounted;
  await expect(page.locator("h1")).toHaveText("WeChat ボットの作り方：まず経路を選ぶ");
  const switcher = page.locator(".site-language");
  await switcher.getByRole("button", { name: "言語：日本語", exact: true }).click();
  await expect(switcher.getByRole("menuitem", { name: "English", exact: true })).toHaveAttribute(
    "href",
    "/en/wechat-bot",
  );
  await expect(switcher.getByRole("menuitem", { name: "Español", exact: true })).toHaveAttribute(
    "href",
    "/es/wechat-bot",
  );
  await expect(switcher.getByRole("menuitem", { name: "中文", exact: true })).toHaveAttribute(
    "href",
    "/wechat-bot",
  );
  const englishPath = "/en/wechat-bot";
  const destination = page.waitForResponse(`${origin}${englishPath}`);
  const englishMounted = appMounted(page, `${origin}${englishPath}`);
  await switcher.getByRole("menuitem", { name: "English", exact: true }).click();
  expect((await destination).status()).toBe(200);
  await englishMounted;
  await expect(page).toHaveURL(`${origin}${englishPath}`);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await switcher.getByRole("button", { name: "Language: English", exact: true }).click();
  await expect(switcher.getByRole("menuitem", { name: "日本語", exact: true })).toHaveAttribute(
    "href",
    "/ja/wechat-bot",
  );
});

test("keeps the pricing query and fragment when the Japanese homepage links to a plan", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto(`${origin}/ja`);
  await page.locator('.landing-plan-year a[href="/ja/pricing?interval=year#plan-year"]').first().click();
  await expect(page).toHaveURL(`${origin}/ja/pricing?interval=year#plan-year`);
  await expect(page.locator("#plan-year")).toHaveAttribute("aria-current", "true");
  await expect(page.locator("#plan-year h3")).toBeInViewport();
  await expect(page.locator("#plan-year .plan-price-unit")).toHaveText("/ 年（人民元）");
  await expect(page.locator("#plan-year .plan-cta")).toHaveAttribute(
    "href",
    `/register?returnTo=${encodeURIComponent("/ja/pricing?interval=year#plan-year")}`,
  );

  await page.goto(`${origin}/ja/pricing?interval=month#plan-month`);
  await expect(page.locator("#plan-month h3")).toBeInViewport();
  await expect(page.locator("#plan-month .plan-price-unit")).toHaveText("/ 月（人民元）");
});

test("keeps the Chinese guide fallback working from the Japanese homepage", async ({ page }) => {
  await page.goto(`${origin}/ja`);
  await page.locator(".steps-heading").getByRole("link", { name: "はじめかたガイドを読む" }).click();
  await expect(page).toHaveURL(`${origin}/docs/getting-started`);
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
});

test("keeps the signed-in Korean pricing account menu in Korean", async ({ page }) => {
  await page.route("**/api/auth/get-session*", (route) => route.fulfill({ json: englishBuyer }));
  await page.route("**/api/dashboard", (route) =>
    route.fulfill({ json: { plan: "plus", planUntil: Date.UTC(2030, 0, 1), wallet: { balance: 100 } } }),
  );
  await page.goto(`${origin}/ko/pricing`);
  await page.getByRole("button", { name: "사용자 메뉴", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "계정 메뉴", exact: true });
  await expect(menu.getByRole("link", { name: "워크스페이스 열기" }))
    .toHaveAttribute("href", "/ko/app");
  await expect(menu.getByRole("link", { name: "멤버십 갱신" }))
    .toHaveAttribute("href", "/app/billing");
  await expect(menu.getByRole("button", { name: "로그아웃" })).toBeVisible();
  await expect(menu).not.toContainText(/\p{Script=Han}/u);
});

test("serves the Korean homepage and pricing page without Chinese page copy", async ({ page }) => {
  const mounted = page.waitForRequest("**/api/auth/get-session");
  await page.goto(`${origin}/ko`);
  await mounted;

  await expect(page.locator("h1")).toContainText("당신의 AI를");
  await expect(page.locator("h1")).toContainText("위챗으로");
  await expect(page.locator('.site-header-nav a[href="/ko/pricing"]')).toHaveText("가격");
  await expect(page.locator('.site-header-nav a[href="/docs"]')).toHaveText("문서");
  await expect(
    page.locator('.landing-plan-year a[href="/ko/pricing?interval=year#plan-year"]').first(),
  ).toBeVisible();
  const faq = page.locator(".landing-faq details").first();
  await faq.locator("summary").click();
  await expect(faq).toHaveAttribute("open", "");
  await expect(faq).toContainText("모델 API 키를 직접 준비해야 하나요?");
  expect(await page.locator("body").innerText()).not.toMatch(/\p{Script=Han}/u);

  await page.goto(`${origin}/pricing`);
  await page.getByRole("button", { name: "语言：中文", exact: true }).click();
  await page.getByRole("menuitem", { name: "한국어", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/ko/pricing`);
  await expect(page.locator("html")).toHaveAttribute("lang", "ko-KR");
  await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", "ko_KR");
  await expect(page.locator("h1")).toHaveText(
    "무료로 시작하고 필요할 때 Plus로 업그레이드하세요",
  );
  await expect(page.locator(".plan h3")).toHaveText(["무료", "Plus 월간", "Plus 연간"]);
  await expect(page.locator(".plan-year .plan-price-unit")).toHaveText("/ 년");
  const estimate = page.locator(".pricing-estimate");
  await estimate.locator("summary").click();
  await expect(estimate).toHaveAttribute("open", "");
  await expect(estimate.locator(".cost-results")).toContainText("크레딧");
  expect(await page.locator("body").innerText()).not.toMatch(/\p{Script=Han}/u);
  const readableAttributes = await page.evaluate(() =>
    [...document.querySelectorAll("[alt], [aria-label], [title], [placeholder]")]
      .flatMap((element) =>
        ["alt", "aria-label", "title", "placeholder"].map(
          (name) => element.getAttribute(name) ?? "",
        ),
      )
      .join(" "),
  );
  expect(readableAttributes).not.toMatch(/\p{Script=Han}/u);

  await page.goto(`${origin}/ko/wechat-ai`);
  await expect(page.locator("h1")).toHaveText("위챗 AI: 내 대형 모델을 위챗 대화에 연결");
  await expect(page.locator(".seopage-related a").first()).toHaveAttribute(
    "href",
    "/ko/wechat-deepseek",
  );
  const landingFaq = page.locator("#faq details").first();
  await landingFaq.locator("summary").click();
  await expect(landingFaq).toHaveAttribute("open", "");
  await expect(landingFaq).toContainText("위챗 AI는 위챗 공식 기능인가요?");
  expect(await page.locator("body").innerText()).not.toMatch(/\p{Script=Han}/u);
});

test("opens the registered English getting-started guide from the homepage", async ({ page }) => {
  await page.goto(`${origin}/en`);
  await page.getByRole("link", { name: "Read the getting-started guide", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/en/docs/getting-started`);
  await expect(page.locator("h1")).toHaveText(
    "WeChat AI guide: configure a model and connect by QR code",
  );
});

test("preserves the getting-started section when opening the English guide", async ({ page }) => {
  await page.goto(`${origin}/en`);
  await page.getByRole("link", { name: "ClawBot entry", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/en/docs/getting-started#clawbot-entry`);
  await expect(page.locator("#clawbot-entry")).toBeVisible();
});

for (const [surface, toggle] of [
  ["FAQ", "How do credits work? Do daily credits roll over?"],
  ["estimator", "Estimate my daily usage"],
]) {
  test(`opens the registered English billing guide from the pricing ${surface}`, async ({ page }) => {
    await page.goto(`${origin}/en/pricing`);
    await page.getByText(toggle, { exact: true }).click();
    await page.getByRole("link", { name: "See full billing rules", exact: true }).click();
    await expect(page).toHaveURL(`${origin}/en/docs/credits`);
    await expect(page.locator("h1")).toHaveText(
      "Wechatai membership and credits: allowance, billing and referral rewards",
    );
  });
}

test("labels the Xiaowei mention with the configured shortcut placeholder", async ({ page }) => {
  await page.goto(`${origin}/en`);
  const example = page.locator(".use-case-cloud .scene-task-prompt");
  await expect(example).toBeVisible();
  await expect(example).toContainText("@<shortcut> convert this Markdown to Word");
  await expect(page.locator(".use-case-cloud .use-case-copy")).toContainText(
    "replace <shortcut> with your configured WeChat shortcut.",
  );
});
