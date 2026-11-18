package app_test

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"maps"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/app"
	"github.com/moutsea/wechatai/backend/internal/automation"
	"github.com/moutsea/wechatai/backend/internal/credits"
	"github.com/moutsea/wechatai/backend/internal/membership"
	"github.com/moutsea/wechatai/backend/internal/platform/config"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

func setup(t *testing.T) (*app.App, accounts.ID) {
	t.Helper()
	a, err := app.New(context.Background(), config.Config{DataDir: filepath.Join(t.TempDir(), "accounts"), MaxOpenAccounts: 8, RPCSecret: "test-only-rpc-signature-key-at-least-32", EncryptionKey: "test-only-encryption-key-at-least-32", FreeDailyUnits: 100000, PlusDailyUnits: 1000000})
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 1, 31, 8, 30, 0, 0, time.UTC)
	a.Now = func() time.Time { return now }
	a.Signer.Now = a.Now
	t.Cleanup(func() {
		if err := a.Close(); err != nil {
			t.Error(err)
		}
	})
	id := accounts.ID(strings.Repeat("a", 64))
	h, err := a.Accounts.Acquire(context.Background(), id, true)
	if err != nil {
		t.Fatal(err)
	}
	defer h.Close()
	if err := sqlite.Within(context.Background(), h.DB, func(tx *sql.Tx) error { return accounts.Bind(context.Background(), tx, id, "target-user", 1, "active") }); err != nil {
		t.Fatal(err)
	}
	return a, id
}

func TestWebCryptoPaymentCrossesHTTPAndCommitsAllAccountModules(t *testing.T) {
	data, err := os.ReadFile("../rpc/testdata/worker-request.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Secret                             string
		Timestamp                          int64
		RequestID, Origin, Body, Signature string
	}
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	var command rpc.Command
	if err := json.Unmarshal([]byte(fixture.Body), &command); err != nil {
		t.Fatal(err)
	}
	a, err := app.New(context.Background(), config.Config{DataDir: filepath.Join(t.TempDir(), "accounts"), MaxOpenAccounts: 8, RPCSecret: fixture.Secret, EncryptionKey: "test-only-encryption-key-at-least-32", FreeDailyUnits: 100000, PlusDailyUnits: 1000000})
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	a.Now = func() time.Time { return time.UnixMilli(fixture.Timestamp) }
	a.Signer.Now = a.Now
	handle, err := a.Accounts.Acquire(context.Background(), command.AccountID, true)
	if err != nil {
		t.Fatal(err)
	}
	defer handle.Close()
	if err := sqlite.Within(context.Background(), handle.DB, func(tx *sql.Tx) error {
		return accounts.Bind(context.Background(), tx, command.AccountID, command.OwnerID, command.RouteEpoch, "active")
	}); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		request := httptest.NewRequest(http.MethodPost, fixture.Origin+"/internal/v1/commands", strings.NewReader(fixture.Body))
		request.Header.Set(rpc.HeaderTime, "1794960000000")
		request.Header.Set(rpc.HeaderRequestID, fixture.RequestID)
		request.Header.Set(rpc.HeaderSignature, fixture.Signature)
		response := httptest.NewRecorder()
		a.Handler("cross-language-test").ServeHTTP(response, request)
		if response.Code != 200 {
			t.Fatalf("Worker payment failed: %s", response.Body.String())
		}
	}
	var payments int
	if err := handle.DB.QueryRow(`SELECT COUNT(*) FROM payments`).Scan(&payments); err != nil {
		t.Fatal(err)
	}
	balance, err := (credits.Wallet{Now: a.Now}).Balance(context.Background(), handle.DB)
	if err != nil {
		t.Fatal(err)
	}
	state, err := automation.Membership(context.Background(), handle.DB)
	if err != nil {
		t.Fatal(err)
	}
	if payments != 1 || balance != 1000000 || len(state.Items) != 2 {
		t.Fatalf("payment chain incomplete: payments=%d balance=%d reminders=%d", payments, balance, len(state.Items))
	}
}

func TestStaleFreezeCannotCloseCurrentAccountAndSuccessfulFreezeStopsWrites(t *testing.T) {
	a, id := setup(t)
	stale := call(t, a, id, rpc.Migration, "", "migration.freeze", []any{}, 2, true)
	if stale.Code != 409 {
		t.Fatalf("stale freeze accepted: %s", stale.Body.String())
	}
	event := membership.Payment{ID: "payment-before-freeze", Kind: "membership", Months: 1}
	if response := call(t, a, id, rpc.Billing, "", "applyPayment", []any{event}, 1, true); response.Code != 200 {
		t.Fatalf("stale freeze denied current work: %s", response.Body.String())
	}
	frozen := call(t, a, id, rpc.Migration, "", "migration.freeze", []any{}, 1, true)
	if frozen.Code != 200 {
		t.Fatalf("freeze failed: %s", frozen.Body.String())
	}
	event.ID = "payment-after-freeze"
	if response := call(t, a, id, rpc.Billing, "", "applyPayment", []any{event}, 1, true); response.Code != 503 {
		t.Fatalf("frozen account accepted write: %s", response.Body.String())
	}
}

