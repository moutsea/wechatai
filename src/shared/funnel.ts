import { z } from "zod";

/**
 * 转化漏斗事件。页面浏览（`page_views`）只回答「谁看了哪页」，答不了「哪一步把人劝退了」；
 * 注册验证、引导三步、配渠道、绑微信、付费墙曝光、结账这些节点都没有页面变化，
 * 只能靠事件。
 *
 * 设计口径与 `page_views` 保持一致：不存 IP/UA，visitor_hash 仍然按天加盐，
 * 同一事件重复投递按 `event_id` 去重。
 */
export const FUNNEL_EVENTS = [
  /** 注册表单提交（服务端是否接受另算）。 */
  "signup_submit",
  /** 验证邮件已发出。 */
  "verify_sent",
  /** 服务端确认邮箱由未验证变为已验证（含密码恢复路径）。 */
  "verify_done",
  /** 引导第 n 步完成，props.step = 1|2|3。 */
  "onboarding_step",
  /** 引导被跳过。 */
  "onboarding_skip",
  /** 引导全部完成。 */
  "onboarding_done",
  /** 模型渠道保存成功。 */
  "channel_saved",
  /** 模型目录导入完成且存在可用条目，不代表已测通模型调用。 */
  "channel_models_imported",
  /** 获取可用模型失败（配 Key 最高发的流失点）。 */
  "channel_test_failed",
  /** 微信连接成功。 */
  "wechat_connected",
  /** 免费用户在首屏看到付费墙。 */
  "paywall_view",
  /** 点了付费墙里的升级按钮。 */
  "paywall_click",
  /** 发起 Stripe 结账。 */
  "checkout_start",
  /** 服务端校验的结账成功回跳，同一订单只记一次。 */
  "checkout_success",
  /** 邀请链接被复制/分享。 */
  "invite_share_click",
  /**
   * 首屏 CTA 被点击。props.cta 区分是哪个按钮（例如 primary 去注册、how 看配置步骤）。
   * 没有这一步，就无法区分「首页没人感兴趣」和「点了但没注册成功」。
   */
  "hero_cta_click",
  /** 到达注册页。与 signup_submit 之间的落差＝表单劝退率。 */
  "register_view",
  /** 点快捷登录（props.provider）。OAuth 路径不经过邮箱验证，是漏斗旁路。 */
  "oauth_click",
  /**
   * 发验证邮件。props.first 区分首发送出（y）与重发（n）：
   * 重发占比高说明送达或找信环节有问题，首发送出量大而 verify_done 少则是根本没打开邮件。
   */
  "verify_send",
] as const;

export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

const eventNameSchema = z.enum(FUNNEL_EVENTS);

/** props 只收短标量：够用来区分「第几步」「哪个渠道」，又不会变成自由文本仓库。 */
export const funnelPropsSchema = z
  .record(z.string().min(1).max(40), z.union([z.string().max(120), z.number(), z.boolean()]))
  .refine((value) => Object.keys(value).length <= 8, { message: "too many props" })
  .optional();

export const funnelEventPayloadSchema = z
  .object({
    eventId: z.uuid(),
    name: eventNameSchema,
    props: funnelPropsSchema,
    sessionId: z
      .string()
      .min(8)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
    /** 引导等内部页也会上报，这里只用来在后台区分来源页。 */
    path: z.string().max(512).optional(),
    touch: z.boolean().optional(),
  })
  .strict();

export type FunnelEventPayload = z.infer<typeof funnelEventPayloadSchema>;
