export const SUPPORT_EMAIL = "cfjwlchangji@gmail.com";
/** Public GitHub profile links this product and the same support email. */
export const SITE_MAINTAINER = {
  name: "Coder Liang",
  profile: "https://github.com/moutsea",
  website: "https://coderliang.com",
} as const;
/** 隐私政策最近一次实质修改的日期。 */
export const POLICY_UPDATED_AT = "2026-11-08";
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
    description:
      "微伴 Wechatai 由 Coder Liang（GitHub：moutsea）独立维护。查看项目来源、公开变更记录和配置、连接、账单支持方式；本站与腾讯微信无官方关联。",
  },
} as const;
export type InfoPageKind = keyof typeof INFO_PAGES;

/** 每个信息页各自显示的更新日期：条款与隐私分开，谁改了谁更新。 */
export const INFO_PAGE_UPDATED_AT: Record<InfoPageKind, string> = {
  terms: TERMS_UPDATED_AT,
  privacy: POLICY_UPDATED_AT,
  contact: "2026-11-09",
};
