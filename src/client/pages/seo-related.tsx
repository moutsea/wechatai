import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { SeoPage } from "../../shared/seo-pages";
import { pricingCopyFor } from "../../shared/i18n/copy";
import { localizedHref, useLocale } from "../locale";

const relatedCopyZh = { heading: "继续了解" };

/** Shared "继续了解" block for SEO landing pages, including the pricing page. */
export function SeoRelated({ links }: { links: SeoPage["related"] }) {
  const { locale } = useLocale();
  const heading = pricingCopyFor(locale)?.relatedHeading ?? relatedCopyZh.heading;
  if (!links.length) return null;
  return (
    <section className="seopage-related" aria-labelledby="seopage-related-title">
      <h2 id="seopage-related-title">{heading}</h2>
      <div className="seopage-related-grid">
        {links.map((link) => (
          // Portuguese dictionaries keep unprefixed hrefs, so the pt pages localize here;
          // other locales already carry their own prefixes in the page data.
          <Link
            to={locale === "pt" ? localizedHref(locale, link.href) : link.href}
            key={link.href}
          >
            <span>{link.label}</span>
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
}
