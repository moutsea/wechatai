package jobs_test

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/jobs"
	"github.com/moutsea/wechatai/backend/internal/platform/cryptobox"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

func TestLeaseRecoveryDoesNotReplayUnknownEffects(t *testing.T) {
	ctx := context.Background()
	db, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "queue.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := jobs.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	q := jobs.Queue{Now: func() time.Time { return now }}
	var model, lookup *jobs.Job
	within := func(fn func(*sql.Tx) error) {
		t.Helper()
		if err := sqlite.Within(ctx, db, fn); err != nil {
			t.Fatal(err)
		}
	}
	within(func(tx *sql.Tx) error {
		for _, job := range []jobs.Job{
			{ID: "model", Kind: "model", Payload: []byte(`{}`), Safety: jobs.NoReplay},
			{ID: "lookup", Kind: "lookup", Payload: []byte(`{}`), Safety: jobs.ReadOnly},
		} {
			if _, err := q.Enqueue(ctx, tx, job); err != nil {
				return err
			}
		}
		var err error
		model, err = q.Claim(ctx, tx, "model", time.Second)
		if err != nil {
			return err
		}
		lookup, err = q.Claim(ctx, tx, "lookup", time.Second)
		return err
	})
	now = now.Add(2 * time.Second)
	within(func(tx *sql.Tx) error { return q.Recover(ctx, tx) })
	m, err := q.Get(ctx, db, "model")
	if err != nil || m.State != "uncertain" {
		t.Fatalf("unknown model was replayed: %+v %v", m, err)
	}
	var next *jobs.Job
	within(func(tx *sql.Tx) error { var err error; next, err = q.Claim(ctx, tx, "lookup", time.Minute); return err })
	if next == nil || next.Lease == lookup.Lease || next.Attempts != 2 {
		t.Fatalf("safe recovery failed: %+v", next)
	}
	for _, stale := range []*jobs.Job{model, lookup} {
		err := sqlite.Within(ctx, db, func(tx *sql.Tx) error { return q.Complete(ctx, tx, stale.ID, stale.Lease, []byte(`{"ok":true}`)) })
		if !errors.Is(err, jobs.ErrStaleLease) {
			t.Fatalf("late result accepted: %v", err)
		}
	}
	within(func(tx *sql.Tx) error { return q.Complete(ctx, tx, next.ID, next.Lease, []byte(`{"ok":true}`)) })
	within(func(tx *sql.Tx) error { return q.Complete(ctx, tx, next.ID, next.Lease, []byte(`{"ok":true}`)) })
	err = sqlite.Within(ctx, db, func(tx *sql.Tx) error { return q.Complete(ctx, tx, next.ID, next.Lease, []byte(`{"ok":false}`)) })
	if !errors.Is(err, jobs.ErrConflict) {
		t.Fatalf("changed result accepted: %v", err)
	}
}

func TestEnqueueConflictAndRestartPersistence(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "persistent.sqlite")
	db, err := sqlite.Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	if err := jobs.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	q := jobs.Queue{}
	job := jobs.Job{ID: "once", Kind: "notification", Payload: []byte(`{"text":"original"}`), Safety: jobs.NoReplay}
	for _, expected := range []bool{true, false} {
		err = sqlite.Within(ctx, db, func(tx *sql.Tx) error {
			inserted, err := q.Enqueue(ctx, tx, job)
			if inserted != expected {
				t.Errorf("inserted=%v", inserted)
			}
			return err
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	job.Payload = []byte(`{"text":"different"}`)
	err = sqlite.Within(ctx, db, func(tx *sql.Tx) error { _, err := q.Enqueue(ctx, tx, job); return err })
	if !errors.Is(err, jobs.ErrConflict) {
		t.Fatalf("changed intent accepted: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	db, err = sqlite.Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	stored, err := q.Get(ctx, db, "once")
	if err != nil || stored == nil || string(stored.Payload) != `{"text":"original"}` {
		t.Fatalf("lost work after restart: %+v %v", stored, err)
	}
}

func TestMigrationOnlyDiscardsTerminalInputs(t *testing.T) {
	ctx := t.Context()
	db, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "old-queue.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	schema := jobs.Schema()
	if err := sqlite.Migrate(ctx, db, schema.Module, schema.Migrations[:1]); err != nil {
		t.Fatal(err)
	}
	states := []string{"complete", "expired", "cancelled", "uncertain", "ready", "leased"}
	for _, state := range states {
		if _, err := db.Exec("INSERT INTO backend_jobs(id,kind,payload,fingerprint,safety,state,availableAt,createdAt,updatedAt) VALUES(?,'job',x'7b7d','fingerprint','no_replay',?,0,0,0)", state, state); err != nil {
			t.Fatal(err)
		}
	}
	if err = jobs.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	for _, state := range states {
		var size int
		var fingerprint string
		if err := db.QueryRow("SELECT length(payload),fingerprint FROM backend_jobs WHERE id=?", state).Scan(&size, &fingerprint); err != nil {
			t.Fatal(err)
		}
		terminal := state == "complete" || state == "expired" || state == "cancelled"
		if (size == 0) != terminal || fingerprint != "fingerprint" {
			t.Fatalf("wrong retention for %s", state)
		}
	}
}

func TestUnreadableInputBacksOffWithoutPublishingLease(t *testing.T) {
	ctx := t.Context()
	db, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "account.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := jobs.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	clock := func() time.Time { return now }
	old, err := cryptobox.New(strings.Repeat("old-key", 8))
	if err != nil {
		t.Fatal(err)
	}
	key, err := cryptobox.New(strings.Repeat("new-key", 8))
	if err != nil {
		t.Fatal(err)
	}
	q := jobs.Queue{Now: clock, Box: old, AccountID: accounts.ID(strings.Repeat("a", 64))}
	tx := func(f func(*sql.Tx) error) {
		t.Helper()
		if err := sqlite.Within(ctx, db, f); err != nil {
			t.Fatal(err)
		}
	}
	add := func(id string) {
		tx(func(tx *sql.Tx) error {
			_, e := q.Enqueue(ctx, tx, jobs.Job{ID: id, Kind: jobs.ExecutionKind, Safety: jobs.NoReplay, Payload: []byte(`{"kind":"attachments"}`)})
			return e
		})
	}
	claim := func() *jobs.Job {
		t.Helper()
		var job *jobs.Job
		tx(func(tx *sql.Tx) error {
			var e error
			job, e = q.Claim(ctx, tx, jobs.ExecutionKind, time.Minute)
			return e
		})
		return job
	}
	first, second := strings.Repeat("b", 64), strings.Repeat("c", 64)
	add(first)
	q.Box = key
	add(second)
	if claim() != nil {
		t.Fatal("unreadable job dispatched")
	}
	j, err := q.Get(ctx, db, first)
	if err != nil || j.InputError != "unreadable" || len(j.Payload) == 0 || j.Attempts != 0 || j.Lease != "" {
		t.Fatal(j, err)
	}
	if j := claim(); j == nil || j.ID != second {
		t.Fatal("healthy job blocked", j)
	}
	now = now.Add(time.Minute)
	q.Box = old
	if j := claim(); j == nil || j.ID != first || j.Attempts != 1 || j.InputError != "" {
		t.Fatal("failed to restore job", j)
	}
}
