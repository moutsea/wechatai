import type { TranslationPage } from "../index";
import { homeCopy } from "./copy/home";
import { pricingCopy } from "./copy/pricing";

/**
 * Korean pages published by T8. The registry — not the presence of a locale
 * directory — decides which `/ko/...` routes may exist. The three landing
 * pages are added only after their English routes land on `main`.
 */
const pages: readonly TranslationPage[] = [
  {
    path: "/",
    title: homeCopy.seo.title,
    description: homeCopy.seo.description,
    updatedAt: "2026-11-21",
  },
  {
    path: "/pricing",
    title: `${pricingCopy.seo.title} | Wechatai`,
    description: pricingCopy.seo.description,
    updatedAt: "2026-11-21",
  },
];

export default pages;
