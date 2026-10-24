import type { SeoPage } from "../seo-pages";
import { byokPage } from "./bring-your-own-api-key";
import { pricingPage } from "./pricing";
import { wechatAgentPage } from "./wechat-agent";
import { wechatOptionsPage } from "./wechat-ai-options";
import { wechatAiPage } from "./wechat-ai";
import { wechatClaudePage } from "./wechat-claude";
import { wechatClawbotModelsPage } from "./wechat-clawbot-models";
import { wechatClawbotPage } from "./wechat-clawbot";
import { wechatDeepseekPage } from "./wechat-deepseek";
import { wechatGptPage } from "./wechat-gpt";

/**
 * Revenue-adjacent pages first (the ones a search visitor lands on), then the
 * model-specific cluster, then pricing. Export order drives sitemap order.
 */
export const SEO_CONTENT: readonly SeoPage[] = [
  wechatAiPage,
  wechatClawbotPage,
  wechatClawbotModelsPage,
  byokPage,
  wechatDeepseekPage,
  wechatClaudePage,
  wechatGptPage,
  wechatAgentPage,
  wechatOptionsPage,
  pricingPage,
];
