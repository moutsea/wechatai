import { useParams } from "react-router-dom";
import { findSeoPage } from "../../shared/seo-pages";
import { NotFound } from "../not-found";
import { SeoPageView } from "./seo-page";

/**
 * `/compare/{a}-vs-{b}` shares the landing-page template: the pair is just a
 * path lookup, so unknown pairs fall through to the normal 404.
 */
export function ComparePage() {
  const { pair } = useParams();
  const page = pair ? findSeoPage(`/compare/${pair}`) : undefined;
  return page ? <SeoPageView page={page} /> : <NotFound />;
}
