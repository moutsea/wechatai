import { z } from "zod";
import { AppError } from "./config";
import {
  noticeCreateSchema,
  noticeUpdateSchema,
  noticeRevisionSchema,
  noticePageSchema,
  noticeReadAllSchema,
  type NoticePage,
  type SiteNotice,
  type UserNotice,
  type UserNotices,
} from "../shared/site-notices";

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new AppError("invalid_notice", "通知参数无效，请检查标题、正文长度和请求参数", 400);
  return result.data;
}

const columns = `n.id,n.title,n.content,n.priority,n.status,n.revision,n.published_revision AS publishedRevision,
  n.created_at AS createdAt,n.updated_at AS updatedAt,n.published_at AS publishedAt`;
const join = "FROM site_notice n LEFT JOIN site_notice_state s ON s.notice_id=n.id AND s.user_id=?";
const unread = "COALESCE(s.read_revision,0)<n.published_revision";
const userColumns = `${columns},COALESCE(s.read_revision,0)>=n.published_revision AS isRead`;
type UserRow = Omit<UserNotice, "isRead"> & { isRead: number };
const userNotice = (row: UserRow): UserNotice => ({ ...row, isRead: !!row.isRead });
const noticeId = (id: string) => parse(z.uuid(), id);
const pagination = (total: number, page: number, limit: number) => ({
  total,
  page,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

export async function listUserNotices(
  env: Env,
  userId: string,
  query: unknown,
): Promise<UserNotices> {
  const { page, limit } = parse(noticePageSchema, query);
  // A batch gives the list, counter and banner a consistent database snapshot.
  const [items, totals, important] = await env.DB.batch([
    env.DB.prepare(`SELECT ${userColumns} ${join} WHERE n.status='published'
      ORDER BY n.published_at DESC,n.id DESC LIMIT ? OFFSET ?`).bind(
      userId,
      limit,
      (page - 1) * limit,
    ),
    env.DB.prepare(`SELECT COUNT(*) AS total,COALESCE(SUM(${unread}),0) AS unread,
      (SELECT revision FROM site_notice_clock WHERE id=1) AS readThrough ${join}
      WHERE n.status='published'`).bind(userId),
    env.DB.prepare(`SELECT ${userColumns} ${join} WHERE n.status='published' AND n.priority='important'
      AND ${unread} ORDER BY n.published_at DESC,n.id DESC LIMIT 1`).bind(userId),
  ]);
  const counts = totals.results[0] as { total: number; unread: number; readThrough: number };
  return {
    ...pagination(counts.total, page, limit),
    unread: counts.unread,
    readThrough: counts.readThrough,
    items: (items.results as UserRow[]).map(userNotice),
    important: important.results.length ? userNotice(important.results[0] as UserRow) : null,
  };
}

export async function readAllNotices(env: Env, userId: string, body: unknown) {
  const { readThrough } = parse(noticeReadAllSchema, body);
  await env.DB.prepare(`INSERT INTO site_notice_state(user_id,notice_id,read_revision,updated_at)
    SELECT ?,id,published_revision,? FROM site_notice WHERE status='published' AND published_revision<=?
    ON CONFLICT(user_id,notice_id) DO UPDATE SET
      read_revision=MAX(site_notice_state.read_revision,excluded.read_revision),updated_at=excluded.updated_at`)
    .bind(userId, Date.now(), readThrough)
    .run();
  return { ok: true };
}

export async function markNotice(env: Env, userId: string, id: string, body: unknown) {
  const { revision } = parse(noticeRevisionSchema, body);
  noticeId(id);
  // Only mark the revision the user actually viewed; an old tab cannot hide a new publication.
  const result =
    await env.DB.prepare(`INSERT INTO site_notice_state(user_id,notice_id,read_revision,updated_at)
    SELECT ?,id,published_revision,? FROM site_notice
    WHERE id=? AND status='published' AND revision=?
    ON CONFLICT(user_id,notice_id) DO UPDATE SET
      read_revision=MAX(site_notice_state.read_revision,excluded.read_revision),
      updated_at=excluded.updated_at`)
      .bind(userId, Date.now(), id, revision)
      .run();
  if (!result.meta.changes)
    throw new AppError("notice_changed", "通知已更新或下架，请刷新后查看", 409);
  return { ok: true };
}

export async function listAdminNotices(env: Env, query: unknown): Promise<NoticePage<SiteNotice>> {
  const { page, limit } = parse(noticePageSchema, query);
  const [items, total] = await env.DB.batch([
    env.DB.prepare(
      `SELECT ${columns} FROM site_notice n ORDER BY n.updated_at DESC,n.id DESC LIMIT ? OFFSET ?`,
    ).bind(limit, (page - 1) * limit),
    env.DB.prepare("SELECT COUNT(*) AS total FROM site_notice"),
  ]);
  return {
    ...pagination(Number((total.results[0] as { total: number }).total), page, limit),
    items: items.results as SiteNotice[],
  };
}

export async function createNotice(env: Env, actor: string, body: unknown): Promise<SiteNotice> {
  const input = parse(noticeCreateSchema, body);
  const now = Date.now();
  const [, inserted, selected] = await env.DB.batch([
    env.DB.prepare(`UPDATE site_notice_clock SET revision=revision+1 WHERE id=1
      AND NOT EXISTS(SELECT 1 FROM site_notice WHERE id=?)`).bind(input.id),
    env.DB.prepare(`INSERT INTO site_notice(id,title,content,priority,status,created_by,updated_by,created_at,updated_at,published_at,revision,published_revision)
      VALUES (?,?,?,?,?,?,?,?,?,?,(SELECT revision FROM site_notice_clock WHERE id=1),
        CASE WHEN ?='published' THEN (SELECT revision FROM site_notice_clock WHERE id=1) ELSE 0 END)
      ON CONFLICT(id) DO NOTHING`).bind(
      input.id,
      input.title,
      input.content,
      input.priority,
      input.status,
      actor,
      actor,
      now,
      now,
      input.status === "published" ? now : null,
      input.status,
    ),
    env.DB.prepare(`SELECT ${columns} FROM site_notice n WHERE n.id=?`).bind(input.id),
  ]);
  const notice = selected.results[0] as SiteNotice;
  if (
    !inserted.meta.changes &&
    (notice.title !== input.title ||
      notice.content !== input.content ||
      notice.priority !== input.priority ||
      notice.status !== input.status)
  )
    throw new AppError("notice_conflict", "此通知已保存，请刷新列表查看", 409);
  return notice;
}

export async function updateNotice(
  env: Env,
  actor: string,
  id: string,
  body: unknown,
): Promise<SiteNotice> {
  noticeId(id);
  const input = parse(noticeUpdateSchema, body);
  const now = Date.now();
  // The clock and record update commit together. A stale editor neither advances
  // the clock nor changes content. Read-all uses this clock, not wall-clock time.
  const announce = "(?='published' AND (status!='published' OR ?))";
  const [, updated] = await env.DB.batch([
    env.DB.prepare(`UPDATE site_notice_clock SET revision=revision+1 WHERE id=1
      AND EXISTS(SELECT 1 FROM site_notice WHERE id=? AND revision=?)`).bind(id, input.revision),
    env.DB.prepare(`UPDATE site_notice SET title=?,content=?,priority=?,
    published_revision=CASE WHEN ${announce} THEN (SELECT revision FROM site_notice_clock WHERE id=1) ELSE published_revision END,
    published_at=CASE WHEN ${announce} THEN ? ELSE published_at END,
    status=?,revision=(SELECT revision FROM site_notice_clock WHERE id=1),updated_by=?,updated_at=?
    WHERE id=? AND revision=? RETURNING id,title,content,priority,status,revision,
      published_revision AS publishedRevision,created_at AS createdAt,updated_at AS updatedAt,published_at AS publishedAt`).bind(
      input.title,
      input.content,
      input.priority,
      input.status,
      input.republish ? 1 : 0,
      input.status,
      input.republish ? 1 : 0,
      now,
      input.status,
      actor,
      now,
      id,
      input.revision,
    ),
  ]);
  const notice = updated.results[0] as SiteNotice | undefined;
  if (!notice) throw new AppError("notice_changed", "通知已被修改或删除，请刷新列表后重试", 409);
  return notice;
}

export async function deleteNotice(env: Env, id: string, body: unknown) {
  noticeId(id);
  const { revision } = parse(noticeRevisionSchema, body);
  const result = await env.DB.prepare("DELETE FROM site_notice WHERE id=? AND revision=?")
    .bind(id, revision)
    .run();
  if (!result.meta.changes)
    throw new AppError("notice_changed", "通知已被修改或删除，请刷新列表后重试", 409);
  return { ok: true };
}
