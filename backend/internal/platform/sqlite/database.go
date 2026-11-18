// Package sqlite provides local durable storage. Business packages own their
// tables; this package only owns connection configuration and transaction scope.
package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

// Querier permits reads inside or outside a transaction. Mutating business
// operations take *sql.Tx explicitly so callers cannot accidentally omit one.
type Querier interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func Open(ctx context.Context, path string) (*sql.DB, error) {
	path, err := filepath.Abs(path)
	if err != nil {
		return nil, fmt.Errorf("resolve database path: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, fmt.Errorf("create database directory: %w", err)
	}
	// Create the main file privately before SQLite opens it. WAL and SHM files
	// inherit its permissions. Do not place live databases on network filesystems.
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, fmt.Errorf("create database: %w", err)
	}
	if err := file.Close(); err != nil {
		return nil, err
	}
	if err := os.Chmod(path, 0600); err != nil {
		return nil, err
	}
	return openWriter(ctx, path, true)
}

// OpenExisting opens a validated account without creating a file or changing its journal mode.
func OpenExisting(ctx context.Context, path string) (*sql.DB, error) {
	return openWriter(ctx, path, false)
}

func openWriter(ctx context.Context, path string, configureWAL bool) (*sql.DB, error) {
	u := url.URL{Scheme: "file", Path: path}
	query := u.Query()
	query.Set("mode", "rw")
	if configureWAL {
		query.Add("_pragma", "journal_mode(WAL)")
	}
	for _, pragma := range []string{"synchronous(FULL)", "foreign_keys(ON)", "busy_timeout(5000)"} {
		query.Add("_pragma", pragma)
	}
	u.RawQuery = query.Encode()
	db, err := sql.Open("sqlite", u.String())
	if err != nil {
		return nil, err
	}
	// A connection is never held over external I/O. A single writer connection
	// per account provides bounded contention without process-wide serialization.
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("open database: %w", err)
	}
	return db, nil
}

// Within commits only when fn succeeds. All SQL state, including ledger entries
// and job acknowledgements, rolls back together on errors or panic. Never call
// another Within or wait for a network request from fn.
func Within(ctx context.Context, db *sql.DB, fn func(*sql.Tx) error) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := fn(tx); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}
	return nil
}

func IsMissing(err error) bool { return errors.Is(err, sql.ErrNoRows) }
