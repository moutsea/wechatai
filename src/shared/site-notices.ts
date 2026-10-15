import { z } from "zod";
import type { ConnectorUpdateNotice } from "./connector-update";
import { connectorVersionPattern } from "./openclaw-release";

export const noticeInputSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    content: z.string().trim().min(1).max(20000),
    priority: z.enum(["normal", "important"]),
    status: z.enum(["draft", "published"]),
  })
  .strict();
export const noticeCreateSchema = noticeInputSchema.extend({ id: z.uuid() });
export const noticeUpdateSchema = noticeInputSchema.extend({
  revision: z.number().int().positive(),
  republish: z.boolean().default(false),
});
export const noticeReadAllSchema = z
  .object({
    readThrough: z.number().int().nonnegative(),
    connectorVersion: z.string().regex(connectorVersionPattern).optional(),
  })
  .strict();
export const noticeRevisionSchema = z.object({ revision: z.number().int().positive() }).strict();
export const noticePageSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type NoticeInput = z.infer<typeof noticeInputSchema>;
export type SiteNotice = NoticeInput & {
  id: string;
  revision: number;
  publishedRevision: number;
  createdAt: number;
  updatedAt: number;
  publishedAt: number | null;
};
export type UserNotice = SiteNotice & { isRead: boolean };
export type NoticePage<T = UserNotice> = {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
};
export type UserNotices = NoticePage & {
  unread: number;
  important: UserNotice | null;
  readThrough: number;
  connectorUpdate?: ConnectorUpdateNotice | null;
};
export const unreadNoticeCount = (feed: UserNotices | null) =>
  (feed?.unread ?? 0) + (feed?.connectorUpdate && !feed.connectorUpdate.isRead ? 1 : 0);
export const noticeDate = (time: number) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(time);
