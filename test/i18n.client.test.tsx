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

it("links only the registered alternative language with a real anchor", async () => {
  registerTranslations("en", [sample], "fixture");
  await act(async () => render("/pricing", <LanguageSwitcher />));
  const english = container.querySelector("a")!;
  expect(english.textContent).toBe("English");
  expect(english.getAttribute("href")).toBe("/en/pricing");
  expect(english.getAttribute("hreflang")).toBe("en");

  await act(async () => root.unmount());
  root = createRoot(container);
  await act(async () => render("/en/pricing", <LanguageSwitcher />));
  const chinese = container.querySelector("a")!;
  expect(chinese.textContent).toBe("中文");
  expect(chinese.getAttribute("href")).toBe("/pricing");
  expect(chinese.getAttribute("hreflang")).toBe("zh-CN");
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
