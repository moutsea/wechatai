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

const tutorialLabelsJa: Record<string, string> = {
  "wechat-ai-assistant": "小薇：デプロイ不要の AI アシスタント",
  "deepseek-in-wechat": "WeChat で DeepSeek を使う",
  "multiple-openclaw-in-wechat": "複数の OpenClaw を接続",
  "hermes-in-wechat": "WeChat で Hermes を使う",
};

const tutorialLabelsKo: Record<string, string> = {
  "wechat-ai-assistant": "Xiaowei: 배포 없는 AI 어시스턴트",
  "deepseek-in-wechat": "위챗에서 DeepSeek 사용",
  "multiple-openclaw-in-wechat": "여러 OpenClaw 연결",
  "hermes-in-wechat": "위챗에서 Hermes 사용",
};

type LabelKey = "zh" | "en" | "ja" | "ko";
type FooterLink = { href: string } & Record<LabelKey, string>;
type FooterGroup = Record<LabelKey, string> & { links: FooterLink[] };

const footerGroups: FooterGroup[] = [
  {
    zh: "产品",
    en: "Product",
    ja: "プロダクト",
    ko: "제품",
    links: [
      { href: "/wechat-ai", zh: "微信 AI 助手", en: "WeChat AI assistant", ja: "WeChat AI アシスタント", ko: "위챗 AI 어시스턴트" },
      { href: "/wechat-ai-options", zh: "方案对比", en: "Compare options", ja: "プラン比較", ko: "옵션 비교" },
      {
        href: "/pricing",
        zh: "价格与免费额度",
        en: "Pricing and free credits",
        ja: "料金と無料クレジット",
        ko: "가격 및 무료 크레딧",
      },
      { href: "/app", zh: "我的工作台", en: "My workspace", ja: "マイワークスペース", ko: "내 워크스페이스" },
      {
        href: "/docs/channels-models",
        zh: "渠道与模型",
        en: "Providers and models",
        ja: "プロバイダーとモデル",
        ko: "채널과 모델",
      },
      {
        href: "/docs/credits",
        zh: "会员与 credits",
        en: "Membership and credits",
        ja: "会員とクレジット",
        ko: "멤버십과 크레딧",
      },
    ],
  },
  {
    zh: "使用帮助",
    en: "Help",
    ja: "ヘルプ",
    ko: "도움말",
    links: [
      { href: "/docs", zh: "文档与教程", en: "Docs and tutorials", ja: "ドキュメントとチュートリアル", ko: "문서 및 가이드" },
      {
        href: "/wechat-clawbot",
        zh: "ClawBot 绑定与排查",
        en: "ClawBot setup and troubleshooting",
        ja: "ClawBot の接続とトラブルシューティング",
        ko: "ClawBot 설정 및 문제 해결",
      },
      {
        href: "/wechat-clawbot-models",
        zh: "ClawBot 支持哪些模型",
        en: "Models supported by ClawBot",
        ja: "ClawBot が対応するモデル",
        ko: "ClawBot 지원 모델",
      },
      {
        href: "/wechat-ai-ban-risk",
        zh: "用 AI 会不会封号",
        en: "Can AI get my account banned?",
        ja: "AI 利用でアカウント停止になる？",
        ko: "AI 사용 시 계정 정지 위험",
      },
      {
        href: "/wechat-deepseek",
        zh: "在微信里用 DeepSeek",
        en: "Use DeepSeek in WeChat",
        ja: "WeChat で DeepSeek を使う",
        ko: "위챗에서 DeepSeek 사용",
      },
      {
        href: "/wechat-claude",
        zh: "在微信里用 Claude",
        en: "Use Claude in WeChat",
        ja: "WeChat で Claude を使う",
        ko: "위챗에서 Claude 사용",
      },
      { href: "/wechat-gpt", zh: "在微信里用 GPT", en: "Use GPT in WeChat", ja: "WeChat で GPT を使う", ko: "위챗에서 GPT 사용" },
      { href: "/docs/faq", zh: "常见问题", en: "FAQ", ja: "よくある質問", ko: "자주 묻는 질문" },
    ],
  },
  {
    zh: "开发者",
    en: "Developers",
    ja: "開発者",
    ko: "개발자",
    links: [
      {
        href: "/developers/plugins",
        zh: "插件开发文档",
        en: "Plugin development docs",
        ja: "プラグイン開発ドキュメント",
        ko: "플러그인 개발 문서",
      },
      { href: "/developers/openclaw", zh: "OpenClaw 接入", en: "OpenClaw setup", ja: "OpenClaw の接続", ko: "OpenClaw 연결" },
      { href: "/developers/hermes", zh: "Hermes 接入", en: "Hermes setup", ja: "Hermes の接続", ko: "Hermes 연결" },
      { href: "/developers/muse", zh: "Muse 接入", en: "Muse setup", ja: "Muse の接続", ko: "Muse 연결" },
      {
        href: "/wechat-agent",
        zh: "微信接入 Agent",
        en: "Connect an agent to WeChat",
        ja: "WeChat にエージェントを接続",
        ko: "위챗에 에이전트 연결",
      },
      {
        href: "/bring-your-own-api-key",
        zh: "自带 API Key",
        en: "Bring your own API key",
        ja: "ご自身の API キーを使う",
        ko: "자체 API 키 사용",
      },
      { href: "/developers/plugins.md", zh: "协议 Markdown", en: "Protocol Markdown", ja: "プロトコル Markdown", ko: "프로토콜 Markdown" },
    ],
  },
  {
    zh: "实操教程",
    en: "Tutorials",
    ja: "チュートリアル",
    ko: "실습 가이드",
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
    ja: "サポートと規約",
    ko: "지원 및 약관",
    links: [
      { href: "/terms", zh: "服务协议", en: "Terms of service", ja: "利用規約", ko: "서비스 약관" },
      { href: "/privacy", zh: "隐私政策", en: "Privacy policy", ja: "プライバシーポリシー", ko: "개인정보 처리방침" },
      { href: "/contact", zh: "联系我们", en: "Contact us", ja: "お問い合わせ", ko: "문의하기" },
      {
        href: "/contact#maintainer",
        zh: "维护者与项目来源",
        en: "Maintainer and project origin",
        ja: "メンテナーとプロジェクトの由来",
        ko: "유지 관리자 및 프로젝트 출처",
      },
      {
        href: "https://github.com/moutsea/wechatai",
        zh: "项目源码与维护者",
        en: "Source code and maintainer",
        ja: "ソースコードとメンテナー",
        ko: "프로젝트 소스 및 유지 관리자",
      },
      {
        href: "https://github.com/moutsea/wechatai/commits/main/",
        zh: "公开变更记录",
        en: "Public change log",
        ja: "公開変更履歴",
        ko: "공개 변경 기록",
      },
    ],
  },
];

