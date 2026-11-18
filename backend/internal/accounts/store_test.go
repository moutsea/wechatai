package accounts_test

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/credits"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

func TestHandlesBoundedWithoutEvictingBusyAccount(t *testing.T) {
	ctx := context.Background()
	store, err := accounts.NewStore(filepath.Join(t.TempDir(), "accounts"), 1, nil, credits.Migrate)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	first := accounts.ID(strings.Repeat("a", 64))
	second := accounts.ID(strings.Repeat("b", 64))
	a, err := store.Acquire(ctx, first, true)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Acquire(ctx, second, true); !errors.Is(err, accounts.ErrBusy) {
		t.Fatalf("evicted busy account: %v", err)
	}
	a.Close()
	a.Close()
	b, err := store.Acquire(ctx, second, true)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Close(); !errors.Is(err, accounts.ErrBusy) {
		t.Fatalf("closed busy account: %v", err)
	}
	b.Close()
	a, err = store.Acquire(ctx, first, false)
	if err != nil {
		t.Fatal(err)
	}
	a.Close()
	ids, err := store.IDs()
	if err != nil || len(ids) != 2 {
		t.Fatalf("IDs: %v %v", ids, err)
	}
	if _, err := store.Acquire(ctx, accounts.ID("../escape"), true); !errors.Is(err, accounts.ErrInvalidID) {
		t.Fatalf("unsafe ID accepted: %v", err)
	}
}

func TestImportedIdentityAndEpochCannotBeRebound(t *testing.T) {
	ctx := context.Background()
	store, err := accounts.NewStore(filepath.Join(t.TempDir(), "accounts"), 4, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	id := accounts.ID(strings.Repeat("c", 64))
	h, err := store.Acquire(ctx, id, true)
	if err != nil {
		t.Fatal(err)
	}
	defer h.Close()
	if _, err := h.DB.Exec(`INSERT INTO settings VALUES('ownerId','"original-user"')`); err != nil {
		t.Fatal(err)
	}
	bind := func(owner string, epoch int64) error {
		return sqlite.Within(ctx, h.DB, func(tx *sql.Tx) error { return accounts.Bind(ctx, tx, id, owner, epoch, "active") })
	}
	if err := bind("wrong-user", 1); !errors.Is(err, accounts.ErrIdentity) {
		t.Fatalf("wrong legacy owner accepted: %v", err)
	}
	if err := bind("original-user", 1); err != nil {
		t.Fatal(err)
	}
	if err := bind("original-user", 1); err != nil {
		t.Fatal(err)
	}
	if err := bind("original-user", 2); !errors.Is(err, accounts.ErrIdentity) {
		t.Fatalf("epoch changed on bind: %v", err)
	}
	if err := accounts.Check(ctx, h.DB, id, "original-user", 1, true); err != nil {
		t.Fatal(err)
	}
	if err := accounts.Check(ctx, h.DB, id, "other-user", 1, true); !errors.Is(err, accounts.ErrIdentity) {
		t.Fatalf("wrong user accepted: %v", err)
	}
	if _, err := h.DB.Exec(`UPDATE backend_account SET phase='frozen'`); err != nil {
		t.Fatal(err)
	}
	if err := accounts.Check(ctx, h.DB, id, "original-user", 1, true); !errors.Is(err, accounts.ErrInactive) {
		t.Fatalf("frozen account accepted write: %v", err)
	}
}

func TestColdAccountDoesNotBlockCachedAccountOrCancelledWaiter(t *testing.T) {
	blocked, resume := make(chan struct{}), make(chan struct{})
	var release sync.Once
	unblock := func() { release.Do(func() { close(resume) }) }
	var calls atomic.Int32
	store, err := accounts.NewStore(filepath.Join(t.TempDir(), "accounts"), 2, nil, func(context.Context, *sql.DB) error {
		if calls.Add(1) == 2 {
			close(blocked)
			<-resume
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	defer unblock()
	hot, cold := accounts.ID(strings.Repeat("a", 64)), accounts.ID(strings.Repeat("b", 64))
	acquire := func(ctx context.Context, id accounts.ID) error {
		h, err := store.Acquire(ctx, id, true)
		if err == nil {
			h.Close()
		}
		return err
	}
	if err := acquire(t.Context(), hot); err != nil {
		t.Fatal(err)
	}
	opening := make(chan error, 1)
	go func() { opening <- acquire(t.Context(), cold) }()
	<-blocked
	cached := make(chan error, 1)
	go func() { cached <- acquire(t.Context(), hot) }()
	select {
	case err := <-cached:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("cold account blocked cached account")
	}
	ctx, cancel := context.WithTimeout(t.Context(), 25*time.Millisecond)
	defer cancel()
	if err := acquire(ctx, cold); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("waiter: %v", err)
	}
	if err := store.Close(); !errors.Is(err, accounts.ErrBusy) {
		t.Fatalf("closed while opening: %v", err)
	}
	unblock()
	if err := <-opening; err != nil {
		t.Fatal(err)
	}
	if err := acquire(t.Context(), cold); err != nil || calls.Load() != 2 {
		t.Fatalf("reopened same account: %v", err)
	}
}

func TestFailedProvisionCanBeRetriedWithoutExposingPartialSchema(t *testing.T) {
	ctx := t.Context()
	dir := filepath.Join(t.TempDir(), "accounts")
	var attempts int
	store, err := accounts.NewStore(dir, 1, nil, func(ctx context.Context, db *sql.DB) error {
		if _, err := db.ExecContext(ctx, "CREATE TABLE fixture (id INTEGER)"); err != nil {
			return err
		}
		attempts++
		if attempts == 1 {
			return errors.New("interrupted provisioning")
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	id := accounts.ID(strings.Repeat("d", 64))
	if _, err := store.Acquire(ctx, id, true); err == nil {
		t.Fatal("partially provisioned account returned")
	}
	if ids, err := store.IDs(); err != nil || len(ids) != 0 {
		t.Fatal(ids, err)
	}
	h, err := store.Acquire(ctx, id, true)
	if err != nil {
		t.Fatal(err)
	}
	h.Close()
}
