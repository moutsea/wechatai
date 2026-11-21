// Package delivery owns the account inbox and its message deduplication keys.
package delivery

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

func Schema() sqlite.Schema {
	return sqlite.Schema{Module: "delivery", Migrations: []sqlite.Migration{{Version: 1, SQL: `
CREATE TABLE IF NOT EXISTS inbox (
 id TEXT PRIMARY KEY,payload TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',
 reply TEXT NOT NULL DEFAULT '',part INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,
 createdAt INTEGER NOT NULL,sessionId TEXT,connectionId TEXT NOT NULL DEFAULT 'default');
`}, {Version: 2, When: "SELECT NOT EXISTS (SELECT 1 FROM pragma_table_info('inbox') WHERE name='sessionId')", SQL: "ALTER TABLE inbox ADD COLUMN sessionId TEXT"},
		{Version: 3, When: "SELECT NOT EXISTS (SELECT 1 FROM pragma_table_info('inbox') WHERE name='connectionId')", SQL: "ALTER TABLE inbox ADD COLUMN connectionId TEXT NOT NULL DEFAULT 'default'"},
		{Version: 4, When: "SELECT NOT EXISTS (SELECT 1 FROM pragma_table_info('inbox') WHERE name='wechatRoundedId')", SQL: "ALTER TABLE inbox ADD COLUMN wechatRoundedId TEXT"},
		{Version: 5, When: "SELECT NOT EXISTS (SELECT 1 FROM pragma_table_info('inbox') WHERE name='wechatExactId')", SQL: "ALTER TABLE inbox ADD COLUMN wechatExactId TEXT"},
		{Version: 6, When: "SELECT NOT EXISTS (SELECT 1 FROM pragma_table_info('inbox') WHERE name='wechatSeq')", SQL: "ALTER TABLE inbox ADD COLUMN wechatSeq TEXT"},
		{Version: 7, SQL: "CREATE INDEX IF NOT EXISTS inbox_wechat_rounded ON inbox(wechatRoundedId) WHERE wechatRoundedId IS NOT NULL"},
		{Version: 8, When: "SELECT NOT EXISTS (SELECT 1 FROM pragma_table_info('inbox') WHERE name='wechatTextReceipts')", SQL: "ALTER TABLE inbox ADD COLUMN wechatTextReceipts TEXT"},
	}}
}

func Migrate(ctx context.Context, db *sql.DB) error { return Schema().Apply(ctx, db) }

// InsertIncoming runs inside the receiver transaction after sender, connection
// generation and cursor validation. id is the existing Worker deduplication key.
func InsertIncoming(ctx context.Context, tx *sql.Tx, id, connection string, payload json.RawMessage, now int64) (bool, error) {
	var message struct {
		Type  int    `json:"message_type"`
		Token string `json:"context_token"`
	}
	if id == "" || connection == "" || json.Unmarshal(payload, &message) != nil || message.Type != 1 {
		return false, errors.New("invalid incoming WeChat message")
	}
	return insertReceipt(ctx, tx, connection, now, message.Token, payload, receiptKey{id: id})
}

type receiptKey struct {
	id                  string
	rounded, exact, seq *string
}

// Only a newly committed inbound receipt may reopen replies waiting for context.
func insertReceipt(ctx context.Context, tx *sql.Tx, connection string, now int64, token string, payload json.RawMessage, key receiptKey) (bool, error) {
	result, err := tx.ExecContext(ctx, `INSERT INTO inbox(id,payload,createdAt,connectionId,wechatRoundedId,wechatExactId,wechatSeq)
		VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`, key.id, string(payload), now, connection, key.rounded, key.exact, key.seq)
	if err != nil {
		return false, err
	}
	changed, err := result.RowsAffected()
	if err != nil || changed == 0 {
		return false, err
	}
	if token != "" {
		_, err = tx.ExecContext(ctx, "UPDATE inbox SET state='reply',attempts=0 WHERE connectionId=? AND state='waiting_context'", connection)
	}
	return true, err
}
