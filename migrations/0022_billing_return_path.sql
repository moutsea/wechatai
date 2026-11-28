-- Preserve the original return URL parameters when retrying pre-migration orders.
ALTER TABLE billing_order ADD COLUMN return_path TEXT NOT NULL DEFAULT '/app/billing'
  CHECK(return_path IN ('/app/billing', '/ko/app/billing'));
