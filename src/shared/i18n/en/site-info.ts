import type { TranslationPage } from "../index";
import { INFO_PAGE_UPDATED_AT } from "../../site-info";
import { enSiteInfo } from "./copy/site-info";

/**
 * T1 discovery module for the three English support documents.
 *
 * The visible body, page nav, labels and contact details come from the same
 * `enSiteInfo` object. Registration only adds the metadata that the router,
 * sitemap and JSON-LD need, so a page cannot be published with copy that was
 * never translated.
 */
export { enSiteInfo, enSiteInfoLabels } from "./copy/site-info";
export type { InfoBlock, InfoInline } from "./copy/site-info";

const BRAND = "Wechatai";

export const EN_SITE_INFO_PAGES = {
  terms: {
    name: enSiteInfo.terms.name,
    description: enSiteInfo.terms.description,
  },
  privacy: {
    name: enSiteInfo.privacy.name,
    description: enSiteInfo.privacy.description,
  },
  contact: {
    name: enSiteInfo.contact.name,
    description: enSiteInfo.contact.description,
  },
} as const;

const pages: readonly TranslationPage[] = [
  {
    path: "/terms",
    title: `${enSiteInfo.terms.name} | ${BRAND}`,
    description: enSiteInfo.terms.description,
    // Same substantive version as the Chinese source; the visible date uses
    // this constant directly.
    updatedAt: INFO_PAGE_UPDATED_AT.terms,
  },
  {
    path: "/privacy",
    title: `${enSiteInfo.privacy.name} | ${BRAND}`,
    description: enSiteInfo.privacy.description,
    updatedAt: INFO_PAGE_UPDATED_AT.privacy,
  },
  {
    path: "/contact",
    title: `${enSiteInfo.contact.name} | ${BRAND}`,
    description: enSiteInfo.contact.description,
    // The contact page shows no date; this only drives the sitemap lastmod.
    updatedAt: INFO_PAGE_UPDATED_AT.contact,
  },
];

export default pages;
