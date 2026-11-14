import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, ChevronDown } from "lucide-react";
import type { SeoPage } from "../../shared/seo-pages";
import { CostEstimator } from "../cost-estimator";
import { SiteHeader } from "../site-header";
import { SiteFooter } from "../site-footer";
import { PricingPlans } from "./pricing-plans";

export function PricingPage({ page, children }: { page: SeoPage; children?: ReactNode }) {
  const { hash } = useLocation();
  const estimator = useRef<HTMLDetailsElement>(null);
  // Keep existing /pricing#estimate links useful while the calculator is collapsed by default.
  useLayoutEffect(() => {
    if (hash === "#estimate" && estimator.current) estimator.current.open = true;
  }, [hash]);

  return (
    <div className="pricing-page">
      <a className="seopage-skip" href="#pricing-content">
        跳到正文
      </a>
      <SiteHeader active="/pricing" />
      <main id="pricing-content">
        <nav className="pricing-breadcrumb" aria-label="面包屑">
          <Link to="/">首页</Link>
          <span aria-hidden="true">/</span>
          <span>价格与方案</span>
        </nav>
        <header className="pricing-heading">
          <p className="eyebrow">{page.eyebrow}</p>
          <h1>{page.h1}</h1>
          <p className="seopage-answer pricing-intro">{page.answer}</p>
        </header>
        <PricingPlans />
        <section className="pricing-faq" id="faq" aria-labelledby="pricing-faq-title">
          <h2 id="pricing-faq-title">还有疑问？</h2>
          {page.faq.map((item) => (
            <details key={item.question}>
              <summary>
                {item.question}
                <ChevronDown size={18} aria-hidden="true" />
              </summary>
              <div className="pricing-faq-answer">
                <p>{item.answer}</p>
                {item.guide && (
                  <Link className="pricing-faq-guide" to={item.guide.href}>
                    {item.guide.label}
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                )}
              </div>
            </details>
          ))}
          <details className="pricing-estimate" id="pricing-estimate" ref={estimator}>
            <summary>
              估算我的每日用量
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <CostEstimator />
          </details>
          <p className="pricing-help">
            <Link to="/contact">需要帮助？联系我们</Link>
            <Link to="/terms">服务协议</Link>
          </p>
        </section>
      </main>
      <SiteFooter />
      {children}
    </div>
  );
}
