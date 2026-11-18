package app

import (
	"database/sql"
	"encoding/json"
	"errors"
	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/platform/config"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
	"net/http/httptest"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/moutsea/wechatai/backend/contract"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

type fixtureProvider []string

func (p fixtureProvider) Capabilities() []string { return p }

func TestReadinessComposesIndependentModuleRegistrations(t *testing.T) {
	c := contract.Load()
	ctx := t.Context()
	a, err := New(ctx, config.Config{DataDir: filepath.Join(t.TempDir(), "accounts"), MaxOpenAccounts: 2, RPCSecret: strings.Repeat("s", 32), EncryptionKey: strings.Repeat("e", 32)})
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	if !slices.Equal(a.features.Capabilities(), CompiledCapabilities()) {
		t.Fatal("CLI and runtime disagree")
	}
	id := accounts.ID(strings.Repeat("a", 64))
	h, err := a.Accounts.Acquire(ctx, id, true)
	if err != nil {
		t.Fatal(err)
	}
	defer h.Close()
	if err := sqlite.Within(ctx, h.DB, func(tx *sql.Tx) error { return accounts.Bind(ctx, tx, id, "user", 1, "prepared") }); err != nil {
		t.Fatal(err)
	}
	activate := func() error {
		_, err := a.Registry.Dispatch(ctx, rpc.Command{Version: rpc.Version, AccountID: id, OwnerID: "user", RouteEpoch: 1, Principal: rpc.Principal{Scope: rpc.Migration}, Method: "migration.activate", Params: json.RawMessage("[]")})
		return err
	}
	var failure *rpc.Error
	if err := activate(); !errors.As(err, &failure) || failure.Status != 503 {
		t.Fatalf("partial config activated: %v", err)
	}
	a.features = contract.Providers{
		Methods: []contract.Provider{fixtureProvider(c.Methods)},
		Actions: []contract.Provider{fixtureProvider(c.Actions)},
		Streams: []contract.Provider{fixtureProvider(c.Streams)},
		Runtime: []contract.Provider{fixtureProvider(c.Runtime)},
	}
	check := func(want int) {
		t.Helper()
		w := httptest.NewRecorder()
		a.Handler("test").ServeHTTP(w, httptest.NewRequest("GET", "/readyz", nil))
		var result struct{ Missing []string }
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil || w.Code != want || !slices.Equal(contract.Missing(a.features.Capabilities()), result.Missing) {
			t.Fatalf("readiness: %d %s", w.Code, w.Body.String())
		}
	}
	check(200)
	if err := activate(); err != nil {
		t.Fatalf("complete fixture activation: %v", err)
	}
	state, err := accounts.State(ctx, h.DB)
	if err != nil || state.Phase != "active" {
		t.Fatalf("activation was not persisted: %v %v", state, err)
	}
	a.features.Runtime = nil
	check(503)
}
