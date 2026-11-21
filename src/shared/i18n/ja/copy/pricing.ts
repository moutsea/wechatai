/**
 * Japanese copy for the pricing page, shared by the rendered page and JSON-LD.
 * Amounts, daily allowances, refund/renewal terms and plan limits still come
 * from the existing billing, credit, link and plugin modules. Prices stay in
 * CNY and the unit labels say 人民元 so `¥` is never read as Japanese yen.
 */
import { BILLING_OFFERS } from "../../../billing-offers";
import { DAILY_CREDIT_DEFAULTS } from "../../../credits";
import { approxYuan } from "../../../pricing-copy";
import { PLUGIN_LIMITS } from "../../../plugin-access";
import { WECHAT_LINK_LIMITS } from "../../../wechat-links";

const monthly = BILLING_OFFERS.find((offer) => offer.id === "plus_monthly")!;
const yearly = BILLING_OFFERS.find((offer) => offer.id === "plus_yearly")!;
const monthlyPrice = `月額 ¥${monthly.amount / 100}（人民元）`;
const yearlyPrice = `年額 ¥${yearly.amount / 100}（人民元）`;

const packs = BILLING_OFFERS.filter((offer) => offer.kind === "credits")
  .map((offer) => `¥${offer.amount / 100}（人民元）で ${offer.credits} クレジット`)
  .join("、");

