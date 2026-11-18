// Package personal owns personal assistant records and their reminder state.
package personal

import "github.com/moutsea/wechatai/backend/internal/platform/sqlite"

func Schema() sqlite.Schema {
	return sqlite.Schema{Module: "personal", Migrations: []sqlite.Migration{{Version: 1, SQL: `
CREATE TABLE IF NOT EXISTS personal_record_migrations (version INTEGER PRIMARY KEY);
CREATE TABLE IF NOT EXISTS personal_record_state (
          pluginId TEXT NOT NULL, connectionId TEXT NOT NULL DEFAULT '',
          revision INTEGER NOT NULL, changes TEXT NOT NULL, PRIMARY KEY(pluginId,connectionId)
        );
CREATE TABLE IF NOT EXISTS personal_records (id TEXT PRIMARY KEY, pluginId TEXT NOT NULL, revision INTEGER NOT NULL, kind TEXT NOT NULL, date TEXT NOT NULL, amountCents INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, connectionId TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS personal_reminder_schedule (id INTEGER PRIMARY KEY CHECK (id=1), revision INTEGER NOT NULL, acknowledged INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS personal_reminders (id TEXT PRIMARY KEY, pluginId TEXT NOT NULL, recordId TEXT NOT NULL UNIQUE, revision INTEGER NOT NULL, dueAt INTEGER NOT NULL, repeatMs INTEGER NOT NULL, connectionId TEXT NOT NULL, generation TEXT NOT NULL, state TEXT NOT NULL, retryAt INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '', recordConnectionId TEXT NOT NULL DEFAULT '', lastFailure TEXT, errorDueAt INTEGER, blockReason TEXT);
CREATE TABLE IF NOT EXISTS personal_runs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS personal_records_plugin ON personal_records(pluginId,kind,date);
CREATE INDEX IF NOT EXISTS personal_records_scope ON personal_records(pluginId,connectionId,kind,date);
CREATE UNIQUE INDEX IF NOT EXISTS personal_daily_tasks_unique ON personal_records(pluginId,connectionId) WHERE kind='reminder' AND json_extract(data,'$.reminderType')='daily_tasks';
CREATE INDEX IF NOT EXISTS personal_reminders_due ON personal_reminders(state,retryAt);
INSERT OR IGNORE INTO personal_reminder_schedule VALUES(1,CASE WHEN EXISTS(SELECT 1 FROM personal_reminders) THEN 1 ELSE 0 END,0);
INSERT OR IGNORE INTO personal_record_migrations(version) SELECT column1 FROM (VALUES (2),(3),(4),(5),(6),(7)) WHERE NOT EXISTS(SELECT 1 FROM personal_records) AND NOT EXISTS(SELECT 1 FROM personal_reminders);
`}}}
}
