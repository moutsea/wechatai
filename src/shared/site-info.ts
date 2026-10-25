export const SUPPORT_EMAIL = "cfjwlchangji@gmail.com";
/** 隐私政策最近一次实质修改的日期。 */
export const POLICY_UPDATED_AT = "2026-10-25";
/** 服务协议最近一次实质修改的日期（改访问统计没有动条款正文）。 */
export const TERMS_UPDATED_AT = "2026-10-10";
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

/** 每个信息页各自显示的更新日期：条款与隐私分开，谁改了谁更新。 */
export const INFO_PAGE_UPDATED_AT: Record<InfoPageKind, string> = {
  terms: TERMS_UPDATED_AT,
  privacy: POLICY_UPDATED_AT,
  // 联系页正文在这次改访问统计时没有改动，沿用上一次的日期，不假报更新。
  contact: TERMS_UPDATED_AT,
};
