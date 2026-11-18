-- One supervisor per receiver installation. Healthy accounts need no recurring writes.
CREATE TABLE receiver_watchdog_supervisor (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  seen_at INTEGER NOT NULL
);
CREATE TABLE receiver_watchdog_sessions (
  session TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  check_after INTEGER NOT NULL
);
CREATE INDEX receiver_watchdog_due ON receiver_watchdog_sessions(check_after);
