import { beforeAll, expect, it } from "vitest";
import { renderPublicPage } from "../src/client/prerender";
import { getPageSeo, renderSeoHead } from "../src/shared/seo";

const path = "/wechat-ai-ban-risk";
let page: Document;

beforeAll(() => {
  page = new DOMParser().parseFromString(
    `<html><head>${renderSeoHead(getPageSeo(path))}</head><body>${renderPublicPage(path)}</body></html>`,
    "text/html",
  );
});

it("guides readers across each checklist row without scoring their risk", () => {
  const section = page.querySelector("#self-check");
  expect(section?.querySelector("p")?.textContent).toMatch(/危险信号[^。]*同一行[^。]*安全做法/);
  expect(section?.textContent).not.toMatch(/答「是」|平均水平|概率[^。]*量级/);
});

it("identifies the CNCERT announcement link as a reprint by 安全内参", () => {
  const citation = page.querySelector('#sources a[href="https://www.secrss.com/articles/91136"]');
  expect(citation?.textContent).toMatch(/安全内参.*转载/);
  expect(citation?.parentElement?.textContent).not.toContain("授权转载");
});

it("publishes Skill-related account bans as a possibility, not a WeChat penalty", () => {
  const question = "装 AI 插件 Skill 也有风险吗？";
  const faq = [...page.querySelectorAll("#faq details")].find(
    (item) => item.querySelector("summary")?.textContent === question,
  );
  const answer = faq?.querySelector("p")?.textContent;
  expect(answer).toMatch(/可能导致[^。]*账号[^。]*封禁/);
  expect(answer).toContain("并非针对微信账号");

  const graph = JSON.parse(page.querySelector("script[data-seo]")!.textContent!)["@graph"] as {
    "@type": string;
    mainEntity?: { name: string; acceptedAnswer: { text: string } }[];
  }[];
  const faqNode = graph.find((node) => node["@type"] === "FAQPage");
  expect(faqNode?.mainEntity?.find((item) => item.name === question)?.acceptedAnswer.text).toBe(
    answer,
  );

  const section = page.querySelector("#skill-supply");
  expect(section?.textContent).toMatch(/可能导致[^。]*账号[^。]*封禁/);
  expect(section?.textContent).not.toContain("却同样触发平台处罚");
});
