import type { DocContent, DocSlug } from "../../../docs";
import { EN_GUIDE_CONTENT } from "./guide-content-en";
import { EN_TUTORIAL_CONTENT } from "./tutorial-content-en";
import { EN_FAQ_SECTIONS } from "./faq-content-en";

export { EN_FAQ_SECTIONS };

export const EN_DOC_CONTENT: Record<DocSlug, DocContent> = {
  ...EN_GUIDE_CONTENT,
  ...EN_TUTORIAL_CONTENT,
};
