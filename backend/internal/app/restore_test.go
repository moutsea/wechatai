package app_test

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/app"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

func legacyWallet(t *testing.T) (string, accounts.ID, *sql.DB) {
	t.Helper()
	dir := t.TempDir()
	if err := os.Chmod(dir, 0700); err != nil {
		t.Fatal(err)
	}
	id := accounts.ID(strings.Repeat("b", 64))
	db, err := sqlite.Open(t.Context(), filepath.Join(dir, string(id)+".sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	completeLegacyLayout(t, db)
	_, err = db.Exec(`CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 INSERT INTO settings VALUES('ownerId','"target-user"'); UPDATE credit_debt SET amount=26000 WHERE id=1;
 INSERT INTO credit_buckets VALUES('paid','purchase',42000,9999999999999)`)
	if err != nil {
		t.Fatal(err)
	}
	return dir, id, db
}

func TestPreparationVerifiesStandaloneGenerationBeforeOpeningSQLite(t *testing.T) {
	ctx := t.Context()
	source, id, _ := legacyWallet(t)
	parent := t.TempDir()
	check := func(t *testing.T, generation string, want string) {
		t.Helper()
		target := filepath.Join(parent, "prepared")
		err := app.PrepareLegacy(ctx, generation, target, id, "target-user", 2)
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Fatalf("expected %q, got %v", want, err)
		}
		if _, err := os.Stat(target); !os.IsNotExist(err) {
			t.Fatal("failed preparation published a target", err)
		}
	}
	check(t, source, "manifest")
	for _, kind := range []string{"main", "wal", "bytes", "owner", "phase", "epoch", "duplicate", "filename", "format", "missing"} {
		t.Run(kind, func(t *testing.T) {
			generation := filepath.Join(t.TempDir(), "generation")
			manifest, err := app.BackupData(ctx, source, generation)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := app.BackupData(ctx, generation, filepath.Join(parent, "resealed")); err == nil {
				t.Fatal("accepted a backup as a raw export")
			}
			path := filepath.Join(generation, manifest.Accounts[0].File)
			want := "manifest"
			switch kind {
			case "main", "wal":
				db, err := sqlite.Open(ctx, path)
				if err != nil {
					t.Fatal(err)
				}
				defer db.Close()
				// Flush the journal mode change before recording the sealed main bytes.
				if _, err := db.Exec("PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
					t.Fatal(err)
				}
				before, err := os.ReadFile(path)
				if err != nil {
					t.Fatal(err)
				}
				if _, err := db.Exec("UPDATE credit_buckets SET remaining=17000"); err != nil {
					t.Fatal(err)
				}
				if kind == "wal" {
					after, err := os.ReadFile(path)
					if err != nil || !bytes.Equal(before, after) {
						t.Fatal("fixture unexpectedly modified the main file")
					}
					manifest.Accounts[0].SHA256 = fmt.Sprintf("%x", sha256.Sum256(after))
					want = "journal"
				} else {
					if err := db.Close(); err != nil {
						t.Fatal(err)
					}
					want = "checksum"
				}
			case "bytes":
				manifest.Accounts[0].Bytes++
				want = "size"
			case "owner":
				manifest.Accounts[0].UserID = "someone-else"
				want = "identity"
			case "phase":
				manifest.Accounts[0].Phase = "active"
				want = "identity"
			case "epoch":
				manifest.Accounts[0].RouteEpoch = 2
				want = "identity"
			case "duplicate":
				manifest.Accounts = append(manifest.Accounts, manifest.Accounts[0])
			case "filename":
				manifest.Accounts[0].File = "../foreign.sqlite"
			case "format":
				manifest.Format = "other"
				want = "format"
			case "missing":
				manifest.Accounts = nil
			}
			data, err := json.Marshal(manifest)
			if err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(generation, "manifest.json"), data, 0600); err != nil {
				t.Fatal(err)
			}
			check(t, generation, want)
		})
	}
}

