package grokwake

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/moutsea/wechatai/backend/internal/rpc"
)

type roundTrip func(*http.Request) (*http.Response, error)

func (f roundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestSignedDispatch(t *testing.T) {
	signer, _ := rpc.NewSigner("test-only-grok-dispatch-key-32-characters")
	const ref = "e3f1fd44-65fb-41c5-a482-a59ee43c7245"
	for _, tt := range []struct {
		name, url      string
		signed         bool
		upstream, want int
		calls          int
	}{
		{"accept", "https://api2.cursor.sh/automations/webhook/example", true, 200, 204, 1},
		{"redirect", "https://api2.cursor.sh/automations/webhook/example", true, 302, 422, 1},
		{"retry", "https://api2.cursor.sh/automations/webhook/example", true, 429, 429, 1},
		{"not signed", "https://api2.cursor.sh/automations/webhook/example", false, 200, 401, 0},
		{"wrong host", "https://example.com/automations/webhook/example", true, 200, 400, 0},
	} {
		t.Run(tt.name, func(t *testing.T) {
			var calls atomic.Int32
			provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				if r.Header.Get("Authorization") != "Bearer test-key" {
					t.Error("missing provider auth")
				}
				var got map[string]string
				if err := json.NewDecoder(r.Body).Decode(&got); err != nil || len(got) != 1 || got["taskId"] != ref {
					t.Errorf("unexpected provider payload: %v", got)
				}
				w.Header().Set("Location", "https://elsewhere.example")
				w.WriteHeader(tt.upstream)
			}))
			defer provider.Close()
			transport := roundTrip(func(r *http.Request) (*http.Response, error) {
				if r.URL.String() != tt.url {
					t.Fatal("invalid destination")
				}
				local, _ := http.NewRequestWithContext(r.Context(), r.Method, provider.URL, r.Body)
				local.Header = r.Header
				return http.DefaultTransport.RoundTrip(local)
			})
			store, err := openReceipts(t.Context(), filepath.Join(t.TempDir(), "wakes.sqlite"))
			if err != nil {
				t.Fatal(err)
			}
			defer store.db.Close()
			srv := httptest.NewServer(handler(signer, transport, store))
			defer srv.Close()
			payload, _ := json.Marshal(map[string]string{"webhookUrl": tt.url, "webhookKey": "test-key", "taskId": ref})
			req, _ := http.NewRequest("POST", srv.URL+Path, bytes.NewReader(payload))
			if tt.signed {
				if err := signer.Sign(req, payload, "request-id"); err != nil {
					t.Fatal(err)
				}
			}
			res, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			defer res.Body.Close()
			body, _ := io.ReadAll(res.Body)
			if res.StatusCode != tt.want || int(calls.Load()) != tt.calls || len(body) != 0 {
				t.Fatalf("status=%d calls=%d", res.StatusCode, calls.Load())
			}
		})
	}
}

func signedWake(t *testing.T, signer *rpc.Signer) *http.Request {
	t.Helper()
	body := []byte(`{"taskId":"e3f1fd44-65fb-41c5-a482-a59ee43c7245","webhookUrl":"https://api2.cursor.sh/automations/webhook/example","webhookKey":"key"}`)
	req := httptest.NewRequest(http.MethodPost, Path, bytes.NewReader(body))
	if err := signer.Sign(req, body, "test-request"); err != nil {
		t.Fatal(err)
	}
	return req
}

func TestWakeReceiptAcrossRestart(t *testing.T) {
	for _, tc := range []struct {
		name                                 string
		providerStatus, first, replay, calls int
	}{
		{"accepted", 200, 204, 204, 1}, {"lost provider response", 0, 202, 202, 1},
		{"gateway timeout", 504, 202, 202, 1}, {"rate limited", 429, 429, 204, 2}, {"invalid key", 401, 422, 422, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "wakes.sqlite")
			signer, _ := rpc.NewSigner("test-only-grok-dispatch-key-32-characters")
			calls := 0
			transport := roundTrip(func(r *http.Request) (*http.Response, error) {
				calls++
				status := tc.providerStatus
				if calls > 1 {
					status = 200
				}
				if status == 0 {
					return nil, io.ErrUnexpectedEOF
				}
				return &http.Response{StatusCode: status, Body: http.NoBody}, nil
			})
			for _, want := range []int{tc.first, tc.replay} {
				store, err := openReceipts(t.Context(), path)
				if err != nil {
					t.Fatal(err)
				}
				out := httptest.NewRecorder()
				handler(signer, transport, store)(out, signedWake(t, signer))
				if err := store.db.Close(); err != nil {
					t.Fatal(err)
				}
				if out.Code != want {
					t.Fatalf("dispatch status = %d, want %d", out.Code, want)
				}
			}
			if calls != tc.calls {
				t.Fatalf("provider calls = %d, want %d", calls, tc.calls)
			}
		})
	}
}

func TestConcurrentWakesReserveBeforeSending(t *testing.T) {
	store, err := openReceipts(t.Context(), filepath.Join(t.TempDir(), "wakes.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.db.Close()
	signer, _ := rpc.NewSigner("test-only-grok-dispatch-key-32-characters")
	started, release := make(chan struct{}), make(chan struct{})
	var calls atomic.Int32
	h := handler(signer, roundTrip(func(r *http.Request) (*http.Response, error) {
		if calls.Add(1) == 1 {
			close(started)
			<-release
		}
		return &http.Response{StatusCode: 200, Body: http.NoBody}, nil
	}), store)
	req := signedWake(t, signer)
	finished := make(chan int, 1)
	go func() { out := httptest.NewRecorder(); h(out, req); finished <- out.Code }()
	select {
	case <-started:
	case <-time.After(5 * time.Second):
		close(release)
		t.Fatal("first wake never reached provider")
	}
	second := httptest.NewRecorder()
	h(second, signedWake(t, signer))
	close(release)
	if first := <-finished; first != 204 || second.Code != 202 || calls.Load() != 1 {
		t.Fatalf("first=%d second=%d provider calls=%d", first, second.Code, calls.Load())
	}
}

func TestUnavailableReceiptsNeverSend(t *testing.T) {
	store, err := openReceipts(t.Context(), filepath.Join(t.TempDir(), "wakes.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	store.db.Close()
	signer, _ := rpc.NewSigner("test-only-grok-dispatch-key-32-characters")
	w := httptest.NewRecorder()
	handler(signer, roundTrip(func(*http.Request) (*http.Response, error) {
		t.Fatal("provider called without a durable reservation")
		return nil, io.ErrUnexpectedEOF
	}), store)(w, signedWake(t, signer))
	if w.Code != http.StatusServiceUnavailable || w.Header().Get("X-Wechatai-Grok-Wake") != "not-sent" {
		t.Fatalf("unavailable receipt store returned %d, %q", w.Code, w.Header().Get("X-Wechatai-Grok-Wake"))
	}
}
