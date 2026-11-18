package automation_test

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	"github.com/moutsea/wechatai/backend/internal/automation"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

func TestRenewalFencesClaimedReminderAndReplayDoesNotResetRetry(t *testing.T) {
	ctx := context.Background()
	db, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "reminders.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := automation.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UnixMilli()
	term := now + 10*86400000
	within := func(fn func(*sql.Tx) error) {
		t.Helper()
		if err := sqlite.Within(ctx, db, fn); err != nil {
			t.Fatal(err)
		}
	}
	within(func(tx *sql.Tx) error { return automation.SyncMembership(ctx, tx, term, now, false) })
	now = term - 7*86400000
	var claimed *automation.MembershipItem
	within(func(tx *sql.Tx) error {
		state, err := automation.Membership(ctx, tx)
		if err != nil {
			return err
		}
		claimed, err = automation.ClaimMembership(ctx, tx, term, state.Revision, 7, 0, automation.ReminderTarget{ConnectionID: "default", Generation: "binding-v1"}, "固定正文", now)
		return err
	})
	if claimed == nil || claimed.Attempts != 1 {
		t.Fatal("reminder was not claimed")
	}
	within(func(tx *sql.Tx) error {
		return automation.SettleMembership(ctx, tx, term, 7, claimed.Attempts, "retry", now)
	})
	before, err := automation.Membership(ctx, db)
	if err != nil {
		t.Fatal(err)
	}
	within(func(tx *sql.Tx) error { return automation.SyncMembership(ctx, tx, term, now, false) })
	after, err := automation.Membership(ctx, db)
	if err != nil {
		t.Fatal(err)
	}
	if after.Revision != before.Revision || after.Items[0].RetryAt != before.Items[0].RetryAt {
		t.Fatal("sync replay reset retry")
	}
	newTerm := term + 30*86400000
	within(func(tx *sql.Tx) error { return automation.SyncMembership(ctx, tx, newTerm, now, false) })
	within(func(tx *sql.Tx) error {
		return automation.SettleMembership(ctx, tx, term, 7, claimed.Attempts, "sent", now)
	})
	after, err = automation.Membership(ctx, db)
	if err != nil || after.PlanUntil != newTerm || after.Items[0].State != "pending" {
		t.Fatalf("old send corrupted renewal: %+v %v", after, err)
	}
}
