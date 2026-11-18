package sqlite

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"time"

	driver "modernc.org/sqlite"
)

type BackupInfo struct {
	SHA256 string `json:"sha256"`
	Bytes  int64  `json:"bytes"`
}

// Backup uses SQLite's online backup API, including committed WAL content. It
// publishes a standalone file exclusively; it never overwrites another backup.
// A backup is consistent within one account, not across independent databases.
func Backup(ctx context.Context, db *sql.DB, destination string) (info BackupInfo, finalErr error) {
	parent := filepath.Dir(destination)
	directory, err := os.Stat(parent)
	if err != nil {
		return info, err
	}
	if !directory.IsDir() || directory.Mode().Perm()&0077 != 0 {
		return info, errors.New("backup directory must be private (0700)")
	}
	temporary, err := os.CreateTemp(parent, ".backup-*.sqlite")
	if err != nil {
		return info, err
	}
	path := temporary.Name()
	if err := temporary.Close(); err != nil {
		os.Remove(path)
		return info, err
	}
	defer func() {
		for _, suffix := range []string{"", "-wal", "-shm"} {
			os.Remove(path + suffix)
		}
	}()
	connection, err := db.Conn(ctx)
	if err != nil {
		return info, err
	}
	defer connection.Close()
	err = connection.Raw(func(raw any) error {
		source, ok := raw.(interface {
			NewBackup(string) (*driver.Backup, error)
		})
		if !ok {
			return errors.New("SQLite driver does not support online backup")
		}
		backup, err := source.NewBackup(path)
		if err != nil {
			return err
		}
		finished := false
		defer func() {
			if !finished {
				backup.Finish()
			}
		}()
		for {
			if err := ctx.Err(); err != nil {
				return err
			}
			more, err := backup.Step(128)
			if err != nil {
				var failure *driver.Error
				if !errors.As(err, &failure) || (failure.Code()&255 != 5 && failure.Code()&255 != 6) {
					return err
				}
				timer := time.NewTimer(20 * time.Millisecond)
				select {
				case <-ctx.Done():
					timer.Stop()
					return ctx.Err()
				case <-timer.C:
				}
				continue
			}
			if !more {
				break
			}
		}
		err = backup.Finish()
		finished = true
		return err
	})
	if err != nil {
		return info, err
	}
	snapshot, err := OpenReadOnly(ctx, path)
	if err != nil {
		return info, err
	}
	var check string
	err = snapshot.QueryRowContext(ctx, `PRAGMA quick_check`).Scan(&check)
	closeErr := snapshot.Close()
	if err != nil {
		return info, err
	}
	if closeErr != nil {
		return info, closeErr
	}
	if check != "ok" {
		return info, errors.New("backup integrity check failed")
	}
	file, err := os.OpenFile(path, os.O_RDWR, 0600)
	if err != nil {
		return info, err
	}
	hash := sha256.New()
	info.Bytes, err = io.Copy(hash, file)
	if err == nil {
		err = file.Sync()
	}
	closeErr = file.Close()
	if err != nil {
		return info, err
	}
	if closeErr != nil {
		return info, closeErr
	}
	info.SHA256 = hex.EncodeToString(hash.Sum(nil))
	// Link gives an atomic O_EXCL-style publish on the same local filesystem.
	if err := os.Link(path, destination); err != nil {
		return info, err
	}
	handle, err := os.Open(parent)
	if err != nil {
		return info, err
	}
	defer handle.Close()
	return info, handle.Sync()
}
