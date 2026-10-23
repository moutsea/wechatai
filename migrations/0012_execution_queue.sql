-- Only routing metadata. Payloads and results stay in the owning account DO.
CREATE TABLE IF NOT EXISTS execution_accounts (
  account_id TEXT PRIMARY KEY,
  pending INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS execution_accounts_pending ON execution_accounts(pending, account_id);
