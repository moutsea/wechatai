-- Editing content must not reset the user's reading state. The publication
-- revision changes only when publishing/re-publishing, while revision also
-- protects ordinary edits against concurrent writes.
ALTER TABLE site_notice ADD COLUMN published_revision INTEGER NOT NULL DEFAULT 0;
UPDATE site_notice SET published_revision=revision WHERE published_at IS NOT NULL;
CREATE TABLE site_notice_clock (
  id INTEGER PRIMARY KEY CHECK(id=1),
  revision INTEGER NOT NULL
);
INSERT INTO site_notice_clock VALUES (1, (SELECT COALESCE(MAX(revision),0) FROM site_notice));
