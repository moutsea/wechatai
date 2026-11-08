import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { GettingStartedPreview, CostEstimator } from "../src/client/getting-started-preview";

it("offers a no-key preview and stops unavailable accounts before configuration", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const node = document.createElement("div");
  document.body.appendChild(node);
  const root = createRoot(node);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <GettingStartedPreview />
          <CostEstimator />
        </MemoryRouter>,
      ),
    );
    const click = async (text: string) => {
      const button = [...node.querySelectorAll("button")].find((b) =>
        b.textContent?.includes(text),
      )!;
      await act(async () => button.click());
    };
    await click("暂时找不到入口");
    expect(node.textContent).toContain("先暂停 Key 配置与付费");
    await click("记下一笔午餐开销");
    expect(node.textContent).toContain("个人助理保存一笔餐饮支出");
    expect(node.querySelector("input[type=password]")).toBeNull();
    expect(node.textContent).toContain("18 credits");
    expect(node.textContent).toContain("填写单价后显示");
    vi.stubGlobal("navigator", { clipboard: undefined });
    await click("复制示例");
    expect(node.textContent).toContain("复制失败，请选中上方文字手动复制");
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    node.remove();
    vi.unstubAllGlobals();
  }
});
