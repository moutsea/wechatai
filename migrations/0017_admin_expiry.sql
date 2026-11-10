-- NULL preserves existing permanent grants. Timed grants are checked on every request.
ALTER TABLE admin_user ADD COLUMN expires_at INTEGER CHECK(expires_at IS NULL OR expires_at > 0);
