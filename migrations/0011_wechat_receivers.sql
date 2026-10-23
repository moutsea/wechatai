-- Discovery only: no WeChat credentials or message content are stored in D1.
CREATE TABLE wechat_receivers (
  account_id TEXT PRIMARY KEY,
  active INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX wechat_receivers_active ON wechat_receivers(active, account_id);
