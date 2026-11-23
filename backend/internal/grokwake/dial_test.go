package grokwake

import (
	"context"
	"errors"
	"net"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type trackedConn struct {
	net.Conn
	closed atomic.Bool
}

func (c *trackedConn) Close() error {
	c.closed.Store(true)
	return c.Conn.Close()
}

func pipeConn() *trackedConn {
	a, b := net.Pipe()
	b.Close()
	return &trackedConn{Conn: a}
}

func TestStaggeredDialUsesALaterAttemptWhenTheFirstStalls(t *testing.T) {
	var calls atomic.Int32
	stalled := make(chan struct{})
	winner := pipeConn()
	dial := staggeredDial(func(ctx context.Context, _, _ string) (net.Conn, error) {
		if calls.Add(1) == 1 {
			<-ctx.Done() // A lost SYN: only cancellation ends this attempt.
			close(stalled)
			return nil, ctx.Err()
		}
		return winner, nil
	}, 3, 20*time.Millisecond)
	started := time.Now()
	conn, err := dial(context.Background(), "tcp", "api2.cursor.sh:443")
	if err != nil || conn != winner {
		t.Fatalf("dial = %v, %v; want the second attempt", conn, err)
	}
	if elapsed := time.Since(started); elapsed > time.Second {
		t.Fatalf("took %v waiting for the stalled attempt", elapsed)
	}
	select {
	case <-stalled:
	case <-time.After(time.Second):
		t.Fatal("the stalled attempt was not cancelled")
	}
	if got := calls.Load(); got != 2 {
		t.Fatalf("attempts = %d, want 2", got)
	}
	if winner.closed.Load() {
		t.Fatal("the returned connection was closed")
	}
}

func TestStaggeredDialClosesAConnectionThatLosesTheRace(t *testing.T) {
	var calls atomic.Int32
	release := make(chan struct{})
	late := pipeConn()
	winner := pipeConn()
	dial := staggeredDial(func(ctx context.Context, _, _ string) (net.Conn, error) {
		if calls.Add(1) == 1 {
			<-release // Connects only after another attempt has won.
			return late, nil
		}
		return winner, nil
	}, 3, 10*time.Millisecond)
	conn, err := dial(context.Background(), "tcp", "api2.cursor.sh:443")
	if err != nil || conn != winner {
		t.Fatalf("dial = %v, %v; want the second attempt", conn, err)
	}
	close(release)
	deadline := time.Now().Add(time.Second)
	for !late.closed.Load() {
		if time.Now().After(deadline) {
			t.Fatal("the losing connection was left open")
		}
		time.Sleep(time.Millisecond)
	}
}

func TestStaggeredDialRetriesFastFailuresUpToTheLimit(t *testing.T) {
	var mu sync.Mutex
	calls := 0
	refused := errors.New("connection refused")
	dial := staggeredDial(func(context.Context, string, string) (net.Conn, error) {
		mu.Lock()
		defer mu.Unlock()
		calls++
		return nil, refused
	}, 3, time.Hour)
	if _, err := dial(context.Background(), "tcp", "api2.cursor.sh:443"); !errors.Is(err, refused) {
		t.Fatalf("err = %v, want the last dial error", err)
	}
	mu.Lock()
	defer mu.Unlock()
	if calls != 3 {
		t.Fatalf("attempts = %d, want 3", calls)
	}
}

func TestStaggeredDialStopsWhenTheRequestIsCancelled(t *testing.T) {
	dial := staggeredDial(func(ctx context.Context, _, _ string) (net.Conn, error) {
		<-ctx.Done()
		return nil, ctx.Err()
	}, 3, 10*time.Millisecond)
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	if _, err := dial(ctx, "tcp", "api2.cursor.sh:443"); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("err = %v, want the request deadline", err)
	}
}
