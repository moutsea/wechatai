import { env, createExecutionContext } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import auth from "../migrations/0001_auth.sql?raw";
import billing from "../migrations/0002_billing.sql?raw";
import referrals from "../migrations/0003_referrals.sql?raw";
import prepaid from "../migrations/0004_prepaid_membership.sql?raw";
import admin from "../migrations/0005_admin.sql?raw";
import notices from "../migrations/0008_site_notices.sql?raw";
import noticeVersions from "../migrations/0009_notice_publication_versions.sql?raw";
import noticeReadState from "../migrations/0010_notice_read_state.sql?raw";
import { authEmailMigration, verifiedFixtureCookie } from "./auth-fixtures";
import worker from "../src/server/index";
import { createNotice, listUserNotices } from "../src/server/site-notices";
import type { NoticeInput, SiteNotice, UserNotices } from "../src/shared/site-notices";

type Account = { id: string; cookie: string };
let owner: Account, alice: Account, bob: Account;
let ip = 100;
const request = (path: string, options?: RequestInit) =>
  worker.fetch(new Request(`${env.APP_URL}${path}`, options), env, createExecutionContext());
const call = (account: Account, path: string, method = "GET", body?: unknown) =>
  request(`/api${path}`, {
    method,
    headers: { cookie: account.cookie, origin: env.APP_URL, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const feed = async (account = alice, query = "") => {
  const response = await call(account, `/notices${query}`);
  expect(response.status).toBe(200);
  return response.json<UserNotices>();
};
const input = (extra: Partial<NoticeInput> = {}) => ({
  id: crypto.randomUUID(),
  title: "产品更新",
  content: "**新功能**\n\n- 欢迎体验",
  priority: "normal",
  status: "published",
  ...extra,
});
async function publish(extra: Partial<NoticeInput> = {}) {
  const response = await call(owner, "/admin/notices", "POST", input(extra));
  expect(response.status).toBe(200);
  return response.json<SiteNotice>();
}
const edit = (notice: SiteNotice, extra: Partial<NoticeInput> & { republish?: boolean } = {}) =>
  call(owner, `/admin/notices/${notice.id}`, "PATCH", {
    title: notice.title,
    content: notice.content,
    priority: notice.priority,
    status: notice.status,
    revision: notice.revision,
    ...extra,
  });
async function login(): Promise<Account> {
  const response = await request("/api/auth/sign-up/email", {
    method: "POST",
    headers: {
      origin: env.APP_URL,
      "content-type": "application/json",
      "cf-connecting-ip": `198.51.100.${++ip}`,
    },
    body: JSON.stringify({
      name: "Notice test",
      email: `${crypto.randomUUID()}@example.test`,
      password: "test-password-only",
    }),
  });
  expect(response.status).toBe(200);
  const { user } = await response.json<{ user: { id: string } }>();
  return { id: user.id, cookie: await verifiedFixtureCookie(user.id, "test-password-only") };
}
beforeAll(async () => {
  for (const migration of [
    auth,
    billing,
    referrals,
    prepaid,
    admin,
    authEmailMigration,
    notices,
    noticeVersions,
    noticeReadState,
  ])
    await env.DB.exec(migration.replace(/^--.*$/gm, "").replace(/\n/g, " "));
  owner = await login();
  alice = await login();
  bob = await login();
  await env.DB.prepare("INSERT INTO admin_user(user_id,created_at) VALUES (?,?)")
    .bind(owner.id, Date.now())
    .run();
});
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM site_notice").run();
  await env.DB.prepare("UPDATE site_notice_clock SET revision=0 WHERE id=1").run();
});

describe("site notices", () => {
  it("authenticates readers and requires the server-side admin role for every mutation", async () => {
    expect((await request("/api/notices")).status).toBe(401);
    expect((await request("/api/admin/notices")).status).toBe(401);
    const notice = await publish();
    for (const [path, method, body] of [
      ["/admin/notices", "GET", undefined],
      ["/admin/notices", "POST", input()],
      [`/admin/notices/${notice.id}`, "PATCH", { revision: 1 }],
      [`/admin/notices/${notice.id}`, "DELETE", { revision: 1 }],
    ] as const)
      expect((await call(alice, path, method, body)).status).toBe(403);
    expect(
      (
        await request("/api/admin/notices", {
          headers: { cookie: alice.cookie, "x-user-id": owner.id },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request("/api/admin/notices", {
          method: "POST",
          headers: {
            cookie: owner.cookie,
            origin: "https://foreign.example",
            "content-type": "application/json",
          },
          body: JSON.stringify(input()),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(`/api/notices/${notice.id}/read`, {
          method: "POST",
          headers: { cookie: alice.cookie, origin: "https://foreign.example" },
          body: JSON.stringify({ revision: 1 }),
        })
      ).status,
    ).toBe(403);
  });
  it("keeps drafts private and publishes to both Free accounts", async () => {
    const draft = await publish({ status: "draft", priority: "important" });
    expect(await feed()).toMatchObject({ total: 0, unread: 0, important: null });
    expect((await call(alice, `/notices/${draft.id}/read`, "POST", { revision: 1 })).status).toBe(
      409,
    );
    const response = await edit(draft, { status: "published" });
    expect(response.status).toBe(200);
    const updated = await response.json<SiteNotice>();
    for (const user of [alice, bob])
      expect(await feed(user)).toMatchObject({
        total: 1,
        unread: 1,
        important: { id: draft.id, revision: updated.revision },
      });
    const list = await call(alice, "/notices");
    expect(list.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(await list.json())).not.toContain("created_by");
  });
  it("treats the legacy close URL as reading, without hiding history or changing other users", async () => {
    const notice = await publish({ priority: "important" });
    const revision = { revision: notice.revision };
    const results = await Promise.all([
      call(alice, `/notices/${notice.id}/read`, "POST", revision),
      call(alice, `/notices/${notice.id}/dismiss`, "POST", revision),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect((await feed()).items[0]).not.toHaveProperty("isDismissed");
    expect(await feed()).toMatchObject({
      unread: 0,
      important: null,
      items: [{ id: notice.id, isRead: true }],
    });
    expect(await feed(bob)).toMatchObject({ unread: 1, important: { id: notice.id } });
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS n FROM site_notice_state WHERE user_id=?")
        .bind(alice.id)
        .first("n"),
    ).toBe(1);
  });
  it.each(["read", "dismiss"])(
    "%s alone marks an important banner read, and only republishing shows it again",
    async (action) => {
      const notice = await publish({ priority: "important" });
      expect(
        (
          await call(alice, `/notices/${notice.id}/${action}`, "POST", {
            revision: notice.revision,
          })
        ).status,
      ).toBe(200);
      expect(await feed()).toMatchObject({ unread: 0, important: null, items: [{ isRead: true }] });
      const quiet = await (await edit(notice, { title: "修正错字" })).json<SiteNotice>();
      expect(await feed()).toMatchObject({ unread: 0, important: null });
      expect((await edit(quiet, { republish: true })).status).toBe(200);
      expect(await feed()).toMatchObject({
        unread: 1,
        important: { id: notice.id, isRead: false },
      });
    },
  );
  it("resurfaces updates and rejects stale readers, editors and deletes", async () => {
    const notice = await publish({ priority: "important" });
    await call(alice, `/notices/${notice.id}/dismiss`, "POST", { revision: 1 });
    expect((await edit(notice, { title: "更新后的标题", republish: true })).status).toBe(200);
    expect((await edit(notice, { title: "覆盖更新" })).status).toBe(409);
    for (const action of ["read", "dismiss"])
      expect(
        (await call(alice, `/notices/${notice.id}/${action}`, "POST", { revision: 1 })).status,
      ).toBe(409);
    expect(
      (await call(owner, `/admin/notices/${notice.id}`, "DELETE", { revision: 1 })).status,
    ).toBe(409);
    expect(await feed()).toMatchObject({
      unread: 1,
      important: { title: "更新后的标题", revision: 2, isRead: false },
    });
  });
  it("marks all current publications read, leaving future publications unread", async () => {
    await publish();
    await publish();
    await publish({ status: "draft" });
    expect(
      (await call(alice, "/notices/read-all", "POST", { readThrough: (await feed()).readThrough }))
        .status,
    ).toBe(200);
    expect(await feed()).toMatchObject({ unread: 0, total: 2 });
    expect(await feed(bob)).toMatchObject({ unread: 2 });
    await publish();
    expect(await feed()).toMatchObject({ unread: 1, total: 3 });
  });
  it("quiet edits preserve read state and ordering, while explicit republication resurfaces", async () => {
    const notice = await publish({ priority: "important" });
    await call(alice, `/notices/${notice.id}/dismiss`, "POST", { revision: notice.revision });
    const quiet = await (await edit(notice, { title: "修正错字" })).json<SiteNotice>();
    expect(quiet).toMatchObject({
      publishedRevision: notice.publishedRevision,
      publishedAt: notice.publishedAt,
    });
    expect(quiet.revision).toBeGreaterThan(notice.revision);
    expect(await feed()).toMatchObject({
      unread: 0,
      important: null,
      items: [{ title: "修正错字", isRead: true }],
    });
    expect(await feed(bob)).toMatchObject({ unread: 1, important: { title: "修正错字" } });
    expect((await edit(notice, { title: "过期编辑" })).status).toBe(409);
    const renewed = await (await edit(quiet, { republish: true })).json<SiteNotice>();
    expect(renewed.publishedRevision).toBe(renewed.revision);
    expect(await feed()).toMatchObject({
      unread: 1,
      important: { id: notice.id, isRead: false },
    });
  });
  it("read-all excludes publications and republications after the fetched snapshot", async () => {
    const old = await publish({ priority: "important" });
    await publish({ title: "保持未改" });
    const snapshot = await feed();
    const newer = await publish({ title: "还未看到的新通知", priority: "important" });
    const renewed = await (await edit(old, { republish: true })).json<SiteNotice>();
    expect(
      (await call(alice, "/notices/read-all", "POST", { readThrough: snapshot.readThrough }))
        .status,
    ).toBe(200);
    const current = await feed();
    expect(current.unread).toBe(2);
    expect(current.items.find((n) => n.id === newer.id)?.isRead).toBe(false);
    expect(current.items.find((n) => n.id === renewed.id)?.isRead).toBe(false);
    expect(current.items.find((n) => n.title === "保持未改")?.isRead).toBe(true);
    expect((await call(alice, "/notices/read-all", "POST", {})).status).toBe(400);
  });
  it("read-all includes quiet edits to known publications and covers all pages", async () => {
    const old = await publish();
    for (let i = 0; i < 6; i++) await publish({ title: `公告 ${i}` });
    const snapshot = await feed(alice, "?limit=5");
    expect(snapshot.items).toHaveLength(5);
    await edit(old, { title: "只修正文字" });
    await call(alice, "/notices/read-all", "POST", { readThrough: snapshot.readThrough });
    expect(await feed()).toMatchObject({ total: 7, unread: 0 });
  });
  it("publishing a withdrawn draft notifies again without an explicit republish flag", async () => {
    const notice = await publish({ priority: "important" });
    await call(alice, `/notices/${notice.id}/read`, "POST", { revision: notice.revision });
    const draft = await (await edit(notice, { status: "draft" })).json<SiteNotice>();
    const published = await (await edit(draft, { status: "published" })).json<SiteNotice>();
    expect(published.publishedRevision).toBe(published.revision);
    expect(await feed()).toMatchObject({ unread: 1, important: { id: notice.id } });
  });
  it("a retried create after editing neither duplicates nor overwrites the notification", async () => {
    const data = input();
    const created = await (await call(owner, "/admin/notices", "POST", data)).json<SiteNotice>();
    await edit(created, { title: "已修改" });
    expect((await call(owner, "/admin/notices", "POST", data)).status).toBe(409);
    expect(await feed()).toMatchObject({ total: 1, items: [{ title: "已修改" }] });
  });
  it("withdraws immediately and removes read records on permanent deletion", async () => {
    const notice = await publish();
    await call(alice, `/notices/${notice.id}/read`, "POST", { revision: 1 });
    const response = await edit(notice, { status: "draft" });
    const draft = await response.json<SiteNotice>();
    expect(await feed()).toMatchObject({ total: 0, unread: 0 });
    expect(
      (await call(owner, `/admin/notices/${notice.id}`, "DELETE", { revision: draft.revision }))
        .status,
    ).toBe(200);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM site_notice_state").first("n")).toBe(0);
  });
  it("returns an older important banner even when it is outside the first page", async () => {
    const important = await publish({ priority: "important" });
    await env.DB.prepare("UPDATE site_notice SET published_at=1 WHERE id=?")
      .bind(important.id)
      .run();
    for (let i = 0; i < 6; i++) await createNotice(env, owner.id, input({ title: `普通 ${i}` }));
    const first = await feed(alice, "?limit=5");
    expect(first).toMatchObject({
      total: 7,
      totalPages: 2,
      unread: 7,
      important: { id: important.id },
    });
    expect(first.items).toHaveLength(5);
    const second = await feed(alice, "?limit=5&page=2");
    expect(second.items).toHaveLength(2);
    expect(second.items.some((n) => first.items.some((p) => p.id === n.id))).toBe(false);
  });
  it("validates bounded content, paging, unknown fields and repeated create requests", async () => {
    for (const bad of [
      { ...input(), title: " " },
      { ...input(), content: "x".repeat(20001) },
      { ...input(), priority: "urgent" },
      { ...input(), userId: bob.id },
    ])
      expect((await call(owner, "/admin/notices", "POST", bad)).status).toBe(400);
    for (const query of ["?page=-1", "?limit=1000", "?page=x"])
      expect((await call(alice, `/notices${query}`)).status).toBe(400);
    const data = input();
    for (let i = 0; i < 2; i++)
      expect((await call(owner, "/admin/notices", "POST", data)).status).toBe(200);
    expect((await call(owner, "/admin/notices", "POST", { ...data, title: "冲突" })).status).toBe(
      409,
    );
    expect(await listUserNotices(env, alice.id, {})).toMatchObject({ total: 1 });
  });
});
