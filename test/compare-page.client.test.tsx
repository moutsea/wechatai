import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AnonymousAuthProvider } from "../src/client/auth";
import { ComparePage } from "../src/client/pages/compare-page";
import { SeoLandingPage } from "../src/client/pages/seo-landing";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderAt(path: string) {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <AnonymousAuthProvider>
          <Routes>
            <Route path="/compare/:pair" element={<ComparePage />} />
            <Route path="/:slug" element={<SeoLandingPage />} />
            <Route path="*" element={<p>这个页面没有找到。</p>} />
          </Routes>
        </AnonymousAuthProvider>
      </MemoryRouter>,
    ),
  );
}

it("renders a known comparison pair with every fact row", async () => {
  await renderAt("/compare/wechatai-vs-openclaw");
  expect(container.querySelector("h1")?.textContent).toBe(
    "微伴 vs 自建 OpenClaw：把运行和维护也算进成本",
  );
  const rows = [...container.querySelectorAll(".seopage-compare-table tbody tr")];
  expect(rows.map((row) => row.querySelector("th")?.textContent)).toEqual([
    "价格",
    "是否需自备 Key",
    "是否支持群聊",
    "是否需设备在线",
    "是否需自行部署",
  ]);
  expect(container.querySelectorAll(".seopage-compare-missing")).toHaveLength(1);
});

it("falls back to not found for an unknown pair", async () => {
  await renderAt("/compare/not-a-pair");
  expect(container.querySelector("h1")?.textContent).toBe("这个页面没有找到。");
  expect(container.querySelector(".seopage-compare-table")).toBeNull();
});

it("renders the comparison index with links to every pair", async () => {
  await renderAt("/compare");
  expect(container.querySelector("h1")?.textContent).toBe("微信 AI 对比：先看三类方案再选");
  const hrefs = [...container.querySelectorAll("a")]
    .map((link) => link.getAttribute("href"))
    .filter((href): href is string => Boolean(href));
  for (const pair of [
    "/compare/wechatai-vs-wechat-official-ai",
    "/compare/wechatai-vs-openclaw",
    "/compare/wechatai-vs-commercial-wechat-ai",
  ]) {
    expect(hrefs, pair).toContain(pair);
  }
  expect(hrefs).toContain("/wechat-ai-options");
  expect(hrefs).toContain("/wechat-ai-ban-risk");
  expect(container.querySelectorAll(".seopage-compare-table")).toHaveLength(0);
});

it("presents Wechatai separately from the three alternatives in the comparison index", async () => {
  await renderAt("/compare");
  const scope = /微伴[与和]另外三类微信 AI 方案/;
  expect.soft(container.querySelector(".seopage-lede")?.textContent, "intro").toMatch(scope);
  expect.soft(container.querySelector(".seopage-answer")?.textContent, "direct answer").toMatch(scope);
  expect.soft(container.querySelector("#faq summary")?.textContent, "first FAQ question").toMatch(scope);
});

it.each(["wechatai-vs-wechat-official-ai", "wechatai-vs-openclaw", "wechatai-vs-commercial-wechat-ai"])(
  "distinguishes Wechatai model requirements from an existing OpenClaw connection for %s",
  async (pair) => {
    await renderAt(`/compare/${pair}`);
    const rows = [...container.querySelectorAll(".seopage-compare-table tbody tr")];
    const key = rows.find((row) => row.querySelector("th")?.textContent === "是否需自备 Key");
    const wechatai = key?.querySelector("td")?.textContent;
    expect(wechatai).toMatch(/普通聊天[^；]*小薇[^；]*需[^；]*API Key/);
    expect(wechatai).toMatch(/已有 OpenClaw[^；]*沿用[^；]*Agent[^；]*模型配置[^；]*无需[^；]*微伴模型渠道/);
  },
);

