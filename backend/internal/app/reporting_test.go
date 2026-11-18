package app_test

import (
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/credits"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
	"github.com/moutsea/wechatai/backend/internal/reporting"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

func TestAdminReportUsesBeijingWindowAndLeavesAccountUntouched(t *testing.T) {
	a, id := setup(t)
	ctx := t.Context()
	h, err := a.Accounts.Acquire(ctx, id, false)
	if err != nil {
		t.Fatal(err)
	}
	defer h.Close()
	_, today, _ := credits.DayWindow(a.Now())
	start := today - 29*86400000
	_, err = h.DB.Exec(`INSERT INTO settings VALUES('connection','{"status":"connected"}'),('wechat:second:connection','{"status":"connected"}');
        INSERT INTO wechat_links VALUES('second','fixture',1);
        INSERT INTO usage VALUES('old',?,5,250),('recent',?,12,1500),('future',?,10,1000);
        INSERT INTO call_failures VALUES('recent',?,'superseded',400),('failed',?,'timeout',NULL)`,
		start-1, start, a.Now().UnixMilli()+1, start, start)
	if err != nil {
		t.Fatal(err)
	}
	response := call(t, a, id, rpc.Admin, "operator", "adminStats", []any{}, 1, true)
	var report struct{ Data reporting.Stats }
	if err := json.Unmarshal(response.Body.Bytes(), &report); response.Code != 200 || err != nil {
		t.Fatalf("report: %v %s", err, response.Body)
	}
	s := report.Data
	if s.Links != 2 || s.Connected != 1 || s.Requests != 3 || s.FailedRequests != 1 || s.LastFailureStatus != nil || s.Credits != 2.75 ||
		len(s.Daily) != 1 || s.Daily[0].Requests != 1 || s.Daily[0].FailedRequests != 1 || s.Daily[0].Credits != 1.5 ||
		len(s.PluginUsage) != 1 || s.PluginUsage[0].PluginID != "legacy" {
		t.Fatalf("report mismatch: %+v", s)
	}
	var writes int
	if err := h.DB.QueryRow("SELECT (SELECT count(*) FROM credit_ledger)+(SELECT count(*) FROM wechat_links WHERE id='default')").Scan(&writes); err != nil || writes != 0 {
		t.Fatal("report modified account", writes, err)
	}
	for _, tc := range []struct {
		method string
		scope  rpc.Scope
		actor  string
		params []any
		epoch  int64
		want   int
	}{
		{"adminStats", rpc.User, "target-user", []any{}, 1, 403},
		{"adminStats", rpc.Admin, "operator", []any{}, 2, 409},
		{"referralWechatIdentity", rpc.User, "target-user", []any{}, 1, 403},
		{"notificationCredentialValid", rpc.User, "target-user", []any{"p", "credential"}, 1, 403},
	} {
		if r := call(t, a, id, tc.scope, tc.actor, tc.method, tc.params, tc.epoch, true); r.Code != tc.want {
			t.Fatalf("%s: %s", tc.method, r.Body)
		}
	}
}

func TestReferralIdentityPrefersRecordedUseAndCachesOriginalBinding(t *testing.T) {
	a, id := setup(t)
	ctx := t.Context()
	h, err := a.Accounts.Acquire(ctx, id, false)
	if err != nil {
		t.Fatal(err)
	}
	defer h.Close()
	check := func(want any) {
		t.Helper()
		r := call(t, a, id, rpc.Referral, "", "referralWechatIdentity", []any{}, 1, true)
		var result struct{ Data any }
		if err := json.Unmarshal(r.Body.Bytes(), &result); r.Code != 200 || err != nil || result.Data != want {
			t.Fatalf("identity: %+v %d %v", result, r.Code, err)
		}
	}
	check(nil)
	save := func(key string, value any) {
		t.Helper()
		if err := sqlite.Within(ctx, h.DB, func(tx *sql.Tx) error { return accounts.SetSetting(ctx, tx, key, value) }); err != nil {
			t.Fatal(err)
		}
	}
	key, err := a.Box.Encrypt(`{"userId":"original"}`, string(id)+":wechat")
	if err != nil {
		t.Fatal(err)
	}
	connection := func(s string) any { return map[string]string{"encryptedCredentials": s} }
	save("connection", connection(key))
	digest := fmt.Sprintf("%x", sha256.Sum256([]byte("wechatai:referral:original")))
	check(digest)
	save("connection", connection("invalid"))
	check(digest)
	used := strings.Repeat("d", 64)
	save("referralUse", map[string]string{"hash": used})
	check(used)
	save("referralUse", nil)
	save("referralWechatHash", nil)
	r := call(t, a, id, rpc.Referral, "", "referralWechatIdentity", []any{}, 1, true)
	if r.Code < 500 {
		t.Fatalf("corrupt binding: %d", r.Code)
	}
	var count int
	if err := h.DB.QueryRow("SELECT count(*) FROM settings WHERE key='referralWechatHash' AND value!='null'").Scan(&count); err != nil || count != 0 {
		t.Fatal("corrupt binding cached", err, count)
	}
}

func TestNotificationCredentialRotationAndRevocation(t *testing.T) {
	a, id := setup(t)
	h, err := a.Accounts.Acquire(t.Context(), id, false)
	if err != nil {
		t.Fatal(err)
	}
	defer h.Close()
	check := func(credential string, want bool) {
		t.Helper()
		r := call(t, a, id, rpc.Notification, "", "notificationCredentialValid", []any{"plugin", credential}, 1, true)
		var result struct{ Data *bool }
		if err := json.Unmarshal(r.Body.Bytes(), &result); r.Code != 200 || err != nil || result.Data == nil || *result.Data != want {
			t.Fatalf("credential result: %s %v", r.Body, err)
		}
	}
	store := func(token string) {
		t.Helper()
		digest := fmt.Sprintf("%x", sha256.Sum256([]byte(token)))
		if _, err := h.DB.Exec("INSERT OR REPLACE INTO notification_tokens VALUES(?,?)", "plugin", digest); err != nil {
			t.Fatal(err)
		}
	}
	check("one", false)
	store("one")
	check("one", true)
	store("two")
	check("one", false)
	check("two", true)
	if _, err := h.DB.Exec("DELETE FROM notification_tokens WHERE pluginId='plugin'"); err != nil {
		t.Fatal(err)
	}
	check("two", false)
}
