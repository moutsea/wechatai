import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { SiteBrand } from "./site-header";
import { DOC_TUTORIALS, docPath } from "../shared/docs";
import {
  DEFAULT_LOCALE,
  hasRegisteredTranslation,
  localizedPath,
  type Locale,
} from "../shared/i18n";
import { useLocale } from "./locale";

const footerLabel = (article: { title: string; navTitle?: string }) =>
  article.navTitle ?? article.title;

const tutorialLabelsEn: Record<string, string> = {
  "wechat-ai-assistant": "Xiaowei: AI assistant without deployment",
  "deepseek-in-wechat": "Use DeepSeek in WeChat",
  "multiple-openclaw-in-wechat": "Connect multiple OpenClaws",
  "hermes-in-wechat": "Use Hermes in WeChat",
};

type FooterLink = { href: string; zh: string; en: string };
type FooterGroup = { zh: string; en: string; links: FooterLink[] };

const footerGroups: FooterGroup[] = [
  {
    zh: "产品",
    en: "Product",
    links: [
      { href: "/wechat-ai", zh: "微信 AI 助手", en: "WeChat AI assistant" },
      { href: "/wechat-ai-options", zh: "方案对比", en: "Compare options" },
      { href: "/pricing", zh: "价格与免费额度", en: "Pricing and free credits" },
      { href: "/app", zh: "我的工作台", en: "My workspace" },
      { href: "/docs/channels-models", zh: "渠道与模型", en: "Providers and models" },
      { href: "/docs/credits", zh: "会员与 credits", en: "Membership and credits" },
    ],
  },
  {
    zh: "使用帮助",
    en: "Help",
    links: [
      { href: "/docs", zh: "文档与教程", en: "Docs and tutorials" },
      { href: "/wechat-clawbot", zh: "ClawBot 绑定与排查", en: "ClawBot setup and troubleshooting" },
      {
        href: "/wechat-clawbot-models",
        zh: "ClawBot 支持哪些模型",
        en: "Models supported by ClawBot",
      },
      { href: "/wechat-ai-ban-risk", zh: "用 AI 会不会封号", en: "Can AI get my account banned?" },
      { href: "/wechat-deepseek", zh: "在微信里用 DeepSeek", en: "Use DeepSeek in WeChat" },
      { href: "/wechat-claude", zh: "在微信里用 Claude", en: "Use Claude in WeChat" },
      { href: "/wechat-gpt", zh: "在微信里用 GPT", en: "Use GPT in WeChat" },
      { href: "/docs/faq", zh: "常见问题", en: "FAQ" },
    ],
  },
  {
    zh: "开发者",
    en: "Developers",
    links: [
      { href: "/developers/plugins", zh: "插件开发文档", en: "Plugin development docs" },
      { href: "/developers/openclaw", zh: "OpenClaw 接入", en: "OpenClaw setup" },
      { href: "/developers/hermes", zh: "Hermes 接入", en: "Hermes setup" },
      { href: "/developers/muse", zh: "Muse 接入", en: "Muse setup" },
      { href: "/wechat-agent", zh: "微信接入 Agent", en: "Connect an agent to WeChat" },
      { href: "/bring-your-own-api-key", zh: "自带 API Key", en: "Bring your own API key" },
      { href: "/developers/plugins.md", zh: "协议 Markdown", en: "Protocol Markdown" },
    ],
  },
  {
    zh: "实操教程",
    en: "Tutorials",
    links: DOC_TUTORIALS.map((article) => ({
      href: docPath(article.slug),
      zh: footerLabel(article),
      en: tutorialLabelsEn[article.slug] ?? footerLabel(article),
    })),
  },
  {
    zh: "支持与条款",
    en: "Support & terms",
    links: [
      { href: "/terms", zh: "服务协议", en: "Terms of service" },
      { href: "/privacy", zh: "隐私政策", en: "Privacy policy" },
      { href: "/contact", zh: "联系我们", en: "Contact us" },
      { href: "/contact#maintainer", zh: "维护者与项目来源", en: "Maintainer and project origin" },
      {
        href: "https://github.com/moutsea/wechatai",
        zh: "项目源码与维护者",
        en: "Source code and maintainer",
      },
      {
        href: "https://github.com/moutsea/wechatai/commits/main/",
        zh: "公开变更记录",
        en: "Public change log",
      },
    ],
  },
];