it.each(["wechatai-vs-wechat-official-ai", "wechatai-vs-openclaw", "wechatai-vs-commercial-wechat-ai"])(
  "distinguishes self-hosted agents from hosted Muse on %s",
  async (pair) => {
    await renderAt(`/compare/${pair}`);
    const rows = [...container.querySelectorAll(".seopage-compare-table tbody tr")];
    const deployment = rows.find((row) => row.querySelector("th")?.textContent === "是否需自行部署");
    const wechatai = deployment?.querySelector("td")?.textContent;
    expect(wechatai).toMatch(/普通聊天[^；]*无需自行部署/);
    expect(wechatai).toMatch(/自建 OpenClaw[^；]*Hermes[^；]*自行部署/);
    expect(wechatai).toMatch(/托管 Muse[^；]*无需自行部署/);
  },
);

it("leaves unverified device requirements unknown and separates local and cloud self-hosting", async () => {
  await renderAt("/wechat-ai-options");
  const rows = [...container.querySelectorAll("#four table tbody tr")];
  const cellsFor = (label: string) => {
    const row = rows.find((row) => row.firstElementChild?.textContent === label);
    return Array.from(row?.querySelectorAll("td") ?? [], (cell) => cell.textContent);
  };
  const [, officialDevice, commercialDevice, selfHostedDevice, relayDevice] =
    cellsFor("需要设备常开");
  expect([officialDevice, commercialDevice]).toEqual(["未核实", "未核实"]);
  expect(selfHostedDevice).toMatch(/运行 Agent 的设备[^；]*在线/);
  expect(relayDevice).toMatch(/普通模型聊天[^；]*不需要.*自建 Agent[^；]*设备[^；]*在线/);

  const [, , , selfHostedKey, relayKey] = cellsFor("需要自己的 API Key");
  expect(selfHostedKey).toMatch(/本地[^；]*无需真实服务商凭据.*云 API[^；]*(?:Key|账号)/);
  expect(relayKey).toMatch(/普通聊天[^；]*小薇[^；]*需要.*已有 OpenClaw[^；]*无需微伴模型渠道/);

  const [, , , selfHostedCost, relayCost] = cellsFor("费用结构");
  expect(selfHostedCost).toMatch(/运行环境[^；]*维护.*本地[^；]*不产生[^；]*API 费.*云 API[^；]*服务商/);
  expect(relayCost).toMatch(/中转费.*使用云 API[^；]*模型费[^；]*另付服务商/);
});

it("renders the WeChat bot guide with its full link label on the options page", async () => {
  await renderAt("/wechat-ai-options");
  const link = container.querySelector('.seopage-related a[href="/wechat-bot"]');
  expect(link?.textContent).toBe("微信机器人怎么弄：先选对路线");
});

it("distinguishes text usage from per-image credits in the commercial comparison", async () => {
  await renderAt("/compare/wechatai-vs-commercial-wechat-ai");
  for (const selector of [".seopage-answer", "#two-models"]) {
    const copy = container.querySelector(selector)?.textContent;
    expect(copy).toMatch(/文字[^。；]*(?:输入|输出)[^。；]*credits/);
    expect(copy).toMatch(/生图[^。；]*每张[^。；]*5\s*credits/);
  }
});

it.each(["wechatai-vs-wechat-official-ai", "wechatai-vs-commercial-wechat-ai"])(
  "shows unverified device and deployment requirements as unknown for %s",
  async (pair) => {
    await renderAt(`/compare/${pair}`);
    const rows = [...container.querySelectorAll(".seopage-compare-table tbody tr")];
    for (const label of ["是否需设备在线", "是否需自行部署"]) {
      const row = rows.find((row) => row.querySelector("th")?.textContent === label);
      expect(row?.querySelector("td:last-child")?.textContent?.trim(), label).toBe("—");
    }
    expect(container.querySelector("#five-facts")?.textContent).toMatch(
      /设备在线与部署[^。]*表中留空/,
    );
  },
);

