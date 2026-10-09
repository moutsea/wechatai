-- Dedicated customers prevent cross-project portal access in the shared Stripe account.
CREATE TABLE billing_customer (
  user_id TEXT NOT NULL REFERENCES user(id),
  mode TEXT NOT NULL CHECK(mode IN ('test', 'live')),
  customer_id TEXT NOT NULL UNIQUE,
  PRIMARY KEY (user_id, mode)
);
CREATE TABLE billing_order (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id),
  mode TEXT NOT NULL CHECK(mode IN ('test', 'live')),
  offer_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  price_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  credits INTEGER NOT NULL,
  customer_id TEXT NOT NULL,
  session_id TEXT UNIQUE,
  subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  pending_key TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);
CREATE INDEX billing_order_user ON billing_order(user_id, mode, created_at);
CREATE TABLE billing_subscription (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id),
  mode TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  offer_id TEXT NOT NULL,
  status TEXT NOT NULL,
  cancel_at_period_end INTEGER NOT NULL,
  period_end INTEGER NOT NULL
);
CREATE INDEX billing_subscription_user ON billing_subscription(user_id, mode);
