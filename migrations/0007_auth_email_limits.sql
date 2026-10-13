-- Shared across Worker instances; keys are hashes, never raw email addresses.
CREATE TABLE IF NOT EXISTS auth_email_limit (
  email_hash TEXT PRIMARY KEY,
  last_sent_at INTEGER NOT NULL,
  hour_start INTEGER NOT NULL,
  hour_count INTEGER NOT NULL,
  day_start INTEGER NOT NULL,
  day_count INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_email_limit_cleanup ON auth_email_limit(last_sent_at);
