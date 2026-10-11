-- Payment notices survive request failures and deployments. Keep accepted IDs
-- after clearing the payload so old Stripe events cannot send another notice.
CREATE TABLE billing_notification (
  payment_id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL REFERENCES billing_order(id),
  data TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','accepted','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  next_at INTEGER NOT NULL,
  delivery_id TEXT,
  accepted_at INTEGER,
  error TEXT NOT NULL DEFAULT ''
);
CREATE INDEX billing_notification_due ON billing_notification(state, next_at);
