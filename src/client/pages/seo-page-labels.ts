import { DEFAULT_LOCALE, type Locale } from "../../shared/i18n";
import { seoPageLabels as ko } from "../../shared/i18n/ko/copy/seo-page";

/** Chrome shared by every landing page rendered through `SeoPageView`. */
export interface SeoPageLabels {
  skipToContent: string;
  home: string;
  breadcrumb: string;
  comparisonTable: string;
  compareMissing: string;
  commands: string;
  copyCommand: (command: string) => string;
  copy: string;
  copied: string;
  copyFailed: string;
  faq: string;
  contents: string;
  tableOfContents: string;
  ctaTitle: string;
  ctaBody: string;
  ctaAction: string;
  updated: string;
  checkRequirements: string;
  estimateCosts: string;
  startFree: string;
  estimateFirst: string;
  setupGuide: string;
}

const zh: SeoPageLabels = {
  skipToContent: "跳到正文",
  home: "首页",
  breadcrumb: "面包屑",
  comparisonTable: "对照表",
  compareMissing: "没有找到可公开核实的来源，不代表对方不支持",
  commands: "常用微信命令",
  copyCommand: (command) => `复制命令 ${command}`,
  copy: "复制",
  copied: "已复制",
  copyFailed: "复制失败",
  faq: "常见问题",
  contents: "本页内容",
  tableOfContents: "本页目录",
  ctaTitle: "确认接入条件，开始配置你的微信 AI",
  ctaBody: "先检查微信 ClawBot 入口，再按模型、Agent 或通知的路径配置。模型调用费用另计。",
  ctaAction: "免费开始",
  updated: "本页更新于",
  checkRequirements: "注册前检查接入条件",
  estimateCosts: "估算平台与模型费用",
  startFree: "免费开始",
  estimateFirst: "先算使用费用",
  setupGuide: "查看使用指南",
};

const en: SeoPageLabels = {
  skipToContent: "Skip to content",
  home: "Home",
  breadcrumb: "Breadcrumb",
  comparisonTable: "Comparison table",
  compareMissing: "No public source could be verified; this does not mean the other side lacks support",
  commands: "Common WeChat commands",
  copyCommand: (command) => `Copy command ${command}`,
  copy: "Copy",
  copied: "Copied",
  copyFailed: "Copy failed",
  faq: "Frequently asked questions",
  contents: "On this page",
  tableOfContents: "Page contents",
  ctaTitle: "Check the requirements, then set up your WeChat AI",
  ctaBody:
    "Start with the WeChat ClawBot entry, then configure a model, an agent, or notifications. Model usage is billed separately.",
  ctaAction: "Start for free",
  updated: "Updated",
  checkRequirements: "Check access requirements before signing up",
  estimateCosts: "Estimate platform and model costs",
  startFree: "Start for free",
  estimateFirst: "Estimate usage costs first",
  setupGuide: "Read the setup guide",
};

const ja: SeoPageLabels = {
  skipToContent: "本文へスキップ",
  home: "ホーム",
  breadcrumb: "パンくずリスト",
  comparisonTable: "比較表",
  compareMissing:
    "公開されている情報源を確認できなかった箇所です。相手側が非対応という意味ではありません",
  commands: "よく使う WeChat コマンド",
  copyCommand: (command) => `コマンドをコピー ${command}`,
  copy: "コピー",
  copied: "コピーしました",
  copyFailed: "コピーに失敗しました",
  faq: "よくある質問",
  contents: "このページの内容",
  tableOfContents: "ページ内目次",
  ctaTitle: "接続条件を確認して、WeChat AI の設定を始める",
  ctaBody:
    "まず WeChat の ClawBot 入口を確認し、モデル・エージェント・通知のいずれかの経路で設定してください。モデルの利用料は別途です。",
  ctaAction: "無料で始める",
  updated: "本ページの更新日",
  checkRequirements: "登録前に接続条件を確認",
  estimateCosts: "プラットフォームとモデルの費用を試算",
  startFree: "無料で始める",
  estimateFirst: "まず利用費用を試算",
  setupGuide: "利用ガイドを見る",
};

/** Locales without a dedicated dictionary use English. */
export function seoPageLabels(locale: Locale): SeoPageLabels {
  if (locale === DEFAULT_LOCALE) return zh;
  if (locale === "ja") return ja;
  if (locale === "ko") return ko;
  return en;
}
