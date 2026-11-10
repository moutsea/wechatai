import { useParams } from "react-router-dom";
import { findSeoPage } from "../../shared/seo-pages";
import { NotFound } from "../not-found";
import { SeoPageView } from "./seo-page";

export function SeoLandingPage() {
  const { slug } = useParams();
  const page = findSeoPage(`/${slug}`);
  return page ? <SeoPageView page={page} /> : <NotFound />;
}
