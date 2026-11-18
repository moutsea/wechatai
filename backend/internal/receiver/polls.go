package receiver

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"github.com/moutsea/wechatai/backend/internal/accounts"
)

type PollKey struct {
	Account          accounts.ID
	Link, Generation string
	Epoch            int64
}
type PollOnce func(context.Context, PollKey) (bool, error)
type poll struct {
	cancel context.CancelFunc
	next   atomic.Int64
}

// Polls limits simultaneous provider requests, independently of the short
// account scheduler jobs. Reconciliation only starts or cancels goroutines.
type Polls struct {
	mu      sync.Mutex
	ctx     context.Context
	cancel  context.CancelFunc
	jobs    map[PollKey]*poll
	workers sync.WaitGroup
	slots   chan struct{}
}

func NewPolls(limit int) *Polls {
	return &Polls{jobs: map[PollKey]*poll{}, slots: make(chan struct{}, limit)}
}
func (p *Polls) Start(ctx context.Context) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.ctx != nil {
		return false
	}
	p.ctx, p.cancel = context.WithCancel(ctx)
	return true
}
func (p *Polls) Stop() {
	p.mu.Lock()
	if p.ctx == nil {
		p.mu.Unlock()
		return
	}
	p.cancel()
	p.mu.Unlock()
	p.workers.Wait()
	p.mu.Lock()
	p.ctx = nil
	p.cancel = nil
	p.mu.Unlock()
}
func (p *Polls) Reconcile(id accounts.ID, keys []PollKey, once PollOnce) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.ctx == nil || p.ctx.Err() != nil {
		return
	}
	wanted := make(map[PollKey]bool, len(keys))
	for _, key := range keys {
		wanted[key] = true
	}
	for key, job := range p.jobs {
		if key.Account == id && !wanted[key] {
			job.cancel()
			delete(p.jobs, key)
		}
	}
	for key := range wanted {
		if p.jobs[key] != nil {
			continue
		}
		ctx, cancel := context.WithCancel(p.ctx)
		job := &poll{cancel: cancel}
		job.next.Store(time.Now().UnixMilli())
		p.jobs[key] = job
		p.workers.Go(func() {
			defer cancel()
			defer func() {
				p.mu.Lock()
				if p.jobs[key] == job {
					delete(p.jobs, key)
				}
				p.mu.Unlock()
			}()
			backoff := time.Second
			for ctx.Err() == nil {
				select {
				case p.slots <- struct{}{}:
				case <-ctx.Done():
					return
				}
				job.next.Store(time.Now().Add(35 * time.Second).UnixMilli())
				keep, err := once(ctx, key)
				<-p.slots
				if ctx.Err() != nil || !keep {
					return
				}
				if err == nil {
					backoff = time.Second
				} else {
					backoff = min(30*time.Second, 2*backoff)
				}
				job.next.Store(time.Now().Add(backoff).UnixMilli())
				timer := time.NewTimer(backoff)
				select {
				case <-ctx.Done():
					timer.Stop()
					return
				case <-timer.C:
				}
			}
		})
	}
}

func (p *Polls) Next(id accounts.ID) *int64 {
	p.mu.Lock()
	defer p.mu.Unlock()
	var earliest *int64
	for k, j := range p.jobs {
		if k.Account == id {
			v := j.next.Load()
			if earliest == nil || v < *earliest {
				earliest = &v
			}
		}
	}
	return earliest
}
