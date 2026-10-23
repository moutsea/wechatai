-- Latest host snapshot only. No user data or monitoring history is stored here.
CREATE TABLE IF NOT EXISTS server_status (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  sampled_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  payload TEXT NOT NULL
);
