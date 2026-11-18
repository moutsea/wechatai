import { expect, it, vi } from "vitest";
import type { BILLING_OFFERS as BillingOffers } from "../src/shared/billing-offers";
import { llmsFullText, llmsText } from "../src/shared/llms-docs";

vi.mock("../src/shared/billing-offers", async (importOriginal) => {
  const { BILLING_OFFERS } = await importOriginal<{ BILLING_OFFERS: typeof BillingOffers }>();
  return {
    BILLING_OFFERS: BILLING_OFFERS.map((offer) =>
      offer.id === "plus_monthly" ? { ...offer, amount: 1050 } : offer,
    ),
  };
});

it("publishes a changed monthly offer in both indexes without retaining the old quote", () => {
  expect.soft(llmsText.match(/¥[\d.]+\/月/g), "short index").toEqual(["¥10.5/月"]);
  const [, fullPriceFacts] = llmsFullText.split("## 价格事实\n");
  expect
    .soft(fullPriceFacts?.match(/¥[\d.]+\/月/g), "full index price facts")
    .toEqual(["¥10.5/月"]);
  expect([...new Set(llmsFullText.match(/¥[\d.]+\/月/g))]).toEqual(["¥10.5/月"]);
});
