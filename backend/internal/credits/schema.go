// Package credits owns the wallet and its immutable financial records.
package credits

import (
	"context"
	"database/sql"

	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

func Schema() sqlite.Schema {
	return sqlite.Schema{Module: "credits", Migrations: []sqlite.Migration{{Version: 1, SQL: `
CREATE TABLE IF NOT EXISTS credit_buckets (id TEXT PRIMARY KEY,kind TEXT NOT NULL,remaining INTEGER NOT NULL CHECK(remaining>=0),expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS credit_ledger (id TEXT PRIMARY KEY,kind TEXT NOT NULL,amount INTEGER NOT NULL,note TEXT NOT NULL,createdAt INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS reservations (id TEXT PRIMARY KEY,amount INTEGER NOT NULL,allocations TEXT NOT NULL,status TEXT NOT NULL,createdAt INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS credit_debt (id INTEGER PRIMARY KEY CHECK(id=1),amount INTEGER NOT NULL CHECK(amount>=0));
INSERT OR IGNORE INTO credit_debt VALUES(1,0);
CREATE TRIGGER IF NOT EXISTS ledger_no_update BEFORE UPDATE ON credit_ledger BEGIN SELECT RAISE(ABORT,'immutable ledger'); END;
CREATE TRIGGER IF NOT EXISTS ledger_no_delete BEFORE DELETE ON credit_ledger BEGIN SELECT RAISE(ABORT,'immutable ledger'); END;
CREATE TABLE IF NOT EXISTS platform_metering (id TEXT PRIMARY KEY,pluginId TEXT NOT NULL,pluginVersion TEXT NOT NULL,instanceId TEXT NOT NULL,data TEXT NOT NULL,createdAt INTEGER NOT NULL);
CREATE TRIGGER IF NOT EXISTS metering_no_update BEFORE UPDATE ON platform_metering BEGIN SELECT RAISE(ABORT,'immutable metering'); END;
CREATE TRIGGER IF NOT EXISTS metering_no_delete BEFORE DELETE ON platform_metering BEGIN SELECT RAISE(ABORT,'immutable metering'); END;
CREATE INDEX IF NOT EXISTS backend_credit_expiry ON credit_buckets(expires,id) WHERE remaining>0;
CREATE INDEX IF NOT EXISTS backend_ledger_recent ON credit_ledger(createdAt DESC);
`}}}
}

func Migrate(ctx context.Context, db *sql.DB) error { return Schema().Apply(ctx, db) }

// CheckLayout validates the original wallet columns even when the tables are empty.
func CheckLayout(ctx context.Context, tx *sql.Tx) error {
	// Preparing these projections checks columns even on empty histories.
	rows, err := tx.QueryContext(ctx, `SELECT b.id,b.kind,b.remaining,b.expires,l.id,l.kind,l.amount,l.note,l.createdAt,
 r.id,r.amount,r.allocations,r.status,r.createdAt,m.id,m.pluginId,m.pluginVersion,m.instanceId,m.data,m.createdAt
 FROM credit_buckets b,credit_ledger l,reservations r,platform_metering m LIMIT 0`)
	if err != nil {
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}
	var debt int64
	return tx.QueryRowContext(ctx, "SELECT amount FROM credit_debt WHERE id=1 AND typeof(amount)='integer' AND amount>=0").Scan(&debt)
}
