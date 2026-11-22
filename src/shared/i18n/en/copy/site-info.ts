import { CLOUD_AGENT_COST_NOTE_EN, OWN_API_COST_NOTE_EN } from "./t4-notes";

/**
 * English copy for `/en/terms`, `/en/privacy` and `/en/contact`.
 *
 * Chinese remains the source in `src/client/pages/site-info.tsx` and
 * `src/shared/site-info.ts`. This module mirrors that structure; the renderer in
 * the page component turns inline tokens into the same links and emphasis, so
 * the English body cannot drift into a second rendering convention.
 */

export interface InfoToken {
  readonly text: string;
  readonly href?: string;
  /** External destinations open in a new tab; internal paths stay in-app. */
  readonly external?: boolean;
  readonly strong?: boolean;
  readonly code?: boolean;
}

export type InfoInline = string | InfoToken;

export interface InfoParagraphBlock {
  readonly kind: "paragraph";
  readonly content: readonly InfoInline[];
}

export interface InfoListBlock {
  readonly kind: "list";
  readonly items: readonly (readonly InfoInline[])[];
}

export type InfoBlock = InfoParagraphBlock | InfoListBlock;

export interface InfoSection {
  readonly heading: string;
  readonly blocks: readonly InfoBlock[];
}

export interface InfoDocumentCopy {
  /** Visible H1 and JSON-LD page name. */
  readonly name: string;
  readonly eyebrow: string;
  /** Meta description and introductory paragraph. */
  readonly description: string;
  readonly articleLabel: string;
  readonly sections: readonly InfoSection[];
}

const link = (text: string, href: string): InfoToken => ({ text, href });
const externalLink = (text: string, href: string): InfoToken => ({
  text,
  href,
  external: true,
});
const strong = (text: string): InfoToken => ({ text, strong: true });
const code = (text: string): InfoToken => ({ text, code: true });
const paragraph = (...content: InfoInline[]): InfoBlock => ({ kind: "paragraph", content });
const list = (...items: readonly (readonly InfoInline[])[]): InfoBlock => ({
  kind: "list",
  items,
});