func call(t *testing.T, a *app.App, id accounts.ID, scope rpc.Scope, actor, method string, args any, epoch int64, signed bool) *httptest.ResponseRecorder {
	t.Helper()
	params, err := json.Marshal(args)
	if err != nil {
		t.Fatal(err)
	}
	command := rpc.Command{Version: rpc.Version, AccountID: id, OwnerID: "target-user", RouteEpoch: epoch, Principal: rpc.Principal{Scope: scope, UserID: actor, AdminUntil: a.Now().Add(time.Hour).UnixMilli()}, Method: method, Params: params}
	return signedCall(t, a, command, "1.1.5", signed)
}

func signedCall(t *testing.T, a *app.App, command rpc.Command, edgeRelease string, signed bool) *httptest.ResponseRecorder {
	t.Helper()
	if command.Method == "connectorUpdateNotice" || command.Method == "readConnectorUpdateNotice" {
		command.ConnectorRelease = edgeRelease
	}
	body, err := json.Marshal(command)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "http://backend.internal/internal/v1/commands", bytes.NewReader(body))
	if signed {
		if err := a.Signer.Sign(request, body, "test-request-original"); err != nil {
			t.Fatal(err)
		}
	}
	response := httptest.NewRecorder()
	a.Handler("fixture-version").ServeHTTP(response, request)
	return response
}

func TestAuthenticatedPaymentToDurableWalletAndSchedule(t *testing.T) {
	a, id := setup(t)
	payment := membership.Payment{ID: "checkout:original", Kind: "membership", Months: 1}
	for range 2 {
		response := call(t, a, id, rpc.Billing, "", "applyPayment", []any{payment}, 1, true)
		if response.Code != http.StatusOK {
			t.Fatalf("payment failed: %d %s", response.Code, response.Body.String())
		}
	}
	h, err := a.Accounts.Acquire(context.Background(), id, false)
	if err != nil {
		t.Fatal(err)
	}
	defer h.Close()
	until, err := membership.PlanUntil(context.Background(), h.DB)
	if err != nil {
		t.Fatal(err)
	}
	want := time.Date(2026, 2, 28, 8, 30, 0, 0, time.UTC).UnixMilli()
	if until != want {
		t.Fatalf("duplicate extended term or calendar drift: %d, want %d", until, want)
	}
	balance, err := (credits.Wallet{Now: a.Now}).Balance(context.Background(), h.DB)
	if err != nil || balance != 1000000 {
		t.Fatalf("daily grant differs: %d %v", balance, err)
	}
	state, err := automation.Membership(context.Background(), h.DB)
	if err != nil || state.PlanUntil != until || len(state.Items) != 2 {
		t.Fatalf("schedule did not commit: %+v %v", state, err)
	}
	response := call(t, a, id, rpc.User, "target-user", "applyPayment", []any{payment}, 1, true)
	if response.Code != http.StatusForbidden {
		t.Fatalf("user can grant payments: %s", response.Body.String())
	}
	response = call(t, a, id, rpc.Billing, "", "applyPayment", []any{payment}, 2, true)
	if response.Code != http.StatusConflict {
		t.Fatalf("stale route accepted: %s", response.Body.String())
	}
	response = call(t, a, id, rpc.Billing, "", "applyPayment", []any{payment}, 1, false)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("unsigned origin request accepted: %s", response.Body.String())
	}
}

func TestFailureAfterPaymentAndGrantRollsBackEveryModule(t *testing.T) {
	a, id := setup(t)
	h, err := a.Accounts.Acquire(context.Background(), id, false)
	if err != nil {
		t.Fatal(err)
	}
	defer h.Close()
	_, err = h.DB.Exec(`CREATE TRIGGER block_schedule BEFORE UPDATE ON membership_reminders BEGIN SELECT RAISE(ABORT,'fixture failure'); END`)
	if err != nil {
		t.Fatal(err)
	}
	payment := membership.Payment{ID: "checkout:retry", Kind: "membership", Months: 12}
	response := call(t, a, id, rpc.Billing, "", "applyPayment", []any{payment}, 1, true)
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("expected scheduling failure: %s", response.Body.String())
	}
	until, err := membership.PlanUntil(context.Background(), h.DB)
	if err != nil || until != 0 {
		t.Fatalf("partial membership committed: %d %v", until, err)
	}
	for _, table := range []string{"payments", "credit_buckets", "credit_ledger"} {
		var count int
		if err := h.DB.QueryRow(`SELECT COUNT(*) FROM ` + table).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 0 {
			t.Fatalf("partial %s state committed: %d", table, count)
		}
	}
	if _, err := h.DB.Exec(`DROP TRIGGER block_schedule`); err != nil {
		t.Fatal(err)
	}
	response = call(t, a, id, rpc.Billing, "", "applyPayment", []any{payment}, 1, true)
	if response.Code != http.StatusOK {
		t.Fatalf("retry failed: %s", response.Body.String())
	}
}

