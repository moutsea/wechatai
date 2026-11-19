import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { SeoPage } from "../../shared/seo-pages";

/** Shared "继续了解" block for SEO landing pages, including the pricing page. */
export function SeoRelated({ links }: { links: SeoPage["related"] }) {
  if (!links.length) return null;
  return (
    <section className="seopage-related" aria-labelledby="seopage-related-title">
      <h2 id="seopage-related-title">继续了解</h2>
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
