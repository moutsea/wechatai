// Package cloudagent owns cloud task state and user-visible task history.
package cloudagent

import "github.com/moutsea/wechatai/backend/internal/platform/sqlite"

func Schema() sqlite.Schema {
	return sqlite.Schema{Module: "cloudagent", Migrations: []sqlite.Migration{{Version: 1, SQL: `CREATE TABLE IF NOT EXISTS cloud_provision (
        id INTEGER PRIMARY KEY CHECK(id = 1), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cloud_tasks (
        id TEXT PRIMARY KEY, pluginId TEXT NOT NULL, sessionId TEXT NOT NULL,
        connectionId TEXT NOT NULL, state TEXT NOT NULL, jobId TEXT NOT NULL DEFAULT '',
        createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, deadline INTEGER NOT NULL,
        nextAt INTEGER NOT NULL, stopRequested INTEGER NOT NULL DEFAULT 0,
        settled INTEGER NOT NULL DEFAULT 0, stale INTEGER NOT NULL DEFAULT 0,
        delivered INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS cloud_tasks_due ON cloud_tasks(state, nextAt);
      CREATE INDEX IF NOT EXISTS cloud_tasks_session ON cloud_tasks(sessionId, createdAt);
      CREATE INDEX IF NOT EXISTS cloud_tasks_created ON cloud_tasks(createdAt);
      CREATE INDEX IF NOT EXISTS cloud_tasks_page ON cloud_tasks(createdAt DESC, id DESC);
      CREATE INDEX IF NOT EXISTS cloud_tasks_plugin_page ON cloud_tasks(pluginId, createdAt DESC, id DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS cloud_tasks_job ON cloud_tasks(jobId) WHERE jobId != '';
      CREATE UNIQUE INDEX IF NOT EXISTS cloud_tasks_source ON cloud_tasks(json_extract(data, '$.sourceId'));
      CREATE TABLE IF NOT EXISTS cloud_task_images (
        taskId TEXT NOT NULL, imageId TEXT NOT NULL, part INTEGER NOT NULL,
        data BLOB NOT NULL, PRIMARY KEY(taskId,imageId,part));
      CREATE TABLE IF NOT EXISTS cloud_callbacks (
        deliveryId TEXT PRIMARY KEY, taskId TEXT NOT NULL, jobId TEXT NOT NULL,
        hash TEXT NOT NULL, createdAt INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS cloud_callbacks_created ON cloud_callbacks(createdAt);
      CREATE INDEX IF NOT EXISTS cloud_callbacks_task ON cloud_callbacks(taskId, jobId);`}}}
}
