package accounts

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"

	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

// OpenSnapshot opens an existing private account file without running initializers.
func OpenSnapshot(ctx context.Context, root string, id ID) (*sql.DB, error) {
	if _, err := ParseID(string(id)); err != nil {
		return nil, err
	}
	path := filepath.Join(root, string(id)+".sqlite")
	info, err := os.Lstat(path)
	if os.IsNotExist(err) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0077 != 0 {
		return nil, errors.New("account database must be a private regular file")
	}
	return sqlite.OpenReadOnly(ctx, path)
}

func hasRuntimeSchema(ctx context.Context, db sqlite.Querier) (bool, error) {
	var managed bool
	err := db.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM sqlite_schema WHERE type='table' AND name='backend_schema_migrations')`).Scan(&managed)
	return managed, err
}

// InspectIdentity classifies a snapshot without binding it or assigning a route epoch.
func InspectIdentity(ctx context.Context, tx *sql.Tx, id ID) (Metadata, error) {
	var state Metadata
	managed, err := hasRuntimeSchema(ctx, tx)
	if err != nil {
		return state, err
	}
	owner, err := Setting[string](ctx, tx, "ownerId", "")
	if err != nil {
		return state, err
	}
	if managed {
		state, err = State(ctx, tx)
		if err != nil {
			// Older status probes could apply the schemas before an import had bound
			// the identity. Report that distinction without inventing an epoch.
			if !sqlite.IsMissing(err) || owner == "" {
				return state, err
			}
			state = Metadata{AccountID: id, UserID: owner, Phase: "unbound"}
		}
		if state.AccountID != id || state.UserID == "" || (owner != "" && state.UserID != owner) {
			return state, ErrIdentity
		}
	} else {
		if owner == "" {
			return state, errors.New("legacy account has no owner identity to verify")
		}
		var unexpected bool
		if err := tx.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM sqlite_schema WHERE name='backend_account')").Scan(&unexpected); err != nil {
			return state, err
		}
		if unexpected {
			return state, errors.New("account metadata has no migration history")
		}
		state = Metadata{AccountID: id, UserID: owner, Phase: "legacy"}
	}
	return state, nil
}
