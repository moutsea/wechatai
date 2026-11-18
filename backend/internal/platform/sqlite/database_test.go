package sqlite_test

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

func TestTransactionRollbackAndPanic(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "account.sqlite")
	db, err := sqlite.Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`CREATE TABLE items(id INTEGER PRIMARY KEY)`); err != nil {
		t.Fatal(err)
	}
	want := errors.New("later step failed")
	err = sqlite.Within(ctx, db, func(tx *sql.Tx) error {
		if _, err := tx.Exec(`INSERT INTO items VALUES(1)`); err != nil {
			return err
		}
		return want
	})
	if !errors.Is(err, want) {
		t.Fatalf("got %v", err)
	}
	func() {
		defer func() {
			if recover() == nil {
				t.Error("expected panic")
			}
		}()
		_ = sqlite.Within(ctx, db, func(tx *sql.Tx) error {
			if _, err := tx.Exec(`INSERT INTO items VALUES(2)`); err != nil {
				return err
			}
			panic("interrupted transaction")
		})
	}()
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM items`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("partial transaction escaped: %d", count)
	}
	var journal string
	var synchronous int
	if err := db.QueryRow(`PRAGMA journal_mode`).Scan(&journal); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`PRAGMA synchronous`).Scan(&synchronous); err != nil {
		t.Fatal(err)
	}
	if journal != "wal" || synchronous != 2 {
		t.Fatalf("unsafe persistence: %s/%d", journal, synchronous)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0600 {
		t.Fatalf("database permission %o", info.Mode().Perm())
	}
}

func TestMigrationImmutabilityAndAtomicity(t *testing.T) {
	ctx := context.Background()
	db, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "migration.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	base := []sqlite.Migration{{Version: 1, SQL: `CREATE TABLE domain_state(id INTEGER PRIMARY KEY)`}}
	for range 2 {
		if err := sqlite.Migrate(ctx, db, "domain", base); err != nil {
			t.Fatal(err)
		}
	}
	changed := []sqlite.Migration{{Version: 1, SQL: `CREATE TABLE different(id INTEGER PRIMARY KEY)`}}
	if err := sqlite.Migrate(ctx, db, "domain", changed); err == nil {
		t.Fatal("accepted changed migration")
	}
	broken := append(append([]sqlite.Migration{}, base...), sqlite.Migration{Version: 2, SQL: `CREATE TABLE partial(id INTEGER); INSERT INTO missing VALUES(1)`})
	if err := sqlite.Migrate(ctx, db, "domain", broken); err == nil {
		t.Fatal("accepted invalid migration")
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM sqlite_schema WHERE name='partial'`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatal("failed migration leaked schema")
	}
	full := append(append([]sqlite.Migration{}, base...), sqlite.Migration{Version: 2, SQL: `CREATE TABLE complete(id INTEGER)`})
	if err := sqlite.Migrate(ctx, db, "domain", full); err != nil {
		t.Fatal(err)
	}
	if err := sqlite.Migrate(ctx, db, "domain", base); err == nil {
		t.Fatal("older binary accepted newer schema")
	}
}
