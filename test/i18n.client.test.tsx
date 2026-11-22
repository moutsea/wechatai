import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PageMetadata } from "../src/client/seo";
import { LanguageSwitcher } from "../src/client/language-switcher";
import { LocaleProvider } from "../src/client/locale";
import { clearRegisteredTranslations, registerTranslations } from "../src/shared/i18n";

const sample = {
  path: "/pricing",
  title: "Pricing | Wechatai",
  description: "Plans for every WeChat AI workflow.",
  updatedAt: "2026-11-20",
};

let container: HTMLDivElement;
let root: Root;

function render(entry: string, children: ReactNode) {
  root.render(
    <MemoryRouter initialEntries={[entry]}>
      <LocaleProvider>{children}</LocaleProvider>
    </MemoryRouter>,
  );
}

function trigger() {
  return container.querySelector<HTMLButtonElement>(".site-language-trigger")!;
}

function menuItems() {
  return [...container.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]')];
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  document.head.querySelectorAll("[data-seo]").forEach((node) => node.remove());
  document.documentElement.lang = "zh-CN";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.head.querySelectorAll("[data-seo]").forEach((node) => node.remove());
  document.documentElement.lang = "zh-CN";
  clearRegisteredTranslations();
  vi.unstubAllGlobals();
});

it("offers every published language from one trigger and marks the current one", async () => {
  registerTranslations("en", [sample], "fixture");
  await act(async () => render("/pricing", <LanguageSwitcher />));

  expect(trigger().textContent).toContain("中文");
  expect(trigger().getAttribute("aria-haspopup")).toBe("menu");
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
  expect(trigger().getAttribute("aria-label")).toBe("语言：中文");
  expect(menuItems()).toHaveLength(0);

  await act(async () => trigger().click());
  expect(trigger().getAttribute("aria-expanded")).toBe("true");
  expect(trigger().getAttribute("aria-controls")).toBe(
    container.querySelector('[role="menu"]')?.id,
  );
  expect(menuItems().map((item) => item.textContent)).toEqual(["中文", "English"]);

  const chinese = container.querySelector('a[href="/pricing"]')!;
  expect(chinese.getAttribute("href")).toBe("/pricing");
  expect(chinese.getAttribute("hreflang")).toBe("zh-CN");
  expect(chinese.getAttribute("aria-current")).toBe("true");
  const english = container.querySelector('a[href="/en/pricing"]')!;
  expect(english.getAttribute("href")).toBe("/en/pricing");
  expect(english.getAttribute("hreflang")).toBe("en");
  expect(english.getAttribute("aria-current")).toBeNull();

  await act(async () => trigger().click());
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
  // Closed items are removed, so they cannot be reached with Tab.
  expect(container.querySelectorAll("a")).toHaveLength(0);
});

it("opens from the current English page with the Chinese target and current state", async () => {
  registerTranslations("en", [sample], "fixture");
  await act(async () => render("/en/pricing", <LanguageSwitcher />));

  expect(trigger().textContent).toContain("English");
  expect(trigger().getAttribute("aria-label")).toBe("Language: English");
  await act(async () => trigger().click());
  expect(menuItems().map((item) => item.textContent)).toEqual(["中文", "English"]);
  expect(container.querySelector('a[href="/pricing"]')?.textContent).toBe("中文");
  expect(container.querySelector('a[href="/pricing"]')?.getAttribute("hreflang")).toBe("zh-CN");
  expect(container.querySelector('a[href="/en/pricing"]')?.getAttribute("aria-current")).toBe(
    "true",
  );
});

it("closes when pressing outside and when pressing the trigger again", async () => {
  registerTranslations("en", [sample], "fixture");
  await act(async () => render("/pricing", <LanguageSwitcher />));

  await act(async () => trigger().click());
  expect(trigger().getAttribute("aria-expanded")).toBe("true");
  await act(async () => {
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  });
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
  expect(menuItems()).toHaveLength(0);
});

it("moves focus with arrows and returns it to the trigger on Escape", async () => {
  registerTranslations("en", [sample], "fixture");
  registerTranslations("ja", [sample], "fixture");
  await act(async () => render("/pricing", <LanguageSwitcher />));

  await act(async () => {
    trigger().focus();
    trigger().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  });
  expect(trigger().getAttribute("aria-expanded")).toBe("true");
  expect(document.activeElement?.textContent).toBe("中文");

  await act(async () => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
  });
  expect(document.activeElement?.textContent).toBe("English");

  await act(async () => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(trigger());
  expect(menuItems()).toHaveLength(0);
});

it("keeps the existing header appearance when no translation is registered", async () => {
  await act(async () => render("/pricing", <LanguageSwitcher />));
  expect(container.querySelector(".site-language")).toBeNull();
  expect(container.querySelector("a")).toBeNull();
});

it("updates lang and og:locale when returning to the Chinese page", async () => {
  registerTranslations("en", [sample], "fixture");
  function GoChinese() {
    const navigate = useNavigate();
    return <button onClick={() => navigate("/pricing")}>to-zh</button>;
  }
  await act(async () =>
    render(
      "/en/pricing",
      <>
        <PageMetadata />
        <GoChinese />
      </>,
    ),
  );
  await vi.waitFor(() => {
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://wechatai.app/en/pricing",
    );
  });
  expect(document.documentElement.lang).toBe("en");
  expect(document.querySelector('meta[property="og:locale"]')?.getAttribute("content")).toBe(
    "en_US",
  );

  await act(async () => container.querySelector("button")!.click());
  await vi.waitFor(() => {
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://wechatai.app/pricing",
    );
  });
  expect(document.documentElement.lang).toBe("zh-CN");
  expect(document.querySelector('meta[property="og:locale"]')?.getAttribute("content")).toBe(
    "zh_CN",
  );
});
