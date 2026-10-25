import { z } from "zod";

/**
 * 访问统计的请求体校验。
 *
 * 单独成文件是刻意的：zod 有 300 KB+，而 `analytics.ts` 里的常量与纯函数会被
 * 首屏组件（`public-pages.tsx` 取 `ANALYTICS_SESSION_HEADER`）直接引用。校验只在
 * 服务端跑，把 schema 留在 `analytics.ts` 里就等于让每个访客先下载一整个校验库。
 * 因此这两个文件不能互相 re-export。
 */

export const analyticsSessionIdSchema = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

/** 浏览器上报的请求体。字段全部有上限，避免被灌入超长字符串。 */
export const pageViewPayloadSchema = z
  .object({
    eventId: z.uuid(),
    // min(1)：空路径经 normalizePath 会变成 "/"，等于把一条垃圾数据记成首页浏览。
    pathname: z.string().min(1).max(512),
    referrer: z.string().max(512),
    sessionId: analyticsSessionIdSchema,
    utmSource: z.string().max(60),
    utmMedium: z.string().max(60),
    utmCampaign: z.string().max(60),
    /** 浏览器是否有触摸屏，用来把 iPadOS 的 Macintosh UA 认回平板。 */
    touch: z.boolean().optional(),
  })
  .strict();

export type PageViewPayload = z.infer<typeof pageViewPayloadSchema>;

/**
 * 服务端账户创建钩子使用的注册事件。事件号由服务端生成；浏览器只提供会话号。
 */
export const signupConversionSchema = z
  .object({
    eventId: z.uuid(),
    sessionId: analyticsSessionIdSchema,
  })
  .strict();

export type SignupConversionPayload = z.infer<typeof signupConversionSchema>;
