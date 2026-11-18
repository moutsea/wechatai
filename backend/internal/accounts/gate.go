package accounts

import (
	"context"
	"sync"
)

// Gate drains application operations before a migration freeze. It is separate
// from the SQL transaction: slow external I/O must not hold a database lock.
// A cancelled freeze cannot be acknowledged or exported as a completed freeze.
type Gate struct {
	mu       sync.Mutex
	active   int
	closing  bool
	drained  chan struct{}
	freezers int
	frozen   bool
}

func (g *Gate) Enter() (func(), error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.closing {
		return nil, ErrInactive
	}
	if g.active == 0 {
		g.drained = make(chan struct{})
	}
	g.active++
	var once sync.Once
	return func() {
		once.Do(func() {
			g.mu.Lock()
			defer g.mu.Unlock()
			g.active--
			if g.active == 0 {
				close(g.drained)
			}
		})
	}, nil
}

func (g *Gate) Quiesce(ctx context.Context) (func(bool), error) {
	g.mu.Lock()
	g.closing = true
	g.freezers++
	active, drained := g.active, g.drained
	g.mu.Unlock()
	var once sync.Once
	finish := func(committed bool) {
		once.Do(func() {
			g.mu.Lock()
			defer g.mu.Unlock()
			g.freezers--
			g.frozen = g.frozen || committed
			g.closing = g.frozen || g.freezers > 0
		})
	}
	if active > 0 {
		select {
		case <-ctx.Done():
		case <-drained:
		}
	}
	if err := ctx.Err(); err != nil {
		finish(false)
		return nil, err
	}
	return finish, nil
}
