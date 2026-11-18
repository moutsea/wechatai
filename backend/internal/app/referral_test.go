package app_test

import (
	"testing"

	"github.com/moutsea/wechatai/backend/internal/rpc"
)

func TestReferralAttestationAndAtomicWallet(t *testing.T) {
	a, id := setup(t)
	h, err := a.Accounts.Acquire(t.Context(), id, false)
	if err != nil {
		t.Fatal(err)
	}
	defer h.Close()
	sql := func(query string) {
		t.Helper()
		if _, err := h.DB.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	scalar := func(query string, want int64) {
		t.Helper()
		var got int64
		if err := h.DB.QueryRow(query).Scan(&got); err != nil || got != want {
			t.Fatal(query, got, want, err)
		}
	}
	award := func(scope rpc.Scope, epoch int64, args []string, status int) {
		t.Helper()
		w := call(t, a, id, scope, "target-user", "applyReferralReward", args, epoch, true)
		if w.Code != status {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	pair := []string{"target-user", "invitee", "another-user"}
	award(rpc.User, 1, pair, 403)
	award(rpc.Referral, 2, pair, 409)
	award(rpc.Referral, 1, []string{"target-user", "inviter", "another-user"}, 403)
	award(rpc.Referral, 1, []string{"target-user", "other", "another-user"}, 403)
	award(rpc.Referral, 1, []string{"target-user", "invitee", "target-user"}, 403)
	award(rpc.Referral, 1, pair[:2], 400)
	sql("UPDATE credit_debt SET amount=125000 WHERE id=1")
	sql("CREATE TRIGGER reject_test_grant BEFORE INSERT ON credit_ledger WHEN NEW.kind='referral' BEGIN SELECT RAISE(ABORT,'test failure'); END")
	award(rpc.Referral, 1, pair, 500)
	scalar("SELECT count(*) FROM credit_buckets", 0)
	scalar("SELECT count(*) FROM credit_ledger", 0)
	scalar("SELECT amount FROM credit_debt", 125000)
	sql("DROP TRIGGER reject_test_grant")
	for range 3 {
		award(rpc.Referral, 1, pair, 200)
	}
	scalar("SELECT remaining FROM credit_buckets WHERE id='referral:target-user:invitee'", 475000)
	scalar("SELECT amount FROM credit_debt", 0)
	scalar("SELECT amount FROM credit_ledger WHERE id='grant:referral:target-user:invitee' AND note LIKE '%25.000 credits'", 500000)
	scalar("SELECT COUNT(*) FROM credit_ledger WHERE kind='referral'", 1)
}