const termsSections: readonly InfoSection[] = [
  {
    heading: "1. About Wechatai and these terms",
    blocks: [
      paragraph(
        "Wechatai (wechatai.app) is an independently developed WeChat AI integration service. These terms set out the basic rules for using this website, the WeChat connection and its plugins. Wechatai is not officially affiliated with WeChat, Tencent or any model provider.",
      ),
      paragraph(
        "Please read these terms and the ",
        link("Privacy Policy", "/privacy"),
        " before registering, purchasing or using the relevant features. If you have questions about the terms, ",
        link("contact us", "/contact"),
        " for an explanation. If you do not yet have the civil capacity required to enter into a contract independently, ask a guardian to help you understand the service and use it in accordance with the law.",
      ),
    ],
  },
  {
    heading: "2. Service scope and third-party integrations",
    blocks: [
      paragraph(
        "Wechatai forwards WeChat messages to the models, search services or Agents you configure, and returns the results to WeChat. It provides channel and model switching, session management, credits metering and the plugin features that are available. Specific features and usage limits are subject to the current product pages.",
      ),
      paragraph(
        "When using your own API, you choose and configure the model, search and image-generation services, including the API Key and service address; Agents such as OpenClaw and Hermes run on devices or services you connect. You must obtain the corresponding usage rights, comply with those services' terms, and bear their fees, availability and permission configuration yourself.",
      ),
      paragraph(
        "When you choose Xiaowei, the operator hosts the execution environment and uses the text model you configured in Wechatai, so you do not need to deploy an Agent yourself. Whether the service is available and its execution limits are subject to the plugin page; read the ",
        link("Xiaowei guide", "/docs/cloud-agent"),
        " before use.",
      ),
      paragraph(
        "If you proactively choose KimiSeek one-click import, the system links to or creates a KimiSeek account under your current identity, generates a dedicated API Key, and imports the channel and available models. KimiSeek's balance, payment and service rules are independent of Wechatai; topping up does not add Wechatai credits.",
      ),
    ],
  },
  {
    heading: "3. Account and security",
    blocks: [
      paragraph(
        "Use an email address, third-party sign-in account and WeChat identity that you have the right to use, and keep your sign-in credentials, API Keys and Agent pairing credentials safe. Do not connect another person's account or keys to this site. If you discover unauthorized use, revoke the relevant credentials promptly and contact us.",
      ),
      paragraph(
        "After binding WeChat or enabling a plugin, the corresponding messages, context and necessary attachments will be passed to the service you choose. When connecting an Agent with tool-execution capability, configure file, command-execution and external-service permissions carefully on the Agent side.",
      ),
    ],
  },
  {
    heading: "4. Membership, credits and payment",
    blocks: [
      paragraph(
        "Membership prices, benefits, billing periods and credit packages are subject to the ",
        link("Membership and credits", "/app/billing"),
        " page and the payment confirmation page. ",
        OWN_API_COST_NOTE_EN,
        " ",
        CLOUD_AGENT_COST_NOTE_EN,
      ),
      paragraph(
        "The platform meters input at the gateway boundary, final output and generated images; see the ",
        link("credits guide", "/docs/credits"),
        " for the conversion rules. Model fees for the internal execution of Agents such as OpenClaw and Hermes that you run yourself are charged separately by the provider you use; Xiaowei's internal model and tool usage is not additionally counted against this site's credits. Daily free allowances refresh and do not accumulate; purchased and referral reward credits are retained under the rules on the relevant pages. Any shortfall from a single settlement is offset against subsequently available credits.",
      ),
      paragraph(
        "Newly purchased memberships are one-time payments and must be renewed manually on expiry; purchasing early extends the validity period. Existing auto-renewing subscriptions can still be managed or cancelled from the \"Manage subscription\" entry in the workspace, and paid benefits remain until expiry. For duplicate charges, benefits that have not arrived, or refund requests, provide your order information and contact us; we will handle it based on the actual order, usage and applicable law, without affecting your statutory consumer rights.",
      ),
    ],
  },
  {
    heading: "5. Acceptable use and content rights",
    blocks: [
      paragraph(
        "Do not use the service for illegal activities, to infringe others' privacy, intellectual property or other lawful rights, to distribute malicious code, to harass people in bulk, or to bypass account isolation, quotas or access restrictions.",
      ),
      paragraph(
        "You must have the right to submit the text, images, files and character settings you send. To provide the service you request, Wechatai will store, process and forward this content to the selected service to the extent necessary, and does not acquire ownership of it because you use the service. The rights to and permitted use of generated content may also be affected by upstream service terms and applicable law.",
      ),
    ],
  },
  {
    heading: "6. AI output and service availability",
    blocks: [
      paragraph(
        "AI may generate inaccurate, outdated or incomplete content. Verify important results yourself, and seek appropriate professional advice for medical, legal, investment or other significant decisions. Role-play content is AI simulation and does not represent a real person or professional service.",
      ),
      paragraph(
        "Network problems, WeChat interfaces, upstream services or your Agent being offline may cause delays, failures or interruptions; reminder features also depend on these connections and should not be used as the only emergency notification channel. We will reasonably maintain the service and address failures, but do not promise that all third-party services will always be available.",
      ),
    ],
  },
  {
    heading: "7. Stopping use, changes and disputes",
    blocks: [
      paragraph(
        "You can disconnect WeChat, disable plugins, manage subscriptions or delete platform sessions at any time. For account deletion and other data requests, contact us. Deleting platform records does not delete content already stored by WeChat, model providers or external Agents.",
      ),
      paragraph(
        "In the event of abuse, security incidents or legal requirements, we may restrict the relevant features and, where appropriate, provide an explanation and an appeal channel. If the service or these terms change materially, we will notify you in an appropriate way; matters that require renewed consent will be handled separately. These terms do not exclude or limit liability that cannot be excluded by law or your statutory rights. For disputes, you may first contact us to negotiate; if negotiation fails, resolve the matter in accordance with the law.",
      ),
    ],
  },
];

