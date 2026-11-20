import { describe, expect, it } from "vitest";
import { renderPublicPage } from "../src/client/prerender";
import { hasRegisteredTranslation, type TranslationPage } from "../src/shared/i18n";
import byok from "../src/shared/i18n/en/bring-your-own-api-key";
import wechatAgent from "../src/shared/i18n/en/wechat-agent";
import wechatOptions from "../src/shared/i18n/en/wechat-ai-options";
import wechatBot from "../src/shared/i18n/en/wechat-bot";
import wechatGlm from "../src/shared/i18n/en/wechat-glm";
import wechatMuse from "../src/shared/i18n/en/wechat-muse";
import wechatBanRisk from "../src/shared/i18n/en/wechat-ai-ban-risk";
import wechatPrivacy from "../src/shared/i18n/en/wechat-ai-privacy";
import wechatImage from "../src/shared/i18n/en/wechat-ai-image";
import wechatPartner from "../src/shared/i18n/en/wechat-ai-partner";
import wechatCharacterCard from "../src/shared/i18n/en/wechat-character-card";
import compareOfficial from "../src/shared/i18n/en/compare-wechatai-vs-wechat-official-ai";
import compareOpenclaw from "../src/shared/i18n/en/compare-wechatai-vs-openclaw";
import compareCommercial from "../src/shared/i18n/en/compare-wechatai-vs-commercial-wechat-ai";

const translations = [
  byok,
  wechatAgent,
  wechatOptions,
  wechatBot,
  wechatGlm,
  wechatMuse,
  wechatBanRisk,
  wechatPrivacy,
  wechatImage,
  wechatPartner,
  wechatCharacterCard,
  compareOfficial,
  compareOpenclaw,
  compareCommercial,
].flat() as readonly TranslationPage[];

describe("prerendered English landing pages", () => {
  for (const page of translations) {
    it(`renders the translated body for /en${page.path} before JavaScript`, () => {
      const html = renderPublicPage(`/en${page.path}`)
        .replaceAll("&quot;", '"')
        .replaceAll("&#x27;", "'")
        .replaceAll("&amp;", "&");
      const content = page.content!;
      expect(html).toContain(`<h1>${content.h1}</h1>`);
      expect(html).toContain(content.answer);
      expect(html).toContain(content.faq[0].question);
      expect(html).toContain("Updated");
      expect(html).toContain(content.updatedAt);
      if (content.comparison) {
        expect(html).toContain(content.comparison.title);
        expect(html).toContain(content.comparison.note);
        const cell = content.comparison.rows.flatMap((row) => row.values).find(Boolean);
        if (cell) expect(html).toContain(cell);
      }
      // The pricing page belongs to T2: link it in English only once it is registered.
      const pricing = hasRegisteredTranslation("en", "/pricing")
        ? "/en/pricing#estimate"
        : "/pricing#estimate";
      expect(html).toContain(`href="${pricing}"`);
    });
  }

  it("keeps the Chinese source body for the unprefixed path", () => {
    const html = renderPublicPage("/wechat-muse");
    expect(html).toContain("微信接入 Muse 托管助理：连接、切换与不回复排查");
    expect(html).not.toContain(
      "Connect a hosted Muse assistant to WeChat: setup, switching, and no-reply checks",
    );
  });
});
