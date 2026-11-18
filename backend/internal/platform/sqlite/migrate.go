package sqlite

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
)

type Migration struct {
	Version int
	SQL     string
	// When conditionally applies SQL to an older, already populated schema.
	When string
}

func (m Migration) checksum() string {
	source := m.SQL
	if m.When != "" {
		source = m.When + "\x00" + source
	}
	digest := sha256.Sum256([]byte(source))
	return hex.EncodeToString(digest[:])
}

func (m Migration) apply(ctx context.Context, tx *sql.Tx) error {
	if m.When != "" {
		var needed bool
		if err := tx.QueryRowContext(ctx, m.When).Scan(&needed); err != nil {
			return err
		}
		if !needed {
			return nil
		}
	}
	_, err := tx.ExecContext(ctx, m.SQL)
	return err
}

type Schema struct {
	Module     string
	Migrations []Migration
}

func (s Schema) Apply(ctx context.Context, db *sql.DB) error {
	return Migrate(ctx, db, s.Module, s.Migrations)
}

// CheckCompatibility never applies migrations. Unknown modules, newer versions
// and changed checksums prevent a deployment or an unsafe binary rollback.
func CheckCompatibility(ctx context.Context, db Querier, schemas []Schema) error {
	return checkVersions(ctx, db, schemas, false)
}

var ErrUpgradeRequired = errors.New("account schema requires an offline upgrade")

func RequireCurrent(ctx context.Context, db Querier, schemas []Schema) error {
	return checkVersions(ctx, db, schemas, true)
}

func checkVersions(ctx context.Context, db Querier, schemas []Schema, current bool) error {
	var exists int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM sqlite_schema WHERE type='table' AND name='backend_schema_migrations'`).Scan(&exists); err != nil {
		return err
	}
	if exists == 0 {
		if current {
			return ErrUpgradeRequired
		}
		return nil
	} // A legacy account has not run any Go migration.
	known := map[string][]Migration{}
	for _, schema := range schemas {
		known[schema.Module] = schema.Migrations
	}
	rows, err := db.QueryContext(ctx, `SELECT module,version,checksum FROM backend_schema_migrations ORDER BY module,version`)
	if err != nil {
		return err
	}
	defer rows.Close()
	versions := map[string]int{}
	for rows.Next() {
		var module, checksum string
		var version int
		if err := rows.Scan(&module, &version, &checksum); err != nil {
			return err
		}
		migrations, found := known[module]
		if !found || version < 1 || version > len(migrations) || version != versions[module]+1 {
			return fmt.Errorf("incompatible schema %s version %d", module, version)
		}
		if migrations[version-1].checksum() != checksum {
			return fmt.Errorf("%s migration %d checksum changed", module, version)
		}
		versions[module] = version
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if current {
		for _, schema := range schemas {
			if versions[schema.Module] != len(schema.Migrations) {
				return fmt.Errorf("%w: %s", ErrUpgradeRequired, schema.Module)
			}
		}
	}
	return nil
}

var moduleName = regexp.MustCompile(`^[a-z][a-z0-9_]{0,63}$`)

// Migrate applies immutable, ordered migrations for one table-owning module.
// Both the schema changes and their checksums commit in one transaction.
func Migrate(ctx context.Context, db *sql.DB, module string, migrations []Migration) error {
	if !moduleName.MatchString(module) || len(migrations) == 0 {
		return fmt.Errorf("invalid migration module %q", module)
	}
	for i, migration := range migrations {
		if migration.Version != i+1 || migration.SQL == "" {
			return fmt.Errorf("%s migrations must be nonempty and consecutive", module)
		}
	}
	return Within(ctx, db, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS backend_schema_migrations (
			module TEXT NOT NULL,version INTEGER NOT NULL,checksum TEXT NOT NULL,
			PRIMARY KEY(module,version))`); err != nil {
			return err
		}
		var latest int
		if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(version),0) FROM backend_schema_migrations WHERE module=?`, module).Scan(&latest); err != nil {
			return err
		}
		if latest > len(migrations) {
			return fmt.Errorf("%s schema version %d is newer than this binary", module, latest)
		}
		for _, migration := range migrations {
			checksum := migration.checksum()
			var previous string
			err := tx.QueryRowContext(ctx, `SELECT checksum FROM backend_schema_migrations WHERE module=? AND version=?`, module, migration.Version).Scan(&previous)
			if err == nil {
				if previous != checksum {
					return fmt.Errorf("%s migration %d checksum changed", module, migration.Version)
				}
				continue
			}
			if !IsMissing(err) {
				return err
			}
			if err := migration.apply(ctx, tx); err != nil {
				return fmt.Errorf("%s migration %d: %w", module, migration.Version, err)
			}
			if _, err := tx.ExecContext(ctx, `INSERT INTO backend_schema_migrations VALUES(?,?,?)`, module, migration.Version, checksum); err != nil {
				return err
			}
		}
		return nil
	})
}