func TestIncompleteAccountHistoryCannotBeRecreatedDuringMigration(t *testing.T) {
	for _, damage := range []string{"DROP TABLE plugins", "DROP TABLE messages", "DROP TABLE notification_tokens", "DROP TABLE execution_jobs", "ALTER TABLE sessions RENAME COLUMN data TO lost", "DROP TABLE credit_debt", "DELETE FROM credit_debt", "DROP TABLE payments", "DROP TABLE membership_gifts", "DROP TABLE reservations", "ALTER TABLE platform_metering RENAME COLUMN instanceId TO unknown"} {
		t.Run(damage, func(t *testing.T) {
			dir, id, db := legacyWallet(t)
			if _, err := db.Exec(damage); err != nil {
				t.Fatal(err)
			}
			if _, err := app.CheckData(t.Context(), dir); err == nil {
				t.Fatal("preflight accepted incomplete financial history")
			}
			dest := filepath.Join(t.TempDir(), "backup")
			if _, err := app.BackupData(t.Context(), dir, dest); err == nil {
				t.Fatal("backed up incomplete financial history")
			}
			if _, err := os.Stat(dest); !os.IsNotExist(err) {
				t.Fatal("published incomplete generation", err)
			}
			// An older backup writer could legitimately have sealed incomplete history.
			// Valid bytes and metadata must not allow migration to invent missing data.
			if err := os.Mkdir(dest, 0700); err != nil {
				t.Fatal(err)
			}
			name := string(id) + ".sqlite"
			info, err := sqlite.Backup(t.Context(), db, filepath.Join(dest, name))
			if err != nil {
				t.Fatal(err)
			}
			manifest := app.BackupManifest{Format: "wechatai-vps-backup-v1", Accounts: []app.BackupAccount{{AccountID: id, UserID: "target-user", Phase: "legacy", File: name, BackupInfo: info}}}
			content, err := json.Marshal(manifest)
			if err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(dest, "manifest.json"), content, 0600); err != nil {
				t.Fatal(err)
			}
			staged := filepath.Join(t.TempDir(), "prepared")
			if err := app.PrepareLegacy(t.Context(), dest, staged, id, "target-user", 2); err == nil {
				t.Fatal("migration invented missing history")
			}
			if _, err := os.Stat(staged); !os.IsNotExist(err) {
				t.Fatal("published incomplete account", err)
			}

		})
	}
}

func TestRequestsNeverUpgradeOlderBoundAccounts(t *testing.T) {
	for _, phase := range []string{"prepared", "frozen", "active"} {
		t.Run(phase, func(t *testing.T) {
			a, _ := setup(t)
			ctx := t.Context()
			dir, id, db := legacyWallet(t)
			for _, s := range app.Schemas() {
				if s.Module == "openclaw" {
					continue
				}
				if err := s.Apply(ctx, db); err != nil {
					t.Fatal(err)
				}
			}
			if err := sqlite.Within(ctx, db, func(tx *sql.Tx) error { return accounts.Bind(ctx, tx, id, "target-user", 3, "prepared") }); err != nil {
				t.Fatal(err)
			}
			if _, err := db.Exec("UPDATE backend_account SET phase=?", phase); err != nil {
				t.Fatal(err)
			}
			if err := db.Close(); err != nil {
				t.Fatal(err)
			}
			name := string(id) + ".sqlite"
			if err := os.Rename(filepath.Join(dir, name), filepath.Join(a.Config.DataDir, name)); err != nil {
				t.Fatal(err)
			}
			read := func(dir string) []byte {
				t.Helper()
				b, err := os.ReadFile(filepath.Join(dir, name))
				if err != nil {
					t.Fatal(err)
				}
				return b
			}
			before := read(a.Config.DataDir)
			// Even a legitimate signed request to the correct route cannot upgrade a cold database.
			for _, command := range []struct {
				scope         rpc.Scope
				actor, method string
				args          []any
				epoch         int64
			}{
				{rpc.Admin, "operator", "adminStats", []any{}, 3}, {rpc.User, "target-user", "identify", []any{"target-user"}, 4},
				{rpc.Migration, "", "migration.freeze", []any{}, 3}, {rpc.Migration, "", "migration.activate", []any{}, 3},
			} {
				r := call(t, a, id, command.scope, command.actor, command.method, command.args, command.epoch, true)
				if r.Code != 503 {
					t.Fatal(command.method, r.Code, r.Body.String())
				}
			}
			if _, err := a.Accounts.Acquire(ctx, id, true); !errors.Is(err, sqlite.ErrUpgradeRequired) {
				t.Fatal("provision modified an existing file", err)
			}
			if _, err := app.CheckData(ctx, a.Config.DataDir); !errors.Is(err, sqlite.ErrUpgradeRequired) {
				t.Fatal("release preflight accepted old schema", err)
			}
			backup := filepath.Join(t.TempDir(), "backup")
			if _, err := app.BackupData(ctx, a.Config.DataDir, backup); err != nil {
				t.Fatal(err)
			}
			for range 2 {
				staged := filepath.Join(t.TempDir(), "upgrade")
				if err := app.UpgradeAccount(ctx, backup, staged, id, "target-user", 3); err != nil {
					t.Fatal(err)
				}
				if n, err := app.CheckData(ctx, staged); err != nil || n != 1 {
					t.Fatal(n, err)
				}
				q, err := accounts.OpenSnapshot(ctx, staged, id)
				if err != nil {
					t.Fatal(err)
				}
				state, err := accounts.State(ctx, q)
				if err != nil || state.Phase != phase || state.Match(id, "target-user", 3) != nil {
					t.Fatal(state, err)
				}
				var balance, debt int
				err = q.QueryRow("SELECT remaining,amount FROM credit_buckets,credit_debt WHERE credit_debt.id=1").Scan(&balance, &debt)
				q.Close()
				if err != nil || balance != 42000 || debt != 26000 {
					t.Fatal(balance, debt, err)
				}
			}
			if !bytes.Equal(before, read(a.Config.DataDir)) {
				t.Fatal("inspection, denied traffic or offline upgrade changed the original schema")
			}
		})
	}
}

