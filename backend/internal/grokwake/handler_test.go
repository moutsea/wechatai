package grokwake

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

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
			srv := httptest.NewServer(handler(signer, transport))
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
