package app

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

const backupFormat = "wechatai-vps-backup-v1"

type BackupAccount struct {
	AccountID  accounts.ID `json:"accountId"`
	UserID     string      `json:"userId"`
	RouteEpoch int64       `json:"routeEpoch"`
	Phase      string      `json:"phase"`
	File       string      `json:"file"`
	sqlite.BackupInfo
}
type BackupManifest struct {
	Format    string          `json:"format"`
	CreatedAt int64           `json:"createdAt"`
	Accounts  []BackupAccount `json:"accounts"`
}

// BackupData creates a new private backup directory. Only a completed manifest
// marks the generation usable. Failure leaves partial files for inspection;
// retries must use a new directory and cannot silently overwrite a generation.
func BackupData(ctx context.Context, source, destination string) (BackupManifest, error) {
	manifest := BackupManifest{Format: backupFormat, CreatedAt: time.Now().UnixMilli(), Accounts: []BackupAccount{}}
	// Do not re-seal an altered or incomplete generation as a raw export.
	for _, marker := range []string{"manifest.json", ".manifest.tmp"} {
		if _, err := os.Lstat(filepath.Join(source, marker)); err == nil {
			return manifest, errors.New("backup-data requires a raw account directory; use the original completed generation for restoration")
		} else if !os.IsNotExist(err) {
			return manifest, err
		}
	}
	if _, err := InspectData(ctx, source); err != nil {
		return manifest, err
	}
	files, err := os.ReadDir(source)
	if err != nil {
		return manifest, err
	}
	if err := os.Mkdir(destination, 0700); err != nil {
		return manifest, err
	}
	file, err := os.OpenFile(filepath.Join(destination, ".manifest.tmp"), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return manifest, err
	}
	defer file.Close()
	for _, file := range files {
		if file.IsDir() || !strings.HasSuffix(file.Name(), ".sqlite") {
			continue
		}
		id, err := accounts.ParseID(strings.TrimSuffix(file.Name(), ".sqlite"))
		if err != nil {
			return manifest, err
		}
		db, err := accounts.OpenSnapshot(ctx, source, id)
		if err != nil {
			return manifest, err
		}
		info, err := sqlite.Backup(ctx, db, filepath.Join(destination, file.Name()))
		closeErr := db.Close()
		if err != nil {
			return manifest, err
		}
		if closeErr != nil {
			return manifest, closeErr
		}
		state, err := inspectFile(ctx, destination, id)
		if err != nil {
			return manifest, err
		}
		account := BackupAccount{AccountID: id, File: file.Name(), BackupInfo: info}
		account.UserID, account.RouteEpoch, account.Phase = state.UserID, state.RouteEpoch, state.Phase
		manifest.Accounts = append(manifest.Accounts, account)
	}
	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return manifest, err
	}
	_, err = file.Write(append(data, '\n'))
	if err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err != nil {
		return manifest, err
	}
	if closeErr != nil {
		return manifest, closeErr
	}
	if err := os.Rename(filepath.Join(destination, ".manifest.tmp"), filepath.Join(destination, "manifest.json")); err != nil {
		return manifest, err
	}
	directory, err := os.Open(destination)
	if err != nil {
		return manifest, err
	}
	defer directory.Close()
	return manifest, directory.Sync()
}
