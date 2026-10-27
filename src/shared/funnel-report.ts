import type { FunnelEvent } from "./funnel";

/**
 * 后台关键事件触达的口径。
 *
 * 这里刻意不 import `./funnel` 的**值**（只有 type import）：`funnel.ts` 为了校验请求体
 * 引入了 zod，而这份口径同时被浏览器端的后台页使用，一旦引入值就会把 zod 一起打进
 * admin chunk。事件名本身仍由 `FUNNEL_EVENTS` 约束，写错名字在 `tsc` 阶段就会报错。
 */

/** 按产品流程展示独立事件，不要求访客按这个顺序完成。 */
export const FUNNEL_STEPS: readonly { name: FunnelEvent; label: string }[] = [
  { name: "signup_submit", label: "提交注册" },
  { name: "verify_sent", label: "注册信已自动发出" },
  { name: "verify_done", label: "邮箱已验证" },
  { name: "onboarding_done", label: "引导完成" },
  { name: "channel_saved", label: "渠道配置已保存" },
  { name: "channel_models_imported", label: "渠道模型已导入" },
  { name: "wechat_connected", label: "微信已连接" },
  { name: "paywall_view", label: "看到付费墙" },
  { name: "paywall_click", label: "点了升级" },
  { name: "checkout_start", label: "发起结账" },
  { name: "checkout_success", label: "结账成功" },
];

/** 辅助事件：失败、跳过与入口事件独立列示。 */
export const FUNNEL_SIDE_EVENTS: readonly { name: FunnelEvent; label: string }[] = [
  { name: "channel_test_failed", label: "拉模型失败" },
  { name: "onboarding_skip", label: "跳过引导" },
  { name: "invite_share_click", label: "复制邀请链接" },
  { name: "hero_cta_click", label: "首屏 CTA 点击" },
  { name: "register_view", label: "到达注册页" },
  { name: "oauth_click", label: "快捷登录点击" },
  { name: "verify_send", label: "手动发送/重发验证信" },
];

export type FunnelCount = { visitorDays: number; events: number };

export type FunnelStepStat = {
  name: FunnelEvent;
  label: string;
  /** 每日去重访客之和；不是区间独立人数。 */
  visitorDays: number;
  /** 原始事件数（同一个人可能重复触发） */
  events: number;
};

export type FunnelSummary = {
  range: { from: string; to: string; days: number };
  steps: FunnelStepStat[];
  side: FunnelStepStat[];
};

/**
 * 事件可能来自不同批访客，按天加盐的哈希也不能跨天识别人。
 * 只输出访客日和事件次数，不能通过相邻计数相除生成留存率或整体转化率。
 */
export function summarizeFunnel(
  range: FunnelSummary["range"],
  counts: Partial<Record<FunnelEvent, FunnelCount>>,
): FunnelSummary {
  const build = (steps: readonly { name: FunnelEvent; label: string }[]) =>
    steps.map((step): FunnelStepStat => {
      const count = counts[step.name];
      return {
        name: step.name,
        label: step.label,
        visitorDays: count?.visitorDays ?? 0,
        events: count?.events ?? 0,
      };
    });
  return {
    range,
    steps: build(FUNNEL_STEPS),
    side: build(FUNNEL_SIDE_EVENTS),
  };
}

/** 空报表：给测试与「当天还没有任何事件」的渲染兜底。 */
export function emptyFunnelSummary(range: FunnelSummary["range"]): FunnelSummary {
  return summarizeFunnel(range, {});
}
