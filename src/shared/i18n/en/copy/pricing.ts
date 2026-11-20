/**
 * English copy for the pricing page, shared by the rendered page and JSON-LD.
 * Amounts, daily allowances, refund/renewal terms and plan limits still come
 * from the existing billing, credit, link and plugin modules.
 */
import { BILLING_OFFERS } from "../../../billing-offers";
import { DAILY_CREDIT_DEFAULTS } from "../../../credits";
import { approxYuan } from "../../../pricing-copy";
import { PLUGIN_LIMITS } from "../../../plugin-access";
import { WECHAT_LINK_LIMITS } from "../../../wechat-links";

const monthly = BILLING_OFFERS.find((offer) => offer.id === "plus_monthly")!;
const yearly = BILLING_OFFERS.find((offer) => offer.id === "plus_yearly")!;
const monthlyPrice = `¥${monthly.amount / 100}/month`;
const yearlyPrice = `¥${yearly.amount / 100}/year`;

const packs = BILLING_OFFERS.filter((offer) => offer.kind === "credits")
  .map((offer) => `¥${offer.amount / 100} for ${offer.credits} credits`)
  .join(", ");

export const pricingCopy = {
  seo: {
    title: `Pricing: ${DAILY_CREDIT_DEFAULTS.free} free credits per day, Plus ${monthlyPrice}`,
    description: `Compare Wechatai Free and Plus: daily credits, WeChat connections, plugins, attachments, and Xiaowei AI. Free includes ${DAILY_CREDIT_DEFAULTS.free} credits per day; Plus is ${monthlyPrice} or ${yearlyPrice}, a one-time purchase with no auto-renewal. Model API fees are billed separately.`,
    eyebrow: "Pricing & plans",
    h1: "Start free, upgrade to Plus when you need more",
    lede: "The free plan covers everyday questions. Plus adds more credits and Xiaowei AI. Bring your own model API key; model fees are billed separately by the provider.",
    answer:
      "The free plan covers everyday questions. Plus adds more credits and Xiaowei AI. Bring your own model API key; model fees are billed separately by the provider.",
    primaryKeyword: "WeChat AI pricing",
    secondaryKeywords: [
      "Wechatai pricing",
      "WeChat AI cost",
      "WeChat AI free credits",
      "ClawBot pricing",
    ],
    faq: [
      {
        question: "Does the membership include model fees?",
        answer:
          "No. Membership and credits cover Wechatai's platform service. Regular chat, image generation, and Xiaowei use the model API you configure, and model fees are billed separately by the provider. Existing Muse, Hermes, and OpenClaw setups keep their own model and billing configuration.",
        guide: { label: "Learn about model setup", href: "/docs/channels-models" },
      },
      {
        question: "How do credits work? Do daily credits roll over?",
        answer: `credits are the platform usage allowance. Text is metered by input, output, and conversation history: for example, 1,000 input tokens and 1,000 output tokens in one request cost about 1.8 credits. Image generation costs 5 credits per image, plus text for the description. Free includes ${DAILY_CREDIT_DEFAULTS.free} credits per day and Plus includes ${DAILY_CREDIT_DEFAULTS.plus}; credits are valid for the day and do not roll over. Webhook service notifications do not consume credits.`,
        guide: { label: "See full billing rules", href: "/docs/credits" },
      },
      {
        question: "What happens when credits run out?",
        answer: `Wait for the daily allowance to reset the next day, or buy a top-up pack: ${packs}. Top-ups do not require Plus, and purchased credits stay valid. Buying a top-up does not unlock Plus-only features.`,
        guide: { label: "Go to membership and credits", href: "/app/billing" },
      },
      {
        question: "What can Plus's Xiaowei AI do?",
        answer:
          "Xiaowei is an assistant that runs in the Wechatai cloud. It can process files, generate documents, and carry out tasks, then send results back to WeChat. No installation or deployment is needed; configure a text model to enable it. Task counts, storage allowance, and service status are shown on the plugin page; model API fees are billed separately.",
        guide: { label: "Meet Xiaowei and its requirements", href: "/docs/cloud-agent" },
      },
      {
        question: "How much is Plus? Does it auto-renew?",
        answer: `Plus is ${monthlyPrice}, or ${yearlyPrice} (about ${approxYuan(yearly.amount / 12)}/month). New memberships are one-time payments with no auto-renewal; renewing early extends the term. When a membership expires, the account returns to the free plan and purchased credits are kept. Legacy auto-renewing subscriptions can be cancelled under "Manage subscription".`,
      },
      {
        question: "Can I get a refund after purchase?",
        answer:
          "To request a refund, contact us with your order details. We handle requests based on the actual order, usage, and applicable law; the terms of service control.",
        guide: { label: "Contact support", href: "/contact" },
      },
      {
        question: "What do I need before I start?",
        answer:
          "First make sure your phone's WeChat has the ClawBot entry; Wechatai cannot enable it for your account. Regular chat and Xiaowei also need a model API key; image generation needs an image model and plugin. When scanning on a phone, show the QR code from a computer or another device.",
        guide: { label: "Read the getting-started guide", href: "/docs/getting-started" },
      },
    ],
    related: [{ label: "Muse managed assistant for WeChat", href: "/wechat-muse" }],
  },
  page: {
    skip: "Skip to content",
    breadcrumbLabel: "Breadcrumb",
    home: "Home",
    breadcrumbCurrent: "Pricing & plans",
    faqTitle: "Still have questions?",
    estimatorSummary: "Estimate my daily usage",
    help: "Need help? Contact us",
    terms: "Terms of service",
  },
  plans: {
    title: "Free vs Plus comparison",
    free: {
      name: "Free",
      badge: "Easy start",
      description: "Start with everyday questions",
      unit: "Free forever",
      note: "No membership required to get started",
      workspace: "Open workspace",
      start: "Start free",
    },
    badgeFlexible: "Flexible",
    badgeSave: (saving: string) => `Save ${saving}`,
    descriptionAnnual: "Long-term use; the yearly plan is better value",
    descriptionMonthly: "More credits and Xiaowei AI",
    unitYear: "/ year",
    unitMonth: "/ month",
    noteAnnual: (approx: string, saving: string) =>
      `About ${approx} / month, ${saving} less than monthly`,
    noteMonthly: "Billed monthly; renew when needed",
    ctaBusy: "Redirecting to payment…",
    ctaSubscribe: (name: string, price: string) => `Get ${name} · ${price}`,
    ctaChoose: (name: string) => `Choose ${name}`,
    offerName: (interval: "month" | "year") => (interval === "year" ? "Plus Yearly" : "Plus Monthly"),
    features: [
      {
        label: "Credits per day",
        free: DAILY_CREDIT_DEFAULTS.free,
        plus: DAILY_CREDIT_DEFAULTS.plus,
      },
      {
        label: "WeChat connections",
        free: WECHAT_LINK_LIMITS.free,
        plus: WECHAT_LINK_LIMITS.plus,
      },
      { label: "Plugin configurations", free: PLUGIN_LIMITS.free, plus: "Unlimited" },
      { label: "Image and file input", free: false, plus: true },
      { label: "View chat history on the web", free: false, plus: true },
      { label: "Xiaowei AI cloud assistant", free: false, plus: true, href: "/docs/cloud-agent" },
    ],
    highlights: ["Credits per day", "WeChat connections", "Plugin configurations"],
    supported: "Supported",
    unsupported: "Not supported",
    comparisonCaption: "Benefits comparison · Monthly and yearly Plus include the same benefits",
    comparisonHeaders: ["Feature & allowance", "Free", "Plus"],
    common:
      "All plans include model chat, AI image generation, role-play, and free service notifications.",
    fineprint:
      "Plus is a one-time purchase with no auto-renewal; monthly and yearly include the same benefits. Daily credits are valid for the day and do not roll over.",
    checked: "Prices checked on",
  },
  estimator: {
    eyebrow: "Two costs when you bring your own API",
    title: "Estimate your text usage first",
    intro:
      "Calculated in your browser only; no login required. The provider rate estimates model API cost. Xiaowei also uses your own model and may call it several times; actual API fees follow the provider's bill. The cloud service still requires Plus and availability, and task counts have separate limits.",
    fields: [
      "Input tokens per turn (including history)",
      "Output tokens per turn",
      "Requests per day",
      "Provider input price (CNY / million tokens)",
      "Provider output price (CNY / million tokens)",
    ],
    placeholder: "Optional, CNY price",
    platformLabel: "Wechatai usage / day",
    platformHint: (free: number, plus: number) =>
      `Free includes ${free} per day; Plus includes ${plus}. Daily credits do not roll over.`,
    providerLabel: "Provider model cost / day",
    providerValue: (amount: string) => `About ¥${amount}`,
    providerEmpty: "Enter a price to see the estimate",
    providerHint:
      "Model API fees are billed separately by the provider; Xiaowei's internal calls may also incur API fees.",
    invalid: "Enter valid non-negative numbers; tokens and turns must be whole numbers.",
    note:
      "Formula: (input + output × 8) ÷ 5,000, rounded up to 0.001 credit per turn. Input must include the history actually sent each turn. Does not cover cache differences, search, extra tool calls, attachments, image generation, tax, or exchange rates. This is an estimate, not a quote, and does not guarantee a fixed number of chats.",
    noteLink: "See full billing rules",
  },
  relatedHeading: "Continue exploring",
};
