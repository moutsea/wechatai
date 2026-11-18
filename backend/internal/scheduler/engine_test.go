package scheduler

import (
	"context"
	"sync"
	"testing"
	"time"
)

type fakeSource struct {
	keys []string
	run  func(context.Context, string) (*time.Time, error)
}

func (s fakeSource) Keys(context.Context) ([]string, error)                  { return s.keys, nil }
func (s fakeSource) Run(ctx context.Context, key string) (*time.Time, error) { return s.run(ctx, key) }

func receive[T any](t *testing.T, ch <-chan T) T {
	t.Helper()
	select {
	case v := <-ch:
		return v
	case <-time.After(3 * time.Second):
		t.Fatal("scheduler did not make progress")
		var zero T
		return zero
	}
}

func TestSlowAccountDoesNotBlockOthersOrExceedWorkerLimit(t *testing.T) {
	started := make(chan string, 8)
	release := make(chan struct{})
	var mu sync.Mutex
	active, maximum := 0, 0
	engine, err := New(fakeSource{keys: []string{"a", "b", "c"}, run: func(ctx context.Context, key string) (*time.Time, error) {
		mu.Lock()
		active++
		maximum = max(maximum, active)
		mu.Unlock()
		defer func() { mu.Lock(); active--; mu.Unlock() }()
		started <- key
		select {
		case <-release:
		case <-ctx.Done():
		}
		return nil, nil
	}}, Options{Workers: 2})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- engine.Run(ctx) }()
	first, second := receive(t, started), receive(t, started)
	if first == second {
		t.Fatal("same account ran concurrently")
	}
	close(release)
	receive(t, started)
	cancel()
	if err := receive(t, done); err != nil {
		t.Fatal(err)
	}
	mu.Lock()
	defer mu.Unlock()
	if maximum != 2 || active != 0 {
		t.Fatalf("active=%d maximum=%d", active, maximum)
	}
}

func TestWakeDuringIOWinsOverStaleNoWorkResult(t *testing.T) {
	started := make(chan int, 8)
	finish := make(chan struct{})
	calls := 0
	engine, _ := New(fakeSource{keys: []string{"account"}, run: func(ctx context.Context, key string) (*time.Time, error) {
		calls++
		started <- calls
		if calls == 1 {
			select {
			case <-finish:
			case <-ctx.Done():
			}
		}
		return nil, nil
	}}, Options{Workers: 1})
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- engine.Run(ctx) }()
	defer cancel()
	if receive(t, started) != 1 {
		t.Fatal("first run missing")
	}
	engine.Wake("account")
	close(finish)
	if receive(t, started) != 2 {
		t.Fatal("wake was lost")
	}
	cancel()
	receive(t, done)
}

func TestRestartRediscoversPersistedScheduleWithoutWake(t *testing.T) {
	// Two independent process lifetimes see the same authoritative source.
	started := make(chan string, 2)
	source := fakeSource{keys: []string{"persisted"}, run: func(ctx context.Context, key string) (*time.Time, error) { started <- key; return nil, nil }}
	for range 2 {
		engine, _ := New(source, Options{Workers: 1})
		ctx, cancel := context.WithCancel(context.Background())
		done := make(chan error, 1)
		go func() { done <- engine.Run(ctx) }()
		if receive(t, started) != "persisted" {
			t.Fatal("schedule not restored")
		}
		cancel()
		receive(t, done)
	}
}
