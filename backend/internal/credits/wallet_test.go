package credits_test

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/moutsea/wechatai/backend/internal/credits"
	"github.com/moutsea/wechatai/backend/internal/jobs"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

func setup(t *testing.T) (context.Context, *sql.DB, credits.Wallet, *time.Time) {
	t.Helper()
	ctx := context.Background()
	db, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "account.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := credits.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 11, 17, 12, 0, 0, 0, time.UTC)
	return ctx, db, credits.Wallet{Now: func() time.Time { return now }}, &now
}

func transact(t *testing.T, ctx context.Context, db *sql.DB, fn func(*sql.Tx) error) {
	t.Helper()
	if err := sqlite.Within(ctx, db, fn); err != nil {
		t.Fatal(err)
	}
}

func balance(t *testing.T, ctx context.Context, db *sql.DB, wallet credits.Wallet) int64 {
	t.Helper()
	value, err := wallet.Balance(ctx, db)
	if err != nil {
		t.Fatal(err)
	}
	return value
}

func TestDailyTopupDoesNotRefillSpentCreditsAndRepaysDebt(t *testing.T) {
	ctx, db, w, _ := setup(t)
	transact(t, ctx, db, func(tx *sql.Tx) error { return w.Daily(ctx, tx, 100000) })
	transact(t, ctx, db, func(tx *sql.Tx) error {
		_, err := w.Charge(ctx, tx, "model:1", 120000, 120000, "usage")
		return err
	})
	transact(t, ctx, db, func(tx *sql.Tx) error { return w.Daily(ctx, tx, 100000) })
	if got := balance(t, ctx, db, w); got != -20000 {
		t.Fatalf("daily replay refilled credits: %d", got)
	}
	transact(t, ctx, db, func(tx *sql.Tx) error { return w.Daily(ctx, tx, 200000) })
	if got := balance(t, ctx, db, w); got != 80000 {
		t.Fatalf("incorrect upgrade topup: %d", got)
	}
	var grants int64
	if err := db.QueryRow(`SELECT SUM(amount) FROM credit_ledger WHERE kind='daily'`).Scan(&grants); err != nil {
		t.Fatal(err)
	}
	if grants != 200000 {
		t.Fatalf("granted %d", grants)
	}
}

func TestConcurrentDuplicateChargeAndGrant(t *testing.T) {
	ctx, db, w, now := setup(t)
	var wg sync.WaitGroup
	errorsFound := make(chan error, 40)
	for range 20 {
		wg.Go(func() {
			errorsFound <- sqlite.Within(ctx, db, func(tx *sql.Tx) error {
				return w.Grant(ctx, tx, "payment:original", "purchase", 100000, now.Add(24*time.Hour).UnixMilli(), "充值")
			})
		})
	}
	wg.Wait()
	for range 20 {
		wg.Go(func() {
			errorsFound <- sqlite.Within(ctx, db, func(tx *sql.Tx) error {
				billed, err := w.Charge(ctx, tx, "message:original", 1000, 2000, "usage")
				if err == nil && billed != 1000 {
					return fmt.Errorf("billed %d", billed)
				}
				return err
			})
		})
	}
	wg.Wait()
	close(errorsFound)
	for err := range errorsFound {
		if err != nil {
			t.Fatal(err)
		}
	}
	if got := balance(t, ctx, db, w); got != 99000 {
		t.Fatalf("duplicate changed balance: %d", got)
	}
	var entries int
	if err := db.QueryRow(`SELECT COUNT(*) FROM credit_ledger`).Scan(&entries); err != nil {
		t.Fatal(err)
	}
	if entries != 2 {
		t.Fatalf("duplicate ledger entries: %d", entries)
	}
}

