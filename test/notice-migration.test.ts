import { env } from "cloudflare:test";
import { expect, it } from "vitest";
import auth from "../migrations/0001_auth.sql?raw";
import notices from "../migrations/0008_site_notices.sql?raw";
import versions from "../migrations/0009_notice_publication_versions.sql?raw";
import readState from "../migrations/0010_notice_read_state.sql?raw";
import {
  createNotice,
  listUserNotices,
  markNotice,
  readAllNotices,
} from "../src/server/site-notices";

it("preserves legacy read/dismiss state and advances new publications beyond the migrated snapshot", async () => {
  for (const migration of [auth, notices])
    await env.DB.exec(migration.replace(/^--.*$/gm, "").replace(/\n/g, " "));
  const user = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO user(id,name,email,createdAt,updatedAt) VALUES (?, 'test', ?,1,1)",
  )
    .bind(user, `${user}@example.test`)
    .run();
  const first = crypto.randomUUID(),
    second = crypto.randomUUID();
  for (const [id, revision] of [
    [first, 5],
    [second, 8],
  ] as const)
    await env.DB.prepare(`INSERT INTO site_notice(id,title,content,priority,status,revision,created_at,updated_at,published_at)
      VALUES (?,'旧公告','内容','important','published',?,1,1,1)`)
      .bind(id, revision)
      .run();
  await env.DB.prepare(`INSERT INTO site_notice_state(user_id,notice_id,read_revision,dismissed_revision,updated_at)
    VALUES (?,?,5,5,1)`)
    .bind(user, first)
    .run();
  await env.DB.exec(versions.replace(/^--.*$/gm, "").replace(/\n/g, " "));
  const before = await listUserNotices(env, user, {});
  expect(before.readThrough).toBe(8);
  expect(before.unread).toBe(1);
  expect(before.items.find((n) => n.id === first)).toMatchObject({
    publishedRevision: 5,
    isRead: true,
  });
  // New code must be deployable against 0009 before dropping the obsolete column.
  await markNotice(env, user, first, { revision: 5 });
  expect((await listUserNotices(env, user, {})).unread).toBe(1);
  const historicalUsers = [];
  for (const [readRevision, dismissedRevision] of [
    [5, 0],
    [0, 5],
    [5, 3],
  ]) {
    const historicalUser = crypto.randomUUID();
    historicalUsers.push(historicalUser);
    await env.DB.prepare(
      "INSERT INTO user(id,name,email,createdAt,updatedAt) VALUES (?, 'legacy', ?,1,1)",
    )
      .bind(historicalUser, `${historicalUser}@example.test`)
      .run();
    await env.DB.prepare(
      "INSERT INTO site_notice_state(user_id,notice_id,read_revision,dismissed_revision,updated_at) VALUES (?,?,?,?,1)",
    )
      .bind(historicalUser, first, readRevision, dismissedRevision)
      .run();
  }
  await env.DB.exec(readState.replace(/^--.*$/gm, "").replace(/\n/g, " "));
  const columns = await env.DB.prepare("PRAGMA table_info(site_notice_state)").all<{
    name: string;
  }>();
  expect(columns.results.map((column) => column.name)).not.toContain("dismissed_revision");
  for (const historicalUser of [user, ...historicalUsers]) {
    const migrated = await listUserNotices(env, historicalUser, {});
    expect(migrated.unread).toBe(1);
    expect(migrated.items.find((n) => n.id === first)).toMatchObject({ isRead: true });
    expect(migrated.items.find((n) => n.id === second)).toMatchObject({ isRead: false });
    expect(migrated.items[0]).not.toHaveProperty("isDismissed");
  }
  const created = await createNotice(env, user, {
    id: crypto.randomUUID(),
    title: "新公告",
    content: "内容",
    priority: "important",
    status: "published",
  });
  expect(created.publishedRevision).toBe(9);
  await readAllNotices(env, user, { readThrough: before.readThrough });
  expect(await listUserNotices(env, user, {})).toMatchObject({
    unread: 1,
    important: { id: created.id },
  });
});
