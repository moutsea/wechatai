import { beforeAll, expect, it } from "vitest";
import { renderPublicPage } from "../src/client/prerender";

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
