package accounts

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

// Settings retains legacy key names and JSON encoding. Callers own the meaning
// of their keys; no API exposes this as an unrestricted settings editor.
func Setting[T any](ctx context.Context, db sqlite.Querier, key string, fallback T) (T, error) {
	var encoded string
	err := db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key=?`, key).Scan(&encoded)
	if sqlite.IsMissing(err) {
		return fallback, nil
	}
	if err != nil {
		return fallback, err
	}
	var value T
	if err := json.Unmarshal([]byte(encoded), &value); err != nil {
		return fallback, fmt.Errorf("invalid persisted setting %s: %w", key, err)
	}
	return value, nil
}

func SetSetting(ctx context.Context, tx *sql.Tx, key string, value any) error {
	encoded, err := json.Marshal(value)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, key, string(encoded))
	return err
}
