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
import {
  footerCopy as footerCopyKo,
  groupLabels as groupLabelsKo,
  linkLabels as linkLabelsKo,
  tutorialLabels as tutorialLabelsKo,
} from "../shared/i18n/ko/copy/site-footer";
import {
  footerCopy as footerCopyJa,
  tutorialLabels as tutorialLabelsJa,
} from "../shared/i18n/ja/copy/site-footer";
import { useLocale } from "./locale";

const footerLabel = (article: { title: string; navTitle?: string }) =>
  article.navTitle ?? article.title;

const tutorialLabelsEn: Record<string, string> = {
  "wechat-ai-assistant": "Xiaowei: AI assistant without deployment",
  "deepseek-in-wechat": "Use DeepSeek in WeChat",
  "multiple-openclaw-in-wechat": "Connect multiple OpenClaws",
  "hermes-in-wechat": "Use Hermes in WeChat",
};

type LabelKey = "zh" | "en" | "ja" | "ko";
type FooterLink = { href: string } & Record<LabelKey, string>;
type FooterGroup = Record<LabelKey, string> & { links: FooterLink[] };

const footerGroups: FooterGroup[] = [
  {
    zh: "产品",
    en: "Product",
    ja: footerCopyJa.groups.product,
    ko: groupLabelsKo.product,
    links: [
      { href: "/wechat-ai", zh: "微信 AI 助手", en: "WeChat AI assistant", ja: footerCopyJa.links.wechatAi, ko: linkLabelsKo.wechatAi },
      { href: "/wechat-ai-options", zh: "方案对比", en: "Compare options", ja: footerCopyJa.links.compare, ko: linkLabelsKo.compareOptions },
      {
        href: "/pricing",
        zh: "价格与免费额度",
        en: "Pricing and free credits",
        ja: footerCopyJa.links.pricing,
        ko: linkLabelsKo.freePricing,
      },
      { href: "/app", zh: "我的工作台", en: "My workspace", ja: footerCopyJa.links.myWorkspace, ko: linkLabelsKo.myWorkspace },
      {
        href: "/docs/channels-models",
        zh: "渠道与模型",
        en: "Providers and models",
        ja: footerCopyJa.links.providers,
        ko: linkLabelsKo.channels,
      },
      {
        href: "/docs/credits",
        zh: "会员与 credits",
        en: "Membership and credits",
        ja: footerCopyJa.links.membership,
        ko: linkLabelsKo.credits,
      },
    ],
  },
  {
    zh: "使用帮助",
    en: "Help",
    ja: footerCopyJa.groups.help,
    ko: groupLabelsKo.help,
    links: [
      { href: "/docs", zh: "文档与教程", en: "Docs and tutorials", ja: footerCopyJa.links.docs, ko: linkLabelsKo.docs },
      {
        href: "/wechat-clawbot",
        zh: "ClawBot 绑定与排查",
        en: "ClawBot setup and troubleshooting",
        ja: footerCopyJa.links.clawbotSetup,
        ko: linkLabelsKo.clawbot,
      },
      {
        href: "/wechat-clawbot-models",
        zh: "ClawBot 支持哪些模型",
        en: "Models supported by ClawBot",
        ja: footerCopyJa.links.clawbotModels,
        ko: linkLabelsKo.clawbotModels,
      },
      {
        href: "/wechat-ai-ban-risk",
        zh: "用 AI 会不会封号",
        en: "Can AI get my account banned?",
        ja: footerCopyJa.links.banRisk,
        ko: linkLabelsKo.banRisk,
      },
      {
        href: "/wechat-deepseek",
        zh: "在微信里用 DeepSeek",
        en: "Use DeepSeek in WeChat",
        ja: footerCopyJa.links.deepseek,
        ko: linkLabelsKo.deepSeek,
      },
      {
        href: "/wechat-claude",
        zh: "在微信里用 Claude",
        en: "Use Claude in WeChat",
        ja: footerCopyJa.links.claude,
        ko: linkLabelsKo.claude,
      },
      { href: "/wechat-gpt", zh: "在微信里用 GPT", en: "Use GPT in WeChat", ja: footerCopyJa.links.gpt, ko: linkLabelsKo.gpt },
      { href: "/docs/faq", zh: "常见问题", en: "FAQ", ja: footerCopyJa.links.faq, ko: linkLabelsKo.faq },
    ],
  },
  {
    zh: "开发者",
    en: "Developers",
    ja: footerCopyJa.groups.developers,
    ko: groupLabelsKo.developers,
    links: [
      {
        href: "/developers/plugins",
        zh: "插件开发文档",
        en: "Plugin development docs",
        ja: footerCopyJa.links.plugins,
        ko: linkLabelsKo.plugins,
      },
      { href: "/developers/openclaw", zh: "OpenClaw 接入", en: "OpenClaw setup", ja: footerCopyJa.links.openclaw, ko: linkLabelsKo.openClaw },
      { href: "/developers/hermes", zh: "Hermes 接入", en: "Hermes setup", ja: footerCopyJa.links.hermes, ko: linkLabelsKo.hermes },
      { href: "/developers/muse", zh: "Muse 接入", en: "Muse setup", ja: footerCopyJa.links.muse, ko: linkLabelsKo.muse },
      {
        href: "/wechat-agent",
        zh: "微信接入 Agent",
        en: "Connect an agent to WeChat",
        ja: footerCopyJa.links.agent,
        ko: linkLabelsKo.agent,
      },
      {
        href: "/bring-your-own-api-key",
        zh: "自带 API Key",
        en: "Bring your own API key",
        ja: footerCopyJa.links.apiKey,
        ko: linkLabelsKo.ownApiKey,
      },
      { href: "/developers/plugins.md", zh: "协议 Markdown", en: "Protocol Markdown", ja: footerCopyJa.links.protocol, ko: linkLabelsKo.protocol },
    ],
  },
  {
    zh: "实操教程",
    en: "Tutorials",
    ja: footerCopyJa.groups.tutorials,
    ko: groupLabelsKo.tutorials,
    links: DOC_TUTORIALS.map((article) => ({
      href: docPath(article.slug),
      zh: footerLabel(article),
      en: tutorialLabelsEn[article.slug] ?? footerLabel(article),
      ja: tutorialLabelsJa[article.slug] ?? footerLabel(article),
      ko: tutorialLabelsKo[article.slug] ?? footerLabel(article),
    })),
  },
  {
    zh: "支持与条款",
    en: "Support & terms",
    ja: footerCopyJa.groups.support,
    ko: groupLabelsKo.support,
    links: [
      { href: "/terms", zh: "服务协议", en: "Terms of service", ja: footerCopyJa.links.terms, ko: linkLabelsKo.terms },
      { href: "/privacy", zh: "隐私政策", en: "Privacy policy", ja: footerCopyJa.links.privacy, ko: linkLabelsKo.privacy },
      { href: "/contact", zh: "联系我们", en: "Contact us", ja: footerCopyJa.links.contact, ko: linkLabelsKo.contact },
      {
        href: "/contact#maintainer",
        zh: "维护者与项目来源",
        en: "Maintainer and project origin",
        ja: footerCopyJa.links.maintainer,
        ko: linkLabelsKo.maintainer,
      },
      {
        href: "https://github.com/moutsea/wechatai",
        zh: "项目源码与维护者",
        en: "Source code and maintainer",
        ja: footerCopyJa.links.source,
        ko: linkLabelsKo.source,
      },
      {
        href: "https://github.com/moutsea/wechatai/commits/main/",
        zh: "公开变更记录",
        en: "Public change log",
        ja: footerCopyJa.links.changelog,
        ko: linkLabelsKo.changelog,
      },
    ],
  },
];

