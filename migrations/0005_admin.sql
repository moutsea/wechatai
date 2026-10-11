-- Roles are bound to existing user IDs, never accepted from registration input.
CREATE TABLE admin_user (user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE, created_at INTEGER NOT NULL);
-- New installations have no administrator. Grant a verified user ID explicitly; see docs/deployment.md.
CREATE TABLE admin_account_stats (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  synced_at INTEGER NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data))
);
CREATE INDEX admin_users_created ON user((CASE WHEN createdAt<100000000000 THEN createdAt*1000 ELSE createdAt END) DESC, id DESC);
CREATE INDEX admin_orders_paid ON billing_order(mode, status, paid_at);
