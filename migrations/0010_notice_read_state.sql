-- Closing a notice and opening it now share the same read state.
-- Preserve all previously acknowledged publications before removing the old column.
UPDATE site_notice_state SET read_revision = MAX(read_revision, dismissed_revision);
ALTER TABLE site_notice_state DROP COLUMN dismissed_revision;