const quickLinks: FooterLink[] = [
  { href: "/app", zh: "进入工作台", en: "Open workspace", ja: footerCopyJa.links.workspace, ko: linkLabelsKo.openWorkspace },
  { href: "/pricing", zh: "价格与额度", en: "Pricing and credits", ja: footerCopyJa.links.pricingQuick, ko: linkLabelsKo.pricing },
  {
    href: "/docs/getting-started",
    zh: "入门教程",
    en: "Getting started",
    ja: footerCopyJa.links.gettingStarted,
    ko: linkLabelsKo.gettingStarted,
  },
  { href: "/contact", zh: "联系我们", en: "Contact us", ja: footerCopyJa.links.contact, ko: linkLabelsKo.contact },
  { href: "/privacy", zh: "隐私政策", en: "Privacy policy", ja: footerCopyJa.links.privacy, ko: linkLabelsKo.privacy },
  {
    href: "https://github.com/moutsea/wechatai",
    zh: "GitHub 开源",
    en: "Open source on GitHub",
    ja: footerCopyJa.links.github,
    ko: linkLabelsKo.openSource,
  },
];

/** Only registered localized pages get a prefix; other links stay real. */
function localizedHref(locale: Locale, href: string) {
  if (locale === DEFAULT_LOCALE) return href;
  const [beforeHash, hash] = href.split("#");
  const base = beforeHash || "/";
  if (!hasRegisteredTranslation(locale, base)) return href;
  return `${localizedPath(locale, base)}${hash ? `#${hash}` : ""}`;
}

