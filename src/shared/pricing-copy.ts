/**
 * 营销页文案里出现的价格（单位：元）。
 *
 * 为什么是字面量而不是 `import { BILLING_OFFERS }`：首页与全部 SEO 落地页都在首屏
 * 关键路径上，一旦 import 价格清单，构建器就会把账单页那套模块合并成一个几十 KB 的
 * 共享 chunk 并预加载到每一个页面。价格只有一个真实来源 `BILLING_OFFERS`
 * （`src/shared/billing-offers.ts`），这里的一致性由 `test/seo.test.ts` 断言保证：
 * 改动 BILLING_OFFERS 却没有同步这里，测试会失败。
 */
export const PLUS_MONTHLY_YUAN = 9.9;
export const PLUS_YEARLY_YUAN = 88;

/**
 * 折合月价（¥7.3）与正式价（¥9.90）用的是两套精度：折合价只保留一位小数，
 * 否则同一页里会同时出现「¥7.33」和「约 ¥7.3」，读者会以为不是同一个数。
 * 入参单位是「分」，与 `BILLING_OFFERS.amount` 一致。
 */
export function approxYuan(cents: number) {
  return `¥${Number((cents / 100).toFixed(1))}`;
}
