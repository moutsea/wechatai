import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeAll, expect, it, vi } from "vitest";
import { renderPublicPage } from "../src/client/prerender";
import { SeoLandingPage } from "../src/client/pages/seo-landing";
import { AnonymousAuthProvider } from "../src/client/auth";

let page: Document;

beforeAll(() => {
  page = new DOMParser().parseFromString(renderPublicPage("/wechat-muse"), "text/html");
});

it("shows the WeChat setup step without raw link markup and keeps both connection links", () => {
  const step = page.querySelector(".seopage-steps li:first-child small")?.textContent;
  expect(step).toContain("/wx help");
  expect(step).not.toMatch(/\[[^\]]+\]\([^)]+\)/);
  expect(page.querySelector('.seopage-actions a[href="/app/wechat"]')?.textContent).toContain(
    "扫码绑定微信",
  );
  expect(page.querySelector('#connect a[href="/app/wechat"]')?.textContent).toBe("微信连接");
});

it("tells readers to generate the command with Connect Muse before using the copy button", () => {
  const steps = [...page.querySelectorAll("#connect ol > li")].map((step) => step.textContent ?? "");
  const connect = steps.findIndex((step) => step.includes("「连接 Muse」"));
  const copy = steps.findIndex((step) => step.includes("「复制 Muse 连接指令」"));
  expect(connect).toBeGreaterThanOrEqual(0);
  expect(copy).toBe(connect + 1);
  expect(steps.slice(connect, copy + 1).join(" ")).not.toContain("「生成连接命令」");
  expect(steps[copy]).toContain("主聊天");
});

it("links the technical guide, plugin library, pricing, and related topics", () => {
  for (const href of [
    "/developers/muse",
    "/app/plugins",
    "/pricing",
    "/wechat-agent",
    "/wechat-ai-options",
    "/compare/wechatai-vs-openclaw",
  ]) {
    expect(page.querySelector(`.seopage-related a[href="${href}"]`), href).toBeTruthy();
  }
});

it("orders connect, copy, send and keeps validity and online rules explicit", () => {
  const answer = page.querySelector(".seopage-answer")?.textContent ?? "";
  const connect = answer.indexOf("「连接 Muse」");
  const copy = answer.indexOf("「复制 Muse 连接指令」");
  expect(connect).toBeGreaterThanOrEqual(0);
  expect(copy).toBeGreaterThan(connect);
  expect(answer).toContain("10 分钟内有效");
  expect(answer).toContain("dry run");
  expect(answer).toContain("实际轮询成功");
  const section = page.querySelector("#connect")?.textContent ?? "";
  expect(section).toContain("过期后在弹窗里重新生成");
  expect(section).toContain("dry run 通过都不等于已连接");
  expect(section).not.toContain("直接安装");
  expect(section).not.toContain("无需绑定");
});

it("points the primary CTA at WeChat and the next setup step at plugins", () => {
  expect(page.querySelector('.seopage-actions a[href="/app/wechat"]')?.textContent).toContain(
    "扫码绑定微信",
  );
  expect(page.querySelector('.seopage-actions a[href="/app/plugins"]')?.textContent).toContain(
    "添加 Muse 插件",
  );
  expect(page.querySelector('#connect a[href="/app/plugins"]')?.textContent).toContain("插件页");
});

it("keeps the long step overview collapsible with copy buttons for example commands", () => {
  const details = page.querySelector("details.seopage-steps-details");
  expect(details?.hasAttribute("open")).toBe(true);
  expect(details?.querySelector("summary")?.textContent).toContain("三步概览");
  expect(details?.querySelectorAll(".seopage-steps li")).toHaveLength(3);
  const labels = [...page.querySelectorAll(".seopage-command button")].map((button) =>
    button.getAttribute("aria-label"),
  );
  expect(labels).toEqual([
    "复制命令 /wx help",
    "复制命令 /use muse",
    "复制命令 @muse 任务内容",
    "复制命令 /wx status",
  ]);
});

it("copies an example command and shows visible feedback", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const writeText = vi.fn().mockResolvedValue(undefined);
  const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={["/wechat-muse"]}>
          <AnonymousAuthProvider>
            <Routes>
              <Route path="/:slug" element={<SeoLandingPage />} />
            </Routes>
          </AnonymousAuthProvider>
        </MemoryRouter>,
      ),
    );
    const button = [...container.querySelectorAll<HTMLButtonElement>(".seopage-command button")].find(
      (candidate) => candidate.getAttribute("aria-label") === "复制命令 /use muse",
    )!;
    await act(async () => button.click());
    expect(writeText).toHaveBeenCalledWith("/use muse");
    expect(button.textContent).toContain("已复制");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    if (original) Object.defineProperty(navigator, "clipboard", original);
    else Reflect.deleteProperty(navigator, "clipboard");
    vi.unstubAllGlobals();
  }
});
