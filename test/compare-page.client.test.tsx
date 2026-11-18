import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AnonymousAuthProvider } from "../src/client/auth";
import { ComparePage } from "../src/client/pages/compare-page";

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
