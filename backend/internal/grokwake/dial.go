package grokwake

import (
	"context"
	"net"
	"net/http"
	"time"
)

type dialFunc func(ctx context.Context, network, addr string) (net.Conn, error)

type dialResult struct {
	conn net.Conn
	err  error
}

// From the VPS, the TCP handshake to the Routine host often loses its first
// SYN and takes 5–8 s, which used to exhaust the wake timeout. A fresh attempt
// usually connects in about 250 ms, so start one when the earlier attempts have
// not connected within stagger. The first connection wins; any later one is
// closed. Only dialing is raced, so no request is ever sent twice.
func staggeredDial(dial dialFunc, attempts int, stagger time.Duration) dialFunc {
	return func(parent context.Context, network, addr string) (net.Conn, error) {
		ctx, cancel := context.WithCancel(parent)
		results := make(chan dialResult, attempts)
		started, finished := 0, 0
		start := func() {
			started++
			go func() {
				conn, err := dial(ctx, network, addr)
				results <- dialResult{conn, err}
			}()
		}
		// Stop the remaining attempts and close any that still connect.
		settle := func() {
			cancel()
			go func(pending int) {
				for ; pending > 0; pending-- {
					if r := <-results; r.conn != nil {
						r.conn.Close()
					}
				}
			}(started - finished)
		}
		ticker := time.NewTicker(stagger)
		defer ticker.Stop()
		start()
		for {
			select {
			case r := <-results:
				finished++
				if r.err == nil {
					settle()
					return r.conn, nil
				}
				if finished == started {
					if started == attempts || ctx.Err() != nil {
						settle()
						return nil, r.err
					}
					start()
				}
			case <-ticker.C:
				if started < attempts {
					start()
				}
			case <-ctx.Done():
				settle()
				return nil, ctx.Err()
			}
		}
	}
}

func wakeTransport() http.RoundTripper {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	dialer := &net.Dialer{KeepAlive: 30 * time.Second}
	// Measured from the VPS with 25 interleaved fresh requests each: a plain
	// dial failed 12 within the 8 s timeout, 3 attempts 1.5 s apart failed 3,
	// and 5 attempts 700 ms apart failed 2.
	transport.DialContext = staggeredDial(dialer.DialContext, 5, 700*time.Millisecond)
	return transport
}
