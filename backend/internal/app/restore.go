package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/moutsea/wechatai/backend/internal/accounts"
)

// Read one unambiguous account entry from a completed backup generation.
func backupEntry(root string, id accounts.ID) (BackupAccount, error) {
	var entry BackupAccount
	var manifest BackupManifest
	data, err := os.ReadFile(filepath.Join(root, "manifest.json"))
	if err != nil {
		return entry, fmt.Errorf("open completed backup manifest: %w", err)
	}
	if err := json.Unmarshal(data, &manifest); err != nil {
		return entry, err
	}
	if manifest.Format != backupFormat {
		return entry, errors.New("unsupported backup format")
	}
	for _, item := range manifest.Accounts {
		if item.AccountID != id {
			continue
		}
		if entry.AccountID != "" {
			return entry, errors.New("duplicate account in backup manifest")
		}
		entry = item
	}
	name := string(id) + ".sqlite"
	if entry.File != name || entry.Bytes <= 0 || len(entry.SHA256) != sha256.Size*2 {
		return entry, errors.New("missing or invalid account manifest entry")
	}
	return entry, nil
}

// Stage the exact standalone bytes identified by the completed generation.
// SQLite must never see a journal from outside the verified staging directory.
func stageBackup(ctx context.Context, root, target string, id accounts.ID) (BackupAccount, error) {
	entry, err := backupEntry(root, id)
	if err != nil {
		return entry, err
	}
	path := filepath.Join(root, entry.File)
	for _, suffix := range []string{"-wal", "-journal"} {
		info, err := os.Lstat(path + suffix)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return entry, err
		}
		if !info.Mode().IsRegular() || info.Size() != 0 {
			return entry, errors.New("backup has an unexpected SQLite journal")
		}
	}
	info, err := os.Lstat(path)
	if err != nil {
		return entry, err
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0077 != 0 || info.Size() != entry.Bytes {
		return entry, errors.New("backup file mode or size mismatch")
	}
	input, err := os.Open(path)
	if err != nil {
		return entry, err
	}
	defer input.Close()
	output, err := os.OpenFile(target, os.O_WRONLY|os.O_EXCL|os.O_CREATE, 0600)
	if err != nil {
		return entry, err
	}
	hash := sha256.New()
	count, err := io.Copy(io.MultiWriter(output, hash), input)
	closeErr := output.Close()
	if err != nil {
		return entry, err
	}
	if closeErr != nil {
		return entry, closeErr
	}
	if count != entry.Bytes || hex.EncodeToString(hash.Sum(nil)) != entry.SHA256 {
		return entry, errors.New("backup checksum or size mismatch")
	}
	return entry, ctx.Err()
}
