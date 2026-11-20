/**
 * English copy for the homepage, shared by the rendered page and its JSON-LD.
 *
 * Prices and allowances are always derived from the existing billing, credit,
 * WeChat-link and plugin-limit modules. This file only supplies wording; it is
 * not a second source for amounts or commercial terms.
 */
import { DAILY_CREDIT_DEFAULTS } from "../../../credits";
import { PLUGIN_LIMITS } from "../../../plugin-access";
import { PLUS_MONTHLY_YUAN, PLUS_YEARLY_YUAN, approxYuan } from "../../../pricing-copy";
import { WECHAT_LINK_LIMITS } from "../../../wechat-links";

const yearlySaving = Number((PLUS_MONTHLY_YUAN * 12 - PLUS_YEARLY_YUAN).toFixed(1));

export interface EnglishFaqItem {
  question: string;
  answer: string;
  guide: { href: string; label: string };
}

export const homeCopy = {
  seo: {
    title: "WeChat AI: DeepSeek, Claude, GPT, and agents | Wechatai",
    description:
      "Wechatai connects models and agents to WeChat: chat with DeepSeek, Claude, and GPT, generate images, connect Muse, Hermes, and OpenClaw, and let the Plus cloud assistant Xiaowei handle files and tasks. Start free with your own model API key; model fees are billed by the provider.",
  },
  plans: {
    free: {
      name: "Free",
      description: "Start with everyday questions",
      unit: "Free forever",
      note: "No membership required to get started",
      badge: "Starter",
      action: "Start free",
    },
    month: {
      name: "Plus Monthly",
      description: "More credits, more possibilities",
      unit: "/ month",
      note: "Billed monthly; renew when needed",
      badge: "Flexible",
      action: "Choose monthly Plus",
    },
    year: {
      name: "Plus Yearly",
      description: "AI by your side every day",
      unit: "/ year",
      note: `About ${approxYuan((PLUS_YEARLY_YUAN * 100) / 12)} / month`,
      badge: `Save ¥${yearlySaving} vs monthly`,
      action: "Choose yearly Plus",
    },
    features: {
      creditsPrefix: "Every day",
      creditsSuffix: "credits",
      wechatConnections: (count: number) =>
        count === 1 ? "WeChat connection" : "WeChat connections",
      unlimitedPlugins: "Unlimited plugin configurations",
      pluginConfigurations: (count: number) =>
        count === 1 ? "plugin configuration" : "plugin configurations",
      imageInput: "Image and file input",
      noImageInput: "Image and file input not included",
      xiaoweiCloud: "cloud assistant",
      noXiaowei: "No Xiaowei AI",
    },
    switchLabel: "Plus billing period",
    monthly: "Monthly",
    yearly: "Yearly · save more",
  },
  hero: {
    titleLead: "Bring your AI",
    titleAccent: "into WeChat",
    body: "Wechatai connects models and agents to WeChat, with chat, image generation, and Xiaowei cloud tasks for files and documents. Connect DeepSeek, Claude, GPT, Muse, Hermes, and OpenClaw from one account.",
    ctaWorkspace: "Open workspace",
    ctaStart: "Get started",
    how: "See how to connect",
    note: `Free ${DAILY_CREDIT_DEFAULTS.free} credits every day; bring your own model API key, and model fees are billed by the provider.`,
    imageAlt:
      "DeepSeek, Claude, GPT, Muse, Hermes, and OpenClaw above, connected by lines into WeChat below.",
  },
  pricingSection: {
    title: "Start free, unlock more with Plus",
    intro:
      "Start with the free plan for everyday questions. Choose Plus for more credits, more WeChat connections, and Xiaowei AI.",
    note: "credits are Wechatai's platform usage allowance, deducted by usage. Memberships are one-time purchases with no auto-renewal; daily credits do not roll over. Model API fees are paid separately to the provider.",
    noteSecond:
      "Xiaowei AI uses the model you configure; task counts and service status are shown on the plugin page. Monthly and yearly plans include the same benefits.",
    estimate: "How do credits work? Estimate your daily usage",
    details: "See full pricing and credit details",
  },
  privacy: {
    title: "Data security and privacy",
    intro: "Learn how keys are stored, how chats are handled, and how to delete records.",
    policy: "Read the privacy policy",
    items: {
      keys: {
        title: "Keys stored encrypted",
        body: "API keys and WeChat connection credentials are encrypted at rest on the server. Saved keys are never sent back to the browser.",
      },
      inspection: {
        title: "No proactive review",
        body: "We do not proactively review your chats or attachments. Messages are processed automatically and delivered to connected services. Necessary conversation and task records are retained under the privacy policy.",
      },
      deletion: {
        title: "Delete conversation records",
        body: "Clear Wechatai conversation records in the workspace; copies kept by WeChat and third-party services must be handled separately.",
      },
    },
    openSource: {
      title: "Open source on GitHub",
      body: "Wechatai is open source under the MIT license. Explore the code, report issues, or contribute.",
      repositoryAria: "View the moutsea/wechatai GitHub repository (opens in a new window)",
    },
  },
  faqSection: {
    title: "Frequently asked questions",
    intro: "Questions about pricing, setup, and usage.",
    more: "Read the full FAQ",
  },
  faq: [
    {
      question: "Do I need my own API key?",
      answer:
        "Regular model chat and Xiaowei need your own model API key configured in Wechatai; model fees are billed separately by the provider. If you connect an existing Muse, Hermes, or OpenClaw setup, it keeps its own model configuration. Service notifications alone do not need a model key.",
      guide: { href: "/docs/channels-models", label: "See the API key and model setup guide" },
    },
    {
      question: "Does the free plan include credits? Do they expire?",
      answer: `Yes. The free plan is free forever and includes ${DAILY_CREDIT_DEFAULTS.free} credits per day, ${WECHAT_LINK_LIMITS.free} WeChat connection, and ${PLUGIN_LIMITS.free} plugin configuration. Daily credits are valid for that day and do not roll over; model API fees are billed separately by the provider.`,
      guide: { href: "/pricing#estimate", label: "Estimate your daily usage" },
    },
    {
      question: "How much is Plus, and what does it add?",
      answer: `Plus is ¥${PLUS_MONTHLY_YUAN}/month or ¥${PLUS_YEARLY_YUAN}/year, with ${DAILY_CREDIT_DEFAULTS.plus} credits per day, ${WECHAT_LINK_LIMITS.plus} WeChat connections, unlimited plugin configurations, image and file input, and the Xiaowei AI cloud assistant. Xiaowei needs a configured model, and model API fees are billed separately. Monthly and yearly plans include the same benefits; both are one-time purchases with no auto-renewal.`,
      guide: { href: "/docs/cloud-agent", label: "Learn what Xiaowei can do" },
    },
    {
      question: "Which models are supported?",
      answer:
        "Connect DeepSeek, Claude, and GPT, plus Kimi, Qwen, MiniMax, and others, and switch between them in the same WeChat account. Official and compatible providers are supported; available models depend on the provider and your API key. Image and tool support also depends on the model and provider.",
      guide: { href: "/docs/channels-models", label: "See supported providers and models" },
    },
    {
      question: "How many steps from sign-up to chatting in WeChat?",
      answer:
        "Regular chat takes three steps: configure a model, scan to connect WeChat, and send a message. Before you start, make sure WeChat has the ClawBot entry and you have an API key ready. On a phone, show the QR code from a computer or another device. Existing agents can follow their own guide and do not need a separate model setup here.",
      guide: { href: "/docs/getting-started", label: "Follow the getting-started guide" },
    },
    {
      question: "Can I look around before signing up?",
      answer:
        "Yes. The public guides include setup steps and real interface screenshots and can be read without an account. The conversations, tasks, and QR previews on the homepage are illustrations. Registering and scanning do not require a model key; configure a model before regular chat or running Xiaowei tasks.",
      guide: { href: "/docs/getting-started", label: "See the setup steps and interface" },
    },
    {
      question: "Where are API keys and chat history stored?",
      answer:
        "API keys are encrypted on Wechatai servers and used to send requests to the provider you configure; they are never sent to the browser. Chat history belongs to your account. The free plan cannot show full history in the browser, but you can delete conversations. Deleting Wechatai records does not delete copies held by WeChat or the provider.",
      guide: { href: "/privacy", label: "Read the privacy policy" },
    },
  ] satisfies readonly EnglishFaqItem[],
  steps: {
    eyebrow: "Easy start",
    title: "Set up in 2 minutes, start free",
    guide: "Read the getting-started guide",
    requirementsPrefix: "First make sure WeChat has the",
    requirementsLink: "ClawBot entry",
    requirementsSuffix:
      "; regular chat requires your own model API key. When scanning on a phone, show the QR code from a computer or another device.",
    tabsLabel: "Setup steps",
    items: [
      {
        title: "Connect the models you use",
        tab: "Configure models",
        description:
          "Supports DeepSeek, SiliconFlow, Alibaba Cloud, OpenAI, Anthropic, and other providers. Enter an API key and sync models in one click.",
        guideLabel: "See the model setup guide",
      },
      {
        title: "Connect your WeChat",
        tab: "Connect WeChat",
        description:
          "Get a QR code in the workspace and confirm it with WeChat ClawBot. On a phone, show the QR code from another device.",
        guideLabel: "See the WeChat connection guide",
      },
      {
        title: "Chat as usual",
        tab: "Start chatting",
        description:
          "Open a WeChat conversation and ask the AI directly. Switch models or start a new topic with a single command.",
        guideLabel: "See the WeChat command reference",
      },
    ],
    preview: {
      providersTitle: "Supported model providers",
      providersNote: "Coding Plan and custom compatible providers are also supported",
      connectLabel: "Connection preview",
      connectTitle: "Scan to connect your WeChat",
      connectHint: "Scan with WeChat ClawBot · confirm on your phone",
      connectNote: "Illustration only; get your QR code in the workspace",
      connectSuccess: "Personal connection",
      chatSent: "Give me three ideas for a weekend outing.",
      chatReceived: "Sure. Would you rather get outdoors or wander around the city?",
      chatNote: "New conversation started. The previous one is still saved.",
    },
    previous: "Previous step",
    next: "Next step",
    status: (index: number, total: number, title: string) =>
      `Step ${index} of ${total}: ${title}`,
    alternativesPrefix:
      "Configure a model, connect WeChat, and start chatting. You can also",
    alternativesAgent: "connect an existing agent",
    alternativesMiddle: "or",
    alternativesNotifications: "receive service notifications",
  },
  useCases: {
    title: "Many AIs, more choices",
    intro: "From a single question to a finished task.",
    caption: "The conversations, model selections, and task results above are illustrations.",
    items: [
      {
        lead: "One WeChat",
        title: "Connect multiple agents",
        description:
          "Use Muse, Hermes, and OpenClaw with your existing tools and configuration, and send tasks and receive results in WeChat.",
        action: "Connect existing agents",
      },
      {
        lead: "One description",
        title: "Generate images in WeChat",
        description:
          "Describe a scene and receive an image in WeChat; enable role-play to customize characters and storylines.",
        note: "Image generation needs an image model; API fees are billed separately by the provider",
        action: "Explore AI image generation",
      },
      {
        lead: "DeepSeek, Claude, GPT",
        title: "Top models, your choice",
        description:
          "Connect your own model API and switch models in the same WeChat account for questions, writing, and translation.",
        note: "Bring your own API key; model fees are billed separately by the provider",
        action: "See model setup",
      },
      {
        lead: "Xiaowei, your cloud assistant",
        title: "Handle files, create documents",
        description:
          "Assign tasks and receive files in WeChat. No installation or deployment; just configure a model. In the example, replace <shortcut> with your configured WeChat shortcut.",
        note: "Plus members only",
        action: "Meet Xiaowei and get started",
      },
    ],
    scenes: {
      creative: {
        title: "AI image generation",
        chat: "WeChat chat",
        prompt: "@draw a street portrait in the city, 3:4",
        done: "Image generated",
        resultLead: "Your idea,",
        resultAccent: "turned into art in WeChat.",
        resultNote: "Generated images return directly to the chat",
        roleplay: "Role-play",
        roleplayNote: "Custom characters and storylines",
      },
      modelsAria: "Use DeepSeek in WeChat: see the model setup guide",
      currentModel: "Current model",
      agentGuide: (name: string) => `${name} setup guide`,
      wechat: "WeChat",
      bridge: "Send tasks · receive results",
      cloud: {
        title: "Xiaowei",
        subtitle: "A task assistant that lives in the Wechatai cloud",
        task: "Hand to Xiaowei",
        done: "Done",
        prompt: "@<shortcut> convert this Markdown to Word",
        fileName: "Project notes.docx",
        fileNote: "Generated file, sent back to WeChat",
      },
    },
  },
} as const;
