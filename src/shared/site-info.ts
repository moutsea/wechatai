export const SUPPORT_EMAIL = "cfjwlchangji@gmail.com";
export const POLICY_UPDATED_AT = "2026-10-10";
export const INFO_PAGES = {
  terms: {
    path: "/terms",
    title: "服务协议",
    eyebrow: "TERMS OF SERVICE",
    description:
      "了解微伴的服务范围、账户使用、会员与 credits 规则，以及第三方模型和插件的使用边界。",
  },
  privacy: {
    path: "/privacy",
    title: "隐私政策",
    eyebrow: "PRIVACY POLICY",
    description: "了解微伴如何处理账户、聊天、API Key 和付款信息，以及如何管理和删除你的数据。",
  },
  contact: {
    path: "/contact",
    title: "联系我们",
    eyebrow: "HERE TO HELP",
    description: "使用中遇到问题，或有想分享的建议？欢迎联系微伴。",
  },
} as const;
export type InfoPageKind = keyof typeof INFO_PAGES;
