import { IMAGE_CREDITS } from "../../../credits";

/**
 * English wording for fee notes shared by the T4 landing pages.
 *
 * The amounts stay in their source modules (`credits`, `pricing-copy`); this
 * file only supplies the translated sentence so three pages cannot drift.
 */
export const OWN_API_COST_NOTE_EN =
  "When you use your own model, search, or image-generation API, fees are billed separately by the provider and are not included in Wechatai membership or credits.";

export const CLOUD_AGENT_COST_NOTE_EN = `Xiaowei is available to Plus members after the operator enables it. It uses the text model you configured in Wechatai, and model API fees are billed separately by the provider. The platform charges credits for task input and final reply text, plus ${IMAGE_CREDITS} credits for each returned image; non-image files are not charged separately. Execution counts have separate limits.`;