export const pricingCopy = {
  seo: {
    title: `料金：毎日 ${DAILY_CREDIT_DEFAULTS.free} クレジット無料、Plus は${monthlyPrice}`,
    description: `Wechatai の無料プランと Plus を比較：毎日のクレジット、WeChat 接続、プラグイン、添付ファイル、小薇（Xiaowei）。無料プランは毎日 ${DAILY_CREDIT_DEFAULTS.free} クレジット、Plus は${monthlyPrice}、または${yearlyPrice}の 1 回払いで、自動更新はありません。モデルの API 利用料は別途です。`,
    eyebrow: "料金とプラン",
    h1: "無料で始めて、必要に応じて Plus へ",
    lede: "無料プランで日常の質問に対応できます。Plus ではクレジットと小薇（Xiaowei）がさらに充実します。モデルの API キーはご自身で用意し、モデル利用料は各プロバイダーに別途お支払いいただきます。",
    answer:
      "無料プランで日常の質問に対応できます。Plus ではクレジットと小薇（Xiaowei）がさらに充実します。モデルの API キーはご自身で用意し、モデル利用料は各プロバイダーに別途お支払いいただきます。",
    primaryKeyword: "WeChat AI 料金",
    secondaryKeywords: [
      "Wechatai 料金",
      "WeChat AI 費用",
      "WeChat AI 無料クレジット",
      "ClawBot 料金",
    ],
    faq: [
      {
        question: "会員プランにモデル利用料は含まれますか？",
        answer:
          "含まれません。会員プランとクレジットは Wechatai のプラットフォームサービスの利用枠です。通常のチャット、画像生成、小薇（Xiaowei）は設定したモデル API を使用し、モデル利用料は各プロバイダーに別途お支払いいただきます。既存の Muse・Hermes・OpenClaw は、それぞれのモデルと料金設定をそのまま使用します。",
        guide: { label: "モデル設定について知る", href: "/docs/channels-models" },
      },
      {
        question: "クレジットはどのように消費されますか？毎日分は繰り越されますか？",
        answer: `クレジットはプラットフォームの利用枠です。テキストは入力・出力・会話履歴で計測され、たとえば 1 回のリクエストで入力 1,000 トークン・出力 1,000 トークンの場合、約 1.8 クレジットを消費します。画像生成は 1 枚あたり 5 クレジットに加え、説明文のテキスト分がかかります。無料プランは毎日 ${DAILY_CREDIT_DEFAULTS.free}、Plus は毎日 ${DAILY_CREDIT_DEFAULTS.plus} クレジットで、当日分のみ有効、繰り越しはありません。Webhook によるサービス通知はクレジットを消費しません。`,
        guide: { label: "課金ルールの詳細を見る", href: "/docs/credits" },
      },
      {
        question: "クレジットがなくなったらどうなりますか？",
        answer: `翌日の付与を待つか、チャージパックを購入できます：${packs}。チャージパックは Plus がなくても購入でき、購入したクレジットは有効期限なしで利用できます。チャージパックを購入しても Plus 限定機能は解放されません。`,
        guide: { label: "会員とクレジットを確認する", href: "/app/billing" },
      },
      {
        question: "Plus の小薇（Xiaowei）は何ができますか？",
        answer:
          "小薇（Xiaowei）は Wechatai のクラウドで動作するアシスタントです。ファイルの処理、文書の作成、タスクの実行を行い、結果を WeChat に送り返します。インストールやデプロイは不要で、テキストモデルを設定すると利用できます。実行回数、ストレージの上限、サービスの提供状況はプラグイン画面に表示され、モデルの API 利用料は別途です。",
        guide: { label: "小薇（Xiaowei）と利用条件を知る", href: "/docs/cloud-agent" },
      },
      {
        question: "Plus の料金と自動更新の有無を教えてください。",
        answer: `Plus は${monthlyPrice}、または ${yearlyPrice}（月あたり約 ${approxYuan(yearly.amount / 12)} 元）です。新規の会員プランは 1 回払いで、自動更新はありません。早めに更新すると有効期間が延長されます。有効期限が切れると無料プランに戻り、購入済みのクレジットは保持されます。以前の自動更新サブスクリプションは「サブスクリプションの管理」から解約できます。`,
      },
      {
        question: "購入後に返金できますか？",
        answer:
          "返金をご希望の場合は、注文情報を添えてお問い合わせください。実際の注文内容、利用状況、適用法に基づいて対応します。詳細は利用規約に従います。",
        guide: { label: "サポートに問い合わせる", href: "/contact" },
      },
      {
        question: "利用を始める前に何を用意すればよいですか？",
        answer:
          "まず、お使いのスマートフォンの WeChat に ClawBot の入口があることをご確認ください。Wechatai 側で入口を開設することはできません。通常のチャットと小薇（Xiaowei）にはモデルの API キーも必要です。画像生成には画像モデルとプラグインが必要です。スマートフォンでスキャンする場合は、パソコンや別の端末で QR コードを表示してください。",
        guide: { label: "はじめかたガイドを読む", href: "/docs/getting-started" },
      },
    ],
    related: [{ label: "WeChat 向け Muse マネージドアシスタント", href: "/wechat-muse" }],
  },
  page: {
    skip: "本文へスキップ",
    breadcrumbLabel: "パンくずリスト",
    home: "ホーム",
    breadcrumbCurrent: "料金とプラン",
    faqTitle: "さらにご不明な点はありますか？",
    estimatorSummary: "1 日の利用量を試算する",
    help: "お問い合わせ",
    terms: "利用規約",
  },
  plans: {
    title: "無料プランと Plus の比較",
    free: {
      name: "無料プラン",
      badge: "気軽に開始",
      description: "日常の質問から始める",
      unit: "ずっと無料",
      note: "有料プランへの加入は不要です",
      workspace: "ワークスペースを開く",
      start: "無料で始める",
    },
    badgeFlexible: "柔軟に選べる",
    badgeSave: (saving: string) => `${saving} おトク`,
    descriptionAnnual: "長く使うなら年間プランがお得",
    descriptionMonthly: "クレジットと小薇（Xiaowei）を追加",
    unitYear: "/ 年（人民元）",
    unitMonth: "/ 月（人民元）",
    noteAnnual: (approx: string, saving: string) =>
      `月あたり約 ${approx} 元（人民元）、月払いより ${saving} おトク`,
    noteMonthly: "1 か月分を 1 回払いで購入。必要なときに更新できます。",
    ctaBusy: "決済画面へ移動しています…",
    ctaSubscribe: (name: string, price: string) => `${name}を購入 · ${price}`,
    ctaChoose: (name: string) => `${name}を選ぶ`,
    loginAgain: "もう一度ログイン",
    checkoutFailed: "決済を開始できませんでした。もう一度お試しください。",
    checkoutErrors: {
      unauthorized: "セッションの有効期限が切れました。再度ログインしてください。",
      rate_limited: "試行回数が多すぎます。少し待ってからもう一度お試しください。",
      billing_unavailable: "このプランは現在購入できません。時間をおいてお試しください。",
      already_subscribed:
        "継続課金または保留中のサブスクリプションがあります。1 回払いの会員プランを購入する前に、「サブスクリプションの管理」で自動更新を解除してください。残りの期間は保持されます。",
      payment_processing: "お支払いを確認しています。しばらくしてから再読み込みしてください。",
      checkout_in_progress: "注文を作成中です。少し待ってからもう一度お試しください。",
    },
    offerName: (interval: "month" | "year") =>
      interval === "year" ? "Plus 年間プラン" : "Plus 月額プラン",
    features: [
      {
        label: "1 日あたりのクレジット",
        free: DAILY_CREDIT_DEFAULTS.free,
        plus: DAILY_CREDIT_DEFAULTS.plus,
      },
      {
        label: "WeChat 接続",
        free: WECHAT_LINK_LIMITS.free,
        plus: WECHAT_LINK_LIMITS.plus,
      },
      { label: "プラグイン設定", free: PLUGIN_LIMITS.free, plus: "無制限" },
      { label: "画像・ファイル入力", free: false, plus: true },
      { label: "Web でチャット履歴を表示", free: false, plus: true },
      {
        label: "小薇（Xiaowei）クラウドアシスタント",
        free: false,
        plus: true,
        href: "/docs/cloud-agent",
      },
    ],
    highlights: ["1 日あたりのクレジット", "WeChat 接続", "プラグイン設定"],
    supported: "対応",
    unsupported: "非対応",
    comparisonCaption: "特典の比較 · Plus の月額と年間プランは特典が同じです",
    comparisonHeaders: ["機能と利用枠", "無料プラン", "Plus"],
    common:
      "すべてのプランで、モデルチャット、AI 画像生成、ロールプレイ、無料のサービス通知を利用できます。",
    fineprint:
      "Plus は 1 回払いの購入で自動更新はありません。月額と年間プランは特典が同じです。毎日のクレジットは当日分のみ有効で、翌日には繰り越されません。",
    checked: "価格の確認日",
  },
  estimator: {
    eyebrow: "ご自身の API を使うときの 2 つの費用",
    title: "まずはテキストの利用量を試算",
    intro:
      "ブラウザー内だけで計算し、ログインは不要です。プロバイダーの料金はモデル API の費用の目安です。小薇（Xiaowei）もご自身のモデルを使い、複数回呼び出す場合があります。実際の API 利用料はプロバイダーの請求に従います。クラウドの利用には Plus とサービスの提供状況が必要で、実行回数には別の制限があります。",
    fields: [
      "1 ターンあたりの入力トークン（履歴を含む）",
      "1 ターンあたりの出力トークン",
      "1 日あたりのリクエスト数",
      "プロバイダーの入力料金（人民元 / 100 万トークン）",
      "プロバイダーの出力料金（人民元 / 100 万トークン）",
    ],
    placeholder: "任意、人民元の料金",
    creditsUnit: "クレジット",
    platformLabel: "Wechatai の利用量 / 日",
    platformHint: (free: number, plus: number) =>
      `無料プランは毎日 ${free}、Plus は毎日 ${plus}。付与分は繰り越されません。`,
    providerLabel: "プロバイダーのモデル費用 / 日",
    providerValue: (amount: string) => `約 ¥${amount}（人民元）`,
    providerEmpty: "料金を入力すると試算を表示します",
    providerHint:
      "モデルの API 利用料は各プロバイダーに別途お支払いいただきます。小薇（Xiaowei）の内部呼び出しでも API 利用料が発生する場合があります。",
    invalid: "有効な 0 以上の数値を入力してください。トークン数と回数は整数である必要があります。",
    note:
      "計算式：（入力 + 出力 × 8）÷ 5,000 を 1 ターンあたり 0.001 クレジットに切り上げ。入力には毎ターン実際に送信される履歴を含めてください。キャッシュの差額、検索、ツールの追加呼び出し、添付ファイル、画像生成、税金、為替レートは含みません。これは試算であり、見積もりやチャット回数の保証ではありません。",
    noteLink: "課金ルールの詳細を見る",
  },
  relatedHeading: "さらに知る",
};
