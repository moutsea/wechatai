package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/moutsea/wechatai/backend/internal/platform/config"
)

func TestStandbyDoesNotServeAccounts(t *testing.T) {
	t.Setenv("WECHATAI_DEPLOY_MODE", "standby")
	t.Setenv("WECHATAI_LISTEN", "127.0.0.1:8088")
	t.Setenv("WECHATAI_RPC_SECRET_FILE", filepath.Join(t.TempDir(), "no-secrets"))
	c, err := config.Load()
	if err != nil || !c.Standby {
		t.Fatalf("standby config: %v", err)
	}
	mux := standbyHandler()
	for _, probe := range []struct {
		method, path string
		code         int
	}{
		{"GET", "/healthz", 200}, {"GET", "/readyz", 503},
		{"POST", "/internal/v1/commands", 404}, {"GET", "/internal/v1/receiver/a/1", 404},
		{"POST", "/internal/v1/executor/a/1/claim", 404},
	} {
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest(probe.method, probe.path, nil))
		if w.Code != probe.code {
			t.Fatalf("%s: got %d", probe.path, w.Code)
		}
		if w.Code != http.StatusNotFound {
			var body struct {
				Mode, Version string
				OK            bool
			}
			if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil || body.Mode != "standby" || body.Version != version || body.OK != (w.Code == 200) {
				t.Fatal("unexpected probe", w.Body.String())
			}
		}
	}
	t.Setenv("WECHATAI_LISTEN", "0.0.0.0:8088")
	if _, err := config.Load(); err == nil {
		t.Fatal("standby accepted a public listener")
	}
}

func TestStandbyRefusesExistingAccountData(t *testing.T) {
	dir := t.TempDir()
	if err := checkStandbyDirectory(dir); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "account.sqlite"), []byte("fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := checkStandbyDirectory(dir); err == nil {
		t.Fatal("standby accepted existing data")
	}
}
