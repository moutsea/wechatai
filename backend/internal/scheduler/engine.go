// Package scheduler multiplexes durable account schedules onto bounded workers.
// The source owns persisted due times; the heap and wake channel are only an
// acceleration layer and can be discarded on every process restart.
package scheduler

import (
	"container/heap"
	"context"
	"errors"
	"sync"
	"time"
)

type Source interface {
	Keys(context.Context) ([]string, error)
	// Run processes a bounded amount of due work, then returns the next persisted
	// due time. It must honor cancellation and perform external I/O outside SQL
	// transactions. nil means no work is scheduled for this key.
	Run(context.Context, string) (*time.Time, error)
}

type Options struct {
	Workers         int
	RediscoverEvery time.Duration
	RetryDelay      time.Duration
	OnError         func(string, error)
}

type Engine struct {
	source  Source
	options Options
	wake    chan string
	running sync.Mutex
}

func New(source Source, options Options) (*Engine, error) {
	if source == nil || options.Workers < 1 || options.Workers > 64 {
		return nil, errors.New("invalid scheduler source or worker count")
	}
	if options.RediscoverEvery == 0 {
		options.RediscoverEvery = 5 * time.Minute
	}
	if options.RetryDelay == 0 {
		options.RetryDelay = 5 * time.Second
	}
	if options.RediscoverEvery < time.Second || options.RetryDelay < time.Millisecond {
		return nil, errors.New("invalid scheduler intervals")
	}
	return &Engine{source: source, options: options, wake: make(chan string, 1024)}, nil
}

// Wake is nonblocking. Overflow cannot lose durable work: discovery and restart
// recover it from Source. Call only after the corresponding SQL commit.
func (e *Engine) Wake(key string) {
	if key == "" || len(key) > 128 {
		return
	}
	select {
	case e.wake <- key:
	default:
	}
}

type due struct {
	key   string
	at    time.Time
	index int
}
type dueHeap []*due

func (h dueHeap) Len() int { return len(h) }
func (h dueHeap) Less(i, j int) bool {
	if h[i].at.Equal(h[j].at) {
		return h[i].key < h[j].key
	}
	return h[i].at.Before(h[j].at)
}
func (h dueHeap) Swap(i, j int) { h[i], h[j] = h[j], h[i]; h[i].index = i; h[j].index = j }
func (h *dueHeap) Push(v any)   { item := v.(*due); item.index = len(*h); *h = append(*h, item) }
func (h *dueHeap) Pop() any {
	items := *h
	n := len(items)
	item := items[n-1]
	items[n-1] = nil
	*h = items[:n-1]
	item.index = -1
	return item
}

type result struct {
	key  string
	next *time.Time
	err  error
}

func (e *Engine) Run(ctx context.Context) error {
	if !e.running.TryLock() {
		return errors.New("scheduler is already running")
	}
	defer e.running.Unlock()
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	work := make(chan string)
	results := make(chan result, e.options.Workers)
	var workers sync.WaitGroup
	for range e.options.Workers {
		workers.Go(func() {
			for {
				select {
				case <-ctx.Done():
					return
				case key := <-work:
					next, err := e.source.Run(ctx, key)
					select {
					case results <- result{key, next, err}:
					case <-ctx.Done():
						return
					}
				}
			}
		})
	}
	defer workers.Wait()
	// Cancel before joining workers, including on discovery errors.
	defer cancel()
	pending := dueHeap{}
	queued := map[string]*due{}
	inFlight := map[string]bool{} // true means a newer Wake arrived during I/O.
	enqueue := func(key string, at time.Time) {
		if _, running := inFlight[key]; running {
			inFlight[key] = true
			return
		}
		if item := queued[key]; item != nil {
			if at.Before(item.at) {
				item.at = at
				heap.Fix(&pending, item.index)
			}
			return
		}
		item := &due{key: key, at: at}
		queued[key] = item
		heap.Push(&pending, item)
	}
	discover := func() error {
		keys, err := e.source.Keys(ctx)
		if err != nil {
			return err
		}
		now := time.Now()
		for _, key := range keys {
			if key != "" && len(key) <= 128 {
				enqueue(key, now)
			}
		}
		return nil
	}
	if err := discover(); err != nil {
		return err
	}
	refresh := time.NewTicker(e.options.RediscoverEvery)
	defer refresh.Stop()
	timer := time.NewTimer(time.Hour)
	defer timer.Stop()
	for {
		// Draining a bounded heap never creates more than Workers account runners.
		for len(inFlight) < e.options.Workers && len(pending) > 0 && !pending[0].at.After(time.Now()) {
			item := heap.Pop(&pending).(*due)
			delete(queued, item.key)
			inFlight[item.key] = false
			select {
			case work <- item.key:
			case <-ctx.Done():
				return nil
			}
		}
		var wakeAt <-chan time.Time
		if len(pending) > 0 && len(inFlight) < e.options.Workers {
			timer.Reset(max(time.Duration(0), time.Until(pending[0].at)))
			wakeAt = timer.C
		} else {
			timer.Stop()
		}
		select {
		case <-ctx.Done():
			return nil
		case <-wakeAt:
		case key := <-e.wake:
			enqueue(key, time.Now())
		case <-refresh.C:
			if err := discover(); err != nil {
				if e.options.OnError != nil {
					e.options.OnError("", err)
				}
				// Keep existing schedules when directory discovery temporarily fails.
			}
		case completed := <-results:
			dirty := inFlight[completed.key]
			delete(inFlight, completed.key)
			if completed.err != nil {
				if e.options.OnError != nil {
					e.options.OnError(completed.key, completed.err)
				}
				enqueue(completed.key, time.Now().Add(e.options.RetryDelay))
			} else if completed.next != nil {
				enqueue(completed.key, *completed.next)
			}
			if dirty {
				enqueue(completed.key, time.Now())
			}
		}
	}
}