const quickLinks: FooterLink[] = [
  { href: "/app", zh: "进入工作台", en: "Open workspace" },
  { href: "/pricing", zh: "价格与额度", en: "Pricing and credits" },
  { href: "/docs/getting-started", zh: "入门教程", en: "Getting started" },
  { href: "/contact", zh: "联系我们", en: "Contact us" },
  { href: "/privacy", zh: "隐私政策", en: "Privacy policy" },
  { href: "https://github.com/moutsea/wechatai", zh: "GitHub 开源", en: "Open source on GitHub" },
];

/** Only the two registered English pages get a prefix; other links stay real. */
function localizedHref(locale: Locale, href: string) {
  if (locale === DEFAULT_LOCALE) return href;
  const [beforeHash, hash] = href.split("#");
  const base = beforeHash || "/";
  if (!hasRegisteredTranslation(locale, base)) return href;
  return `${localizedPath(locale, base)}${hash ? `#${hash}` : ""}`;
}

function FooterLinks({ links, english }: { links: FooterLink[]; english: boolean }) {
  const { locale } = useLocale();
  return links.map(({ href, zh, en }) =>
    href.startsWith("https://") || href.endsWith(".md") ? (
      <a key={href} href={href}>
        {english ? en : zh}
      </a>
    ) : (
      <Link key={href} to={localizedHref(locale, href)}>
        {english ? en : zh}
      </Link>
    ),
  );
}

const footerCopyZh = {
  homeAria: "微伴首页",
  intro: "在微信里，与自选的大模型对话。",
  tagline: "连接你的模型与 Agent，让灵感随时有回应。",
  navigation: "页脚导航",
  brand: "微伴 Wechatai",
  disclaimer: "独立开发产品，与微信、腾讯及模型供应商无官方关联。",
};

const footerCopyEn = {
  homeAria: "Wechatai home",
  intro: "Chat with the models you choose, right inside WeChat.",
  tagline: "Connect your models and agents so ideas always get an answer.",
  navigation: "Footer navigation",
  brand: "Wechatai",
  disclaimer: "Independently built; not affiliated with WeChat, Tencent, or model providers.",
};

export function SiteFooter() {
  const { locale } = useLocale();
  const english = locale === "en";
  const copy = english ? footerCopyEn : footerCopyZh;
  return (
    <footer className="landing-footer">
      <div className="landing-footer-main">
        <div className="landing-footer-brand">
          <Link to={localizedHref(locale, "/")} aria-label={copy.homeAria}>
            <SiteBrand light english={english} />
          </Link>
          <p>
            {copy.intro}
            <span>{copy.tagline}</span>
          </p>
        </div>
        <div className="landing-footer-desktop">
          {footerGroups.map(({ zh: titleZh, en: titleEn, links }) => {
            const title = english ? titleEn : titleZh;
            return (
              <nav className="landing-footer-column" aria-label={title} key={title}>
                <p className="landing-footer-title">{title}</p>
                <FooterLinks links={links} english={english} />
              </nav>
            );
          })}
        </div>
        <nav className="landing-footer-mobile" aria-label={copy.navigation}>
          <div className="landing-footer-quick">
            <FooterLinks links={quickLinks} english={english} />
          </div>
          {footerGroups.map(({ zh: titleZh, en: titleEn, links }, index) => {
            const title = english ? titleEn : titleZh;
            return (
              <details id={`footer-group-${index}`} key={title}>
                <summary>
                  <ChevronDown size={16} aria-hidden="true" />
                  {title}
                </summary>
                <div className="landing-footer-column">
                  <FooterLinks links={links} english={english} />
                </div>
              </details>
            );
          })}
        </nav>
      </div>
      <div className="landing-footer-bottom">
        <span>
          © {new Date().getFullYear()} {copy.brand}
        </span>
        <p>{copy.disclaimer}</p>
      </div>
    </footer>
  );
}
