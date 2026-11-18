// Package media authorizes access to account-owned R2 objects.
package media

import (
	"context"
	"database/sql"
	"regexp"

	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

func Schema() sqlite.Schema {
	return sqlite.Schema{Module: "media", Migrations: []sqlite.Migration{
		{Version: 1, SQL: `CREATE TABLE IF NOT EXISTS output_assets(id TEXT PRIMARY KEY,runId TEXT NOT NULL,sessionId TEXT,mime TEXT NOT NULL,bytes INTEGER NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,expiresAt INTEGER NOT NULL,committed INTEGER NOT NULL DEFAULT 0,wechat TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS assets_session ON output_assets(sessionId);`},
		{Version: 2, When: "SELECT NOT EXISTS (SELECT 1 FROM pragma_table_info('output_assets') WHERE name='name')", SQL: "ALTER TABLE output_assets ADD COLUMN name TEXT NOT NULL DEFAULT ''"},
	}}
}

type Descriptor struct {
	MIME  string `json:"mime"`
	Bytes int64  `json:"bytes"`
	Name  string `json:"name"`
}

var assetID = regexp.MustCompile("^[0-9a-f-]{36}$")

func Lookup(ctx context.Context, tx *sql.Tx, id string, now int64) (*Descriptor, error) {
	if !assetID.MatchString(id) {
		return nil, nil
	}
	var desc Descriptor
	err := tx.QueryRowContext(ctx, "SELECT mime,bytes,name FROM output_assets WHERE id=? AND committed=1 AND expiresAt>?", id, now).Scan(&desc.MIME, &desc.Bytes, &desc.Name)
	if sqlite.IsMissing(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &desc, nil
}
