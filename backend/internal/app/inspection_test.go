package app_test

import (
	"bytes"
	"context"
	"database/sql"
	_ "embed"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/app"
	"github.com/moutsea/wechatai/backend/internal/credits"
	"github.com/moutsea/wechatai/backend/internal/membership"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

func TestReadOnlyCompatibilityCheckRejectsUnknownFutureModule(t *testing.T) {
	a, id := setup(t)
	ctx := context.Background()
	if count, err := app.CheckData(ctx, a.Config.DataDir); err != nil || count != 1 {
		t.Fatalf("initial check: %d %v", count, err)
	}
	handle, err := a.Accounts.Acquire(ctx, id, false)
	if err != nil {
		t.Fatal(err)
	}
	defer handle.Close()
	if _, err := handle.DB.ExecContext(ctx, `INSERT INTO backend_schema_migrations VALUES('future_module',1,'unknown')`); err != nil {
		t.Fatal(err)
	}
	if _, err := app.CheckData(ctx, a.Config.DataDir); err == nil {
		t.Fatal("old binary accepted unknown future module")
	}
}

func TestReadOnlyCheckDoesNotCreateMissingDatabase(t *testing.T) {
	path := t.TempDir() + "/missing"
	if _, err := app.CheckData(context.Background(), path); !os.IsNotExist(err) {
		t.Fatalf("missing directory created: %v", err)
	}
}

//go:embed testdata/legacy-business-tables.sql
var legacyBusinessTables string

func completeLegacyLayout(t *testing.T, db *sql.DB) {
	t.Helper()
	if _, err := db.Exec(legacyBusinessTables); err != nil {
		t.Fatal(err)
	}
	for _, schema := range []sqlite.Schema{credits.Schema(), membership.Schema()} {
		if _, err := db.Exec(schema.Migrations[0].SQL); err != nil {
			t.Fatal(err)
		}
	}
}

func TestPreflightChecksLegacyIdentityAndWallet(t *testing.T) {
	dir := t.TempDir()
	if err := os.Chmod(dir, 0700); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, strings.Repeat("1", 64)+".sqlite")
	if err := os.WriteFile(path, nil, 0600); err != nil {
		t.Fatal(err)
	}
	check := func(want bool) {
		t.Helper()
		n, err := app.CheckData(t.Context(), dir)
		if (err == nil) != want || (want && n != 1) {
			t.Fatalf("check = %d, %v", n, err)
		}
	}
	check(false)
	db, err := sqlite.Open(t.Context(), path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err = db.Exec("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO settings VALUES('ownerId','\"legacy-user\"')"); err != nil {
		t.Fatal(err)
	}
	check(false)
	if _, err = db.Exec("CREATE TABLE credit_buckets(id TEXT PRIMARY KEY,kind TEXT,remaining INTEGER,expires INTEGER); CREATE TABLE credit_ledger(id TEXT PRIMARY KEY,kind TEXT,amount INTEGER,note TEXT,createdAt INTEGER)"); err != nil {
		t.Fatal(err)
	}
	check(false)
	completeLegacyLayout(t, db)
	check(true)
	if _, err = db.Exec("DELETE FROM settings WHERE key='ownerId'"); err != nil {
		t.Fatal(err)
	}
	check(false)
}

func TestLegacyStatusAndBackupUseSameReadOnlyIdentity(t *testing.T) {
	a, _ := setup(t)
	id := accounts.ID(strings.Repeat("7", 64))
	file := filepath.Join(a.Config.DataDir, string(id)+".sqlite")
	db, err := sqlite.Open(t.Context(), file)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 INSERT INTO settings VALUES('ownerId','"target-user"');
 CREATE TABLE credit_buckets(id TEXT PRIMARY KEY,kind TEXT,remaining INTEGER,expires INTEGER);
 CREATE TABLE credit_ledger(id TEXT PRIMARY KEY,kind TEXT,amount INTEGER,note TEXT,createdAt INTEGER);
 INSERT INTO credit_ledger VALUES('payment:original','purchase',42000,'充值',123)`)
	if err != nil {
		t.Fatal(err)
	}
	completeLegacyLayout(t, db)
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	status := call(t, a, id, rpc.Migration, "", "migration.status", []any{}, 2, true)
	if status.Code != 200 || !strings.Contains(status.Body.String(), `"phase":"legacy"`) || !strings.Contains(status.Body.String(), `"routeEpoch":0`) {
		t.Fatal(status.Code, status.Body.String())
	}
	if w := call(t, a, id, rpc.Migration, "", "migration.freeze", []any{}, 2, true); w.Code != 503 {
		t.Fatal("unimported account accepted freeze", w.Code)
	}
	dest := filepath.Join(t.TempDir(), "snapshot")
	manifest, err := app.BackupData(t.Context(), a.Config.DataDir, dest)
	if err != nil {
		t.Fatal(err)
	}
	var found bool
	for _, entry := range manifest.Accounts {
		if entry.AccountID == id {
			found = entry.Phase == "legacy" && entry.RouteEpoch == 0 && entry.UserID == "target-user"
		}
	}
	if !found {
		t.Fatal(manifest.Accounts)
	}
	if n, err := app.CheckData(t.Context(), dest); err != nil || n != 2 {
		t.Fatal(n, err)
	}
	snapshot, err := accounts.OpenSnapshot(t.Context(), dest, id)
	if err != nil {
		t.Fatal(err)
	}
	defer snapshot.Close()
	var amount int
	if err := snapshot.QueryRow("SELECT amount FROM credit_ledger WHERE id='payment:original'").Scan(&amount); err != nil || amount != 42000 {
		t.Fatal("snapshot lost payment", amount, err)
	}
	staging := filepath.Join(t.TempDir(), "prepared")
	if err := app.PrepareLegacy(t.Context(), dest, staging, id, "different-owner", 2); !errors.Is(err, accounts.ErrIdentity) {
		t.Fatalf("wrong owner: %v", err)
	}
	if _, err := os.Stat(staging); !os.IsNotExist(err) {
		t.Fatal("failed validation published a destination")
	}
	if err := app.PrepareLegacy(t.Context(), dest, staging, id, "target-user", 2); err != nil {
		t.Fatal(err)
	}
	if err := app.PrepareLegacy(t.Context(), dest, staging, id, "target-user", 2); !os.IsExist(err) {
		t.Fatalf("replaced an existing target: %v", err)
	}
	if err := app.PrepareLegacy(t.Context(), staging, filepath.Join(t.TempDir(), "another"), id, "target-user", 3); err == nil {
		t.Fatal("repurposed an already bound snapshot")
	}
	after, err := os.ReadFile(file)
	if err != nil || !bytes.Equal(before, after) {
		t.Fatal("status/backup changed the source", err)
	}

	t.Run("previously inspected but unbound", func(t *testing.T) {
		db, err := sqlite.Open(t.Context(), file)
		if err != nil {
			t.Fatal(err)
		}
		schema := accounts.Schema()
		if err := sqlite.Migrate(t.Context(), db, schema.Module, schema.Migrations[:1]); err != nil {
			t.Fatal(err)
		}
		if err := db.Close(); err != nil {
			t.Fatal(err)
		}
		before, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		w := call(t, a, id, rpc.Migration, "", "migration.status", []any{}, 2, true)
		if w.Code != 200 || !strings.Contains(w.Body.String(), `"phase":"unbound"`) {
			t.Fatal(w.Code, w.Body.String())
		}
		if w := call(t, a, id, rpc.Migration, "", "migration.freeze", []any{}, 2, true); w.Code != 503 {
			t.Fatal(w.Code)
		}
		after, err := os.ReadFile(file)
		if err != nil || !bytes.Equal(before, after) {
			t.Fatal("unbound source was changed", err)
		}
	})
}

func TestReleasePreflightUsesServingDirectoryPolicy(t *testing.T) {
	a, _ := setup(t)
	dir := a.Config.DataDir
	if err := os.Chmod(dir, 0755); err != nil {
		t.Fatal(err)
	}
	for _, probe := range []func() error{
		func() error { _, err := app.CheckData(t.Context(), dir); return err },
		func() error {
			service, err := app.New(t.Context(), a.Config)
			if service != nil {
				service.Close()
			}
			return err
		},
	} {
		if err := probe(); err == nil || !strings.Contains(err.Error(), "0700") {
			t.Fatal("insecure directory accepted", err)
		}
	}
	if n, err := app.InspectData(t.Context(), dir); err != nil || n != 1 {
		t.Fatal("read-only inspection", n, err)
	}
}