func TestAdminActorAndTargetOwnerStaySeparate(t *testing.T) {
	a, id := setup(t)
	input := map[string]string{"id": "f1111111-1111-4111-8111-111111111111", "reason": "赠送测试"}
	for range 2 {
		response := call(t, a, id, rpc.Admin, "operator-user", "adminGiftPlus", []any{"operator-user", input}, 1, true)
		if response.Code != http.StatusOK {
			t.Fatalf("admin could not operate on target: %s", response.Body.String())
		}
	}
	response := call(t, a, id, rpc.Admin, "operator-user", "adminMembership", []any{}, 1, true)
	if response.Code != http.StatusOK {
		t.Fatalf("read failed: %s", response.Body.String())
	}
	var result struct {
		Data struct {
			Gifts []membership.Gift `json:"gifts"`
		} `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Data.Gifts) != 1 || result.Data.Gifts[0].ActorID != "operator-user" {
		t.Fatalf("gift identity or dedupe changed: %+v", result)
	}
	response = call(t, a, id, rpc.Admin, "operator-user", "adminGiftPlus", []any{"forged-actor", input}, 1, true)
	if response.Code != http.StatusForbidden {
		t.Fatalf("actor spoof accepted: %s", response.Body.String())
	}
}

func TestIncompleteBackendCannotPassCutoverReadiness(t *testing.T) {
	a, _ := setup(t)
	response := httptest.NewRecorder()
	a.Handler("fixture-version").ServeHTTP(response, httptest.NewRequest(http.MethodGet, "http://backend.internal/readyz", nil))
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("partial backend marked ready: %d", response.Code)
	}
	var result struct {
		OK      bool     `json:"ok"`
		Missing []string `json:"missing"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.OK || len(result.Missing) == 0 {
		t.Fatalf("readiness did not report missing handlers: %+v", result)
	}
}

func TestPaymentRequiresAmountsBeforeDeduplication(t *testing.T) {
	a, account := setup(t)
	ctx := t.Context()
	handle, err := a.Accounts.Acquire(ctx, account, false)
	if err != nil {
		t.Fatal(err)
	}
	defer handle.Close()
	for _, kind := range []string{"purchase", "subscription"} {
		for _, field := range []string{"units", "expires"} {
			for _, omit := range []bool{true, false} {
				id := fmt.Sprintf("%s-%s-%v", kind, field, omit)
				valid := map[string]any{"id": id, "kind": kind, "units": 5000, "expires": a.Now().AddDate(0, 1, 0).UnixMilli()}
				if kind == "subscription" {
					valid["units"] = 0
				}
				broken := maps.Clone(valid)
				if omit {
					delete(broken, field)
				} else {
					broken[field] = nil
				}
				pay := func(v any) int { return call(t, a, account, rpc.Billing, "", "applyPayment", []any{v}, 1, true).Code }
				if got := pay(broken); got != 400 {
					t.Fatalf("%s: invalid event returned %d", id, got)
				}
				var count int
				if err := handle.DB.QueryRow("SELECT count(*) FROM payments WHERE id=?", id).Scan(&count); err != nil || count != 0 {
					t.Fatalf("invalid payment recorded: %v %d", err, count)
				}
				if pay(valid) != 200 || pay(valid) != 200 {
					t.Fatalf("%s: valid retry failed", id)
				}
				if kind == "purchase" {
					var units int
					if err := handle.DB.QueryRow("SELECT remaining FROM credit_buckets WHERE id=?", "payment:"+id).Scan(&units); err != nil || units != 5000 {
						t.Fatalf("%s: %d %v", id, units, err)
					}
				}
			}
		}
	}
}

func TestMembershipReadsOneSnapshotDuringConcurrentGifts(t *testing.T) {
	a, id := setup(t)
	var group sync.WaitGroup
	start, done := make(chan struct{}), make(chan struct{})
	for range 3 {
		group.Go(func() {
			<-start
			for {
				select {
				case <-done:
					return
				default:
				}
				response := call(t, a, id, rpc.Admin, "operator", "adminMembership", []any{}, 1, true)
				var view struct {
					Data struct {
						PlanUntil int64
						Gifts     []membership.Gift
					}
				}
				if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &view) != nil {
					t.Error("membership read failed")
					return
				}
				if len(view.Data.Gifts) > 0 && view.Data.Gifts[0].PlanUntil != view.Data.PlanUntil {
					t.Error("term and latest gift came from different commits")
					return
				}
			}
		})
	}
	close(start)
	defer func() { close(done); group.Wait() }()
	for i := range 35 {
		input := map[string]string{"id": fmt.Sprintf("00000000-0000-4000-8000-%012x", i+1), "reason": "snapshot"}
		if response := call(t, a, id, rpc.Admin, "operator", "adminGiftPlus", []any{"operator", input}, 1, true); response.Code != 200 {
			t.Fatalf("gift: %s", response.Body.String())
		}
	}
}

