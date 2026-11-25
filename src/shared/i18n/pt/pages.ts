import type { TranslationPage } from "../index";
import { homeCopyPt } from "./copy/home";
import { pricingCopyPt } from "./copy/pricing";

/**
 * The first Brazilian Portuguese batch. Only the paths listed here are
 * published under `/pt`; landing pages register their own complete content in
 * sibling modules.
 */
const pages: readonly TranslationPage[] = [
  {
    path: "/",
    title: homeCopyPt.seo.title,
    description: homeCopyPt.seo.description,
    updatedAt: "2026-11-21",
  },
  {
    path: "/pricing",
    title: `${pricingCopyPt.seo.title} | Wechatai`,
    description: pricingCopyPt.seo.description,
    updatedAt: "2026-11-21",
  },
];

export default pages;
