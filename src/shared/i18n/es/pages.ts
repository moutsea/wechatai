import type { TranslationPage } from "../index";
import { homeCopy } from "./copy/home";
import { pricingCopy } from "./copy/pricing";

/**
 * Spanish marketing pages rendered by their own components. The three landing
 * pages that come from `SeoPage` registers their content in `wechat-*.ts`.
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
