// Package reporting provides the read model for administrator account totals.
package reporting

import "github.com/moutsea/wechatai/backend/internal/platform/sqlite"

// Imported accounts retain their source tables. New accounts start with the
// same empty input tables, so readers use a single query for both layouts.
func Schema() sqlite.Schema {
	return sqlite.Schema{Module: "reporting", Migrations: []sqlite.Migration{{Version: 1, SQL: `
CREATE TABLE IF NOT EXISTS channels(id TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS assistants(id TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS plugins(id TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS usage(id TEXT PRIMARY KEY,createdAt INTEGER NOT NULL,tokens INTEGER NOT NULL,units INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS usage_created ON usage(createdAt);
CREATE TABLE IF NOT EXISTS call_failures(id TEXT PRIMARY KEY,createdAt INTEGER NOT NULL,code TEXT NOT NULL,upstreamStatus INTEGER);
CREATE INDEX IF NOT EXISTS call_failures_created ON call_failures(createdAt);
CREATE TABLE IF NOT EXISTS claw_events(id TEXT PRIMARY KEY,pluginId TEXT NOT NULL,receipt TEXT NOT NULL,createdAt INTEGER NOT NULL);
`}, {Version: 2, When: `SELECT EXISTS(SELECT 1 FROM sqlite_schema WHERE name='runs') AND NOT EXISTS(SELECT 1 FROM settings WHERE key='callFailuresMigrated')`, SQL: `
INSERT OR IGNORE INTO call_failures SELECT r.id,r.createdAt,'legacy_unknown',NULL FROM runs r
WHERE r.status='failed' AND NOT EXISTS(SELECT 1 FROM usage u WHERE u.id=r.id);
`}, {Version: 3, When: `SELECT EXISTS(SELECT 1 FROM sqlite_schema WHERE name='claw_jobs') AND NOT EXISTS(SELECT 1 FROM settings WHERE key='callFailuresMigrated')`, SQL: `
INSERT OR IGNORE INTO call_failures SELECT 'legacy-remote:'||id,createdAt,'remote_agent_failed',NULL FROM claw_jobs WHERE state='failed';
`}}}
}
