// Package legacy checks the storage layout of the supported PersonalAccount
// export before any Go initializer can create a missing table.
package legacy

import (
	"context"
	"database/sql"
	_ "embed"
	"fmt"

	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

//go:embed personal-account-v1.json
var layout string

func CheckLayout(ctx context.Context, tx *sql.Tx) error {
	var table, column string
	err := tx.QueryRowContext(ctx, `SELECT t.key, c.value FROM json_each(?) t, json_each(t.value) c
 EXCEPT SELECT s.name, p.name FROM sqlite_schema s JOIN pragma_table_info(s.name) p
 WHERE s.type='table'
 ORDER BY 1,2 LIMIT 1`, layout).Scan(&table, &column)
	if sqlite.IsMissing(err) {
		return nil
	}
	if err != nil {
		return err
	}
	return fmt.Errorf("incomplete PersonalAccount v1 export: missing %s.%s; re-export the initialized original DO", table, column)
}
