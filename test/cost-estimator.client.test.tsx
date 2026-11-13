import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { CostEstimator } from "../src/client/cost-estimator";

it("estimates costs without credentials or network requests", async () => {
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
          <CostEstimator />
        </MemoryRouter>,
      ),
    );
    expect(node.querySelector("input[type=password]")).toBeNull();
    expect(node.textContent).toContain("18 credits");
    expect(node.textContent).toContain("填写单价后显示");
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    node.remove();
    vi.unstubAllGlobals();
  }
});
