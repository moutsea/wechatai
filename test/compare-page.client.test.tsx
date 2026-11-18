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
