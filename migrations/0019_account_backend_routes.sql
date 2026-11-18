-- No row routes to the original DO. A frozen row blocks account access during transfer.
CREATE TABLE account_backend_routes (
  owner_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE CHECK (length(account_id) = 64 AND account_id NOT GLOB '*[^0-9a-f]*'),
  location TEXT NOT NULL CHECK (location IN ('frozen', 'go')),
  route_epoch INTEGER NOT NULL CHECK (route_epoch BETWEEN 1 AND 9007199254740991)
);
