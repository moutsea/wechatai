package app_test

import (
	"database/sql"
	"testing"
	"time"

	"github.com/moutsea/wechatai/backend/internal/app"
	"github.com/moutsea/wechatai/backend/internal/automation"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

func TestIncomingWechatWakesWaitingReminderExactlyOnce(t *testing.T) {
	a, id := setup(t)
	ctx := t.Context()
	h, err := a.Accounts.Acquire(ctx, id, false)
	if err != nil {
		t.Fatal(err)
	}
	defer h.Close()
	now := a.Now().UnixMilli()
	term := a.Now().AddDate(0, 0, 10).UnixMilli()
	when := term - int64(7*24*time.Hour/time.Millisecond)
	target := automation.ReminderTarget{ConnectionID: "default", Generation: "generation-one"}
	run := func(fn func(*sql.Tx) error) {
		t.Helper()
		if err := sqlite.Within(ctx, h.DB, fn); err != nil {
			t.Fatal(err)
		}
	}
	var observed int64
	run(func(tx *sql.Tx) error {
		if err := automation.SyncMembership(ctx, tx, term, now, false); err != nil {
			return err
		}
		s, err := automation.Membership(ctx, tx)
		if err != nil {
			return err
		}
		// Inbound can arrive during the initial target lookup, before anyone
		// has deferred the occurrence. Even a same-millisecond wake fences it.
		if err := automation.WakeMembership(ctx, tx, when); err != nil {
			return err
		}
		if err := automation.DeferMembership(ctx, tx, term, s.Revision, 7, 0, "waiting", when); err != nil {
			return err
		}
		current, err := automation.Membership(ctx, tx)
		if err != nil {
			return err
		}
		if current.Items[0].State != "pending" || current.Revision <= s.Revision {
			t.Fatal("initial target lookup survived new context")
		}
		observed = current.Revision
		return automation.DeferMembership(ctx, tx, term, observed, 7, 0, "waiting", when)
	})
	incoming := func(tx *sql.Tx) (bool, error) {
		return app.RecordWechatInbound(ctx, tx, "bot:user:1", "default", []byte(`{"message_type":1,"context_token":"fixture-token"}`), when+1)
	}
	if _, err = h.DB.Exec("CREATE TRIGGER fail_wake BEFORE UPDATE ON membership_reminders BEGIN SELECT RAISE(ABORT,'test'); END"); err != nil {
		t.Fatal(err)
	}
	if err := sqlite.Within(ctx, h.DB, func(tx *sql.Tx) error { _, err := incoming(tx); return err }); err == nil {
		t.Fatal("partial incoming message committed")
	}
	if _, err = h.DB.Exec("DROP TRIGGER fail_wake"); err != nil {
		t.Fatal(err)
	}
	run(func(tx *sql.Tx) error {
		fresh, err := incoming(tx)
		if err != nil {
			return err
		}
		if !fresh {
			t.Fatal("message lost on rollback")
		}
		// An old completion cannot overwrite a newly reopened occurrence.
		if err := automation.SettleMembership(ctx, tx, term, 7, 0, "sent", when+1); err != nil {
			return err
		}
		if err := automation.DeferMembership(ctx, tx, term, observed, 7, 0, "waiting", when+1); err != nil {
			return err
		}
		stale, err := automation.ClaimMembership(ctx, tx, term, observed, 7, 0, target, "old target", when+1)
		if err != nil {
			return err
		}
		if stale != nil {
			t.Fatal("stale target claimed after wake")
		}
		s, err := automation.Membership(ctx, tx)
		if err != nil {
			return err
		}
		item, err := automation.ClaimMembership(ctx, tx, term, s.Revision, 7, 0, target, "reminder", when+1)
		if err != nil {
			return err
		}
		if item == nil {
			t.Fatal("message did not wake reminder")
		}
		return automation.SettleMembership(ctx, tx, term, 7, item.Attempts, "sent", when+2)
	})
	run(func(tx *sql.Tx) error {
		fresh, err := incoming(tx)
		if fresh {
			t.Fatal("duplicate inbound message")
		}
		return err
	})
	s, err := automation.Membership(ctx, h.DB)
	if err != nil || s.Items[0].State != "sent" || s.Items[0].Attempts != 1 {
		t.Fatal("duplicate reminder delivery")
	}
}
