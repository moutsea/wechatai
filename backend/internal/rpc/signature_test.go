package rpc_test

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/moutsea/wechatai/backend/internal/rpc"
)

func TestSignedRequestBindsTargetBodyAndTime(t *testing.T) {
	now := time.Date(2026, 11, 17, 12, 0, 0, 0, time.UTC)
	signer, err := rpc.NewSigner("test-only-independent-rpc-key-with-32-bytes")
	if err != nil {
		t.Fatal(err)
	}
	signer.Now = func() time.Time { return now }
	body := []byte(`{"event":"original"}`)
	request := httptest.NewRequest("POST", "https://backend.example/internal/v1/commands?version=1", nil)
	if err := signer.Sign(request, body, "request-test-original"); err != nil {
		t.Fatal(err)
	}
	if err := signer.Verify(request, body); err != nil {
		t.Fatal(err)
	}
	if err := signer.Verify(request, []byte(`{"event":"changed"}`)); err == nil {
		t.Fatal("modified body accepted")
	}
	changed := request.Clone(request.Context())
	changed.URL.Path = "/internal/v1/other"
	if err := signer.Verify(changed, body); err == nil {
		t.Fatal("modified target accepted")
	}
	changed = request.Clone(request.Context())
	changed.Method = "GET"
	if err := signer.Verify(changed, body); err == nil {
		t.Fatal("modified method accepted")
	}
	now = now.Add(61 * time.Second)
	if err := signer.Verify(request, body); err == nil {
		t.Fatal("expired signature accepted")
	}
}

func TestMethodCapabilityBoundary(t *testing.T) {
	for _, tc := range []struct {
		method  string
		scope   rpc.Scope
		allowed bool
	}{
		{"api", rpc.User, true}, {"applyPayment", rpc.User, false}, {"applyPayment", rpc.Billing, true},
		{"adminGiftPlus", rpc.Connector, false}, {"adminGiftPlus", rpc.Admin, true},
		{"notificationRequest", rpc.Notification, true}, {"executionRequest", rpc.Notification, false},
		{"migration.activate", rpc.User, false}, {"alarm", rpc.Admin, false},
	} {
		command := rpc.Command{Version: rpc.Version, AccountID: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", OwnerID: "verified-user", RouteEpoch: 1, Principal: rpc.Principal{Scope: tc.scope, UserID: "verified-user"}, Method: tc.method, Params: []byte(`{}`)}
		if got := command.Validate() == nil; got != tc.allowed {
			t.Errorf("%s/%s: allowed=%v", tc.scope, tc.method, got)
		}
	}
}
