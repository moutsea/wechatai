package accounts

import (
	"context"
	"errors"
	"testing"
)

func TestCancelledFreezeDoesNotLeaveAccountClosed(t *testing.T) {
	var gate Gate
	done, err := gate.Enter()
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := gate.Quiesce(ctx); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	another, err := gate.Enter()
	if err != nil {
		t.Fatal("cancelled freeze blocked later work")
	}
	another()
	done()
	done() // completion is idempotent.
}

func TestConcurrentFreezeAbortCannotReopenCommittedFreeze(t *testing.T) {
	var gate Gate
	first, err := gate.Quiesce(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	second, err := gate.Quiesce(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	first(false)
	if _, err := gate.Enter(); !errors.Is(err, ErrInactive) {
		t.Fatal("opened while another freeze was pending")
	}
	second(true)
	first(false)
	if _, err := gate.Enter(); !errors.Is(err, ErrInactive) {
		t.Fatal("opened committed freeze")
	}
}
