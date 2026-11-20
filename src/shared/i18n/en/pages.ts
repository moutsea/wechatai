import type { TranslationPage } from "../index";
import { homeCopy } from "./copy/home";
import { pricingCopy } from "./copy/pricing";

/**
 * Only these two English pages are published in T2. Everything else keeps its
 * unprefixed Chinese URL, so the registry — not the presence of a locale
 * directory — decides which `/en/...` routes may exist.
 */
const pages: readonly TranslationPage[] = [
  {
    path: "/",
    title: homeCopy.seo.title,
    description: homeCopy.seo.description,
    updatedAt: "2026-11-20",
  },
  {
    path: "/pricing",
    title: `${pricingCopy.seo.title} | Wechatai`,
    description: pricingCopy.seo.description,
    updatedAt: "2026-11-20",
  },
];

export default pages;
