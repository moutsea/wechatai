package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

// PrepareLegacy stages one already-exported account under an independently
// supplied owner and epoch. Only a verified, prepared snapshot is published.
func PrepareLegacy(ctx context.Context, source, destination string, id accounts.ID, owner string, epoch int64) error {
	return stageAccount(ctx, source, destination, id, owner, epoch, "legacy")
}

// UpgradeAccount stages a bound account from a verified backup, retaining its
// owner, epoch and phase. A failure leaves the original generation untouched.
func UpgradeAccount(ctx context.Context, source, destination string, id accounts.ID, owner string, epoch int64) error {
	return stageAccount(ctx, source, destination, id, owner, epoch, "bound")
}

// RecoverUnbound requires an operator-supplied identity record obtained from
// the original namespace, independently of the SQLite file and its manifest.
func RecoverUnbound(ctx context.Context, source, destination string, id accounts.ID, owner string, epoch int64, mapping string) error {
	data, err := os.ReadFile(mapping)
	if err != nil {
		return fmt.Errorf("read original namespace identity mapping: %w", err)
	}
	var record struct {
		Format    string      `json:"format"`
		AccountID accounts.ID `json:"accountId"`
		UserID    string      `json:"userId"`
	}
	if err := json.Unmarshal(data, &record); err != nil {
		return err
	}
	if record.Format != "wechatai-original-identity-v1" || record.AccountID != id || record.UserID != owner {
		return accounts.ErrIdentity
	}
	return stageAccount(ctx, source, destination, id, owner, epoch, "unbound")
}

func stageAccount(ctx context.Context, source, destination string, id accounts.ID, owner string, epoch int64, sourcePhase string) error {
	if _, err := accounts.ParseID(string(id)); err != nil {
		return err
	}
	if owner == "" || len(owner) > 128 || epoch < 1 || epoch > 1<<53-1 {
		return accounts.ErrIdentity
	}
	if _, err := os.Lstat(destination); err == nil {
		return os.ErrExist
	} else if !os.IsNotExist(err) {
		return err
	}
	scratch, err := os.MkdirTemp(filepath.Dir(destination), ".wechatai-prepare-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(scratch)
	name := string(id) + ".sqlite"
	path := filepath.Join(scratch, name)
	entry, err := stageBackup(ctx, source, path, id)
	if err != nil {
		return err
	}
	state, err := inspectFile(ctx, scratch, id)
	if err != nil {
		return err
	}
	if state.UserID != owner || entry.UserID != state.UserID || entry.Phase != state.Phase || entry.RouteEpoch != state.RouteEpoch {
		return accounts.ErrIdentity
	}
	expectedPhase := "prepared"
	if state.Phase == "unbound" && sourcePhase != "unbound" {
		return errors.New("account has no Go binding; use recover-unbound with an independently verified original account mapping, or re-export the original DO")
	}
	switch sourcePhase {
	case "bound":
		if state.Phase == "legacy" || state.Match(id, owner, epoch) != nil {
			return accounts.ErrIdentity
		}
		expectedPhase = state.Phase
	default:
		if state.Phase != sourcePhase || state.RouteEpoch != 0 {
			return fmt.Errorf("preparation requires a %s snapshot", sourcePhase)
		}
	}
	db, err := sqlite.Open(ctx, path)
	if err != nil {
		return err
	}
	defer db.Close()
	for _, schema := range Schemas() {
		if err := schema.Apply(ctx, db); err != nil {
			return err
		}
	}
	if sourcePhase != "bound" {
		if err := sqlite.Within(ctx, db, func(tx *sql.Tx) error { return accounts.Bind(ctx, tx, id, owner, epoch, "prepared") }); err != nil {
			return err
		}
	}
	state, err = inspectSchema(ctx, scratch, id, true)
	if err != nil {
		return err
	}
	if state.Phase != expectedPhase || state.Match(id, owner, epoch) != nil {
		return accounts.ErrIdentity
	}
	if err := os.Mkdir(destination, 0700); err != nil {
		return err
	}
	// The online backup includes committed schema and identity changes in WAL.
	_, err = sqlite.Backup(ctx, db, filepath.Join(destination, name))
	if err != nil {
		// Only remove our empty directory. An already-published file stays
		// available for inspection if the final directory sync failed.
		_ = os.Remove(destination)
	}
	return err
}
