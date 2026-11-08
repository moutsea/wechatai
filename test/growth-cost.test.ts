import { expect, it } from "vitest";
import { estimateTextCost } from "../src/shared/cost-estimate";
import { creditUnits } from "../src/server/wallet";
import { GUIDE_CONTENT } from "../src/client/pages/guide-content";
import { PLUGIN_LIMITS } from "../src/shared/plugin-access";

it("matches actual per-request metering and separates provider costs", () => {
  for (const [input, output, rounds] of [
    [1000, 1000, 10],
    [1, 0, 100],
    [200001, 9999, 23],
    [0, 0, 0],
  ]) {
    const result = estimateTextCost(input, output, rounds, 2, 8)!;
    expect(result.credits).toBe((creditUnits(input, output) * rounds) / 1000);
    expect(result.modelYuan).toBe(((input * 2 + output * 8) * rounds) / 1_000_000);
  }
  expect(estimateTextCost(-1, 100, 2, 0, 0)).toBeNull();
  expect(estimateTextCost(1, 1, 1.5, 0, 0)).toBeNull();
  expect(estimateTextCost(Infinity, 1, 1, 0, 0)).toBeNull();
});
it("documents the implemented Free plugin allowance", () => {
  const body = GUIDE_CONTENT.credits.sections[0].body;
  expect(body).toContain(
    `| DS Chat、Agent、个人助理等插件配置 | ${PLUGIN_LIMITS.free} 个 | 不限 |`,
  );
  expect(body).not.toContain("DS Chat、Agent 等插件 | 不支持");
});
