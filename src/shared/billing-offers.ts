/**
 * 价格档位的单一事实来源。
 *
 * 单独成文件是刻意的：营销页（首页价格锚、/pricing 方案卡）只要这几个常量，
 * 而 `billing.ts` 里还有结账、订阅状态等只在账单页用到的类型与逻辑；放在一起会让
 * 首页预加载一整块本页用不到的代码。`billing.ts` 会 re-export 这里的定义。
 */
export const BILLING_OFFERS = [
  {
    id: "plus_monthly",
    kind: "plus",
    name: "Plus 月付",
    amount: 990,
    credits: 0,
    interval: "month",
    priceEnv: "STRIPE_PLUS_MONTHLY_PRICE_ID",
  },
  {
    id: "plus_yearly",
    kind: "plus",
    name: "Plus 年付",
    amount: 8800,
    credits: 0,
    interval: "year",
    priceEnv: "STRIPE_PLUS_YEARLY_PRICE_ID",
  },
  {
    id: "credits_5000",
    kind: "credits",
    name: "Credits 小包",
    amount: 990,
    credits: 5000,
    interval: null,
    priceEnv: "STRIPE_CREDITS_5000_PRICE_ID",
  },
  {
    id: "credits_20000",
    kind: "credits",
    name: "Credits 标准包",
    amount: 2900,
    credits: 20000,
    interval: null,
    priceEnv: "STRIPE_CREDITS_20000_PRICE_ID",
  },
  {
    id: "credits_50000",
    kind: "credits",
    name: "Credits 大包",
    amount: 5900,
    credits: 50000,
    interval: null,
    priceEnv: "STRIPE_CREDITS_50000_PRICE_ID",
  },
] as const;
