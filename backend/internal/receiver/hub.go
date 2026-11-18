package receiver

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"github.com/moutsea/wechatai/backend/internal/accounts"
)

// A replacement may start reading only after its predecessor has finished its
// last transaction. Other accounts can continue receiving during this handoff.
type Hub struct {
	mu       sync.Mutex
	sessions map[accounts.ID]*Session
	closed   bool
}
type Session struct {
	until   atomic.Int64
	Context context.Context
	cancel  context.CancelFunc
	done    chan struct{}
	wake    chan struct{}
}

func NewHub() *Hub { return &Hub{sessions: map[accounts.ID]*Session{}} }
func (h *Hub) Open(parent context.Context, id accounts.ID) (*Session, func()) {
	ctx, cancel := context.WithCancel(parent)
	s := &Session{Context: ctx, cancel: cancel, done: make(chan struct{}), wake: make(chan struct{}, 1)}
	s.Received()
	h.mu.Lock()
	prev := h.sessions[id]
	if h.closed {
		cancel()
	} else {
		h.sessions[id] = s
	}
	h.mu.Unlock()
	if prev != nil {
		prev.cancel()
		<-prev.done
	}
	return s, func() {
		cancel()
		h.mu.Lock()
		if h.sessions[id] == s {
			delete(h.sessions, id)
		}
		close(s.done)
		h.mu.Unlock()
	}
}
func (h *Hub) Connected(id accounts.ID) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	s := h.sessions[id]
	return s != nil && s.Context.Err() == nil
}
func (h *Hub) Wake(id accounts.ID) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if s := h.sessions[id]; s != nil {
		select {
		case s.wake <- struct{}{}:
		default:
		}
	}
}
func (s *Session) Changes() <-chan struct{} { return s.wake }
func (h *Hub) Close() {
	h.mu.Lock()
	h.closed = true
	var wait []chan struct{}
	for _, s := range h.sessions {
		s.cancel()
		wait = append(wait, s.done)
	}
	h.mu.Unlock()
	for _, done := range wait {
		<-done
	}
}

func (s *Session) Received() { s.until.Store(time.Now().Add(60 * time.Second).UnixMilli()) }
func (h *Hub) Lease(id accounts.ID) *int64 {
	h.mu.Lock()
	defer h.mu.Unlock()
	if s := h.sessions[id]; s != nil && s.Context.Err() == nil {
		v := s.until.Load()
		return &v
	}
	return nil
}