const privacySections: readonly InfoSection[] = [
  {
    heading: "1. Scope and contact channel",
    blocks: [
      paragraph(
        "This policy explains how Wechatai processes information to provide the WeChat AI integration service. It applies to this website, the WeChat connection and the available plugins. Privacy and data requests can be sent to ",
        link("cfjwlchangji@gmail.com", "mailto:cfjwlchangji@gmail.com"),
        ".",
      ),
      paragraph(
        "Models, search services, Agents, WeChat and payment services that you connect yourself may process data independently, and their own policies apply separately. Please understand how those services process data before connecting them.",
      ),
    ],
  },
  {
    heading: "2. Information we process and why",
    blocks: [
      list(
        [
          strong("Account and sign-in:"),
          " email address, display name, avatar, verification status, sign-in session, and the identity information returned when you choose Google or GitHub sign-in plus necessary authorization credentials, used for registration, sign-in, account linking and security verification. Passwords for Wechatai accounts registered with an email address are stored in hashed form.",
        ],
        [
          strong("Connections and configuration:"),
          " channel address, model ID, API Key, system prompt, WeChat connection identifiers and credentials, and plugin settings, used to make requests to the services you specify and send the results to the corresponding WeChat.",
        ],
        [
          strong("Chats and attachments:"),
          " the text you send, voice transcripts provided by WeChat, parsed image and file content, model replies, conversation summaries and generated images, used to complete conversations and provide context management and history records. The Free plan has no permission to view web history, which does not mean chat data is not stored to operate the service.",
        ],
        [
          strong("Personal assistant:"),
          " notes, ledgers, to-dos and reminder times that you choose to save, used for queries, statistics, export and due reminders; these records are independent of chat history.",
        ],
        [
          strong("Payment and credits:"),
          " orders, subscription identifiers and status, amounts, credit changes, gateway token and image metering, referral relationships and reward status, used to activate benefits, settle accounts, handle disputes and prevent duplicate rewards.",
        ],
        [
          strong("Operations and support:"),
          " request time, IP address, browser information, necessary error and operational logs, and feedback you proactively provide, used for security protection, troubleshooting and responding to requests.",
        ],
      ),
    ],
  },
  {
    heading: "3. Who information is sent to",
    blocks: [
      paragraph(
        "When executing a conversation or plugin task, Wechatai sends the messages, prompts, historical context or summaries, and attachments needed to complete the task to the model, search, image-generation service or Agent you choose, and sends and receives messages through the WeChat interface. Web-enabled plugins may send search terms to search services and request page content from target websites.",
      ),
      paragraph(
        "When using Xiaowei, task text or WeChat voice transcripts, run results and cloud memory are processed by the operator's AGT service and the model provider you choose; the selected model's channel configuration and keys are encrypted and synced to AGT for execution. Deleting Wechatai tasks or session records does not delete the model channels, history or memory in AGT; to delete them, contact us.",
      ),
      paragraph(
        "Google and GitHub participate in the sign-in flow you choose. Cloudflare provides website operation, databases, object storage and network services; Stripe processes payments, and Wechatai stores orders and payment status but does not store full card numbers or card security codes. See the ",
        externalLink("Cloudflare Privacy Policy", "https://www.cloudflare.com/privacypolicy/"),
        " and the ",
        externalLink("Stripe Privacy Policy", "https://stripe.com/privacy"),
        ".",
      ),
      paragraph(
        "Only when you proactively use KimiSeek connectivity do we send KimiSeek the site source and your Wechatai user ID; for a first-time link we also send the email address, verification status and display name, in order to link to or create an account. First-time linking requires a verified email; a verified email can match an existing account, and creating a new KimiSeek account must also comply with its email registration rules. Previously linked accounts can still be used. KimiSeek returns the dedicated API Key, available models and balance to Wechatai; the key is transmitted only on the server side and stored encrypted, and is not placed in the browser redirect URL. Its independent processing rules are described in the ",
        externalLink("KimiSeek Privacy Policy", "https://kimiseek.app/privacy"),
        ".",
      ),
      paragraph(
        "This site currently has no feature that uses your chats to train its own models. Upstream services' retention, training or usage rules are determined by their policies and account settings; Wechatai cannot make those choices on your behalf.",
      ),
    ],
  },
  {
    heading: "4. Storage, security and retention",
    blocks: [
      paragraph(
        "Wechatai uses Cloudflare infrastructure and may call services you configure in different countries or regions. Data may be transferred or processed outside your region; this site does not promise that all data is stored in mainland China. Processing that requires separate notice or consent will be handled in accordance with applicable requirements.",
      ),
      paragraph(
        "We encrypt model and plugin keys and WeChat connection credentials on the server, isolate account data by user, and protect access through authentication and HTTPS. Chat processing requires the server to read the necessary content, so this is not end-to-end encrypted communication that only you and the upstream can decrypt.",
      ),
      paragraph(
        "Account configuration, sessions and summaries, and personal assistant records are retained to provide the corresponding features until you delete them through the relevant features or submit a deletion request; necessary order, accounting and security records may be retained longer for reconciliation, dispute handling or legal requirements, and will then be used only for those purposes.",
      ),
      paragraph(
        "Attachments not yet submitted to the model are stored temporarily for 15 minutes; processed text or attachment content may become part of the session. Access to platform-generated images is usually valid for 30 days, after which they enter the cleanup process. Deletion or expiry does not automatically remove copies already stored by WeChat, third-party services or your devices.",
      ),
    ],
  },
  {
    heading: "5. Cookies and necessary storage",
    blocks: [
      paragraph(
        "This site uses necessary cookies to maintain sign-in, validate third-party sign-in and cross-site linking requests, and record referral attribution. Clearing or blocking these cookies may sign you out, cause referral identification to fail, or interrupt linking flows. You can manage cookies through your browser, or sign out from the account menu.",
      ),
    ],
  },
  {
    heading: "6. Visits and key-action analytics",
    blocks: [
      paragraph(
        "This site records visits to public pages itself, to understand which content people read and where traffic comes from, and does not use third-party analytics services. A page-visit record includes: the page path visited, the referring site hostname and campaign parameters for this visit (",
        code("utm_source"),
        ", ",
        code("utm_medium"),
        ", ",
        code("utm_campaign"),
        ", recorded only once at the start of the session), country or region, device category (phone, tablet or desktop, based on the User-Agent and whether touch is supported), visit time, and a random identifier used only to distinguish sessions. Signed-in workspace pages and one-time link pages such as email verification and password reset do not record page views.",
      ),
      paragraph(
        "We store the times of model tests, WeChat binding and the first confirmed delivery of a complete model reply, and the number of deliveries, to verify first use and subsequent use; we do not collect chat bodies or Keys as analytics fields. First-use times that historical accounts do not have are not inferred or backfilled. We also record some key action events, including homepage button and quick sign-in clicks, registration form display and submission, verification email sending and email verification completion, onboarding completion or skip, channel saving and model import results, WeChat connection success, upgrade entry display and clicks, checkout initiation and successful payment return, and copying a referral link. Most of these events occur in the workspace or verification flows and are counted separately from public page views. Event records include the action name, page path, time, country or region, device category, session identifier when available, and short attributes such as button category, sign-in state, provider, onboarding step, model count or purchase plan.",
      ),
      paragraph(
        "Email verification completion is recorded by the server from the actual verification result, including cases where verification is completed by resetting the password after resending the email; the successful-payment event records only the browser return after server confirmation and does not represent all payments. To avoid duplicate counting, verification completion for the same account and the successful-payment return for the same order each use a separately keyed deduplication identifier; analytics records do not store the original account or order ID. Deduplication identifiers are cleaned up together with the analytics records and are not used for cross-site tracking.",
      ),
      paragraph(
        "These analytics ",
        strong("do not store"),
        " raw IP addresses, User-Agent strings, full URLs, query strings, email addresses, names, form inputs, API Keys, chat or payment credential content, and do not record page interaction traces. To count daily unique visitors, the server hashes the IP address, User-Agent, current date and a site secret together and stores only the hash; the hash changes when the date changes, so cross-day aggregate displays show the sum of daily unique counts, not the number of unique people across days.",
      ),
      paragraph(
        "The session identifier is stored in the browser's sessionStorage and expires when the tab is closed. Analytics data is automatically cleaned up after 180 days and is used only to understand usage and improve the product, not for advertising, user profiling or cross-site tracking. When the browser enables Do Not Track (DNT) or Global Privacy Control (GPC), page-visit and key-action analytics are not sent; when the server receives the corresponding rejection signal, it also does not record verification or successful-payment events. Rejecting analytics does not affect registration, verification, sign-in or payment.",
      ),
      paragraph(
        "At registration, the browser passes the session identifier for that visit with the email registration request or third-party authorization flow; the server records attribution only after a new account is actually created, to determine which pages bring registrations. Duplicate registrations and sign-ins to existing accounts do not count as new registrations. This attribution record includes the session identifier, landing page and source information, does not include email, name or account ID, and is cleaned up after 180 days together with other analytics data. This attribution information is not passed when DNT or GPC is enabled.",
      ),
    ],
  },
  {
    heading: "7. How to manage your data",
    blocks: [
      list(
        [
          "In the workspace, modify or delete channels, models and plugins, disconnect WeChat or external Agents, and stop the corresponding connections. Revoking upstream API Keys or third-party sign-in authorization must be done with the respective provider.",
        ],
        [
          "Use the WeChat clear or delete conversation commands, or choose \"Delete all conversation records\" under \"My Account\" in the workspace. ",
          code("/wx reset"),
          " only resets the context; for specific commands, see the ",
          link("WeChat commands reference", "/docs/commands"),
          ".",
        ],
        [
          "Personal assistant records must be managed, exported or deleted separately in the corresponding plugin; clearing chats does not clear ledgers, notes or reminders. Deleting a personal assistant configuration also deletes the records under that configuration and cancels reminders.",
        ],
        [
          "To access, correct, obtain a copy of, delete your account or data, or make other privacy requests, submit them through ",
          link("contact us", "/contact"),
          ". We may need to verify account ownership; if some data cannot be deleted immediately due to legal or settlement requirements, we will explain why.",
        ],
      ),
    ],
  },
  {
    heading: "8. Minors, policy updates and feedback",
    blocks: [
      paragraph(
        "This service is not directed to children under 14. If you find that a child has provided personal information to this site without appropriate guardian consent, contact us and we will handle it. Other minor users should use the service under guardian guidance.",
      ),
      paragraph(
        "Policy changes will update the date on this page; material changes in data processing will be notified in an appropriate way and, where applicable, require separate consent. If you have questions or complaints about data processing, you can contact the email on this page; this does not affect your right to complain to a competent authority in accordance with the law.",
      ),
    ],
  },
];