function FooterLinks({ links, label }: { links: FooterLink[]; label: LabelKey }) {
  const { locale } = useLocale();
  return links.map((link) => {
    const { href } = link;
    return href.startsWith("https://") || href.endsWith(".md") ? (
      <a key={href} href={href}>
        {link[label]}
      </a>
    ) : (
      <Link key={href} to={localizedHref(locale, href)}>
        {link[label]}
      </Link>
    );
  });
}

interface FooterCopy {
  home: string;
  intro: string;
  tagline: string;
  navigation: string;
  brand: string;
  disclaimer: string;
}

const footerCopyZh: FooterCopy = {
  home: "首页",
  intro: "在微信里，与自选的大模型对话。",
  tagline: "连接你的模型与 Agent，让灵感随时有回应。",
  navigation: "页脚导航",
  brand: "微伴 Wechatai",
  disclaimer: "独立开发产品，与微信、腾讯及模型供应商无官方关联。",
};

const footerCopyEn = {
  home: "Home",
  intro: "Chat with the models you choose, right inside WeChat.",
  tagline: "Connect your models and agents so ideas always get an answer.",
  navigation: "Footer navigation",
  brand: "Wechatai",
  disclaimer: "Independently built; not affiliated with WeChat, Tencent, or model providers.",
};

const footerCopies: Partial<Record<Locale, FooterCopy>> = {
  en: footerCopyEn,
  ja: footerCopyJa,
  ko: footerCopyKo,
};

export function SiteFooter() {
  const { locale } = useLocale();
  const label: LabelKey = locale === "en" ? "en" : locale === "ko" ? "ko" : locale === "ja" ? "ja" : "zh";
  const copy = footerCopies[locale] ?? footerCopyZh;
  return (
    <footer className="landing-footer">
      <div className="landing-footer-main">
        <div className="landing-footer-brand">
          <Link to={localizedHref(locale, "/")}>
            <SiteBrand light latin={locale !== DEFAULT_LOCALE} />
            <span className="visually-hidden">{copy.home}</span>
          </Link>
          <p>
            {copy.intro}
            <span>{copy.tagline}</span>
          </p>
        </div>
        <div className="landing-footer-desktop">
          {footerGroups.map((group) => {
            const title = group[label];
            return (
              <nav className="landing-footer-column" aria-label={title} key={title}>
                <p className="landing-footer-title">{title}</p>
                <FooterLinks links={group.links} label={label} />
              </nav>
            );
          })}
        </div>
        <nav className="landing-footer-mobile" aria-label={copy.navigation}>
          <div className="landing-footer-quick">
            <FooterLinks links={quickLinks} label={label} />
          </div>
          {footerGroups.map((group, index) => {
            const title = group[label];
            return (
              <details id={`footer-group-${index}`} key={title}>
                <summary>
                  <ChevronDown size={16} aria-hidden="true" />
                  {title}
                </summary>
                <div className="landing-footer-column">
                  <FooterLinks links={group.links} label={label} />
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
