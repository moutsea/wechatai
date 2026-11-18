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