export interface ContactSectionCopy {
  readonly icon: "message" | "book";
  readonly heading: string;
  readonly blocks: readonly InfoBlock[];
  readonly note?: readonly InfoInline[];
  readonly link?: { readonly label: string; readonly href: string };
}

export interface ContactCopy {
  readonly name: string;
  readonly eyebrow: string;
  readonly description: string;
  readonly email: {
    readonly heading: string;
    readonly intro: string;
    readonly subject: string;
    readonly hint: string;
  };
  readonly maintainer: {
    readonly id: "maintainer";
    readonly heading: string;
    readonly blocks: readonly InfoBlock[];
  };
  readonly sections: readonly ContactSectionCopy[];
  readonly privacyNote: readonly InfoInline[];
}

const contact: ContactCopy = {
  name: "Contact Us",
  eyebrow: "HERE TO HELP",
  description:
    "Wechatai is independently maintained by Coder Liang (GitHub: moutsea). Find the project origin, public change log, and support paths for configuration, connection and billing. This site is not officially affiliated with Tencent WeChat.",
  email: {
    heading: "Write to us",
    intro: "Account, payment and connection issues, or a new idea, can all be sent here.",
    subject: "Wechatai feedback",
    hint: "Click the email address to send with your mail app.",
  },
  maintainer: {
    id: "maintainer",
    heading: "Wechatai · Project and maintainer",
    blocks: [
      paragraph(
        "Wechatai (wechatai.app) is maintained by independent developer ",
        link("Coder Liang (moutsea)", "https://github.com/moutsea"),
        ". You can verify the project links from his ",
        link("personal website", "https://coderliang.com"),
        " and public GitHub profile. This site connects your own models and Agents through one-to-one chats with the WeChat ClawBot plugin. It is not official WeChat AI and does not provide group-chat bots.",
      ),
      paragraph(
        "This site is unrelated to desktop clients or other WeChatAI projects with the same name; the product identity is determined by this domain and the ",
        externalLink("moutsea/wechatai repository", "https://github.com/moutsea/wechatai"),
        ". The ",
        externalLink(
          "public change log",
          "https://github.com/moutsea/wechatai/commits/main/",
        ),
        " shows maintenance activity; open source does not mean an independent security audit has been performed, and there is no official affiliation with WeChat, Tencent or model providers.",
      ),
      paragraph(
        "This site supports configuration, connection and billing questions, but cannot enable WeChat access on your behalf or manage provider accounts. The contact email is above; do not submit keys or personal chat content in public issues.",
      ),
    ],
  },
  sections: [
    {
      icon: "message",
      heading: "Make the problem easier to locate",
      blocks: [
        paragraph(
          "Please explain what happened, the steps you took and the approximate time. For account or payment issues, include the account email and order number; mask personal information in error screenshots first.",
        ),
      ],
      note: [
        "Do not send passwords, API Keys, pairing credentials or full card details.",
      ],
    },
    {
      icon: "book",
      heading: "The guide may already have the answer",
      blocks: [
        paragraph(
          "Model configuration, WeChat commands, plugin integration and credit rules are all documented.",
        ),
      ],
      link: { label: "Open the documentation", href: "/docs" },
    },
  ],
  privacyNote: [
    "Data access, deletion or account closure requests can also be sent to the same email with the subject \"Privacy and data request\". See the ",
    link("Privacy Policy", "/privacy"),
    " for how they are handled.",
  ],
};

export const enSiteInfo = {
  terms: {
    name: "Terms of Service",
    eyebrow: "TERMS OF SERVICE",
    description:
      "Read the Wechatai terms of service: service scope, account use, membership and credits rules, and the boundaries of third-party models and plugins.",
    articleLabel: "Terms of service",
    sections: termsSections,
  },
  privacy: {
    name: "Privacy Policy",
    eyebrow: "PRIVACY POLICY",
    description:
      "Learn how Wechatai handles account, chat, API key and payment information, and how to manage and delete your data.",
    articleLabel: "Privacy policy",
    sections: privacySections,
  },
  contact,
} as const satisfies Record<"terms" | "privacy" | "contact", InfoDocumentCopy | ContactCopy>;

export const enSiteInfoLabels = {
  navigation: "Support and policy navigation",
  updated: "Updated:",
} as const;
