import type { TranslationPage } from "../index";
import { homeCopy } from "./copy/home";
import { pricingCopy } from "./copy/pricing";

/**
 * Japanese pages published by T7. The landing pages listed in the card are
 * registered in the follow-up commit on top of the T3/T4 wiring; until their
 * body copy exists, registering them would serve Chinese text under `/ja`.
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
