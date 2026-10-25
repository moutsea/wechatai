export { BILLING_OFFERS } from "./billing-offers";
import { BILLING_OFFERS } from "./billing-offers";

export const BILLING_SERVICE = "wechatai";
// Calendar months in Beijing time; Jan 31 renews to the last day of February.
export function extendMembership(from: number, months: 1 | 12) {
  const offset = 8 * 60 * 60 * 1000;
  const date = new Date(from + offset);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.getTime() - offset;
}
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
