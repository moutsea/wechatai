import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, ChevronDown } from "lucide-react";
import type { SeoPage } from "../../shared/seo-pages";
import { pricingPageFor } from "../../shared/seo-content/pricing";
import { pricingCopy } from "../../shared/i18n/en/copy/pricing";
import { pricingCopy as pricingCopyJa } from "../../shared/i18n/ja/copy/pricing";
import { CostEstimator } from "../cost-estimator";
import { SiteHeader } from "../site-header";
import { SiteFooter } from "../site-footer";
import { localizedHref, useLocale } from "../locale";
import { PricingPlans } from "./pricing-plans";
import { SeoRelated } from "./seo-related";

const pageCopyZh = {
  skip: "跳到正文",
  breadcrumbLabel: "面包屑",
  home: "首页",
  breadcrumbCurrent: "价格与方案",
  faqTitle: "还有疑问？",
  estimatorSummary: "估算我的每日用量",
  help: "需要帮助？联系我们",
  terms: "服务协议",
};

export function PricingPage({ page, children }: { page: SeoPage; children?: ReactNode }) {
  const { hash } = useLocation();
  const { locale } = useLocale();
  const english = locale === "en";
  const content = locale === "zh-CN" ? page : pricingPageFor(locale);
  const copy = english ? pricingCopy.page : locale === "ja" ? pricingCopyJa.page : pageCopyZh;
  const estimator = useRef<HTMLDetailsElement>(null);
  // Keep existing /pricing#estimate links useful while the calculator is collapsed by default.
  useLayoutEffect(() => {
    if (hash === "#estimate" && estimator.current) estimator.current.open = true;
  }, [hash]);

  return (
    <div className="pricing-page">
      <a className="seopage-skip" href="#pricing-content">
        {copy.skip}
      </a>
      <SiteHeader active="/pricing" />
      <main id="pricing-content">
        <nav className="pricing-breadcrumb" aria-label={copy.breadcrumbLabel}>
          <Link to={localizedHref(locale, "/")}>{copy.home}</Link>
          <span aria-hidden="true">/</span>
          <span>{copy.breadcrumbCurrent}</span>
        </nav>
        <header className="pricing-heading">
          <p className="eyebrow">{content.eyebrow}</p>
          <h1>{content.h1}</h1>
          <p className="seopage-answer pricing-intro">{content.answer}</p>
        </header>
        <PricingPlans />
        <section className="pricing-faq" id="faq" aria-labelledby="pricing-faq-title">
          <h2 id="pricing-faq-title">{copy.faqTitle}</h2>
          {content.faq.map((item) => (
            <details key={item.question}>
              <summary>
                {item.question}
                <ChevronDown size={18} aria-hidden="true" />
              </summary>
              <div className="pricing-faq-answer">
                <p>{item.answer}</p>
                {item.guide && (
                  <Link className="pricing-faq-guide" to={localizedHref(locale, item.guide.href)}>
                    {item.guide.label}
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                )}
              </div>
            </details>
          ))}
          <details className="pricing-estimate" id="pricing-estimate" ref={estimator}>
            <summary>
              {copy.estimatorSummary}
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <CostEstimator />
          </details>
          <p className="pricing-help">
            <Link to="/contact">{copy.help}</Link>
            <Link to="/terms">{copy.terms}</Link>
          </p>
        </section>
        <SeoRelated links={content.related} />
      </main>
      <SiteFooter />
      {children}
    </div>
  );
}
