-- NULL identifies orders created before prepaid membership was introduced.
-- Keep their original fulfillment rules for delayed payments and old subscriptions.
ALTER TABLE billing_order ADD COLUMN checkout_mode TEXT CHECK(checkout_mode IN ('payment', 'subscription'));
ALTER TABLE billing_order ADD COLUMN membership_months INTEGER NOT NULL DEFAULT 0 CHECK(membership_months IN (0, 1, 12));
