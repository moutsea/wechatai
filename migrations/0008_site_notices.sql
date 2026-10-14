CREATE TABLE site_notice (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  priority TEXT NOT NULL CHECK(priority IN ('normal','important')),
  status TEXT NOT NULL CHECK(status IN ('draft','published')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_by TEXT REFERENCES user(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES user(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER
);
CREATE INDEX site_notice_published ON site_notice(status, published_at DESC, id DESC);
CREATE INDEX site_notice_updated ON site_notice(updated_at DESC, id DESC);
CREATE TABLE site_notice_state (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  notice_id TEXT NOT NULL REFERENCES site_notice(id) ON DELETE CASCADE,
  read_revision INTEGER NOT NULL DEFAULT 0,
  dismissed_revision INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, notice_id)
);
CREATE INDEX site_notice_state_notice ON site_notice_state(notice_id);
