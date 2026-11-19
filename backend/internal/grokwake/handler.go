// Package grokwake sends one authenticated Routine wake. The account owns the
// task, retries and receipts; the dispatcher never opens an account database.
package grokwake

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptrace"
	"regexp"
	"sync/atomic"
	"time"

	"github.com/moutsea/wechatai/backend/internal/rpc"
)

const Path = "/internal/v1/grok/wake"

var routineURL = regexp.MustCompile(`^https://api2\.cursor\.sh/automations/webhook/[a-zA-Z0-9_-]{1,256}$`)
var taskID = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
var keyFormat = regexp.MustCompile(`^[!-~]+$`)

type wakeRequest struct {
	WebhookURL string `json:"webhookUrl"`
	WebhookKey string `json:"webhookKey"`
	TaskID     string `json:"taskId"`
}

func (w wakeRequest) valid() bool {
	return routineURL.MatchString(w.WebhookURL) && taskID.MatchString(w.TaskID) &&
		len(w.WebhookKey) <= 2048 && keyFormat.MatchString(w.WebhookKey)
}

func Mount(ctx context.Context, next http.Handler, secret, receiptPath string) (http.Handler, func(), error) {
	if secret == "" {
		return next, func() {}, nil
	}
	signer, err := rpc.NewSigner(secret)
	if err != nil {
		return nil, nil, err
	}
	store, err := openReceipts(ctx, receiptPath)
	if err != nil {
		return nil, nil, err
	}
	mux := http.NewServeMux()
	mux.Handle("POST "+Path, handler(signer, http.DefaultTransport, store))
	mux.Handle("/", next)
	return mux, func() { store.db.Close() }, nil
}

func handler(signer *rpc.Signer, transport http.RoundTripper, store *receipts) http.HandlerFunc {
	client := &http.Client{
		Transport:     transport,
		Timeout:       8 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 8192))
		if err != nil {
			w.WriteHeader(http.StatusRequestEntityTooLarge)
			return
		}
		if r.URL.RawQuery != "" || signer.Verify(r, body) != nil {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		var input wakeRequest
		if json.Unmarshal(body, &input) != nil || !input.valid() {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		payload, _ := json.Marshal(map[string]string{"taskId": input.TaskID})
		req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, input.WebhookURL, bytes.NewReader(payload))
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		req.Header.Set("Authorization", "Bearer "+input.WebhookKey)
		req.Header.Set("Content-Type", "application/json")
		status, err := store.reserve(r.Context(), input.TaskID)
		if err != nil {
			status = http.StatusServiceUnavailable
		} else if status == 0 {
			status = sendRoutine(client, req)
			if err := store.finish(context.WithoutCancel(r.Context()), input.TaskID, status); err != nil {
				// Only advertise a retry after the reservation is durably released.
				status = http.StatusAccepted
			}
		}
		if status == http.StatusServiceUnavailable {
			w.Header().Set("X-Wechatai-Grok-Wake", "not-sent")
		}
		w.WriteHeader(status)
	}
}

func sendRoutine(client *http.Client, req *http.Request) int {
	// A dial or TLS failure before GotConn cannot have delivered the POST.
	// Once any connection was acquired, keep the reservation even on an error.
	var gettingConn, gotConn atomic.Bool
	trace := &httptrace.ClientTrace{
		GetConn: func(string) { gettingConn.Store(true) },
		GotConn: func(httptrace.GotConnInfo) { gotConn.Store(true) },
	}
	res, err := client.Do(req.WithContext(httptrace.WithClientTrace(req.Context(), trace)))
	if err != nil {
		if gettingConn.Load() && !gotConn.Load() {
			return http.StatusServiceUnavailable
		}
		return http.StatusAccepted
	}
	defer res.Body.Close()
	switch {
	case res.StatusCode == http.StatusOK:
		return http.StatusNoContent
	case res.StatusCode == http.StatusTooManyRequests:
		return http.StatusTooManyRequests
	case res.StatusCode >= 500 || res.StatusCode == http.StatusRequestTimeout:
		return http.StatusAccepted
	default:
		return http.StatusUnprocessableEntity
	}
}
