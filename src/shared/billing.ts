export const BILLING_SERVICE = "wechatai";
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
export type BillingOfferId = (typeof BILLING_OFFERS)[number]["id"];
export type BillingOffer = {
  id: BillingOfferId;
  kind: "plus" | "credits";
  name: string;
  price: number;
  currency: "cny";
  credits: number;
  interval: "month" | "year" | null;
  enabled: boolean;
};
export type BillingCatalog = { mode: "test" | "live"; offers: BillingOffer[] };
export type SubscriptionInfo = {
  id: string;
  offerId: BillingOfferId;
  status: string;
  cancelAtPeriodEnd: boolean;
  periodEnd: number;
} | null;
export type CheckoutStatus = {
  status: "pending" | "paid" | "expired" | "failed";
  kind: "plus" | "credits";
  credits: number;
};