func TestHoldsStayIsolatedAndRefundRepaysDebt(t *testing.T) {
	ctx, db, w, now := setup(t)
	transact(t, ctx, db, func(tx *sql.Tx) error {
		return w.Grant(ctx, tx, "purchase:1", "purchase", 60000, now.Add(time.Hour).UnixMilli(), "充值")
	})
	transact(t, ctx, db, func(tx *sql.Tx) error { return w.Reserve(ctx, tx, "a", 20000) })
	transact(t, ctx, db, func(tx *sql.Tx) error { return w.Reserve(ctx, tx, "b", 30000) })
	budget := int64(100000)
	transact(t, ctx, db, func(tx *sql.Tx) error { _, err := w.Settle(ctx, tx, "a", 100000, &budget); return err })
	if got := balance(t, ctx, db, w); got != -70000 {
		t.Fatalf("other hold was consumed: %d", got)
	}
	transact(t, ctx, db, func(tx *sql.Tx) error { _, err := w.Settle(ctx, tx, "b", 0, nil); return err })
	transact(t, ctx, db, func(tx *sql.Tx) error { _, err := w.Settle(ctx, tx, "b", 0, nil); return err })
	if got := balance(t, ctx, db, w); got != -40000 {
		t.Fatalf("refund/debt mismatch: %d", got)
	}
	transact(t, ctx, db, func(tx *sql.Tx) error {
		return w.Grant(ctx, tx, "purchase:2", "purchase", 50000, now.Add(time.Hour).UnixMilli(), "充值")
	})
	if got := balance(t, ctx, db, w); got != 10000 {
		t.Fatalf("debt was not repaid: %d", got)
	}
}

func TestCrossModuleFailureRollsBackChargeAndJobCompletion(t *testing.T) {
	ctx, db, w, now := setup(t)
	if err := jobs.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	q := jobs.Queue{Now: w.Now}
	var job *jobs.Job
	transact(t, ctx, db, func(tx *sql.Tx) error {
		if err := w.Grant(ctx, tx, "grant", "purchase", 10000, now.Add(time.Hour).UnixMilli(), "充值"); err != nil {
			return err
		}
		if _, err := q.Enqueue(ctx, tx, jobs.Job{ID: "run", Kind: "model", Payload: []byte(`{}`), Safety: jobs.NoReplay}); err != nil {
			return err
		}
		var err error
		job, err = q.Claim(ctx, tx, "model", time.Minute)
		return err
	})
	want := errors.New("outbox insert failed")
	err := sqlite.Within(ctx, db, func(tx *sql.Tx) error {
		if _, err := w.Charge(ctx, tx, "run", 3000, 3000, "usage"); err != nil {
			return err
		}
		if err := q.Complete(ctx, tx, "run", job.Lease, []byte(`{"ok":true}`)); err != nil {
			return err
		}
		return want
	})
	if !errors.Is(err, want) {
		t.Fatalf("got %v", err)
	}
	if got := balance(t, ctx, db, w); got != 10000 {
		t.Fatalf("partial debit: %d", got)
	}
	stored, err := q.Get(ctx, db, "run")
	if err != nil {
		t.Fatal(err)
	}
	if stored.State != "leased" {
		t.Fatalf("partial acknowledgement: %s", stored.State)
	}
	transact(t, ctx, db, func(tx *sql.Tx) error {
		if _, err := w.Charge(ctx, tx, "run", 3000, 3000, "usage"); err != nil {
			return err
		}
		return q.Complete(ctx, tx, "run", job.Lease, []byte(`{"ok":true}`))
	})
	if got := balance(t, ctx, db, w); got != 7000 {
		t.Fatalf("settlement did not commit: %d", got)
	}
	if _, err := db.Exec(`UPDATE credit_ledger SET amount=0`); err == nil {
		t.Fatal("ledger can be changed")
	}
	if _, err := db.Exec(`DELETE FROM credit_ledger`); err == nil {
		t.Fatal("ledger can be deleted")
	}
}

func TestTokenUnitsAndBeijingDayBoundary(t *testing.T) {
	for _, tc := range []struct{ input, output, want int64 }{{0, 0, 0}, {1, 0, 1}, {5, 0, 1}, {0, 1, 2}, {5000, 1000, 2600}} {
		got, err := credits.TokenUnits(tc.input, tc.output)
		if err != nil || got != tc.want {
			t.Fatalf("%+v: %d %v", tc, got, err)
		}
	}
	if _, err := credits.TokenUnits(-1, 0); err == nil {
		t.Fatal("accepted negative token count")
	}
	day, start, end := credits.DayWindow(time.Date(2026, 11, 17, 16, 0, 0, 0, time.UTC))
	if day != "2026-11-18" || end-start != 86400000 {
		t.Fatalf("wrong boundary: %s %d %d", day, start, end)
	}
}
