import type { SeoPage } from "../seo-pages";
import { byokPage } from "./bring-your-own-api-key";
import { wechataiVsCommercialPage } from "./compare-wechatai-vs-commercial-wechat-ai";
import { wechataiVsOpenclawPage } from "./compare-wechatai-vs-openclaw";
import { wechataiVsWechatAiPage } from "./compare-wechatai-vs-wechat-official-ai";
import { pricingPage } from "./pricing";
import { wechatAgentPage } from "./wechat-agent";
import { wechatAiPage } from "./wechat-ai";
import { wechatBanRiskPage } from "./wechat-ai-ban-risk";
import { wechatAiImagePage } from "./wechat-ai-image";
import { wechatOptionsPage } from "./wechat-ai-options";
import { wechatAiPartnerPage } from "./wechat-ai-partner";
import { wechatAiPrivacyPage } from "./wechat-ai-privacy";
import { wechatBotPage } from "./wechat-bot";
import { wechatCharacterCardPage } from "./wechat-character-card";
import { wechatClaudePage } from "./wechat-claude";
import { wechatClawbotModelsPage } from "./wechat-clawbot-models";
import { wechatClawbotPage } from "./wechat-clawbot";
import { wechatDeepseekPage } from "./wechat-deepseek";
import { wechatGlmPage } from "./wechat-glm";
import { wechatGptPage } from "./wechat-gpt";
import { wechatKimiPage } from "./wechat-kimi";
import { wechatMusePage } from "./wechat-muse";
import { wechatQwenPage } from "./wechat-qwen";

/**
 * Revenue-adjacent pages first (the ones a search visitor lands on), then the
 * model-specific cluster, then the query-landing cluster, then pricing. Export
 * order drives sitemap order.
 */
export const SEO_CONTENT: readonly SeoPage[] = [
  wechatAiPage,
  wechatClawbotPage,
  wechatMusePage,
  wechatBanRiskPage,
  wechatClawbotModelsPage,
  byokPage,
  wechatDeepseekPage,
  wechatClaudePage,
  wechatGptPage,
  wechatKimiPage,
  wechatQwenPage,
  wechatGlmPage,
  wechatAgentPage,
  wechatOptionsPage,
  wechataiVsWechatAiPage,
  wechataiVsOpenclawPage,
  wechataiVsCommercialPage,
  wechatAiPartnerPage,
  wechatCharacterCardPage,
  wechatBotPage,
  wechatAiImagePage,
  wechatAiPrivacyPage,
  pricingPage,
];