it("separates local OpenClaw costs and credentials from cloud API requirements", async () => {
  await renderAt("/compare/wechatai-vs-openclaw");
  const rows = [...container.querySelectorAll(".seopage-compare-table tbody tr")];
  const price = rows.find((row) => row.querySelector("th")?.textContent === "价格");
  const key = rows.find((row) => row.querySelector("th")?.textContent === "是否需自备 Key");
  expect(price?.querySelector("td:last-child")?.textContent).toMatch(
    /本地[^；]*不产生[^；]*API 费.*云 API[^；]*服务商/,
  );
  expect(key?.querySelector("td:last-child")?.textContent).toMatch(
    /本地 Ollama[^；]*无需[^；]*服务商凭据.*云 API[^；]*(?:Key|账号)/,
  );
  const faq = [...container.querySelectorAll("#faq details")].find((item) =>
    item.querySelector("summary")?.textContent?.includes("自建 OpenClaw 还需要付微伴 credits 吗"),
  );
  expect(faq?.querySelector("p")?.textContent).toMatch(
    /本地 Ollama[^；。]*不产生[^；。]*API 费.*云 API[^；。]*服务商/,
  );
});

it("distinguishes hosted Word generation from tasks needing local access or custom tools", async () => {
  await renderAt("/compare/wechatai-vs-openclaw");
  const lede = container.querySelector(".seopage-lede")?.textContent;
  expect(lede).toMatch(/云端小薇[^。；]*生成 Word[^。；]*无需自行部署/);
  for (const selector of [".seopage-lede", ".seopage-answer"]) {
    expect(container.querySelector(selector)?.textContent).toMatch(
      /访问本机文件[^。；]*运行本机命令[^。；]*自定义工具[^。；]*自建 OpenClaw/,
    );
  }
});

it("states the operator and Plus requirements wherever hosted Word generation is recommended", async () => {
  await renderAt("/compare/wechatai-vs-openclaw");
  for (const selector of [".seopage-lede", "#hosted-vs-selfhosted"]) {
    expect(container.querySelector(selector)?.textContent, selector).toMatch(
      /运营方开放[^。；]*Plus 会员[^。；]*云端小薇[^。；]*生成 Word[^。；]*无需自行部署/,
    );
  }
});

it.each([
  ["wechatai-vs-wechat-official-ai", "微伴和微信官方内置 AI 是同一个产品吗？"],
  ["wechatai-vs-commercial-wechat-ai", "商业平台需要自己准备 API Key 吗？"],
])("scopes Key and provider charges to the relevant model path on %s", async (pair, question) => {
  await renderAt(`/compare/${pair}`);
  const faq = [...container.querySelectorAll("#faq details")].find((item) =>
    item.querySelector("summary")?.textContent?.includes(question),
  );
  for (const element of [
    container.querySelector(".seopage-answer"),
    container.querySelector("#five-facts"),
    faq?.querySelector("p"),
  ]) {
    const copy = element?.textContent;
    expect(copy).toMatch(/普通聊天和小薇[^。；]*自备[^。；]*API Key/);
    expect(copy).toMatch(/已有 OpenClaw[^。；]*沿用[^。；]*模型配置[^。；]*无需另配微伴模型渠道/);
    expect(copy).toMatch(/云 API[^。；]*才[^。；]*服务商/);
    expect(copy).toMatch(/本地推理[^。；]*不产生模型 API 费/);
  }
});

it("discloses server-side Key storage, use and revocation before recommending Wechatai", async () => {
  await renderAt("/compare/wechatai-vs-commercial-wechat-ai");
  const copy = container.querySelector("#when-wechatai")?.textContent;
  expect(copy).toMatch(/微伴[^。；]*加密保存[^。；]*Key[^。；]*代你调用/);
  expect(copy).toMatch(/服务商后台撤销[^。；]*Key/);
  expect(copy).toMatch(/不能接受[^。；]*保存[^。；]*不适合/);
});

it.each([
  ["wechatai-vs-wechat-official-ai", "price"],
  ["wechatai-vs-openclaw", "cost"],
])("explains which estimator inputs to fill for %s", async (pair, section) => {
  await renderAt(`/compare/${pair}`);
  const link = container.querySelector(`#${section} a[href="/pricing#estimate"]`);
  const instructions = link?.closest("p")?.textContent;
  expect(instructions).toMatch(/输入[^。]*输出[^。]*轮数/);
  expect(instructions).toMatch(/服务商[^。]*输入[^。]*输出[^。]*价/);
  expect(instructions).toMatch(/自动估算[^。]*credits/);
  expect(instructions).not.toContain("平台单价");
});
