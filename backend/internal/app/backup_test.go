package app_test

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/moutsea/wechatai/backend/internal/app"
)

func TestAccountBackupHasCompleteManifestAndCanBeCheckedIndependently(t *testing.T) {
	a, id := setup(t)
	destination := filepath.Join(t.TempDir(), "generation")
	manifest, err := app.BackupData(context.Background(), a.Config.DataDir, destination)
	if err != nil {
		t.Fatal(err)
	}
	if len(manifest.Accounts) != 1 || manifest.Accounts[0].AccountID != id || manifest.Accounts[0].UserID != "target-user" || manifest.Accounts[0].RouteEpoch != 1 {
		t.Fatal("backup omitted account identity")
	}
	data, err := os.ReadFile(filepath.Join(destination, "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	var persisted app.BackupManifest
	if err := json.Unmarshal(data, &persisted); err != nil {
		t.Fatal(err)
	}
	if persisted.Accounts[0].SHA256 != manifest.Accounts[0].SHA256 {
		t.Fatal("backup checksum not persisted")
	}
	if count, err := app.CheckData(context.Background(), destination); err != nil || count != 1 {
		t.Fatalf("backup not independently usable: %d %v", count, err)
	}
	if _, err := app.BackupData(context.Background(), a.Config.DataDir, destination); !os.IsExist(err) {
		t.Fatal("backup generation overwritten")
	}
}
