import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { SeoPage } from "../../shared/seo-pages";
import { pricingCopy } from "../../shared/i18n/en/copy/pricing";
import { pricingCopy as pricingCopyJa } from "../../shared/i18n/ja/copy/pricing";
import { useLocale } from "../locale";

const relatedCopyZh = { heading: "继续了解" };

/** Shared "继续了解" block for SEO landing pages, including the pricing page. */
export function SeoRelated({ links }: { links: SeoPage["related"] }) {
  const { locale } = useLocale();
  const heading =
    locale === "en"
      ? pricingCopy.relatedHeading
      : locale === "ja"
        ? pricingCopyJa.relatedHeading
        : relatedCopyZh.heading;
  if (!links.length) return null;
  return (
    <section className="seopage-related" aria-labelledby="seopage-related-title">
      <h2 id="seopage-related-title">{heading}</h2>
      <div className="seopage-related-grid">
        {links.map((link) => (
          <Link to={link.href} key={link.href}>
            <span>{link.label}</span>
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
}