const quickLinks: FooterLink[] = [
  { href: "/app", zh: "进入工作台", en: "Open workspace", ja: "ワークスペースを開く", ko: "워크스페이스 열기" },
  { href: "/pricing", zh: "价格与额度", en: "Pricing and credits", ja: "料金とクレジット", ko: "가격 및 크레딧" },
  { href: "/docs/getting-started", zh: "入门教程", en: "Getting started", ja: "はじめかた", ko: "시작 가이드" },
  { href: "/contact", zh: "联系我们", en: "Contact us", ja: "お問い合わせ", ko: "문의하기" },
  { href: "/privacy", zh: "隐私政策", en: "Privacy policy", ja: "プライバシーポリシー", ko: "개인정보 처리방침" },
  {
    href: "https://github.com/moutsea/wechatai",
    zh: "GitHub 开源",
    en: "Open source on GitHub",
    ja: "GitHub でオープンソース",
    ko: "GitHub 오픈 소스",
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
  homeAria: string;
  intro: string;
  tagline: string;
  navigation: string;
  brand: string;
  disclaimer: string;
}

const footerCopyZh: FooterCopy = {
  homeAria: "微伴首页",
  intro: "在微信里，与自选的大模型对话。",
  tagline: "连接你的模型与 Agent，让灵感随时有回应。",
  navigation: "页脚导航",
  brand: "微伴 Wechatai",
  disclaimer: "独立开发产品，与微信、腾讯及模型供应商无官方关联。",
};

const footerCopyJa = {
  homeAria: "Wechatai のホーム",
  intro: "選んだモデルと、WeChat の中でそのまま会話できます。",
  tagline: "モデルとエージェントをつないで、アイデアにいつでも応えを。",
  navigation: "フッターナビゲーション",
  brand: "Wechatai",
  disclaimer:
    "個人開発のプロダクトです。WeChat、Tencent、各モデルプロバイダーとは公式な関係はありません。",
};

const footerCopyEn = {
  homeAria: "Wechatai home",
  intro: "Chat with the models you choose, right inside WeChat.",
  tagline: "Connect your models and agents so ideas always get an answer.",
  navigation: "Footer navigation",
  brand: "Wechatai",
  disclaimer: "Independently built; not affiliated with WeChat, Tencent, or model providers.",
};

const footerCopyKo: FooterCopy = {
  homeAria: "Wechatai 홈",
  intro: "직접 고른 모델과 위챗에서 대화하세요.",
  tagline: "모델과 에이전트를 연결해 아이디어에 언제나 답이 있게 하세요.",
  navigation: "바닥글 탐색",
  brand: "Wechatai",
  disclaimer: "독립적으로 개발된 제품이며 WeChat, Tencent 및 모델 제공자와 공식 제휴 관계가 없습니다.",
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
          <Link to={localizedHref(locale, "/")} aria-label={copy.homeAria}>
            <SiteBrand light latin={locale !== DEFAULT_LOCALE} />
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
