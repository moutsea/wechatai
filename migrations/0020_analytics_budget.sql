CREATE TABLE IF NOT EXISTS anonymous_analytics_budget (
  day TEXT PRIMARY KEY,
  reserved INTEGER NOT NULL,
  last_grant INTEGER NOT NULL
);
