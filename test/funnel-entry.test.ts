import { describe, expect, it } from "vitest";
import { FUNNEL_EVENTS, funnelEventPayloadSchema } from "../src/shared/funnel";
import { FUNNEL_SIDE_EVENTS, FUNNEL_STEPS } from "../src/shared/funnel-report";
import { allowsFunnelEvent } from "../src/shared/funnel-policy";

/**
 * 入口侧事件的契约测试：这几个事件是「首屏 CTA → 注册页 → 表单提交」这条
 * 前半段漏斗的唯一数据源，名字或 props 漂了会让后台直接少一行，
 * 而缺数据不像报错那样会被发现。
 */

const eventId = "3f6c1a52-9e0a-4d6a-8f5e-1c2d3e4f5a6b";
const sessionId = "9b1d7f0a2c";

describe("入口事件载荷", () => {
  it.each([
    ["hero_cta_click", { cta: "primary", auth: "out" }, "/"],
    ["hero_cta_click", { cta: "demo", auth: "in" }, "/"],
    ["register_view", undefined, "/register"],
    ["oauth_click", { provider: "google" }, "/register"],
    ["verify_send", { first: "y" }, "/verify-email"],
    ["verify_send", { first: "n" }, "/verify-email"],
  ])("接受 %s 事件", (name, props, path) => {
    const parsed = funnelEventPayloadSchema.safeParse({ eventId, name, props, sessionId, path });
    expect(parsed.success).toBe(true);
  });

  it("拒绝未登记的事件名", () => {
    const parsed = funnelEventPayloadSchema.safeParse({ eventId, name: "hero_cta", sessionId });
    expect(parsed.success).toBe(false);
  });

  it("props 超过 8 个键时拒绝，避免变成自由文本仓库", () => {
    const props = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`k${i}`, "v"]));
    const parsed = funnelEventPayloadSchema.safeParse({
      eventId,
      name: "hero_cta_click",
      props,
      sessionId,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("侧栏清单与事件表保持一致", () => {
  it("事件表没有重复项（重复会让同一事件被写两次）", () => {
    expect(new Set(FUNNEL_EVENTS).size).toBe(FUNNEL_EVENTS.length);
  });

  /**
   * 这条防的是「加了埋点但没进报表」：事件名写错 `tsc` 会拦，
   * 但一个合法的新事件忘了登记到 FUNNEL_STEPS/FUNNEL_SIDE_EVENTS 不会报错，
   * 只会让数据进库而报表里永远看不见。
   */
  it("每个登记的事件都在报表里出现且只出现一次", () => {
    // onboarding_step 按步展开后会淹没主路径，报表只看 onboarding_done 与 skip。
    const notSurfaced = new Set<string>(["onboarding_step"]);
    const counts = new Map<string, number>();
    for (const { name } of [...FUNNEL_STEPS, ...FUNNEL_SIDE_EVENTS])
      counts.set(name, (counts.get(name) ?? 0) + 1);
    for (const name of FUNNEL_EVENTS) {
      if (notSurfaced.has(name)) {
        expect(counts.has(name), `${name} 不该在报表里`).toBe(false);
        continue;
      }
      expect(counts.get(name), `${name} 没有出现在后台报表里`).toBe(1);
    }
  });

  it("主路径与辅助事件不重叠（重叠会让条形图重复计数）", () => {
    const steps = new Set<string>(FUNNEL_STEPS.map((step) => step.name));
    for (const { name } of FUNNEL_SIDE_EVENTS) expect(steps.has(name)).toBe(false);
  });

  it("每个条目都有可读的标签", () => {
    for (const { name, label } of [...FUNNEL_STEPS, ...FUNNEL_SIDE_EVENTS]) {
      expect(label.trim().length, `${name} 缺少标签`).toBeGreaterThan(1);
    }
  });
});

describe("演示工作台不污染正式漏斗", () => {
  it("首页与注册页放行", () => {
    expect(allowsFunnelEvent("hero_cta_click", "/")).toBe(true);
    expect(allowsFunnelEvent("register_view", "/register")).toBe(true);
  });

  it("/demo 只允许 demo_view", () => {
    expect(allowsFunnelEvent("hero_cta_click", "/demo")).toBe(false);
    expect(allowsFunnelEvent("register_view", "/demo/dashboard")).toBe(false);
    expect(allowsFunnelEvent("demo_view", "/demo/dashboard")).toBe(true);
  });
});