func TestTopupAndRepeatedGiftPreserveUnrelatedHolds(t *testing.T) {
	for _, mode := range []string{"purchase", "gift replay"} {
		t.Run(mode, func(t *testing.T) {
			a, id := setup(t)
			ctx := t.Context()
			h, err := a.Accounts.Acquire(ctx, id, false)
			if err != nil {
				t.Fatal(err)
			}
			defer h.Close()
			gift := []any{"operator", map[string]string{"id": "f1111111-1111-4111-8111-111111111111", "reason": "赠送测试"}}
			adminGift := func() {
				t.Helper()
				if r := call(t, a, id, rpc.Admin, "operator", "adminGiftPlus", gift, 1, true); r.Code != 200 {
					t.Fatal(r.Body.String())
				}
			}
			if mode == "gift replay" {
				adminGift()
			}
			yesterday := a.Now()
			wallet := credits.Wallet{Now: func() time.Time { return yesterday }}
			err = sqlite.Within(ctx, h.DB, func(tx *sql.Tx) error {
				if err := wallet.Grant(ctx, tx, "original", "purchase", 10000, credits.MaxUnits, "test"); err != nil {
					return err
				}
				return wallet.Reserve(ctx, tx, "other-job", 1000)
			})
			if err != nil {
				t.Fatal(err)
			}
			a.Now = func() time.Time { return yesterday.Add(24 * time.Hour) }
			a.Signer.Now = a.Now
			if mode == "gift replay" {
				adminGift()
			} else {
				payment := map[string]any{"id": "topup", "kind": "purchase", "units": 6000, "expires": credits.MaxUnits}
				for range 2 {
					if r := call(t, a, id, rpc.Billing, "", "applyPayment", []any{payment}, 1, true); r.Code != 200 {
						t.Fatal(r.Body.String())
					}
				}
				var granted int
				if err := h.DB.QueryRow("SELECT amount FROM credit_ledger WHERE id='grant:payment:topup'").Scan(&granted); err != nil || granted != 6000 {
					t.Fatalf("purchase: %d %v", granted, err)
				}
			}
			var held string
			if err := h.DB.QueryRow("SELECT status FROM reservations WHERE id='other-job'").Scan(&held); err != nil || held != "held" {
				t.Fatalf("unrelated hold: %s %v", held, err)
			}
			var daily int
			if err := h.DB.QueryRow("SELECT count(*) FROM credit_ledger WHERE kind='daily' AND createdAt>?", yesterday.UnixMilli()).Scan(&daily); err != nil || daily != 0 {
				t.Fatalf("unexpected daily: %d %v", daily, err)
			}
		})
	}
}

func TestFrozenAccountRejectsPublicReadsAndAllowsInspection(t *testing.T) {
	a, id := setup(t)
	if res := call(t, a, id, rpc.Migration, "", "migration.freeze", []any{}, 1, true); res.Code != 200 {
		t.Fatal(res.Body.String())
	}
	for _, tc := range []struct {
		scope        rpc.Scope
		user, method string
		args         []any
	}{
		{rpc.Receiver, "", "receiverStatus", []any{}},
		{rpc.Notification, "", "notificationCredentialValid", []any{"plugin", "old-token"}},
		{rpc.User, "target-user", "imageAsset", []any{"fixture"}},
	} {
		r := call(t, a, id, tc.scope, tc.user, tc.method, tc.args, 1, true)
		if r.Code != 503 {
			t.Fatal(tc.method, r.Code, r.Body.String())
		}
	}
	if res := call(t, a, id, rpc.Migration, "", "migration.status", []any{}, 1, true); res.Code != 200 {
		t.Fatal(res.Body.String())
	}
}
