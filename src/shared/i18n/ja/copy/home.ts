/**
 * Japanese copy for the homepage, shared by the rendered page and its JSON-LD.
 *
 * Prices and allowances are always derived from the existing billing, credit,
 * WeChat-link and plugin-limit modules. This file only supplies wording; it is
 * not a second source for amounts or commercial terms. Amounts stay in CNY,
 * and every price is labelled as 人民元 so `¥` is not read as Japanese yen.
 */
import { DAILY_CREDIT_DEFAULTS } from "../../../credits";
import { PLUGIN_LIMITS } from "../../../plugin-access";
import { PLUS_MONTHLY_YUAN, PLUS_YEARLY_YUAN, approxYuan } from "../../../pricing-copy";
import { WECHAT_LINK_LIMITS } from "../../../wechat-links";

const yearlySaving = Number((PLUS_MONTHLY_YUAN * 12 - PLUS_YEARLY_YUAN).toFixed(1));

export interface JapaneseFaqItem {
  question: string;
  answer: string;
  guide: { href: string; label: string };
}

export const homeCopy = {
  seo: {
    title: "WeChat AI：DeepSeek・Claude・GPT とエージェント接続 | Wechatai",
    description:
      "Wechatai はモデルとエージェントを WeChat につなぐサービスです。DeepSeek・Claude・GPT とのチャット、画像生成、Muse・Hermes・OpenClaw の接続、Plus のクラウドアシスタント小薇（Xiaowei）によるファイル処理とタスク実行ができます。無料で始められ、モデルの API キーはご自身で用意し、モデル利用料は各プロバイダーに別途お支払いいただきます。",
  },
  plans: {
    free: {
      name: "無料プラン",
      description: "日常の質問から始める",
      unit: "ずっと無料",
      note: "会員登録なしでも始められます",
      badge: "まずは体験",
      action: "無料で始める",
    },
    month: {
      name: "Plus 月額プラン",
      description: "クレジットも選択肢もさらに広がる",
      unit: "/ 月（人民元）",
      note: "1 か月分を 1 回払いで購入。必要なときに更新できます。",
      badge: "柔軟に選べる",
      action: "月額 Plus を選ぶ",
    },
    year: {
      name: "Plus 年間プラン",
      description: "毎日そばに AI がいる暮らし",
      unit: "/ 年（人民元）",
      note: `月あたり約 ${approxYuan((PLUS_YEARLY_YUAN * 100) / 12)} 元（人民元）`,
      badge: `月払いより ${yearlySaving} 元おトク`,
      action: "年間 Plus を選ぶ",
    },
    features: {
      creditsPrefix: "毎日",
      creditsSuffix: "クレジット",
      wechatConnections: (count: number) => `WeChat 接続 ${count} 件`,
      unlimitedPlugins: "プラグイン設定",
      unlimitedPluginsEmphasis: "無制限",
      pluginConfigurations: (count: number) => `プラグイン設定 ${count} 件`,
      imageInput: "画像・ファイル入力に対応",
      noImageInput: "画像・ファイル入力には非対応",
      xiaoweiName: "小薇（Xiaowei）",
      xiaoweiCloud: "クラウドアシスタント",
      noXiaowei: "小薇（Xiaowei）は含まれません",
    },
    switchLabel: "Plus の支払い期間",
    monthly: "月払い",
    yearly: "年払い・よりおトク",
  },
  hero: {
    titleLead: "あなたの AI を、",
    titleAccent: "WeChat へ",
    body: "Wechatai はモデルとエージェントを WeChat につなぎ、チャット、画像生成、クラウドアシスタント小薇（Xiaowei）によるファイル処理とタスク実行を可能にします。DeepSeek・Claude・GPT・Muse・Hermes・OpenClaw を 1 つのアカウントから必要なだけ接続できます。",
    ctaWorkspace: "ワークスペースを開く",
    ctaStart: "無料で始める",
    how: "接続方法を見る",
    note: `毎日 ${DAILY_CREDIT_DEFAULTS.free} クレジットを無料で進呈。モデルの API キーはご自身で用意し、モデル利用料は各プロバイダーに別途お支払いいただきます。`,
    imageAlt:
      "上部に DeepSeek・Claude・GPT・Muse・Hermes・OpenClaw、接続線が下部の WeChat へ集まっている図。",
  },
  ctaSteps: "無料で始める",
  pricingSection: {
    title: "無料で始めて、Plus でさらに広げる",
    intro:
      "日常の質問は無料プランで。クレジット、WeChat 接続、小薇（Xiaowei）を増やしたいときは Plus をお選びください。",
    note: "クレジット（credits）は Wechatai のプラットフォーム利用枠で、利用量に応じて消費されます。会員プランは 1 回払いの購入で、自動更新はありません。毎日の付与分は翌日に繰り越されません。モデルの API 利用料は各プロバイダーに別途お支払いいただきます。",
    noteSecond:
      "小薇（Xiaowei）は設定したモデルを使用します。実行回数とサービスの提供状況はプラグイン画面に表示されます。月額と年間プランの特典は同じです。",
    estimate: "クレジットの仕組みと 1 日の利用量を確認",
    details: "料金とクレジットの詳細を見る",
  },
  privacy: {
    title: "データの安全性とプライバシー",
    intro: "キーの保存方法、チャットの取り扱い、記録の削除方法をご案内します。",
    policy: "プライバシーポリシーを見る",
    items: {
      keys: {
        title: "キーは暗号化して保存",
        body: "API キーと WeChat 接続の認証情報はサーバー側で暗号化して保存されます。保存済みのキーがブラウザーに返されることはありません。",
      },
      inspection: {
        title: "こちらから内容を確認することはありません",
        body: "チャットや添付ファイルの内容をこちらから進んで確認することはありません。メッセージは自動で処理され、接続先のサービスへ届けられます。必要な会話記録とタスク記録はプライバシーポリシーに従って保存されます。",
      },
      deletion: {
        title: "会話記録を削除できる",
        body: "ワークスペースで Wechatai 側の会話記録を削除できます。WeChat や外部サービス側に残るコピーは別途の対応が必要です。",
      },
    },
    openSource: {
      title: "GitHub でオープンソース公開",
      body: "Wechatai は MIT ライセンスでオープンソース公開しています。実装の確認、問題の報告、改善への参加を歓迎します。",
      repositoryAria: "GitHub の moutsea/wechatai リポジトリを表示（新しいウィンドウで開きます）",
    },
  },
  faqSection: {
    title: "よくある質問",
    intro: "料金、設定、利用方法についてのご質問。",
    more: "よくある質問をすべて見る",
  },
  faq: [
    {
      question: "自分で API キーを用意する必要がありますか？",
      answer:
        "通常のモデルチャットと小薇（Xiaowei）を利用するには、Wechatai にご自身のモデル API キーを設定してください。モデル利用料は各プロバイダーに別途お支払いいただきます。既存の Muse・Hermes・OpenClaw を接続する場合は、それぞれのモデル設定をそのまま使用します。サービス通知の受信だけならモデルのキーは不要です。",
      guide: { href: "/docs/channels-models", label: "API キーとモデル設定のガイドを見る" },
    },
    {
      question: "無料プランにもクレジットはありますか？失効しますか？",
      answer: `はい。無料プランはずっと無料で、毎日 ${DAILY_CREDIT_DEFAULTS.free} クレジット、WeChat 接続 ${WECHAT_LINK_LIMITS.free} 件、プラグイン設定 ${PLUGIN_LIMITS.free} 件が含まれます。毎日のクレジットは当日分のみ有効で繰り越されません。モデルの API 利用料は各プロバイダーに別途お支払いいただきます。`,
      guide: { href: "/pricing#estimate", label: "1 日の利用量を試算する" },
    },
    {
      question: "Plus の料金と、増える特典を教えてください。",
      answer: `Plus は月額 ¥${PLUS_MONTHLY_YUAN}（人民元）または年額 ¥${PLUS_YEARLY_YUAN}（人民元）で、毎日 ${DAILY_CREDIT_DEFAULTS.plus} クレジット、WeChat 接続 ${WECHAT_LINK_LIMITS.plus} 件、プラグイン設定の無制限、画像・ファイル入力、クラウドアシスタント小薇（Xiaowei）が含まれます。小薇（Xiaowei）の利用にはモデル設定が必要で、モデルの API 利用料は別途です。月額と年間プランの特典は同じで、どちらも 1 回払いの購入となり自動更新はありません。`,
      guide: { href: "/docs/cloud-agent", label: "小薇（Xiaowei）にできることを知る" },
    },
    {
      question: "どのモデルに対応していますか？",
      answer:
        "DeepSeek・Claude・GPT に加え、Kimi・Qwen（通義千問）・MiniMax などを接続でき、同じ WeChat アカウントで切り替えられます。公式および互換プロバイダーに対応し、利用できるモデルはプロバイダーと API キーによって異なります。画像やツールの対応もモデルとプロバイダーによります。",
      guide: { href: "/docs/channels-models", label: "対応プロバイダーとモデルを見る" },
    },
    {
      question: "登録から WeChat でのチャットまで何ステップですか？",
      answer:
        "通常のチャットは 3 ステップです。モデルを設定し、QR コードをスキャンして WeChat を接続し、メッセージを送信します。開始前に、WeChat に ClawBot の入口があることと、API キーを用意したことをご確認ください。スマートフォンで操作する場合は、パソコンや別の端末で QR コードを表示してください。既存のエージェントは各ガイドに従って接続でき、ここでのモデル設定は不要です。",
      guide: { href: "/docs/getting-started", label: "はじめかたガイドを読む" },
    },
    {
      question: "登録前に画面を確認できますか？",
      answer:
        "はい。公開ガイドには設定手順と実際の画面のスクリーンショットが掲載され、アカウントなしで読めます。ホームページの会話、タスク、QR コードのプレビューはイメージです。登録とスキャンにモデルのキーは不要ですが、通常のチャットや小薇（Xiaowei）のタスク実行の前にモデルを設定してください。",
      guide: { href: "/docs/getting-started", label: "設定手順と画面を見る" },
    },
    {
      question: "API キーとチャット履歴はどこに保存されますか？",
      answer:
        "API キーは Wechatai のサーバーで暗号化して保存され、設定したプロバイダーへのリクエストに使われます。ブラウザーに送信されることはありません。チャット履歴はあなたのアカウントに帰属します。無料プランでは履歴の全文をブラウザーで表示できませんが、会話は削除できます。Wechatai 側の記録を削除しても、WeChat やプロバイダー側のコピーは削除されません。",
      guide: { href: "/privacy", label: "プライバシーポリシーを読む" },
    },
  ] satisfies readonly JapaneseFaqItem[],
  steps: {
    eyebrow: "かんたんスタート",
    title: "2 分で設定して、無料で開始",
    guide: "はじめかたガイドを読む",
    requirementsPrefix: "まず、WeChat に",
    requirementsLink: "ClawBot の入口",
    requirementsSuffix:
      "があることをご確認ください。通常のチャットにはご自身のモデル API キーが必要です。スマートフォンでスキャンする場合は、パソコンや別の端末で QR コードを表示してください。",
    tabsLabel: "設定手順",
    items: [
      {
        title: "よく使うモデルを接続",
        tab: "モデルを設定",
        description:
          "DeepSeek、SiliconFlow、Alibaba Cloud、OpenAI、Anthropic などのプロバイダーに対応しています。API キーを入力し、ワンクリックでモデルを同期できます。",
        guideLabel: "モデル設定のガイドを見る",
      },
      {
        title: "WeChat を接続",
        tab: "WeChat を接続",
        description:
          "ワークスペースで QR コードを取得し、WeChat の ClawBot で確認します。スマートフォンの場合は、別の端末で QR コードを表示してください。",
        guideLabel: "WeChat 接続のガイドを見る",
      },
      {
        title: "いつもどおりチャット",
        tab: "チャットを始める",
        description:
          "WeChat の会話を開いて、AI にそのまま質問できます。モデルの切り替えや新しい話題の開始も、コマンド 1 つで完了します。",
        guideLabel: "WeChat コマンド一覧を見る",
      },
    ],
    preview: {
      providersTitle: "対応しているモデルプロバイダー",
      providersNote: "Coding Plan とカスタム互換プロバイダーにも対応",
      connectLabel: "接続イメージ",
      connectTitle: "スキャンして WeChat を接続",
      connectHint: "WeChat ClawBot でスキャン · スマートフォンで確認",
      connectNote: "イメージです。QR コードはワークスペースで取得してください",
      connectSuccess: "個人専用の接続",
      chatBrand: "Wechatai",
      chatSent: "週末のお出かけのアイデアを 3 つ教えて。",
      chatReceived: "もちろんです。屋外で過ごしたいですか、それとも街をゆっくり巡りますか？",
      chatNote: "新しい会話を開始しました。以前の会話は保存されています。",
    },
    previous: "前のステップ",
    next: "次のステップ",
    status: (index: number, total: number, title: string) =>
      `ステップ ${index} / ${total}：${title}`,
    alternativesPrefix:
      "モデルを設定して WeChat を接続すれば、チャットを始められます。ほかにも",
    alternativesAgent: "既存のエージェントを接続",
    alternativesMiddle: "するか、",
    alternativesNotifications: "サービス通知を受け取る",
    alternativesEnd: "こともできます。",
  },
  useCases: {
    title: "いろいろな AI を、より自由に",
    intro: "ひとつの質問から、ひとつの作業の完了まで。",
    caption: "上記の会話、モデルの選択、タスクの結果はイメージです。",
    items: [
      {
        lead: "WeChat ひとつで",
        title: "複数のエージェントを接続",
        description:
          "Muse・Hermes・OpenClaw を既存のツールと設定のまま使い、WeChat でタスクを送って結果を受け取れます。",
        action: "既存のエージェントを接続",
      },
      {
        lead: "ひとことの説明で",
        title: "WeChat で画像を生成",
        description:
          "シーンを説明すると WeChat で画像を受け取れます。ロールプレイを有効にすれば、キャラクターとストーリーもカスタマイズできます。",
        note: "画像生成には画像モデルが必要です。API 利用料は各プロバイダーに別途お支払いいただきます",
        action: "AI 画像生成を見る",
      },
      {
        lead: "DeepSeek・Claude・GPT",
        title: "トップモデルを自由に選択",
        description:
          "ご自身のモデル API を接続し、同じ WeChat アカウントでモデルを切り替えて、質問・文章作成・翻訳に使えます。",
        note: "API キーはご自身で用意し、モデル利用料は各プロバイダーに別途お支払いいただきます",
        action: "モデル設定を見る",
      },
      {
        lead: "小薇（Xiaowei）はクラウドのアシスタント",
        title: "ファイル処理と文書作成",
        description:
          "WeChat でタスクを依頼し、ファイルを受け取れます。インストールやデプロイは不要で、モデルを設定するだけです。例では <shortcut> を設定済みの WeChat ショートカットに置き換えてください。",
        note: "Plus 会員限定",
        action: "小薇（Xiaowei）を知って始める",
      },
    ],
    scenes: {
      creative: {
        title: "AI 画像生成",
        chat: "WeChat の会話",
        prompt: "@draw 街角のポートレートを 3:4 で描いて",
        done: "画像を生成しました",
        resultLead: "あなたのアイデアが、",
        resultAccent: "WeChat で作品になります。",
        resultNote: "生成した画像はそのまま会話に戻ります",
        roleplay: "ロールプレイ",
        roleplayNote: "キャラクターとストーリーをカスタマイズ",
      },
      modelsAria: "WeChat で DeepSeek を使う：モデル設定のガイドを見る",
      currentModel: "現在のモデル",
      agentGuide: (name: string) => `${name} の接続ガイド`,
      wechat: "WeChat",
      bridge: "タスクを送信 · 結果を受信",
      cloud: {
        title: "小薇（Xiaowei）",
        subtitle: "Wechatai のクラウドで動くタスクアシスタント",
        task: "小薇（Xiaowei）に依頼",
        done: "完了",
        prompt: "@<shortcut> この Markdown を Word に変換して",
        fileName: "プロジェクト説明.docx",
        fileNote: "生成したファイルを WeChat に送信",
      },
    },
  },
} as const;
