// Package openclaw owns connector bindings and per-release notification state.
package openclaw

import (
	"context"
	"database/sql"
	"regexp"
	"strconv"
	"strings"

	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

func Schema() sqlite.Schema {
	return sqlite.Schema{Module: "openclaw", Migrations: []sqlite.Migration{
		{Version: 1, SQL: `CREATE TABLE IF NOT EXISTS claw_connectors(pluginId TEXT PRIMARY KEY, tokenHash TEXT NOT NULL, lastSeen INTEGER NOT NULL DEFAULT 0)`},
		{Version: 2, When: "SELECT NOT EXISTS(SELECT 1 FROM pragma_table_info('claw_connectors') WHERE name='connectorVersion')", SQL: "ALTER TABLE claw_connectors ADD COLUMN connectorVersion TEXT NOT NULL DEFAULT ''"},
		{Version: 3, SQL: relayTables},
		{Version: 4, When: "SELECT NOT EXISTS(SELECT 1 FROM pragma_table_info('claw_jobs') WHERE name='runnerId')", SQL: "ALTER TABLE claw_jobs ADD COLUMN runnerId TEXT NOT NULL DEFAULT ''"},
		{Version: 5, When: "SELECT NOT EXISTS(SELECT 1 FROM pragma_table_info('claw_jobs') WHERE name='command')", SQL: "ALTER TABLE claw_jobs ADD COLUMN command TEXT NOT NULL DEFAULT ''"},
		{Version: 6, When: "SELECT NOT EXISTS(SELECT 1 FROM pragma_table_info('claw_jobs') WHERE name='lane')", SQL: "ALTER TABLE claw_jobs ADD COLUMN lane TEXT NOT NULL DEFAULT 'message'"},
		{Version: 7, When: "SELECT NOT EXISTS(SELECT 1 FROM pragma_table_info('claw_events') WHERE name='sessionId')", SQL: "ALTER TABLE claw_events ADD COLUMN sessionId TEXT NOT NULL DEFAULT ''"},
		{Version: 8, When: "SELECT NOT EXISTS(SELECT 1 FROM pragma_table_info('claw_connectors') WHERE name='nativeCommands')", SQL: "ALTER TABLE claw_connectors ADD COLUMN nativeCommands INTEGER NOT NULL DEFAULT 0"},
		{Version: 9, When: "SELECT NOT EXISTS(SELECT 1 FROM pragma_table_info('claw_connectors') WHERE name='versionSeenAt')", SQL: "ALTER TABLE claw_connectors ADD COLUMN versionSeenAt INTEGER NOT NULL DEFAULT 0"},
	}}
}

type Connection struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	Shortcut       string  `json:"shortcut"`
	CurrentVersion *string `json:"currentVersion"`
}
type ReadState struct {
	Version   string `json:"version"`
	CreatedAt int64  `json:"createdAt"`
	IsRead    bool   `json:"isRead"`
}
type Notice struct {
	ReadState
	Connections []Connection `json:"connections"`
}

const setting = "openclawUpdateNotice"

var versionPattern = regexp.MustCompile(`^(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})$`)

func parseVersion(version string) (parts [3]int, valid bool) {
	if !versionPattern.MatchString(version) {
		return parts, false
	}
	for i, part := range strings.Split(version, ".") {
		parts[i], _ = strconv.Atoi(part)
	}
	return parts, true
}

// The connector reports three numeric components. Missing or unrecognized
// versions are eligible; the last reported version persists while offline.
func current(version string, targetVersion [3]int) bool {
	parts, valid := parseVersion(version)
	if !valid {
		return false
	}
	for i, v := range parts {
		if v != targetVersion[i] {
			return v > targetVersion[i]
		}
	}
	return true
}

func outdated(ctx context.Context, tx *sql.Tx, limit int, targetVersion [3]int) ([]Connection, error) {
	rows, err := tx.QueryContext(ctx, `SELECT data->>'$.id',data->>'$.name',data->>'$.shortcut',NULLIF(c.connectorVersion,'')
 FROM (SELECT rowid AS position,data FROM plugins ORDER BY rowid LIMIT ?) AS p
 JOIN claw_connectors c ON c.pluginId=p.data->>'$.id'
 WHERE data->>'$.pluginId'='wechatai/openclaw' AND data->>'$.enabled'=1
 ORDER BY p.position`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []Connection
	for rows.Next() {
		var conn Connection
		if err := rows.Scan(&conn.ID, &conn.Name, &conn.Shortcut, &conn.CurrentVersion); err != nil {
			return nil, err
		}
		if conn.CurrentVersion == nil || !current(*conn.CurrentVersion, targetVersion) {
			result = append(result, conn)
		}
	}
	return result, rows.Err()
}

func UpdateNotice(ctx context.Context, tx *sql.Tx, plus bool, now int64, release string) (*Notice, error) {
	target, valid := parseVersion(release)
	if !valid {
		return nil, nil
	}
	limit := 1
	if plus {
		limit = -1
	}
	connections, err := outdated(ctx, tx, limit, target)
	if err != nil || len(connections) == 0 {
		return nil, err
	}
	state, err := accounts.Setting(ctx, tx, setting, ReadState{})
	if err != nil {
		return nil, err
	}
	if state.Version != release {
		state = ReadState{Version: release, CreatedAt: now}
		if err := accounts.SetSetting(ctx, tx, setting, state); err != nil {
			return nil, err
		}
	}
	return &Notice{state, connections}, nil
}

func MarkRead(ctx context.Context, tx *sql.Tx, version, release string) (bool, error) {
	if version != release || !versionPattern.MatchString(release) {
		return false, nil
	}
	state, err := accounts.Setting(ctx, tx, setting, ReadState{})
	if err != nil || state.Version != version {
		return false, err
	}
	if !state.IsRead {
		state.IsRead = true
		if err := accounts.SetSetting(ctx, tx, setting, state); err != nil {
			return false, err
		}
	}
	return true, nil
}
