import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PageMetadata } from "../src/client/seo";

vi.mock("../src/shared/seo", () => {
  throw new Error("Failed to fetch metadata chunk");
});

let container: HTMLDivElement;
let root: Root;
let oldTitle: string;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  oldTitle = document.title;
  document.head.querySelectorAll("title").forEach((node) => node.remove());
  document.head.insertAdjacentHTML(
    "beforeend",
    `
    <title data-seo>Original homepage</title>
    <link data-seo rel="canonical" href="https://wechatai.app/">
    <meta data-seo name="robots" content="index, follow">
    <meta data-seo name="description" content="Homepage description">
    <meta data-seo property="og:url" content="https://wechatai.app/">
    <script data-seo type="application/ld+json">{"url":"https://wechatai.app/"}</script>
    <meta data-metadata-test name="google-site-verification" content="verification-token">
  `,
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.head
    .querySelectorAll("[data-seo], [data-metadata-test]")
    .forEach((node) => node.remove());
  document.title = oldTitle;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps matching prerendered metadata without depending on the deferred module", async () => {
  const canonical = document.head.querySelector('link[rel="canonical"]');
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/"]}>
        <PageMetadata />
      </MemoryRouter>,
    ),
  );
  expect(document.head.querySelector('link[rel="canonical"]')).toBe(canonical);
  expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
    "index, follow",
  );
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it("removes the previous page's public metadata on failure without destroying content or verification tags", async () => {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/login"]}>
        <PageMetadata />
        <main>
          <h1>Login</h1>
        </main>
      </MemoryRouter>,
    ),
  );
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(container.querySelector('[role="alert"] button')).not.toBeNull();
  });
  expect(container.querySelector("main h1")?.textContent).toBe("Login");
  expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
  expect(document.head.querySelector('meta[property="og:url"]')).toBeNull();
  expect(document.head.querySelector('meta[name="description"]')).toBeNull();
  expect(document.head.querySelector('script[type="application/ld+json"]')).toBeNull();
  expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
    "noindex, follow",
  );
  expect(
    document.head.querySelector('meta[name="google-site-verification"]')?.getAttribute("content"),
  ).toBe("verification-token");
  expect(document.title).not.toBe("Original homepage");
});
