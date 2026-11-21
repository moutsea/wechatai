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
      const rendered = renderPublicPage(`/en${page.path}`);
      const html = rendered
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
      if (content.comparison || page.path === "/wechat-ai-options") {
        const doc = new DOMParser().parseFromString(rendered, "text/html");
        const related = doc.querySelector(".seopage-related");
        expect(related?.querySelector('a[href="/compare"]')?.textContent).toBe("All comparisons");
        expect(related?.querySelector('a[href="/en/compare"]')).toBeNull();
      }
      // The pricing page belongs to T2: link it in English only once it is registered.
      const pricing = hasRegisteredTranslation("en", "/pricing")
        ? "/en/pricing#estimate"
        : "/pricing#estimate";
      expect(html).toContain(`href="${pricing}"`);
    });
  }

  it("explains Free image saving and Plus-only web history in the guide and FAQ", () => {
    const doc = new DOMParser().parseFromString(renderPublicPage("/en/wechat-ai-image"), "text/html");
    const faq = [...doc.querySelectorAll("#faq details")].find(({ textContent }) =>
      textContent?.startsWith("How long are generated images kept?"),
    );
    expect.soft(doc.querySelector("#how-it-works")?.textContent, "guide").toMatch(
      /Free users can save generated images .* in WeChat\. Only Plus users can view .* in web conversation history for 30 days/,
    );
    expect.soft(faq?.querySelector("p")?.textContent, "retention FAQ").toMatch(
      /Only Plus users can view .* in web conversation history .*30 days\. Free users can save generated images .* in WeChat/,
    );
  });

  it("keeps the Chinese source body for the unprefixed path", () => {
    const html = renderPublicPage("/wechat-muse");
    expect(html).toContain("微信接入 Muse 托管助理：连接、切换与不回复排查");
    expect(html).not.toContain(
      "Connect a hosted Muse assistant to WeChat: setup, switching, and no-reply checks",
    );
  });

  it("states the public HTTPS domain and default port in both BYOK explanations", () => {
    const byokDoc = new DOMParser().parseFromString(
      renderPublicPage("/en/bring-your-own-api-key"),
      "text/html",
    );
    const faq = [...byokDoc.querySelectorAll("#faq details")].find(({ textContent }) =>
      textContent?.startsWith("Can I connect my own model service?"),
    );
    const optionsDoc = new DOMParser().parseFromString(
      renderPublicPage("/en/wechat-ai-options"),
      "text/html",
    );
    const option = [...optionsDoc.querySelectorAll("#byok li")].find(({ textContent }) =>
      textContent?.startsWith("Model freedom."),
    );
    const endpointRequirement = /must .*public HTTPS domain on the default port \(443\)/;
    expect.soft(faq?.querySelector("p")?.textContent, "BYOK FAQ").toMatch(endpointRequirement);
    expect.soft(option?.textContent, "options comparison").toMatch(endpointRequirement);
  });

  it("warns that rebinding keeps story context unless the user starts a new story", () => {
    const html = renderPublicPage("/en/wechat-character-card");
    const doc = new DOMParser().parseFromString(html, "text/html");
    const answer = [...doc.querySelectorAll("#faq details")]
      .find(({ textContent }) => textContent?.startsWith("Can one character switch models?"))
      ?.querySelector("p")?.textContent;
    expect.soft(answer).toMatch(/same story.*existing context can be sent to the new model provider/);
    expect.soft(answer).toMatch(/send \/wx new .*before sending your next chat message/);
  });
});