func TestRecoverUnboundRequiresIndependentMatchingIdentity(t *testing.T) {
	ctx := t.Context()
	dir, id, db := legacyWallet(t)
	if err := accounts.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	backup := filepath.Join(t.TempDir(), "backup")
	if _, err := app.BackupData(ctx, dir, backup); err != nil {
		t.Fatal(err)
	}
	dest := filepath.Join(t.TempDir(), "staged")
	mapping := filepath.Join(t.TempDir(), "original.json")
	writeMapping := func(account, owner string) {
		t.Helper()
		b, _ := json.Marshal(map[string]string{"format": "wechatai-original-identity-v1", "accountId": account, "userId": owner})
		if err := os.WriteFile(mapping, b, 0600); err != nil {
			t.Fatal(err)
		}
	}
	recover := func() error { return app.RecoverUnbound(ctx, backup, dest, id, "target-user", 4, mapping) }
	// Passing the backup's own metadata is not an independent identity record.
	if err := os.WriteFile(mapping, []byte(fmt.Sprintf(`{"accountId":%q,"userId":"target-user","phase":"unbound"}`, string(id))), 0600); err != nil {
		t.Fatal(err)
	}
	if err := recover(); !errors.Is(err, accounts.ErrIdentity) {
		t.Fatal("accepted a manifest entry as identity evidence", err)
	}
	for _, identity := range [][2]string{{string(id), "another"}, {strings.Repeat("c", 64), "target-user"}} {
		writeMapping(identity[0], identity[1])
		if err := recover(); !errors.Is(err, accounts.ErrIdentity) {
			t.Fatal(err)
		}
		if _, err := os.Stat(dest); !os.IsNotExist(err) {
			t.Fatal("unexpected published target", err)
		}
	}
	writeMapping(string(id), "target-user")
	if err := recover(); err != nil {
		t.Fatal(err)
	}
	staged, err := accounts.OpenSnapshot(ctx, dest, id)
	if err != nil {
		t.Fatal(err)
	}
	defer staged.Close()
	state, err := accounts.State(ctx, staged)
	if err != nil || state.Match(id, "target-user", 4) != nil || state.Phase != "prepared" {
		t.Fatal(state, err)
	}
	var amount int
	if err := staged.QueryRow("SELECT amount FROM credit_debt WHERE id=1").Scan(&amount); err != nil || amount != 26000 {
		t.Fatal(amount, err)
	}
	if _, err := accounts.State(ctx, db); !errors.Is(err, sql.ErrNoRows) {
		t.Fatal("source acquired a binding", err)
	}
	if err := recover(); !errors.Is(err, os.ErrExist) {
		t.Fatal("existing target replaced", err)
	}
}
